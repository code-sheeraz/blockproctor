// services/instructorService.js
import db from '../config/db.js';

// Get all exams for an instructor + basic stats from attempts
export async function getInstructorDashboard(instructorId) {
  const query = `
    SELECT 
      e.id,
      e.title,
      e.description,
      e.duration_minutes,
      e.created_at,
      e.starts_at,
      e.ends_at,
      COUNT(a.id)::int AS attempts_count,
      COALESCE(ROUND(AVG(a.score)::numeric, 2), 0) AS avg_score,
      MAX(a.submitted_at) AS last_attempt_at
    FROM exams e
    LEFT JOIN attempts a ON a.exam_id = e.id
    WHERE e.instructor_id = $1
    GROUP BY e.id
    ORDER BY e.created_at DESC;
  `;

  const { rows } = await db.query(query, [instructorId]);
  return rows;
}
