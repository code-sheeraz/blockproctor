import db from '../config/db.js';

// 1. Get All Exams (For Student Dashboard)
export const getAllExams = async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id, title, description, duration_minutes, starts_at FROM exams');
    res.json(rows);
  } catch (error) {
    console.error("Fetch Exams Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// 2. Get Single Exam with Questions (For Exam Page)
export const getExamById = async (req, res) => {
  try {
    const { id } = req.params;
    // We explicitly fetch questions_json
    const { rows } = await db.query('SELECT id, title, duration_minutes, questions_json FROM exams WHERE id = $1', [id]);
    
    if (rows.length === 0) return res.status(404).json({ message: "Exam not found" });
    
    res.json(rows[0]);
  } catch (error) {
    console.error("Fetch Exam Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// 3. Submit Exam & Calculate Score
export const submitExam = async (req, res) => {
  try {
    const { examId, studentId, answers } = req.body; 
    
    // 1. Fetch Correct Answers from DB
    const { rows } = await db.query('SELECT questions_json FROM exams WHERE id = $1', [examId]);
    if (rows.length === 0) return res.status(404).json({ message: "Exam not found" });

    const questions = rows[0].questions_json;
    let score = 0;
    let correctCount = 0;

    // 2. Calculate Score (Simple Exact Match)
    questions.forEach((q, index) => {
      const studentAns = answers[index];
      if (studentAns === q.correctAnswer) { // Ensure your JSON has 'correctAnswer'
        score += 10; // 10 points per question (customize logic as needed)
        correctCount++;
      }
    });

    // 3. Save Attempt to DB
    const attemptQuery = `
      INSERT INTO attempts (exam_id, student_id, score, correct_count, total_questions, answers_json)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, score;
    `;
    
    const attemptResult = await db.query(attemptQuery, [
      examId, studentId, score, correctCount, questions.length, JSON.stringify(answers)
    ]);

    res.json({ success: true, score, attemptId: attemptResult.rows[0].id });

  } catch (error) {
    console.error("Submit Error:", error);
    res.status(500).json({ message: "Submission failed" });
  }
};