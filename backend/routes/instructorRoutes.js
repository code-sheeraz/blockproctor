// routes/instructorRoutes.js
import express from 'express';
import { getInstructorDashboard } from '../services/instructorService.js';

const router = express.Router();

// GET /api/instructors/:instructorId/dashboard
router.get('/instructors/:instructorId/dashboard', async (req, res) => {
  try {
    const instructorId = Number(req.params.instructorId);

    if (!instructorId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid instructorId'
      });
    }

    const exams = await getInstructorDashboard(instructorId);
    return res.json({ success: true, exams });

  } catch (err) {
    console.error('getInstructorDashboard error', err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

export default router;
