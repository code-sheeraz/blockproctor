// utils/scoring.js
// Canonical exam scoring. Supports BOTH authoring formats found in the wild:
//   - numeric index into options[]      e.g. { options: [...], answer: 0 }
//   - literal option text               e.g. { correctAnswer: "14 AUgust" }
// The client always submits the selected option's TEXT, so numeric answers
// must be resolved through options[] before comparison.

function normalize(value) {
    return String(value ?? "").trim().toLowerCase();
}

/**
 * Resolve a question's correct answer to normalized comparable text.
 * Numeric strings are treated as option indexes ONLY when an options array
 * exists and the index resolves to a non-empty entry; otherwise the value is
 * compared verbatim.
 */
export function resolveCorrectAnswer(q) {
    if (!q || typeof q !== "object") return "";
    const raw = q.answer ?? q.correctAnswer;
    if (raw === undefined || raw === null) return "";

    const asStr = String(raw).trim();
    if (/^\d+$/.test(asStr) && Array.isArray(q.options)) {
        const opt = q.options[Number(asStr)];
        if (opt !== undefined && opt !== null && String(opt).trim() !== "") {
            return normalize(opt);
        }
    }
    return normalize(asStr);
}

/** True when the submitted (option-text) answer matches the question key. */
export function isCorrectAnswer(q, submitted) {
    const correct = resolveCorrectAnswer(q);
    return correct !== "" && correct === normalize(submitted);
}

/**
 * Score a full attempt. Equal weight per question, percentage scale 0-100.
 * Returns { score, correct, total }.
 */
export function calculateScore(questions, answers) {
    if (!Array.isArray(questions) || questions.length === 0) {
        return { score: 0, correct: 0, total: 0 };
    }

    let correct = 0;
    for (let i = 0; i < questions.length; i++) {
        if (isCorrectAnswer(questions[i], answers[i])) correct++;
    }

    return {
        score: Math.round((correct / questions.length) * 100),
        correct,
        total: questions.length,
    };
}

export default { resolveCorrectAnswer, isCorrectAnswer, calculateScore };
