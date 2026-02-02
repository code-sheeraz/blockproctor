// services/attemptService.js
import db from '../config/db.js';
import { getExamById } from './examService.js';

// helper to compute score
function computeScore(examQuestions, answers) {
  // examQuestions: array of { id, answer, ... }
  // answers: array of { id, answer }
  const correctMap = new Map();
  for (const q of examQuestions) {
    correctMap.set(String(q.id), q.answer);
  }

  let total = examQuestions.length || 0;
  let correct = 0;
  for (const a of answers) {
    const qid = String(a.id);
    if (!correctMap.has(qid)) continue;
    if (a.answer === correctMap.get(qid)) correct++;
  }

  const percent = total === 0 ? 0 : Math.round((correct / total) * 100);
  return { total, correct, percent };
}
export async function submitAttempt({ examId, student_id, answers }) {
  console.log('🧪 submitAttempt debug:');
  console.log('examId:', examId);
  console.log('student_id:', student_id);
  console.log('raw answers typeof:', typeof answers);
  console.log('raw answers value:', answers);

  // --- 1) normalize answers ---
  let answersVal = answers;

  // if it comes as string from client, parse it
  if (typeof answersVal === 'string') {
    try {
      answersVal = JSON.parse(answersVal);
    } catch (e) {
      console.error('❌ answers JSON.parse failed:', e.message);
      throw new Error('Invalid JSON in answers field');
    }
  }

  // must be an array now
  if (!Array.isArray(answersVal)) {
    console.error('❌ answersVal is not an array after normalize:', answersVal);
    throw new Error('answers must be an array');
  }

  console.log('✅ normalized answers typeof:', typeof answersVal);
  console.log('✅ normalized answers value:', answersVal);

  // --- 2) fetch exam ---
  const exam = await getExamById(examId);
  if (!exam) throw new Error('Exam not found');

  // --- 3) ensure user exists ---
  const userRes = await db.query(
    'SELECT id FROM users WHERE id = $1',
    [student_id]
  );
  if (!userRes.rows[0]) {
    throw new Error('Student (user) not found');
  }

  // --- 4) exam questions ---
  const examQs = exam.questions_json || [];
  if (!Array.isArray(examQs)) {
    throw new Error('Exam questions_json is invalid');
  }

  const { total, correct, percent } = computeScore(examQs, answersVal);

  // --- 5) INSERT attempt ---
  const insertQ = `
    INSERT INTO attempts 
      (exam_id, student_id, answers_json, score, correct_count, total_questions, started_at, submitted_at)
    VALUES ($1, $2, $3::jsonb, $4, $5, $6, NOW(), NOW())
    RETURNING *;
  `;

  const params = [
    examId,
    student_id,
    JSON.stringify(answersVal), // send as JSON string explicitly
    percent,
    correct,
    total
  ];

  console.log('🧪 INSERT params:', params);

  const { rows } = await db.query(insertQ, params);
  console.log('✅ attempt inserted:', rows[0]);
  return rows[0];
}

export async function getAttemptsForExam(examId) {
  const { rows } = await db.query(
    'SELECT * FROM attempts WHERE exam_id = $1 ORDER BY created_at DESC',
    [examId]
  );
  return rows;
}

// list all attempts for a given student (with exam info)
export async function getAttemptsForStudent(studentId) {
  const { rows } = await db.query(`
    SELECT a.*, e.title
    FROM attempts a
    JOIN exams e ON e.id = a.exam_id
    WHERE a.student_id = $1
    ORDER BY a.created_at DESC;
  `, [studentId]);

  return rows;
}

// 🔹 NEW: Exam summary (for instructor dashboard)
export async function getExamSummary(examId) {
  // 1) get exam basic info
  const exam = await getExamById(examId);
  if (!exam) {
    throw new Error('Exam not found');
  }

  const examQuestions = Array.isArray(exam.questions_json)
    ? exam.questions_json
    : [];

  // map of correct answers per question
  const correctMap = new Map();
  for (const q of examQuestions) {
    correctMap.set(String(q.id), q.answer);
  }

  // 2) fetch all attempts for this exam
  const { rows: attempts } = await db.query(
    'SELECT * FROM attempts WHERE exam_id = $1 ORDER BY created_at ASC',
    [examId]
  );

  const totalAttempts = attempts.length;

  // if no attempts yet, return empty-ish summary
  if (totalAttempts === 0) {
    return {
      exam: {
        id: exam.id,
        title: exam.title,
        instructor_id: exam.instructor_id,
        duration_minutes: exam.duration_minutes,
        starts_at: exam.starts_at,
        ends_at: exam.ends_at,
        total_questions: examQuestions.length
      },
      stats: {
        totalAttempts: 0,
        avgScore: 0,
        maxScore: 0,
        minScore: 0,
        passCount: 0,
        failCount: 0
      },
      questions: examQuestions.map(q => ({
        id: q.id,
        question: q.question || '',
        attemptCount: 0,
        correctCount: 0,
        correctPercent: 0
      }))
    };
  }

  // 3) compute overall score stats
  let sumScore = 0;
  let maxScore = -Infinity;
  let minScore = Infinity;
  let passCount = 0;
  let failCount = 0;

  // per-question stats
  const questionStats = new Map(); // key: qid -> { id, question, attemptCount, correctCount }

  for (const q of examQuestions) {
    questionStats.set(String(q.id), {
      id: q.id,
      question: q.question || '',
      attemptCount: 0,
      correctCount: 0
    });
  }

  for (const att of attempts) {
    const scoreNum = Number(att.score) || 0;
    sumScore += scoreNum;
    if (scoreNum > maxScore) maxScore = scoreNum;
    if (scoreNum < minScore) minScore = scoreNum;

    if (scoreNum >= 50) passCount++;
    else failCount++;

    const answers = Array.isArray(att.answers_json) ? att.answers_json : [];

    // update per-question stats
    for (const ans of answers) {
      const qid = String(ans.id);
      if (!questionStats.has(qid)) continue;

      const stat = questionStats.get(qid);
      stat.attemptCount += 1;

      const correctAns = correctMap.get(qid);
      if (ans.answer === correctAns) {
        stat.correctCount += 1;
      }
    }
  }

  const avgScore = sumScore / totalAttempts;

  // finalize question stats with percentages
  const questionsSummary = [];
  for (const stat of questionStats.values()) {
    const { attemptCount, correctCount } = stat;
    const correctPercent =
      attemptCount === 0 ? 0 : Math.round((correctCount / attemptCount) * 100);

    questionsSummary.push({
      ...stat,
      correctPercent
    });
  }

  return {
    exam: {
      id: exam.id,
      title: exam.title,
      instructor_id: exam.instructor_id,
      duration_minutes: exam.duration_minutes,
      starts_at: exam.starts_at,
      ends_at: exam.ends_at,
      total_questions: examQuestions.length
    },
    stats: {
      totalAttempts,
      avgScore: Math.round(avgScore),
      maxScore,
      minScore,
      passCount,
      failCount
    },
    questions: questionsSummary
  };
}
