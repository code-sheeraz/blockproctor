import express from 'express';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { generateToken } from '../middleware/auth.js';
import pool from '../config/db.js';
const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════════
// STUDENT REGISTRATION (with department & batch)
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, student_id, department_id, batch_id, faceDescriptor } = req.body;
        
        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const faceData = faceDescriptor ? JSON.stringify(Object.values(faceDescriptor)) : null;
        const initialStatus = 'pending_admin';

        const result = await pool.query(
            `INSERT INTO users (full_name, email, password_hash, student_id, department_id, batch_id, face_descriptor, role, enrollment_status) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'student', $8) 
             RETURNING id, full_name as name, email, role, enrollment_status`,
            [name, email, hashedPassword, student_id || null, department_id || null, batch_id || null, faceData, initialStatus]
        );

        const newUser = result.rows[0];
        const token = generateToken({ id: newUser.id, role: newUser.role, email: newUser.email });

        res.json({ 
            success: true, 
            message: "Registration submitted. Waiting for admin approval.",
            token,
            user: { 
                id: newUser.id, 
                name: newUser.name, 
                role: newUser.role,
                enrollment_status: newUser.enrollment_status
            }
        });

    } catch (err) {
        console.error("Register Error:", err);
        if (err.code === '23505') { 
            return res.status(400).json({ success: false, message: "Email already exists" });
        }
        res.status(500).json({ success: false, message: "Registration failed", error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// UNIFIED LOGIN (Student, Instructor, Admin)
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/login', async (req, res) => {
    try {
        const { email, password, role } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ success: false, message: "Email and password required" });
        }
        if (!role) {
            return res.status(400).json({ success: false, message: "Please select your role" });
        }

        if (role === 'admin') {
            const { rows } = await pool.query(
                'SELECT id, name, email, password_hash, is_super_admin FROM admins WHERE email = $1 AND is_active = true',
                [email]
            );
            if (rows.length > 0) {
                const match = rows[0].password_hash
                    ? await bcrypt.compare(password, rows[0].password_hash).catch(() => false)
                    : false;
                if (match) {
                    await pool.query('UPDATE admins SET last_login = NOW() WHERE id = $1', [rows[0].id]);
                    const token = generateToken({ id: rows[0].id, role: 'admin', email: rows[0].email });
                    return res.json({ 
                        success: true, 
                        token,
                        user: { id: rows[0].id, name: rows[0].name, email: rows[0].email, role: 'admin', is_super_admin: rows[0].is_super_admin }
                    });
                }
            }
            return res.status(401).json({ success: false, message: "Invalid admin credentials" });
        }

        if (role === 'instructor') {
            const { rows } = await pool.query(
                `SELECT i.id, i.name, i.email, i.password_hash, i.department_id, d.name as department_name
                 FROM instructors i
                 LEFT JOIN departments d ON i.department_id = d.id
                 WHERE i.email = $1 AND i.is_active = true`,
                [email]
            );
            if (rows.length > 0) {
                const match = rows[0].password_hash
                    ? await bcrypt.compare(password, rows[0].password_hash).catch(() => false)
                    : false;
                if (match) {
                    await pool.query('UPDATE instructors SET last_login = NOW() WHERE id = $1', [rows[0].id]);
                    const token = generateToken({ id: rows[0].id, role: 'instructor', email: rows[0].email });
                    return res.json({ 
                        success: true, 
                        token,
                        user: { ...rows[0], role: 'instructor', password_hash: undefined }
                    });
                }
            }
            return res.status(401).json({ success: false, message: "Invalid instructor credentials" });
        }

        if (role === 'student') {
            const studentResult = await pool.query(
                `SELECT u.id, u.full_name as name, u.email, u.password_hash, u.role, u.enrollment_status, u.student_id,
                        d.name as department_name, b.name as batch_name
                 FROM users u
                 LEFT JOIN departments d ON u.department_id = d.id
                 LEFT JOIN batches b ON u.batch_id = b.id
                 WHERE u.email = $1`,
                [email]
            );
            
            if (studentResult.rows.length > 0) {
                const user = studentResult.rows[0];
                const match = user.password_hash
                    ? await bcrypt.compare(password, user.password_hash).catch(() => false)
                    : false;
                if (match) {
                    const token = generateToken({ id: user.id, role: user.role || 'student', email: user.email });
                    return res.json({ 
                        success: true, 
                        token,
                        user: { 
                            id: user.id, name: user.name, email: user.email,
                            role: user.role || 'student', enrollment_status: user.enrollment_status,
                            student_id: user.student_id, department_name: user.department_name, batch_name: user.batch_name
                        }
                    });
                }
            }
            return res.status(401).json({ success: false, message: "Invalid student credentials" });
        }

        return res.status(400).json({ success: false, message: "Invalid role selected" });
        
    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET REGISTRATION OPTIONS (Departments & Batches)
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/registration-options', async (req, res) => {
    try {
        const departments = await pool.query('SELECT id, name, code FROM departments ORDER BY name');
        const batches = await pool.query('SELECT id, name, year FROM batches WHERE is_active = true ORDER BY year ASC');
        
        res.json({ 
            success: true, 
            departments: departments.rows,
            batches: batches.rows
        });
    } catch (err) {
        console.error("Registration options error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CHECK ENROLLMENT STATUS
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/enrollment-status/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const result = await pool.query(
            `SELECT id, full_name as name, email, enrollment_status, face_descriptor IS NOT NULL as has_face
             FROM users WHERE id = $1`,
            [userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
