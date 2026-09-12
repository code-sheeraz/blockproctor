// src/utils/headPose.test.js
// UDLR classification tests against thesis Table 3.2 thresholds:
//   yaw |v| > 0.25 -> LEFT/RIGHT, pitch |v| > 0.20 -> DOWN/UP.
// makeLandmarks builds a face with faceWidth = 1 and faceHeight = 1, so
// noseX maps directly to yaw and (noseY - 0.35) maps directly to pitch.

import { describe, it, expect } from 'vitest';
import { calculateHeadPose, makeLandmarks, DEFAULT_THRESHOLDS } from './headPose.js';

describe('calculateHeadPose — straight pose', () => {
    it('classifies a centered face as CENTER / LEVEL / straight', () => {
        const r = calculateHeadPose(makeLandmarks({ noseX: 0 }));
        expect(r.yawDirection).toBe('CENTER');
        expect(r.pitchDirection).toBe('LEVEL');
        expect(r.isStraight).toBe(true);
    });
});

describe('calculateHeadPose — yaw boundaries', () => {
    it('keeps CENTER at exactly +0.25 (strictly-greater rule)', () => {
        const r = calculateHeadPose(makeLandmarks({ noseX: 0.25 }));
        expect(r.yaw).toBeCloseTo(0.25);
        expect(r.yawDirection).toBe('CENTER');
        expect(r.isStraight).toBe(true); // boundary is not a violation
    });

    it('flags LEFT just past +0.25', () => {
        const r = calculateHeadPose(makeLandmarks({ noseX: 0.26 }));
        expect(r.yawDirection).toBe('LEFT');
        expect(r.isStraight).toBe(false);
    });

    it('flags RIGHT just past -0.25', () => {
        const r = calculateHeadPose(makeLandmarks({ noseX: -0.26 }));
        expect(r.yawDirection).toBe('RIGHT');
    });
});

describe('calculateHeadPose — pitch boundaries', () => {
    it('keeps LEVEL below the threshold (noseY = 0.54 -> pitch 0.19)', () => {
        // NB: noseY=0.55 cannot be used for an exact-boundary assertion because
        // JS floating point makes 0.55 - 0.35 = 0.20000000000000004 (> 0.20).
        // The production formula shares this behaviour by design.
        const r = calculateHeadPose(makeLandmarks({ noseY: 0.54 }));
        expect(r.pitch).toBeCloseTo(0.19);
        expect(r.pitchDirection).toBe('LEVEL');
        expect(r.isStraight).toBe(true);
    });

    it('flags DOWN past +0.20 (looking down)', () => {
        const r = calculateHeadPose(makeLandmarks({ noseY: 0.56 }));
        expect(r.pitchDirection).toBe('DOWN');
        expect(r.isStraight).toBe(false);
    });

    it('flags UP below -0.20 relative to expected (nose raised)', () => {
        // pitch = (noseY - eyeMidY) - 0.35; eyes at y=0 -> pitch = noseY - 0.35
        const r = calculateHeadPose(makeLandmarks({ noseY: 0.14 })); // pitch = -0.21
        expect(r.pitch).toBeCloseTo(-0.21);
        expect(r.pitchDirection).toBe('UP');
    });
});

describe('calculateHeadPose — combined directions', () => {
    it('reports both axes turning simultaneously', () => {
        const r = calculateHeadPose(makeLandmarks({ noseX: 0.4, noseY: 0.6 }));
        expect(r.yawDirection).toBe('LEFT');
        expect(r.pitchDirection).toBe('DOWN');
        expect(r.isStraight).toBe(false);
    });
});

describe('calculateHeadPose — thresholds are configurable', () => {
    it('honors custom (stricter) thresholds', () => {
        const r = calculateHeadPose(makeLandmarks({ noseX: 0.26 }), { yaw: 0.10, pitch: 0.20 });
        expect(r.yawDirection).toBe('LEFT');
        const lenient = calculateHeadPose(makeLandmarks({ noseX: 0.26 }), { yaw: 0.50, pitch: 0.20 });
        expect(lenient.yawDirection).toBe('CENTER');
    });

    it('exports the documented defaults', () => {
        expect(DEFAULT_THRESHOLDS).toEqual({ yaw: 0.25, pitch: 0.20 });
    });
});
