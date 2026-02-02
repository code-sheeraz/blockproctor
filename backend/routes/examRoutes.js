// routes/examRoutes.js
import express from 'express';
import { createExam, getExamById, getAllExams } from '../services/examService.js';
import { getExamSummary } from '../services/attemptService.js';

const router = express.Router();

// CREATE exam
router.post('/exams', async (req, res) => {
  try {
    const { title, instructor_id, duration_minutes, questions, starts_at, ends_at } = req.body;

    if (!title || !instructor_id) {
      return res.status(400).json({ success:false, message: 'title and instructor_id required' });
    }

    console.log('POST /api/exams body:', req.body);
    console.log('questions type:', typeof questions);

    const exam = await createExam({
      title,
      instructor_id,
      duration_minutes,
      questions,
      starts_at,
      ends_at
    });

    res.json({ success: true, exam });
  } catch (err) {
    console.error('createExam error', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// LIST all exams
router.get('/exams', async (req, res) => {
  try {
    const exams = await getAllExams();
    res.json({ success: true, exams });
  } catch (err) {
    console.error('listExams error', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET single exam by id
router.get('/exams/:examId', async (req, res) => {
  try {
    const examId = Number(req.params.examId);
    if (!examId) {
      return res.status(400).json({ success:false, message: 'Invalid examId' });
    }

    const exam = await getExamById(examId);
    if (!exam) {
      return res.status(404).json({ success:false, message: 'Exam not found' });
    }

    res.json({ success:true, exam });
  } catch (err) {
    console.error('getExamById error', err);
    res.status(500).json({ success:false, error: err.message });
  }
});

// 🔹 NEW: exam summary for instructor dashboard
router.get('/exams/:examId/summary', async (req, res) => {
  try {
    const examId = Number(req.params.examId);
    if (!examId) {
      return res.status(400).json({ success:false, message: 'Invalid examId' });
    }

    const summary = await getExamSummary(examId);
    res.json({ success:true, summary });

  } catch (err) {
    console.error('getExamSummary error', err);
    res.status(500).json({ success:false, error: err.message });
  }
});

export default router;
