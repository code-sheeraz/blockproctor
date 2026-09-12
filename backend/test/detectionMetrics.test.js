// test/detectionMetrics.test.js
// Unit tests for the detection-quality metric math (thesis §4.1.2 metrics).
// All expected values below are hand-computed.

import { describe, it, expect } from 'vitest';
import {
    toMs,
    fromProctorLogs,
    matchEvents,
    computeClassMetrics,
    evaluateDetection,
    evaluateSessionClasses,
    DEFAULT_TOLERANCE_MS,
} from '../utils/detectionMetrics.js';

describe('toMs', () => {
    it('passes through epoch ms numbers', () => {
        expect(toMs(1700000000000)).toBe(1700000000000);
    });

    it('converts Date objects', () => {
        const d = new Date('2026-08-01T10:00:00Z');
        expect(toMs(d)).toBe(d.getTime());
    });

    it('parses ISO strings', () => {
        expect(toMs('2026-08-01T10:00:00Z')).toBe(Date.parse('2026-08-01T10:00:00Z'));
    });

    it('parses numeric strings as epoch ms', () => {
        expect(toMs(' 1700000000000 ')).toBe(1700000000000);
    });

    it('throws on garbage input', () => {
        expect(() => toMs('not-a-date')).toThrow(/Invalid timestamp/);
        expect(() => toMs(null)).toThrow(/Invalid timestamp/);
    });
});

describe('fromProctorLogs', () => {
    it('maps proctor_logs rows to evaluation events', () => {
        const rows = [
            { violation_type: 'MULTI_FACE', created_at: '2026-08-01T10:00:00Z' },
            { violation_type: 'ABSENCE_CRITICAL', created_at: '2026-08-01T10:05:00Z' },
        ];
        expect(fromProctorLogs(rows)).toEqual([
            { type: 'MULTI_FACE', timestamp: '2026-08-01T10:00:00Z' },
            { type: 'ABSENCE_CRITICAL', timestamp: '2026-08-01T10:05:00Z' },
        ]);
        expect(fromProctorLogs(null)).toEqual([]);
    });
});

describe('matchEvents', () => {
    it('matches a perfect one-to-one timeline', () => {
        const gt = [{ type: 'A', t: 1000 }, { type: 'B', t: 5000 }];
        const det = [{ type: 'A', t: 1100 }, { type: 'B', t: 5200 }];
        const m = matchEvents(gt, det, DEFAULT_TOLERANCE_MS);
        expect(m.tp).toBe(2);
        expect(m.fp).toBe(0);
        expect(m.fn).toBe(0);
    });

    it('matches at exactly the tolerance and rejects beyond it', () => {
        const gt = [{ type: 'A', t: 10000 }];
        // delta exactly equal to tolerance -> TP
        let m = matchEvents(gt, [{ type: 'A', t: 13000 }], 3000);
        expect(m.tp).toBe(1);
        // delta tolerance + 1ms -> FP + FN
        m = matchEvents(gt, [{ type: 'A', t: 13001 }], 3000);
        expect(m.tp).toBe(0);
        expect(m.fp).toBe(1);
        expect(m.fn).toBe(1);
    });

    it('never matches across different types', () => {
        const gt = [{ type: 'MULTI_FACE', t: 1000 }];
        const det = [{ type: 'IMPERSONATION', t: 1000 }];
        const m = matchEvents(gt, det, 60000);
        expect(m.tp).toBe(0);
        expect(m.fp).toBe(1);
        expect(m.fn).toBe(1);
    });

    it('greedily matches each detection to its nearest free ground truth', () => {
        const gt = [{ type: 'A', t: 1000 }, { type: 'A', t: 1400 }];
        const det = [{ type: 'A', t: 1300 }];
        const m = matchEvents(gt, det, 300);
        // 1300 is closer to 1400 (delta 100) than to 1000 (delta 300)
        expect(m.pairs[0].gtTime).toBe(1400);
        expect(m.tp).toBe(1);
        expect(m.fn).toBe(1);
        expect(m.fp).toBe(0);
    });

    it('reports every ground-truth miss as a false negative', () => {
        const gt = [
            { type: 'HEAD_TURN_LEFT', t: 1000 },
            { type: 'HEAD_TURN_LEFT', t: 60000 },
            { type: 'HEAD_TURN_LEFT', t: 120000 },
        ];
        const det = [{ type: 'HEAD_TURN_LEFT', t: 1500 }];
        const m = matchEvents(gt, det, DEFAULT_TOLERANCE_MS);
        expect(m.tp).toBe(1);
        expect(m.fn).toBe(2);
        expect(m.fp).toBe(0);
    });
});

describe('computeClassMetrics', () => {
    it('computes perfect scores', () => {
        const m = computeClassMetrics({ tp: 2, fp: 0, fn: 0 });
        expect(m.precision).toBe(1);
        expect(m.recall).toBe(1);
        expect(m.f1).toBe(1);
        expect(m.fpr).toBeNull();
        expect(m.accuracy).toBeNull();
    });

    it('uses zero_division=0 convention for empty denominators', () => {
        // False alarms only: no positives in ground truth
        const alarms = computeClassMetrics({ tp: 0, fp: 3, fn: 0 });
        expect(alarms.precision).toBe(0);
        expect(alarms.recall).toBe(0);
        expect(alarms.f1).toBe(0);

        // Missed everything
        const misses = computeClassMetrics({ tp: 0, fp: 0, fn: 4 });
        expect(misses.recall).toBe(0);
        expect(misses.f1).toBe(0);
    });

    it('derives FPR and accuracy when tn is provided', () => {
        // tp=8 fp=2 fn=0 tn=90
        const m = computeClassMetrics({ tp: 8, fp: 2, fn: 0, tn: 90 });
        expect(m.precision).toBeCloseTo(0.8, 6);
        expect(m.recall).toBe(1);
        expect(m.tpr).toBe(1);
        expect(m.fpr).toBeCloseTo(2 / 92, 6);
        expect(m.accuracy).toBeCloseTo(98 / 100, 6);
        expect(m.f1).toBeCloseTo(16 / 18, 6);
    });
});

describe('evaluateDetection', () => {
    it('scores a flawless session with macro == micro == 1', () => {
        const events = [
            { type: 'MULTI_FACE', timestamp: 1000 },
            { type: 'IMPERSONATION', timestamp: 90000 },
            { type: 'TAB_SWITCH', timestamp: 180000 },
        ];
        const r = evaluateDetection(events, events.map(e => ({ ...e })));
        expect(r.summary.tp).toBe(3);
        expect(r.summary.macroF1).toBe(1);
        expect(r.summary.microF1).toBe(1);
        expect(r.perType).toHaveLength(3);
        for (const p of r.perType) {
            expect(p.f1).toBe(1);
            expect(p.fn).toBe(0);
            expect(p.fp).toBe(0);
        }
    });

    it('separates types and computes macro vs micro differently', () => {
        const gt = [
            { type: 'T1', timestamp: 1000 },
            { type: 'T1', timestamp: 2000 },
            { type: 'T1', timestamp: 3000 },
            { type: 'T1', timestamp: 4000 },
            { type: 'T2', timestamp: 5000 },
        ];
        const det = [
            { type: 'T1', timestamp: 1000 },
            { type: 'T1', timestamp: 2000 },
            { type: 'T1', timestamp: 3000 },
            { type: 'T1', timestamp: 4000 },
            { type: 'T1', timestamp: 4500 }, // false alarm
            // T2 missed entirely
        ];
        const r = evaluateDetection(gt, det);

        const t1 = r.perType.find(p => p.violationType === 'T1');
        const t2 = r.perType.find(p => p.violationType === 'T2');
        expect(t1.tp).toBe(4);
        expect(t1.fp).toBe(1);
        expect(t1.precision).toBe(0.8);
        expect(t1.recall).toBe(1);
        expect(t1.f1).toBe(0.8889); // 16/18 rounded to 4dp

        expect(t2.tp).toBe(0);
        expect(t2.fn).toBe(1);
        expect(t2.f1).toBe(0);

        expect(r.summary.macroPrecision).toBe(0.4);   // (0.8 + 0)/2
        expect(r.summary.macroRecall).toBe(0.5);      // (1 + 0)/2
        expect(r.summary.macroF1).toBe(0.4444);       // (0.8889 + 0)/2
        expect(r.summary.microPrecision).toBe(0.8);   // 4/(4+1)
        expect(r.summary.microRecall).toBe(0.8);      // 4/(4+1)
        expect(r.summary.microF1).toBe(0.8);
    });

    it('supports negative windows for FPR and accuracy', () => {
        const gt = Array.from({ length: 8 }, (_, i) => ({ type: 'A', timestamp: i * 10000 }));
        const det = [...gt.map(e => ({ ...e })), { type: 'A', timestamp: 999999 }];
        const r = evaluateDetection(gt, det, { negativeWindows: 100 });
        // tp=8 fp=1 fn=0 -> tn = 99, fpr = 1/100, accuracy = (8+99)/109
        expect(r.summary.tn).toBe(99);
        expect(r.summary.fpr).toBe(0.01);
        expect(r.summary.accuracy).toBe(0.9907); // 107/108 = 0.99074...
        expect(r.summary.f1).toBeCloseTo(16 / 17, 4);
    });

    it('accepts ISO timestamps and DB rows end-to-end', () => {
        const gt = [
            { type: 'MULTI_FACE', timestamp: '2026-08-01T10:00:00Z' },
            { type: 'MULTI_FACE', timestamp: '2026-08-01T10:20:00Z' },
        ];
        const logs = fromProctorLogs([
            { violation_type: 'MULTI_FACE', created_at: new Date('2026-08-01T10:00:02Z') },
        ]);
        const r = evaluateDetection(gt, logs, { toleranceMs: 3000 });
        expect(r.summary.tp).toBe(1);
        expect(r.summary.fn).toBe(1);
        expect(r.summary.recall).toBeCloseTo(0.5, 4);
        expect(r.summary.precision).toBe(1);
        expect(r.summary.f1).toBeCloseTo(2 / 3, 4);
    });

    it('returns zeroed metrics for completely empty input', () => {
        const r = evaluateDetection([], []);
        expect(r.perType).toHaveLength(0);
        expect(r.summary.macroF1).toBe(0);
        expect(r.summary.microF1).toBe(0);
    });

    it('throws on malformed inputs', () => {
        expect(() => evaluateDetection('nope', [])).toThrow(/array/i);
        expect(() => evaluateDetection([{ timestamp: 1 }], [])).toThrow(/type/i);
        expect(() => evaluateDetection([{ type: 'A', timestamp: 'x' }], [])).toThrow(/timestamp/i);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// SESSION-CLASS EVALUATION
// ═══════════════════════════════════════════════════════════════════════════

describe('evaluateSessionClasses — mechanics (synthetic case)', () => {
    it('computes per-class confusion across binary session decisions', () => {
        const sessions = [
            { sessionId: 'a', groundTruthClasses: ['X'], detectedClasses: ['X'] },        // X: tp, Y: tn
            { sessionId: 'b', groundTruthClasses: ['X'], detectedClasses: [] },           // X: fn, Y: tn
            { sessionId: 'c', groundTruthClasses: [], detectedClasses: ['Y'] },           // X: tn, Y: fp
        ];
        const r = evaluateSessionClasses(sessions);
        expect(r.sessions).toBe(3);
        expect(r.decisions).toBe(6);

        const x = r.perClass.find(c => c.violationType === 'X');
        expect(x).toMatchObject({ tp: 1, fn: 1, fp: 0, tn: 1, precision: 1, recall: 0.5 });
        expect(x.f1).toBeCloseTo(2 / 3, 4);

        const y = r.perClass.find(c => c.violationType === 'Y');
        expect(y).toMatchObject({ tp: 0, fp: 1, fn: 0, tn: 2, recall: null, precision: null, f1: null });
        expect(y.fpr).toBeCloseTo(1 / 3, 4); // one false alarm out of 3 not-performed sessions

        expect(r.summary).toMatchObject({ tp: 1, fp: 1, fn: 1, tn: 3 });
    });

    it('throws on malformed input', () => {
        expect(() => evaluateSessionClasses('nope')).toThrow(/array/i);
        expect(() => evaluateSessionClasses([{ sessionId: 1 }])).toThrow(/groundTruthClasses/i);
    });
});

describe('evaluateSessionClasses — BlockProctor field validation dataset', () => {
    // The exact seven-session dataset from the August 2026 field runs
    // (3 behavioural sessions + 4 impersonation trials). Expected values below
    // are hand-computed and ARE the thesis Table 4.2 numbers; this test keeps
    // them regression-locked to the harness.
    const FIELD_SESSIONS = [
        {
            sessionId: 's1-shortcuts',
            groundTruthClasses: ['TAB_AWAY', 'KEYBOARD_SHORTCUT', 'RIGHT_CLICK'],
            detectedClasses: ['TAB_AWAY', 'KEYBOARD_SHORTCUT', 'RIGHT_CLICK'],
        },
        {
            sessionId: 's2-mixed',
            groundTruthClasses: ['HEAD_TURN_RIGHT', 'HEAD_TURN_LEFT', 'HEAD_TURN_UP', 'TAB_AWAY', 'ABSENCE_MINOR', 'MULTI_FACE'],
            detectedClasses: ['HEAD_TURN_RIGHT', 'HEAD_TURN_LEFT', 'HEAD_TURN_UP', 'TAB_AWAY', 'MULTI_FACE'],
        },
        {
            sessionId: 's3-normal',
            groundTruthClasses: ['HEAD_TURN_UP', 'HEAD_TURN_RIGHT'],
            detectedClasses: ['HEAD_TURN_RIGHT', 'HEAD_TURN_UP'],
        },
        // Impersonation trials: substitute sat in place of the enrolled student;
        // each trial scores ONLY the IMPERSONATION class (design scope).
        ...[1, 2, 3, 4].map(i => ({
            sessionId: `s${3 + i}-impersonation`,
            groundTruthClasses: ['IMPERSONATION'],
            detectedClasses: ['IMPERSONATION'],
        })),
    ];

    const result = evaluateSessionClasses(FIELD_SESSIONS);

    it('evaluates 9 exercised classes over 63 decisions (9x7 full grid)', () => {
        expect(result.sessions).toBe(7);
        expect(result.decisions).toBe(63);
        expect(result.perClass).toHaveLength(9);
    });

    it('scores every performed-and-detected class at 100% F1, including IMPERSONATION 4/4', () => {
        for (const type of [
            'HEAD_TURN_LEFT', 'HEAD_TURN_RIGHT', 'HEAD_TURN_UP',
            'MULTI_FACE', 'TAB_AWAY', 'RIGHT_CLICK', 'KEYBOARD_SHORTCUT',
            'IMPERSONATION',
        ]) {
            const c = result.perClass.find(p => p.violationType === type);
            expect(c.f1).toBe(1);
        }
        const left = result.perClass.find(c => c.violationType === 'HEAD_TURN_LEFT');
        expect(left).toMatchObject({ tp: 1, fp: 0, fn: 0, tn: 6 });

        const right = result.perClass.find(c => c.violationType === 'HEAD_TURN_RIGHT');
        expect(right).toMatchObject({ tp: 2, fp: 0, fn: 0, tn: 5 });

        const up = result.perClass.find(c => c.violationType === 'HEAD_TURN_UP');
        expect(up).toMatchObject({ tp: 2, fp: 0, fn: 0, tn: 5 });

        const imp = result.perClass.find(c => c.violationType === 'IMPERSONATION');
        expect(imp).toMatchObject({ tp: 4, fp: 0, fn: 0, tn: 3, positives: 4 });
    });

    it('records the single absence miss as a false negative', () => {
        const abs = result.perClass.find(c => c.violationType === 'ABSENCE_MINOR');
        expect(abs).toMatchObject({ tp: 0, fp: 0, fn: 1, tn: 6, precision: 0, recall: 0, f1: 0 });
    });

    it('reports the now-exercised IMPERSONATION class with perfect scores', () => {
        const imp = result.perClass.find(c => c.violationType === 'IMPERSONATION');
        expect(imp).toMatchObject({ tp: 4, fp: 0, fn: 0, tn: 3, positives: 4, precision: 1, recall: 1, f1: 1 });
        expect(imp.fpr).toBe(0);
    });

    it('produces the headline summary: Accuracy .9841, P 1.0, R .9333, micro-F1 .9655, macro-F1 .8889, FPR 0', () => {
        expect(result.summary).toEqual({
            tp: 14, fp: 0, fn: 1, tn: 48,
            accuracy: 0.9841,
            precision: 1,
            recall: 0.9333,
            f1: 0.9655,
            microF1: 0.9655,
            macroF1: 0.8889,
            fpr: 0,
        });
    });
});
