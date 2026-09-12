// Head-pose math for the AI proctor (UDLR detection), extracted verbatim from
// ExamProctor.jsx so the thesis Table 3.2 thresholds are unit-testable.
//
// MediaPipe FaceMesh landmark indices used:
//   1 = nose tip, 33 = left eye outer, 263 = right eye outer,
//   152 = chin, 10 = forehead

export const DEFAULT_THRESHOLDS = {
    yaw: 0.25,   // |yaw| above this => LEFT / RIGHT
    pitch: 0.20, // |pitch| above this => UP / DOWN
};

/**
 * Compute normalized yaw/pitch and their UDLR classification for one face.
 * @param {Array<{x:number,y:number,z?:number}>} landmarks 468 FaceMesh points
 * @param {{yaw:number,pitch:number}} [thresholds]
 */
export function calculateHeadPose(landmarks, thresholds = DEFAULT_THRESHOLDS) {
    const noseTip = landmarks[1];
    const leftEyeOuter = landmarks[33];
    const rightEyeOuter = landmarks[263];
    const chin = landmarks[152];
    const forehead = landmarks[10];

    const faceWidth = Math.abs(rightEyeOuter.x - leftEyeOuter.x);
    const faceHeight = Math.abs(forehead.y - chin.y);

    // YAW (Left/Right)
    const eyeMidX = (leftEyeOuter.x + rightEyeOuter.x) / 2;
    const yaw = (noseTip.x - eyeMidX) / faceWidth;

    // PITCH (Up/Down)
    const eyeMidY = (leftEyeOuter.y + rightEyeOuter.y) / 2;
    const noseDeltaY = noseTip.y - eyeMidY;
    const expectedNoseY = faceHeight * 0.35;
    const pitch = (noseDeltaY - expectedNoseY) / faceHeight;

    let yawDirection = "CENTER";
    if (Math.abs(yaw) > thresholds.yaw) {
        yawDirection = yaw > 0 ? "LEFT" : "RIGHT";
    }

    let pitchDirection = "LEVEL";
    if (Math.abs(pitch) > thresholds.pitch) {
        pitchDirection = pitch > 0 ? "DOWN" : "UP";
    }

    const isStraight = yawDirection === "CENTER" && pitchDirection === "LEVEL";

    return { yaw, pitch, yawDirection, pitchDirection, isStraight };
}

/**
 * Build a synthetic landmark array for tests/simulation.
 */
export function makeLandmarks({ noseX = 0, noseY = null, eyeY = 0 } = {}) {
    const pt = (x, y) => ({ x, y });
    const landmarks = Array.from({ length: 468 }, () => pt(0, 0));
    landmarks[33] = pt(-0.5, eyeY);   // left eye outer  -> faceWidth = 1
    landmarks[263] = pt(0.5, eyeY);   // right eye outer
    landmarks[10] = pt(0, 0);         // forehead       -> faceHeight = 1
    landmarks[152] = pt(0, 1);        // chin
    landmarks[1] = pt(noseX, noseY === null ? 0.35 * 1 : noseY); // nose tip
    return landmarks;
}
