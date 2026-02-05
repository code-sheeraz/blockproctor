import * as faceapi from 'face-api.js';

export const loadModels = async () => {
    try {
        console.log("🚀 Starting Face-API (Hybrid CPU Mode)...");

        // 1. Set Backend to CPU (Stable & Crash-Proof)
        // We removed the 'WASM_HAS_SIMD_SUPPORT' line because it was causing the crash.
        await faceapi.tf.setBackend('cpu');
        await faceapi.tf.ready();

        const MODEL_URL = '/models';
        
        await Promise.all([
            // LIGHTWEIGHT detector for video (Fast)
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            // HEAVY detector for reference photo (Accurate)
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL), 
            // Landmarks & Recognition
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);

        console.log(`✅ AI Ready. Backend: ${faceapi.tf.getBackend()}`);
        return true;
    } catch (err) {
        console.error("❌ AI Load Failed:", err);
        return false;
    }
};