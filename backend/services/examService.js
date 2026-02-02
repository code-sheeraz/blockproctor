// services/examService.js
import db from '../config/db.js';

// create exam
export async function createExam({ title, instructor_id, duration_minutes, questions, starts_at, ends_at }) {
  // normalize questions: if client sent JSON string, parse it
  let questionsVal = questions;
  if (typeof questionsVal === 'string') {
    try {
      questionsVal = JSON.parse(questionsVal);
    } catch (err) {
      throw new Error('Invalid JSON in questions field');
    }
  }

  const query = `
    INSERT INTO exams
      (title, instructor_id, duration_minutes, questions_json, starts_at, ends_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `;

  const params = [
    title || null,
    instructor_id || null,
    duration_minutes || null,
    questionsVal || null,
    starts_at || null,
    ends_at || null
  ];

  const { rows } = await db.query(query, params);
  return rows[0];
}

// get single exam by id
export async function getExamById(examId) {
  const { rows } = await db.query(
    'SELECT * FROM exams WHERE id = $1',
    [examId]
  );
  return rows[0];
}

// list all exams (for instructor / admin)
export async function getAllExams() {
  const { rows } = await db.query(
    'SELECT * FROM exams ORDER BY created_at DESC'
  );
  return rows;
}

/**
 * Get exams visible to a student (time-window aware)
 * and include a status ("not_started" | "completed") based on attempts.
 */
export async function getAvailableExamsForStudent(studentId) {
  const { rows } = await db.query(
    `
    SELECT 
      e.*,
      a.id      AS attempt_id,
      a.score   AS attempt_score,
      a.created_at AS attempt_created_at
    FROM exams e
    LEFT JOIN attempts a
      ON a.exam_id = e.id
     AND a.student_id = $1
    WHERE
      -- exam is active now (you can tweak logic: upcoming, etc.)
      (e.starts_at IS NULL OR e.starts_at <= NOW())
      AND (e.ends_at   IS NULL OR e.ends_at   >= NOW())
    ORDER BY e.starts_at NULLS LAST, e.created_at DESC;
    `,
    [studentId]
  );

  // compute a simple "status" per exam for this student
  const result = rows.map(row => {
    let status = 'not_started';
    if (row.attempt_id) status = 'completed';   // later we can add "in_progress", etc.

    return {
      id: row.id,
      title: row.title,
      description: row.description,
      duration_minutes: row.duration_minutes,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      created_at: row.created_at,
      status,
      last_attempt_score: row.attempt_score,
      last_attempt_at: row.attempt_created_at
    };
  });

  return result;
}

/**
 * Get exam detail + student's attempt info (if exists)
 */
export async function getExamDetailForStudent(examId, studentId) {
  const exam = await getExamById(examId);
  if (!exam) return null;

  // latest attempt for this student on this exam
  const { rows: attemptRows } = await db.query(
    `
    SELECT *
    FROM attempts
    WHERE exam_id = $1 AND student_id = $2
    ORDER BY created_at DESC
    LIMIT 1;
    `,
    [examId, studentId]
  );

  const attempt = attemptRows[0] || null;

  let status = 'not_started';
  if (attempt) {
    status = 'completed'; // keep it simple for now
  }

  return {
    exam,
    attempt,
    status
  };
}
