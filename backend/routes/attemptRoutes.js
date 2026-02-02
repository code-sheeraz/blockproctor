// routes/attemptRoutes.js
import express from 'express';
import {
  submitAttempt,
  getAttemptsForExam,
  getAttemptsForStudent // <-- correct name
} from '../services/attemptService.js';

const router = express.Router();

// Submit attempt
router.post('/exams/:examId/attempts', async (req, res) => {
  try {
    const examId = Number(req.params.examId);
    const { student_id, answers } = req.body;

    if (!examId || !student_id || !answers) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    if (!Array.isArray(answers)) {
      return res.status(400).json({ success: false, message: 'answers must be array' });
    }

    const attempt = await submitAttempt({ examId, student_id, answers });
    res.json({ success: true, attempt });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List attempts by exam
router.get('/exams/:examId/attempts', async (req, res) => {
  try {
    const examId = Number(req.params.examId);
    const attempts = await getAttemptsForExam(examId);
    res.json({ success: true, attempts });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List attempts by student (for research results / dashboard)
router.get('/students/:studentId/attempts', async (req, res) => {
  try {
    const studentId = Number(req.params.studentId);
    const attempts = await getAttemptsForStudent(studentId);
    res.json({ success: true, attempts });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
