#!/usr/bin/env node
// scripts/evaluate_detection.mjs
// Offline evaluation harness for the AI proctoring module (thesis §4.1.2
// metrics): TPR / FPR / precision / recall / accuracy / F1.
//
// TWO FILE MODES
// ──────────────
// 1) EVENT MODE (default when the file has `groundTruth` + `detected`):
//    matches annotated violation events to system detections within a time
//    tolerance. Best when timestamps are exact (e.g. derived from DB rows).
//
//    {
//      "scenario": "Scenario 1 - Shortcuts & tab switches",
//      "toleranceMs": 3000,
//      "groundTruth": [{ "type": "TAB_AWAY", "timestamp": "00:00:43" }, ...],
//      "detected":   [{ "type": "TAB_AWAY", "timestamp": "00:00:43" }, ...]
//    }
//
//    Timestamps may be epoch ms, ISO strings, or HH:MM:SS exam-clock offsets.
//
// 2) SESSION-CLASS MODE (`"mode": "session-classes"`): binary performed-vs-
//    detected decision per class per session. Robust when annotations come
//    from memory and exact times cannot be trusted. Produces true negatives,
//    so Accuracy and FPR are legitimately computable.
//
//    {
//      "mode": "session-classes",
//      "scenario": "...",
//      "sessions": [
//        { "sessionId": "s1", "groundTruthClasses": [...], "detectedClasses": [...] },
//        ...
//      ]
//    }
//
// Usage:
//   node scripts/evaluate_detection.mjs data/ground-truth/<file>.json [more.json ...]

import fs from 'fs';
import path from 'path';
import { evaluateDetection, evaluateSessionClasses } from '../utils/detectionMetrics.js';

function parseClock(ts) {
    // Convert "HH:MM:SS" (or "MM:SS") exam-clock strings to ms offsets.
    if (typeof ts !== 'string') return null;
    const m = ts.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1] || 0);
    const min = Number(m[2]);
    const s = Number(m[3]);
    return ((h * 60 + min) * 60 + s) * 1000;
}

function mapEvents(list) {
    return list.map(e => {
        const clock = parseClock(e.timestamp);
        return { type: e.type ?? e.violation_type, timestamp: clock !== null ? clock : e.timestamp };
    });
}

const pct = v => (v === null || v === undefined) ? '—' : `${(v * 100).toFixed(1)}%`;

function printEventReport(file, result) {
    console.log(`\n═══ ${file.scenario} (event-level, tolerance=${result.toleranceMs}ms) ═══`);
    console.log('');
    console.log('| Violation Type | TP | FP | FN | TPR/Recall | Precision | F1 |');
    console.log('|----------------|----|----|----|-----------|-----------|----|');
    for (const p of result.perType) {
        console.log(`| ${p.violationType} | ${p.tp} | ${p.fp} | ${p.fn} | ${pct(p.recall)} | ${pct(p.precision)} | ${pct(p.f1)} |`);
    }
    const s = result.summary;
    console.log('');
    console.log(`Overall  : tp=${s.tp} fp=${s.fp} fn=${s.fn}${s.tn !== null ? ` tn=${s.tn}` : ''}`);
    console.log(`Micro F1 : ${pct(s.microF1)}   (P=${pct(s.microPrecision)} R=${pct(s.microRecall)})`);
    console.log(`Macro F1 : ${pct(s.macroF1)}   (P=${pct(s.macroPrecision)} R=${pct(s.macroRecall)})`);
    if (s.accuracy !== null) console.log(`Accuracy : ${pct(s.accuracy)}  FPR=${pct(s.fpr)}`);
}

function printSessionClassReport(file, result) {
    console.log(`\n═══ ${file.scenario} (session-class level, ${result.sessions} sessions, ${result.decisions} decisions) ═══`);
    console.log('');
    console.log('| Violation Type | TP | FP | FN | TN | Positives | Recall/TPR | Precision | Accuracy | FPR | F1 |');
    console.log('|----------------|----|----|----|----|-----------|-----------|-----------|----------|-----|----|');
    for (const p of result.perClass) {
        console.log(
            `| ${p.violationType} | ${p.tp} | ${p.fp} | ${p.fn} | ${p.tn} | ${p.positives} | ` +
            `${pct(p.recall)} | ${pct(p.precision)} | ${pct(p.accuracy)} | ${pct(p.fpr)} | ${pct(p.f1)} |`
        );
    }
    const s = result.summary;
    console.log('');
    console.log(`Decisions : tp=${s.tp} fp=${s.fp} fn=${s.fn} tn=${s.tn}`);
    console.log(`Accuracy  : ${pct(s.accuracy)}`);
    console.log(`Precision : ${pct(s.precision)}   Recall: ${pct(s.recall)}   FPR: ${pct(s.fpr)}`);
    console.log(`Micro F1  : ${pct(s.microF1)}`);
    console.log(`Macro F1  : ${pct(s.macroF1)}   (classes with ≥1 positive sample)`);
}

const args = process.argv.slice(2);
if (args.length === 0) {
    console.error('Usage: node scripts/evaluate_detection.mjs <groundTruthFile.json> [moreFiles...]');
    console.error('See data/ground-truth/*.json for both supported file formats.');
    process.exit(1);
}

let failed = 0;
for (const fileArg of args) {
    try {
        const raw = JSON.parse(fs.readFileSync(fileArg, 'utf8'));

        if (raw.mode === 'session-classes') {
            if (!Array.isArray(raw.sessions)) throw new Error('session-classes files need a `sessions` array');
            const result = evaluateSessionClasses(raw.sessions);
            printSessionClassReport({ scenario: raw.scenario || path.basename(fileArg) }, result);
            continue;
        }

        if (!Array.isArray(raw.groundTruth)) throw new Error('file must contain a `groundTruth` array (or use "mode":"session-classes")');
        const detectedKey = Array.isArray(raw.detected) ? 'detected' : (Array.isArray(raw.logs) ? 'logs' : null);
        if (!detectedKey) throw new Error('event-mode files need a `detected` (or `logs`) array');

        const result = evaluateDetection(mapEvents(raw.groundTruth), mapEvents(raw[detectedKey]), {
            toleranceMs: raw.toleranceMs,
            negativeWindows: raw.negativeWindows ?? null,
        });
        printEventReport({ scenario: raw.scenario || path.basename(fileArg) }, result);
    } catch (err) {
        failed++;
        console.error(`✗ ${fileArg}: ${err.message}`);
    }
}
process.exit(failed > 0 ? 1 : 0);
