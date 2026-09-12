// routes/blockchainRoutes.js
import express from "express";
import dotenv from "dotenv";
import { authenticate } from "../middleware/auth.js";
import {
  recordExamOnChain,
  recordAttemptOnChain,
  verifyExamIntegrity,
  verifyAttemptIntegrity,
  verifyLogsIntegrity,
  getBlockchainStatistics,
  generateExamHash,
  generateAttemptHash,
  generateLogsHash,
  isBlockchainReady
} from "../services/blockchainService.js";
import pool from "../config/db.js";

const router = express.Router();

// All blockchain endpoints require an authenticated user
router.use(authenticate);

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS & STATISTICS
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/status", async (req, res) => {
  try {
    const ready = isBlockchainReady();
    const stats = ready ? await getBlockchainStatistics() : null;
    
    res.json({ 
      success: true, 
      connected: ready,
      statistics: stats
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// RECORD ON BLOCKCHAIN
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/exams/:examId/record", async (req, res) => {
  try {
    const { examId } = req.params;
    
    // Fetch exam data
    const { rows } = await pool.query('SELECT * FROM exams WHERE id = $1', [examId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Exam not found" });
    }
    
    const result = await recordExamOnChain(parseInt(examId), rows[0]);
    res.json({ success: result.success, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/attempts/:attemptId/record", async (req, res) => {
  try {
    const { attemptId } = req.params;
    
    // Fetch attempt data
    const attemptResult = await pool.query('SELECT * FROM attempts WHERE id = $1', [attemptId]);
    if (attemptResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Attempt not found" });
    }
    
    const attempt = attemptResult.rows[0];
    
    // Fetch proctor logs
    const logsResult = await pool.query(
      'SELECT * FROM proctor_logs WHERE student_id = $1 AND exam_id = $2 ORDER BY created_at',
      [attempt.student_id, attempt.exam_id]
    );
    
    const result = await recordAttemptOnChain(attempt, logsResult.rows);
    
    // Store blockchain hash and tx in database if successful
    if (result.success) {
      await pool.query(
        `UPDATE attempts 
         SET blockchain_hash = $1, blockchain_tx = $2 
         WHERE id = $3`,
        [result.dataHash, result.txHash, attemptId]
      );
    }
    
    res.json({ success: result.success, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Batch record all unrecorded attempts
router.post("/batch-record-attempts", async (req, res) => {
  try {
    const force = !!req.body?.force;
    // Get all attempts without blockchain hash (or all when force=true,
    // e.g. after the chain was reset and needs re-seeding)
    const unrecordedResult = await pool.query(`
      SELECT a.* FROM attempts a 
      WHERE a.submitted_at IS NOT NULL
        AND (a.blockchain_hash IS NULL OR $1)
      ORDER BY a.submitted_at ASC
    `, [force]);
    
    const attempts = unrecordedResult.rows;
    const results = { total: attempts.length, recorded: 0, failed: 0, skipped: 0, details: [] };
    
    if (attempts.length === 0) {
      return res.json({ success: true, message: 'All attempts already recorded', ...results });
    }
    
    for (const attempt of attempts) {
      try {
        // Fetch proctor logs
        const logsResult = await pool.query(
          'SELECT * FROM proctor_logs WHERE student_id = $1 AND exam_id = $2 ORDER BY created_at',
          [attempt.student_id, attempt.exam_id]
        );
        
        const result = await recordAttemptOnChain(attempt, logsResult.rows);
        
        if (result.success && result.txHash) {
          await pool.query(
            `UPDATE attempts 
             SET blockchain_hash = $1, blockchain_tx = $2 
             WHERE id = $3`,
            [result.dataHash, result.txHash, attempt.id]
          );
          results.recorded++;
          results.details.push({ attemptId: attempt.id, status: 'recorded', hash: result.dataHash?.substring(0, 16) + '...' });
        } else if (result.success && result.offChainOnly) {
          // Already on-chain with matching hash - DB values stay as-is
          results.recorded++;
          results.details.push({ attemptId: attempt.id, status: 'already-recorded', hash: result.dataHash?.substring(0, 16) + '...' });
        } else if (result.reason === 'blockchain_not_ready') {
          results.skipped++;
          results.details.push({ attemptId: attempt.id, status: 'skipped', reason: 'Blockchain not configured' });
        } else {
          results.failed++;
          results.details.push({ attemptId: attempt.id, status: 'failed', reason: result.reason || result.error || 'Unknown error' });
        }
        
        // Small delay to avoid overwhelming the blockchain node
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (err) {
        results.failed++;
        results.details.push({ attemptId: attempt.id, status: 'error', reason: err.message });
      }
    }
    
    res.json({ 
      success: true, 
      message: `Processed ${results.total} attempts: ${results.recorded} recorded, ${results.failed} failed, ${results.skipped} skipped`,
      ...results 
    });
  } catch (err) {
    console.error('Batch record error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/verify/exam/:examId", async (req, res) => {
  try {
    const { examId } = req.params;
    
    const { rows } = await pool.query('SELECT * FROM exams WHERE id = $1', [examId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Exam not found" });
    }
    
    const result = await verifyExamIntegrity(parseInt(examId), rows[0]);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/verify/attempt/:attemptId", async (req, res) => {
  try {
    const { attemptId } = req.params;
    
    const { rows } = await pool.query('SELECT * FROM attempts WHERE id = $1', [attemptId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Attempt not found" });
    }
    
    const result = await verifyAttemptIntegrity(parseInt(attemptId), rows[0]);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/verify/logs/:attemptId", async (req, res) => {
  try {
    const { attemptId } = req.params;
    
    // Get attempt to find student_id and exam_id
    const attemptResult = await pool.query('SELECT * FROM attempts WHERE id = $1', [attemptId]);
    if (attemptResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Attempt not found" });
    }
    
    const attempt = attemptResult.rows[0];
    
    // Get proctor logs
    const logsResult = await pool.query(
      'SELECT * FROM proctor_logs WHERE student_id = $1 AND exam_id = $2 ORDER BY created_at',
      [attempt.student_id, attempt.exam_id]
    );
    
    const result = await verifyLogsIntegrity(parseInt(attemptId), logsResult.rows);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// HASH GENERATION (For manual verification)
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/hash/exam/:examId", async (req, res) => {
  try {
    const { examId } = req.params;
    
    const { rows } = await pool.query('SELECT * FROM exams WHERE id = $1', [examId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Exam not found" });
    }
    
    const hash = generateExamHash(rows[0]);
    res.json({ success: true, hash, examId: parseInt(examId) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/hash/attempt/:attemptId", async (req, res) => {
  try {
    const { attemptId } = req.params;
    
    const { rows } = await pool.query('SELECT * FROM attempts WHERE id = $1', [attemptId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Attempt not found" });
    }
    
    const hash = generateAttemptHash(rows[0]);
    res.json({ success: true, hash, attemptId: parseInt(attemptId) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/hash/logs/:attemptId", async (req, res) => {
  try {
    const { attemptId } = req.params;
    
    const attemptResult = await pool.query('SELECT * FROM attempts WHERE id = $1', [attemptId]);
    if (attemptResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: "Attempt not found" });
    }
    
    const attempt = attemptResult.rows[0];
    
    const logsResult = await pool.query(
      'SELECT * FROM proctor_logs WHERE student_id = $1 AND exam_id = $2 ORDER BY created_at',
      [attempt.student_id, attempt.exam_id]
    );
    
    const hash = generateLogsHash(logsResult.rows);
    res.json({ success: true, hash, logCount: logsResult.rows.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
