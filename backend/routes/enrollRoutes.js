import express from 'express';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const router = express.Router();

// POST /api/enroll/upload - Student uploads face photo and descriptor
router.post('/upload', async (req, res) => {
    try {
        const { userId, faceDescriptor, photoBase64 } = req.body;

        if (!userId || !faceDescriptor || !photoBase64) {
            return res.status(400).json({ 
                success: false, 
                message: "Missing required fields: userId, faceDescriptor, photoBase64" 
            });
        }

        // Validate user exists
        const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Convert descriptor array to JSON string
        const descriptorString = JSON.stringify(faceDescriptor);

        // Update user with face data and set status to PENDING
        const result = await pool.query(
            `UPDATE users 
             SET face_descriptor = $1, 
                 profile_photo_url = $2, 
                 enrollment_status = 'PENDING'
             WHERE id = $3
             RETURNING id, enrollment_status`,
            [descriptorString, photoBase64, userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.json({ 
            success: true, 
            message: "Face enrollment submitted. Waiting for admin approval.",
            enrollment_status: result.rows[0].enrollment_status
        });
    } catch (err) {
        console.error("Enrollment Upload Error:", err);
        res.status(500).json({ success: false, message: "Enrollment failed: " + err.message });
    }
});

export default router;
