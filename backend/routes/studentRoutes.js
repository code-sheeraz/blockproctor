// routes/studentRoutes.js
import express from 'express';
import { getAttemptsForStudent } from '../services/attemptService.js';
import { 
  getAvailableExamsForStudent,
  getExamDetailForStudent
} from '../services/examService.js';

const router = express.Router();

/**
 * GET /api/students/:studentId/attempts
 * -> all attempts for this student (we already had the service)
 */
router.get('/students/:studentId/attempts', async (req, res) => {
  try {
    const studentId = Number(req.params.studentId);
    if (!studentId) {
      return res.status(400).json({ success:false, message:'invalid studentId' });
    }

    const attempts = await getAttemptsForStudent(studentId);
    res.json({ success:true, attempts });

  } catch (err) {
    console.error('getAttemptsForStudent error', err);
    res.status(500).json({ success:false, error: err.message });
  }
});

/**
 * GET /api/students/:studentId/exams/available
 * -> exams that are active for this student, plus status
 */
router.get('/students/:studentId/exams/available', async (req, res) => {
  try {
    const studentId = Number(req.params.studentId);
    if (!studentId) {
      return res.status(400).json({ success:false, message:'invalid studentId' });
    }

    const exams = await getAvailableExamsForStudent(studentId);
    res.json({ success:true, exams });

  } catch (err) {
    console.error('getAvailableExamsForStudent error', err);
    res.status(500).json({ success:false, error: err.message });
  }
});

/**
 * GET /api/students/:studentId/exams/:examId
 * -> exam detail + this student's attempt info
 */
router.get('/students/:studentId/exams/:examId', async (req, res) => {
  try {
    const studentId = Number(req.params.studentId);
    const examId = Number(req.params.examId);

    if (!studentId || !examId) {
      return res.status(400).json({ success:false, message:'invalid studentId or examId' });
    }

    const detail = await getExamDetailForStudent(examId, studentId);
    if (!detail) {
      return res.status(404).json({ success:false, message:'Exam not found' });
    }

    res.json({ success:true, ...detail });

  } catch (err) {
    console.error('getExamDetailForStudent error', err);
    res.status(500).json({ success:false, error: err.message });
  }
});

export default router;
