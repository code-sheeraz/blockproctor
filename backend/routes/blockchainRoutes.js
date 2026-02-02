// routes/blockchainRoutes.js
import express from "express";
import {
  setExamHash,
  setAttemptHash,
  setLogHash,
  getExamHash,
  getAttemptHash,
  getLogHash
} from "../services/blockchainService.js";

const router = express.Router();

router.post("/exams/:examId/hash", async (req, res) => {
  try {
    const tx = await setExamHash(req.body.hash);
    res.json({ success: true, tx });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/attempts/:attemptId/hash", async (req, res) => {
  try {
    const tx = await setAttemptHash(req.body.hash);
    res.json({ success: true, tx });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/logs/hash", async (req, res) => {
  try {
    const tx = await setLogHash(req.body.hash);
    res.json({ success: true, tx });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/exams/hash", async (req, res) => {
  try {
    const hash = await getExamHash();
    res.json({ success: true, hash });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/attempts/hash", async (req, res) => {
  try {
    const hash = await getAttemptHash();
    res.json({ success: true, hash });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/logs/hash", async (req, res) => {
  try {
    const hash = await getLogHash();
    res.json({ success: true, hash });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
