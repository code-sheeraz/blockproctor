import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import enrollRoutes from './routes/enrollRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import examRoutes from './routes/examRoutes.js';
import blockchainRoutes from './routes/blockchainRoutes.js';
import researchRoutes from './routes/researchRoutes.js';
import instructorRoutes from './routes/instructorRoutes.js';
import studentRoutes from './routes/studentRoutes.js';
import sessionRoutes from './routes/sessionRoutes.js';
import pool from './config/db.js';
import { ensureChainSeeded, startChainReseedMonitor } from './services/chainReseed.js';

dotenv.config();

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY BOOT CHECKS - fail fast on weak configuration
// ═══════════════════════════════════════════════════════════════════════════════

const WEAK_JWT_SECRETS = [
    'blockproctor-jwt-secret-change-in-production',
    'your-secret-key-here',
    'secret',
    ''
];

if (!process.env.JWT_SECRET || WEAK_JWT_SECRETS.includes(process.env.JWT_SECRET)) {
    console.error('❌ Fatal: JWT_SECRET must be set to a strong, unique value (see backend/.env.example)');
    process.exit(1);
}

const DEV_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
if (process.env.PRIVATE_KEY === DEV_PRIVATE_KEY) {
    console.warn('⚠️  PRIVATE_KEY is the well-known Hardhat/Foundry dev key - only acceptable for local development');
}

// ═══════════════════════════════════════════════════════════════════════════════

const app = express();

// Security headers
app.use(helmet());

// CORS with whitelist
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000').split(',');
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════════════

// Strict limit on authentication endpoints (brute-force protection)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message: 'Too many login attempts. Please try again later.' }
});

// General API limit
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Please slow down.' }
});

app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/enroll', enrollRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/blockchain', blockchainRoutes);
app.use('/api/research', researchRoutes);
app.use('/api/instructors', instructorRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/session', sessionRoutes);

// Health check for Docker
app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// Root info
app.get('/', (req, res) => {
    res.send(`
      <h1>✅ BlockProctor Backend is Online!</h1>
      <h2>LMS API Endpoints:</h2>
      <h3>Authentication</h3>
      <ul>
        <li>POST /api/auth/login - Unified login (student/instructor/admin)</li>
        <li>POST /api/auth/register - Student registration</li>
        <li>GET /api/auth/registration-options - Get departments & batches</li>
      </ul>
      <h3>Admin</h3>
      <ul>
        <li>GET /api/admin/dashboard/stats - Dashboard statistics</li>
        <li>GET /api/admin/enrollments/pending - Pending student approvals</li>
        <li>POST /api/admin/enrollments/:userId/approve - Approve student</li>
        <li>GET /api/admin/departments - List departments</li>
        <li>GET /api/admin/batches - List batches</li>
        <li>GET /api/admin/instructors - List instructors</li>
      </ul>
      <h3>Instructor</h3>
      <ul>
        <li>GET /api/instructors/:id/dashboard - Instructor dashboard</li>
        <li>GET /api/instructors/:id/classes - List classes</li>
        <li>POST /api/instructors/:id/classes - Create class</li>
        <li>GET /api/instructors/:id/pending-students - Students to add</li>
        <li>POST /api/instructors/:id/classes/:classId/students - Add student to class</li>
        <li>POST /api/instructors/:id/exams - Create exam</li>
      </ul>
      <h3>Student</h3>
      <ul>
        <li>GET /api/students/:id/dashboard - Student dashboard</li>
        <li>GET /api/students/:id/exams/available - Available exams</li>
        <li>GET /api/students/:id/classes - Enrolled classes</li>
      </ul>
      <h3>Research APIs (For Research Paper)</h3>
      <ul>
        <li><a href="/api/research/summary">/api/research/summary</a> - Complete research summary</li>
        <li><a href="/api/research/ai-metrics">/api/research/ai-metrics</a> - AI detection performance</li>
        <li><a href="/api/research/system-metrics">/api/research/system-metrics</a> - System performance stats</li>
        <li><a href="/api/research/blockchain-metrics">/api/research/blockchain-metrics</a> - Blockchain integrity</li>
        <li><a href="/api/research/blockchain-audit">/api/research/blockchain-audit</a> - Full blockchain audit</li>
        <li><a href="/api/research/detection-timeline">/api/research/detection-timeline</a> - Detection patterns</li>
        <li><a href="/api/research/exam-analysis">/api/research/exam-analysis</a> - Exam-level analysis</li>
        <li><a href="/api/research/full-export">/api/research/full-export</a> - Export all data</li>
        <li><a href="/api/research/proctor-metrics">/api/research/proctor-metrics</a> - Proctor metrics</li>
      </ul>
    `);
});

const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => {
  console.log(`BlockProctor Server running on port ${PORT}`);
  // Self-healing: re-record attempts on-chain if the chain was reset
  ensureChainSeeded();
  startChainReseedMonitor();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(async () => {
        try {
            await pool.end();
        } catch (e) {
            // ignore pool close errors
        }
        process.exit(0);
    });
});

process.on('SIGINT', async () => {
    console.log('SIGINT received. Shutting down gracefully...');
    server.close(async () => {
        try {
            await pool.end();
        } catch (e) {
            // ignore pool close errors
        }
        process.exit(0);
    });
});