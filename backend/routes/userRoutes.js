import express from 'express';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const router = express.Router();

// 1. GET USER ENROLLMENT STATUS
router.get('/:userId/enrollment-status', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT enrollment_status FROM users WHERE id = $1', 
            [req.params.userId]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: "User not found" });
        res.json({ success: true, enrollment_status: result.rows[0].enrollment_status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. GET FACE DESCRIPTOR
router.get('/:userId/face', async (req, res) => {
    try {
        const result = await pool.query('SELECT face_descriptor FROM users WHERE id = $1', [req.params.userId]);
        if (result.rows.length === 0 || !result.rows[0].face_descriptor) {
            return res.status(404).json({ error: "Face not enrolled" });
        }
        let descriptor = result.rows[0].face_descriptor;
        if (typeof descriptor === 'string') descriptor = JSON.parse(descriptor);
        res.json({ faceDescriptor: descriptor });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. LOG PROCTOR EVENTS (Fixes the 404)
router.post('/:userId/log', async (req, res) => {
    try {
        const { userId } = req.params;
        const { examId, type, description, metadata } = req.body;

        // Create the event JSON object
        const eventLog = {
            type,
            description,
            timestamp: new Date().toISOString(),
            metadata: metadata || {}
        };

        // Insert into proctor_logs table
        await pool.query(
            `INSERT INTO proctor_logs (student_id, exam_id, events_json, created_at) 
             VALUES ($1, $2, $3, NOW())`,
            [userId, examId, JSON.stringify(eventLog)]
        );

        res.json({ success: true });
    } catch (err) {
        console.error("Log Error:", err);
        res.status(500).json({ error: "Failed to log event" });
    }
});

export default router;