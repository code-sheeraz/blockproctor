// utils/detectionMetrics.js
// Detection-quality metrics for the AI proctoring module (thesis §4.1.2):
// TPR/recall, FPR, precision, accuracy and F1 computed from ground-truth
// annotated events vs system-detected events, matched within a time tolerance.
//
// Conventions (sklearn zero_division=0 style): a metric whose denominator is 0
// evaluates to 0. FPR/accuracy require a negative-window count; otherwise null.

export const DEFAULT_TOLERANCE_MS = 3000;

// ═══════════════════════════════════════════════════════════════════════════════
// NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

export function toMs(ts) {
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
    if (typeof ts === 'string') {
        // Numeric strings are treated as epoch ms ("1700000000000")
        if (/^\d+$/.test(ts.trim())) return Number(ts.trim());
        const parsed = Date.parse(ts);
        if (!Number.isNaN(parsed)) return parsed;
    }
    throw new Error(`Invalid timestamp: ${JSON.stringify(ts)}`);
}

function normalizeEvents(events, typeKey, timeKey) {
    if (!Array.isArray(events)) {
        throw new Error('events must be an array');
    }
    return events.map((e, i) => {
        if (!e || typeof e !== 'object') {
            throw new Error(`events[${i}] is not an object`);
        }
        const type = e[typeKey];
        if (!type || typeof type !== 'string') {
            throw new Error(`events[${i}].${typeKey} must be a non-empty string`);
        }
        return { type, t: toMs(e[timeKey]) };
    });
}

// Map proctor_logs rows to evaluation events.
export function fromProctorLogs(rows) {
    return (rows || []).map(r => ({
        type: r.violation_type,
        timestamp: r.created_at ?? r.createdAt,
    }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT MATCHING (per-type greedy nearest match within tolerance)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Match detected events to ground-truth events of the same type.
 * A ground-truth event matches at most one detection and vice versa.
 * Returns { tp, fn, fp } counts plus the unmatched lists for inspection.
 */
export function matchEvents(groundTruth, detected, toleranceMs = DEFAULT_TOLERANCE_MS) {
    const gt = [...groundTruth].sort((a, b) => a.t - b.t);
    const det = [...detected].sort((a, b) => a.t - b.t);
    const gtUsed = new Array(gt.length).fill(false);

    const pairs = [];
    const falsePositives = [];

    for (const d of det) {
        let bestIdx = -1;
        let bestDelta = Infinity;
        for (let i = 0; i < gt.length; i++) {
            if (gtUsed[i] || gt[i].type !== d.type) continue;
            const delta = Math.abs(gt[i].t - d.t);
            if (delta <= toleranceMs && delta < bestDelta) {
                bestDelta = delta;
                bestIdx = i;
            }
        }
        if (bestIdx >= 0) {
            gtUsed[bestIdx] = true;
            pairs.push({ type: d.type, gtTime: gt[bestIdx].t, detectedTime: d.t, deltaMs: bestDelta });
        } else {
            falsePositives.push(d);
        }
    }

    const falseNegatives = gt.filter((_, i) => !gtUsed[i]);
    return {
        tp: pairs.length,
        fn: falseNegatives.length,
        fp: falsePositives.length,
        pairs,
        falsePositives,
        falseNegatives,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// METRIC MATH
// ═══════════════════════════════════════════════════════════════════════════════

const ratio = (num, den) => (den > 0 ? num / den : 0);

/**
 * Compute quality metrics from confusion-matrix counts.
 * `tn` may be null when negative windows are unknown — FPR/accuracy become null.
 */
export function computeClassMetrics({ tp, fp, fn, tn = null }) {
    const precision = ratio(tp, tp + fp);
    const recall = ratio(tp, tp + fn);
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    const hasTn = tn !== null && tn !== undefined;
    return {
        tp,
        fp,
        fn,
        tn: hasTn ? tn : null,
        tpr: recall,
        fpr: hasTn ? ratio(fp, fp + tn) : null,
        precision,
        recall,
        accuracy: hasTn ? ratio(tp + tn, tp + tn + fp + fn) : null,
        f1,
    };
}

const mean = values => (values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const round4 = v => (v === null ? null : Math.round(v * 10000) / 10000);

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION-CLASS EVALUATION (robust to timestamp noise in field runs)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Binary "performed?" vs "detected?" decision per violation class per session.
 * Robust when annotated timestamps are unreliable (memory-based notes): only
 * class presence per session matters. Yields true negatives, so Accuracy and
 * FPR are legitimately computable.
 *
 * @param {Array<{sessionId:string|number,
 *                groundTruthClasses:string[],
 *                detectedClasses:string[]}>} sessionDecisions
 */
export function evaluateSessionClasses(sessionDecisions) {
    if (!Array.isArray(sessionDecisions)) {
        throw new Error('sessionDecisions must be an array');
    }

    const classSet = new Set();
    for (const s of sessionDecisions) {
        if (!s || !Array.isArray(s.groundTruthClasses) || !Array.isArray(s.detectedClasses)) {
            throw new Error('each session needs groundTruthClasses[] and detectedClasses[]');
        }
        s.groundTruthClasses.forEach(c => classSet.add(c));
        s.detectedClasses.forEach(c => classSet.add(c));
    }
    const types = [...classSet].sort();

    const perClass = types.map(type => {
        let tp = 0, fp = 0, fn = 0, tn = 0;
        for (const s of sessionDecisions) {
            const performed = s.groundTruthClasses.includes(type);
            const detected = s.detectedClasses.includes(type);
            if (performed && detected) tp++;
            else if (performed && !detected) fn++;
            else if (!performed && detected) fp++;
            else tn++;
        }

        const positives = tp + fn;
        // Classes never performed anywhere have no meaningful P/R/F1 — report
        // null and exclude from the macro average (they still contribute TN/FP
        // to the micro totals).
        const hasPositives = positives > 0;
        const precision = hasPositives ? ratio(tp, tp + fp) : null;
        const recall = hasPositives ? ratio(tp, positives) : null;
        const f1 = hasPositives
            ? (precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0)
            : null;

        return {
            violationType: type,
            tp, fp, fn, tn,
            samples: sessionDecisions.length,
            positives,
            tpr: recall,
            fpr: ratio(fp, fp + tn),
            precision,
            recall,
            accuracy: ratio(tp + tn, sessionDecisions.length),
            f1,
        };
    });

    const totals = perClass.reduce(
        (a, c) => ({ tp: a.tp + c.tp, fp: a.fp + c.fp, fn: a.fn + c.fn, tn: a.tn + c.tn }),
        { tp: 0, fp: 0, fn: 0, tn: 0 }
    );
    const totalDecisions = totals.tp + totals.fp + totals.fn + totals.tn;

    const microPrecision = ratio(totals.tp, totals.tp + totals.fp);
    const microRecall = ratio(totals.tp, totals.tp + totals.fn);
    const microF1 = microPrecision + microRecall > 0
        ? (2 * microPrecision * microRecall) / (microPrecision + microRecall)
        : 0;

    const supported = perClass.filter(c => c.positives > 0);
    const macroF1 = supported.length > 0 ? mean(supported.map(c => c.f1)) : 0;

    return {
        sessions: sessionDecisions.length,
        decisions: totalDecisions,
        perClass: perClass.map(c => ({
            ...c,
            tpr: round4(c.tpr),
            fpr: round4(c.fpr),
            precision: round4(c.precision),
            recall: round4(c.recall),
            accuracy: round4(c.accuracy),
            f1: round4(c.f1),
        })),
        summary: {
            tp: totals.tp,
            fp: totals.fp,
            fn: totals.fn,
            tn: totals.tn,
            accuracy: round4(ratio(totals.tp + totals.tn, totalDecisions)),
            precision: round4(microPrecision),
            recall: round4(microRecall),
            f1: round4(microF1),          // micro-averaged
            microF1: round4(microF1),
            macroF1: round4(macroF1),
            fpr: round4(ratio(totals.fp, totals.fp + totals.tn)),
        },
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVALUATION ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Evaluate detections against ground truth.
 *
 * @param {Array<{type:string, timestamp:*}>} groundTruth annotated violations
 * @param {Array<{type:string, timestamp:*}>} detected system-logged events
 * @param {object} [opts]
 * @param {number}   [opts.toleranceMs=3000]   max |gt − detected| for a TP match
 * @param {number}   [opts.negativeWindows]    total decision windows (enables FPR/accuracy)
 * @param {string}   [opts.typeKey='type']
 * @param {string}   [opts.timeKey='timestamp']
 */
export function evaluateDetection(groundTruthRaw, detectedRaw, opts = {}) {
    const {
        toleranceMs = DEFAULT_TOLERANCE_MS,
        negativeWindows = null,
        typeKey = 'type',
        timeKey = 'timestamp',
    } = opts;

    const groundTruth = normalizeEvents(groundTruthRaw, typeKey, timeKey);
    const detected = normalizeEvents(detectedRaw, typeKey, timeKey);

    const types = [...new Set([...groundTruth, ...detected].map(e => e.type))].sort();

    const perType = types.map(type => {
        const m = matchEvents(
            groundTruth.filter(e => e.type === type),
            detected.filter(e => e.type === type),
            toleranceMs
        );
        // Negative windows are a global measurement; attribute them per class only
        // when evaluating that class in a one-vs-rest sense is possible. Without
        // per-class window counts we keep tn/fpr/accuracy null per type.
        const metrics = computeClassMetrics({ tp: m.tp, fp: m.fp, fn: m.fn, tn: null });
        return { violationType: type, ...metrics };
    });

    const overallMatch = matchEvents(groundTruth, detected, toleranceMs);
    const summary = computeClassMetrics({
        tp: overallMatch.tp,
        fp: overallMatch.fp,
        fn: overallMatch.fn,
        tn: negativeWindows !== null
            ? Math.max(negativeWindows - overallMatch.fp, 0)
            : null,
    });

    const macroF1 = mean(perType.map(p => p.f1));
    const macroPrecision = mean(perType.map(p => p.precision));
    const macroRecall = mean(perType.map(p => p.recall));
    // Micro averages pool all classes before computing the ratios.
    const microPrecision = ratio(summary.tp, summary.tp + summary.fp);
    const microRecall = ratio(summary.tp, summary.tp + summary.fn);
    const microF1 = microPrecision + microRecall > 0
        ? (2 * microPrecision * microRecall) / (microPrecision + microRecall)
        : 0;

    const roundMetrics = m => ({
        ...m,
        tpr: round4(m.tpr),
        fpr: round4(m.fpr),
        precision: round4(m.precision),
        recall: round4(m.recall),
        accuracy: round4(m.accuracy),
        f1: round4(m.f1),
    });

    return {
        toleranceMs,
        negativeWindows,
        summary: {
            ...roundMetrics(summary),
            macroPrecision: round4(macroPrecision),
            macroRecall: round4(macroRecall),
            macroF1: round4(macroF1),
            microPrecision: round4(microPrecision),
            microRecall: round4(microRecall),
            microF1: round4(microF1),
        },
        perType: perType.map(roundMetrics),
    };
}

export default {
    toMs,
    fromProctorLogs,
    matchEvents,
    computeClassMetrics,
    evaluateDetection,
    evaluateSessionClasses,
    DEFAULT_TOLERANCE_MS,
};
