import express from 'express';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const router = express.Router();

// REGISTER ROUTE
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, faceDescriptor } = req.body;
        
        if (!name || !email || !password) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        // Handle Face Data (Can be null)
        const faceData = faceDescriptor ? JSON.stringify(Object.values(faceDescriptor)) : null;

        // FIXED: Using your exact column names: full_name, password
        const result = await pool.query(
            `INSERT INTO users (full_name, email, password, face_descriptor, role) 
             VALUES ($1, $2, $3, $4, 'student') 
             RETURNING id, full_name, role`,
            [name, email, password, faceData]
        );

        const newUser = result.rows[0];

        res.json({ 
            success: true, 
            message: "Registration Successful",
            user: { id: newUser.id, name: newUser.full_name, role: newUser.role }
        });

    } catch (err) {
        console.error("Register Error:", err);
        if (err.code === '23505') { 
            return res.status(400).json({ message: "Email already exists" });
        }
        res.status(500).json({ message: "Registration failed" });
    }
});

// LOGIN ROUTE
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        // FIXED: Checking against 'password' column (ensure exact match)
        if (rows.length === 0 || rows[0].password !== password) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        res.json({ 
            success: true, 
            user: { id: rows[0].id, name: rows[0].full_name, role: rows[0].role } 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

export default router;