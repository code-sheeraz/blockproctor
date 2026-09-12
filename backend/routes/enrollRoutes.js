import express from 'express';
import dotenv from 'dotenv';
import { authenticate } from '../middleware/auth.js';
import pool from '../config/db.js';
const router = express.Router();

// Face enrollment requires an authenticated user
router.use(authenticate);

// POST /api/enroll/upload - Student uploads face photo and descriptor
// Status stays at 'pending_face' until admin approves the photo.
// The target user is always taken from the JWT — a caller can never enroll
// or overwrite another student's biometric data (IDOR guard).
router.post('/upload', async (req, res) => {
    try {
        const { faceDescriptor, photoBase64 } = req.body;
        const userId = req.user.userId; // token identity, body value ignored

        if (!faceDescriptor || !photoBase64) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: faceDescriptor, photoBase64"
            });
        }

        // Validate user exists and is in pending_face status
        const userCheck = await pool.query(
            'SELECT id, enrollment_status FROM users WHERE id = $1', 
            [userId]
        );
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Convert descriptor array to JSON string
        const descriptorString = JSON.stringify(faceDescriptor);

        // Update user with face data - status stays 'pending_face' until admin approves photo
        // Admin will verify photo matches the person before approving
        const result = await pool.query(
            `UPDATE users 
             SET face_descriptor = $1, 
                 face_verification_photo = $2,
                 updated_at = NOW()
             WHERE id = $3
             RETURNING id, enrollment_status`,
            [descriptorString, photoBase64, userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.json({ 
            success: true, 
            message: "Face photo uploaded. Waiting for admin to verify your identity.",
            enrollment_status: result.rows[0].enrollment_status
        });
    } catch (err) {
        console.error("Enrollment Upload Error:", err);
        res.status(500).json({ success: false, message: "Enrollment failed: " + err.message });
    }
});

export default router;
