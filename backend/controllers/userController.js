// backend/controllers/userController.js
import db from '../config/db.js';

// 1. SAVE FACE (Enrollment)
export const enrollFace = async (req, res) => {
  try {
    const { userId } = req.params;
    const { faceDescriptor } = req.body;

    // Log what we received (Crucial for debugging)
    console.log(`[ENROLL] Attempting to enroll User ${userId}`);
    
    if (!faceDescriptor || faceDescriptor.length === 0) {
      console.error("[ENROLL] Fail: No face descriptor data received.");
      return res.status(400).json({ message: "No face data provided" });
    }

    // Convert array to string for JSONB storage
    const jsonDescriptor = JSON.stringify(faceDescriptor);

    // Run the Update
    const query = `
      UPDATE users 
      SET face_descriptor = $1 
      WHERE id = $2 
      RETURNING id, full_name, email; 
    `;
    
    const { rows } = await db.query(query, [jsonDescriptor, userId]);

    if (rows.length === 0) {
      console.error("[ENROLL] Fail: User ID not found in DB.");
      return res.status(404).json({ message: "User not found" });
    }

    console.log(`[ENROLL] Success! Face saved for User ${userId}`);
    res.status(200).json({ message: "Biometric enrollment successful" });

  } catch (error) {
    console.error("[ENROLL] Server Error:", error);
    res.status(500).json({ message: "Server error during enrollment" });
  }
};

// 2. FETCH FACE (Exam Check)
export const getEnrolledFace = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const query = 'SELECT face_descriptor FROM users WHERE id = $1';
    const { rows } = await db.query(query, [userId]);

    // CHECK: Does user exist?
    if (rows.length === 0) {
        return res.status(404).json({ message: "User not found" });
    }

    // CHECK: Is the column NULL? (This was causing the crash!)
    if (!rows[0].face_descriptor) {
        console.warn(`[FETCH] User ${userId} exists but has NO face enrolled.`);
        return res.status(404).json({ message: "Face not enrolled yet." });
    }

    res.json({ face_descriptor: rows[0].face_descriptor });
  } catch (error) {
    console.error("[FETCH] Server Error:", error);
    res.status(500).json({ message: "Server error fetching face" });
  }
};

// ... Keep your getUserById function here ...
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // FIX: Changed 'name' to 'full_name'
    const query = 'SELECT id, full_name, email, face_descriptor FROM users WHERE id = $1';
    
    const { rows } = await db.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Get User Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// backend/controllers/userController.js

// 1. LOG AN INCIDENT (Uses existing 'proctor_logs' table)
export const logIncident = async (req, res) => {
  try {
    const { userId } = req.params; // This is student_id
    const { examId, type, description, metadata } = req.body; // Frontend must send examId

    // Build event data with metadata (for tab switches, etc.)
    const eventData = JSON.stringify({ 
      type, 
      description, 
      metadata: metadata || {},
      timestamp: new Date().toISOString() 
    });

    // Insert into your EXISTING table
    await db.query(
      'INSERT INTO proctor_logs (student_id, exam_id, events_json) VALUES ($1, $2, $3)',
      [userId, examId, eventData]
    );

    res.status(200).json({ message: "Log recorded" });
  } catch (error) {
    console.error("Log Error:", error);
    res.status(500).json({ message: "Failed to log" });
  }
};

// 2. BLOCK THE USER (Uses existing 'exam_sessions' table)
export const blockUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { examId } = req.body; // Frontend must send examId

    // Update the session status to 'blocked'
    const result = await db.query(
      "UPDATE exam_sessions SET status = 'blocked' WHERE student_id = $1 AND exam_id = $2 RETURNING *",
      [userId, examId]
    );

    if (result.rowCount === 0) {
        // Fallback: If no session exists yet, maybe create one or just warn
        console.warn("No active session found to block");
    }

    res.status(200).json({ message: "User blocked successfully" });
  } catch (error) {
    console.error("Block Error:", error);
    res.status(500).json({ message: "Failed to block user" });
  }
};