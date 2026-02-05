import express from 'express';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const router = express.Router();

// 1. LIST EXAMS (With Score Check)
router.get('/', async (req, res) => {
    try {
        const { studentId } = req.query;

        const query = `
            SELECT e.*, 
            (SELECT score FROM attempts a WHERE a.exam_id = e.id AND a.student_id = $1 LIMIT 1) as score,
            (SELECT status FROM exam_sessions s WHERE s.exam_id = e.id AND s.student_id = $1 LIMIT 1) as status
            FROM exams e
            ORDER BY e.id ASC
        `;
        
        const { rows } = await pool.query(query, [studentId || -1]);
        
        const exams = rows.map(exam => ({
            ...exam,
            is_completed: exam.status === 'COMPLETED' || exam.score != null,
            score: exam.score 
        }));

        res.json({ success: true, exams });
    } catch (err) {
        console.error("List Exams Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// 2. GET SINGLE EXAM
router.get('/:id', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM exams WHERE id = $1', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ success: false });
        res.json({ success: true, exam: rows[0] });
    } catch (err) {
        console.error("Get Exam Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// 3. SUBMIT EXAM (Transaction Safe)
router.post('/submit', async (req, res) => {
    let client; // <--- FIX: Declared outside try block
    
    try {
        client = await pool.connect();
        const { examId, studentId, answers } = req.body; 

        // Start Transaction
        await client.query('BEGIN');

        // A. Calculate Score
        const examResult = await client.query('SELECT questions_json FROM exams WHERE id = $1', [examId]);
        if (examResult.rows.length === 0) throw new Error("Exam not found");

        const questions = examResult.rows[0].questions_json || [];
        let score = 0;
        let correctCount = 0;

        questions.forEach((q, index) => {
            // Compare answers (Trimmed and Lowercase for safety)
            const studentAns = String(answers[index] || "").trim().toLowerCase();
            const correctAns = String(q.answer || q.correctAnswer || "").trim().toLowerCase();
            
            if (studentAns === correctAns) {
                score += 10;
                correctCount++;
            }
        });

        // B. Update 'exam_sessions'
        await client.query(
            `INSERT INTO exam_sessions (exam_id, student_id, status, finished_at, result)
             VALUES ($1, $2, 'COMPLETED', NOW(), $3)
             ON CONFLICT (exam_id, student_id) 
             DO UPDATE SET status = 'COMPLETED', finished_at = NOW(), result = $3`,
            [examId, studentId, score.toString()]
        );

        // C. Update 'attempts'
        const attemptResult = await client.query(
            `INSERT INTO attempts 
            (exam_id, student_id, answers_json, score, correct_count, total_questions, submitted_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (exam_id, student_id)
            DO UPDATE SET 
                answers_json = EXCLUDED.answers_json,
                score = EXCLUDED.score,
                correct_count = EXCLUDED.correct_count,
                submitted_at = NOW()
            RETURNING id`,
            [examId, studentId, JSON.stringify(answers), score, correctCount, questions.length]
        );

        // Commit Transaction
        await client.query('COMMIT');

        res.json({ 
            success: true, 
            score, 
            attemptId: attemptResult.rows[0].id 
        });

    } catch (err) {
        if (client) await client.query('ROLLBACK'); // Only rollback if connected
        console.error("Submission Transaction Error:", err);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        if (client) client.release(); // Only release if connected
    }
});

export default router;