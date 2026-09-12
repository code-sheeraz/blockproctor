import express from 'express';
import examSessionService from '../services/examSessionService.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// All session endpoints require an authenticated user
router.use(authenticate);

// Admin-only session management routes are guarded with authorize('admin') individually

// ═══════════════════════════════════════════════════════════════════════════════
// EXAM SESSION ROUTES - Handles proctored exam sessions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Start or resume an exam session
 * POST /api/session/start
 */
router.post('/start', async (req, res) => {
    try {
        const { studentId, examId } = req.body;
        const clientInfo = {
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
        };
        
        const result = await examSessionService.startSession(studentId, examId, clientInfo);
        res.json(result);
        
    } catch (err) {
        console.error('Session start error:', err.message);
        
        // Parse error type
        if (err.message.startsWith('LOCKED:')) {
            return res.status(403).json({ 
                success: false, 
                locked: true,
                message: err.message.replace('LOCKED: ', '')
            });
        }
        if (err.message.startsWith('TERMINATED:')) {
            return res.status(403).json({ 
                success: false, 
                terminated: true,
                message: err.message.replace('TERMINATED: ', '')
            });
        }
        if (err.message.startsWith('COMPLETED:')) {
            return res.status(400).json({ 
                success: false, 
                completed: true,
                message: err.message.replace('COMPLETED: ', '')
            });
        }
        if (err.message.startsWith('EXPIRED:')) {
            return res.status(400).json({ 
                success: false, 
                expired: true,
                message: err.message.replace('EXPIRED: ', '')
            });
        }
        
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * Record heartbeat (client sends every 5-10 seconds)
 * POST /api/session/heartbeat
 */
router.post('/heartbeat', async (req, res) => {
    try {
        const { sessionId, studentId, examId, timeRemaining, partialAnswers } = req.body;
        const clientInfo = {
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
        };
        
        const result = await examSessionService.recordHeartbeat(
            sessionId, studentId, examId, timeRemaining, clientInfo, partialAnswers
        );
        
        if (result.locked) {
            return res.status(403).json({
                success: false,
                locked: true,
                lockReason: result.lockReason
            });
        }
        
        res.json(result);
        
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * Log a violation
 * POST /api/session/violation
 */
router.post('/violation', async (req, res) => {
    try {
        const { sessionId, studentId, examId, violationType, description, metadata, isSevere } = req.body;
        
        const result = await examSessionService.logViolation(
            sessionId, studentId, examId, violationType, description, metadata, isSevere
        );
        
        res.json(result);
        
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * Force submit on lock (saves progress as proof)
 * POST /api/session/force-submit
 */
router.post('/force-submit', async (req, res) => {
    try {
        const { sessionId, studentId, examId, answers, lockReason, timeRemaining } = req.body;
        
        const result = await examSessionService.forceSubmitOnLock(
            sessionId, studentId, examId, answers, lockReason, timeRemaining
        );
        res.json(result);
        
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * Submit exam
 * POST /api/session/submit
 */
router.post('/submit', async (req, res) => {
    try {
        const { sessionId, studentId, examId, answers } = req.body;
        
        const result = await examSessionService.submitExam(sessionId, studentId, examId, answers);
        res.json(result);
        
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * Get session status (for reconnection check)
 * GET /api/session/:sessionId/status
 */
router.get('/:sessionId/status', async (req, res) => {
    try {
        const details = await examSessionService.getSessionDetails(req.params.sessionId);
        
        if (!details) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }
        
        res.json({
            success: true,
            status: details.session.status,
            isLocked: details.session.is_locked,
            lockReason: details.session.lock_reason,
            warningCount: details.session.warning_count,
            violationCount: details.session.violation_count,
            timeRemaining: details.session.time_remaining
        });
        
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * Request access (for technical issues)
 * POST /api/session/request-access
 */
router.post('/request-access', async (req, res) => {
    try {
        const { studentId, examId, requestType, reason, evidenceData } = req.body;
        
        const result = await examSessionService.requestAccess(
            studentId, examId, requestType, reason, evidenceData
        );
        
        res.json({ success: true, request: result });
        
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get session details with all violations (Admin)
 * GET /api/session/admin/:sessionId
 */
router.get('/admin/:sessionId', authorize('admin'), async (req, res) => {
    try {
        const details = await examSessionService.getSessionDetails(req.params.sessionId);
        
        if (!details) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }
        
        res.json({ success: true, ...details });
        
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * Unlock a session (Admin)
 * POST /api/session/admin/:sessionId/unlock
 */
router.post('/admin/:sessionId/unlock', authorize('admin'), async (req, res) => {
    try {
        const { adminNotes } = req.body;
        const session = await examSessionService.unlockSession(req.params.sessionId, adminNotes);
        
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }
        
        res.json({ success: true, session, message: 'Session unlocked' });
        
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * Lock a session (Admin)
 * POST /api/session/admin/:sessionId/lock
 */
router.post('/admin/:sessionId/lock', authorize('admin'), async (req, res) => {
    try {
        const { reason } = req.body;
        const session = await examSessionService.lockSession(req.params.sessionId, reason);
        
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }
        
        res.json({ success: true, session, message: 'Session locked' });
        
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
