import express from 'express';
import dotenv from 'dotenv';
import { authenticate } from '../middleware/auth.js';
import pool from '../config/db.js';
const router = express.Router();

// All user endpoints require an authenticated user
router.use(authenticate);

// Ownership guard: students may only touch their own data; admins may act on
// any account. Prevents IDOR against biometric data and proctor logs.
function requireSelfOrAdmin(req, res) {
    const requested = Number(req.params.userId);
    if (!Number.isInteger(requested)) {
        res.status(400).json({ success: false, message: 'Invalid user id' });
        return false;
    }
    if (req.user.role !== 'admin' && req.user.userId !== requested) {
        res.status(403).json({ success: false, message: 'You can only access your own data' });
        return false;
    }
    return true;
}

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
    if (!requireSelfOrAdmin(req, res)) return;
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

// 3. LOG PROCTOR EVENTS (Updated for research metrics)
router.post('/:userId/log', async (req, res) => {
    if (!requireSelfOrAdmin(req, res)) return;
    try {
        const { userId } = req.params;
        const { examId, type, description, trustScore, metadata } = req.body;

        // Insert with new schema supporting research metrics
        // trust_score column is INTEGER — round float scores (e.g. 80.299999) to avoid insert errors
        const trustScoreInt = trustScore != null
            ? Math.round(Number(trustScore))
            : 100;

        const { rows } = await pool.query(
            `INSERT INTO proctor_logs (student_id, exam_id, violation_type, description, trust_score, metadata, created_at) 
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             RETURNING id`,
            [userId, examId, type, description || '', trustScoreInt, JSON.stringify(metadata || {})]
        );

        res.json({ success: true, logId: rows[0]?.id });
    } catch (err) {
        console.error("Log Error:", err);
        res.status(500).json({ error: "Failed to log event" });
    }
});

// 4. SAVE FACE VERIFICATION PHOTO (base64 image - for identity verification only)
router.put('/:userId/photo', async (req, res) => {
    if (!requireSelfOrAdmin(req, res)) return;
    try {
        const { userId } = req.params;
        const { photo } = req.body;

        if (!photo) {
            return res.status(400).json({ error: "Photo data required" });
        }

        await pool.query(
            'UPDATE users SET face_verification_photo = $1, updated_at = NOW() WHERE id = $2',
            [photo, userId]
        );

        res.json({ success: true, message: "Face verification photo saved" });
    } catch (err) {
        console.error("Photo save error:", err);
        res.status(500).json({ error: "Failed to save photo" });
    }
});

// 5. GET FACE VERIFICATION PHOTO (for proctoring and admin verification)
router.get('/:userId/photo', async (req, res) => {
    if (!requireSelfOrAdmin(req, res)) return;
    try {
        const { userId } = req.params;
        
        const result = await pool.query(
            'SELECT face_verification_photo FROM users WHERE id = $1',
            [userId]
        );

        if (result.rows.length === 0 || !result.rows[0].face_verification_photo) {
            return res.status(404).json({ error: "Face verification photo not found" });
        }

        res.json({ success: true, photo: result.rows[0].face_verification_photo });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;