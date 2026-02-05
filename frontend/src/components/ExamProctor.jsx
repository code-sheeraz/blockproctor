import React, { useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import * as faceapi from 'face-api.js';
import { FaceMesh } from '@mediapipe/face_mesh';

const ExamProctor = ({ studentId, examId, onLogsUpdate, onExamBlock }) => {
    const webcamRef = useRef(null);
    
    // UI State
    const [status, setStatus] = useState("Initializing AI...");
    const [trustScore, setTrustScore] = useState(100);
    const [debugInfo, setDebugInfo] = useState({ dist: 0, head: "CENTER" });
    const [isBlocked, setIsBlocked] = useState(false);

    // Logic Refs (Performance Critical)
    const trustScoreRef = useRef(100); 
    const isHeadStraightRef = useRef(true);
    const headDirectionRef = useRef("STRAIGHT");
    const storedDescriptorRef = useRef(null);
    const modelsLoadedRef = useRef(false);
    const faceDetectedRef = useRef(false); // Track if MediaPipe sees a face
    
    // --- 1. LOAD RESOURCES ---
    useEffect(() => {
        const loadResources = async () => {
            try {
                const MODEL_URL = '/models';
                await faceapi.tf.setBackend('cpu'); // CPU is more stable for tab switching
                await faceapi.tf.ready();
                
                // Only load the detector and recognition model (landmark model not needed for FaceAPI if using MediaPipe)
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL), // Still needed for alignment
                    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
                ]);

                if (studentId) {
                    const res = await fetch(`http://localhost:8080/api/users/${studentId}/face`);
                    if (res.ok) {
                        const data = await res.json();
                        const desc = data.faceDescriptor || data.face_descriptor;
                        if (desc) {
                            storedDescriptorRef.current = new Float32Array(desc);
                            modelsLoadedRef.current = true;
                            setStatus("✅ Proctor Active");
                        }
                    }
                }
            } catch (err) {
                console.error("Init Error:", err);
            }
        };
        loadResources();
    }, [studentId]);

    // --- 2. FAST LOOP: Head Pose & Presence (MediaPipe - 30 FPS) ---
    useEffect(() => {
        const faceMesh = new FaceMesh({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });
        
        // Optimizations: maxNumFaces=1, refineLandmarks=false (Faster)
        faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: false, minDetectionConfidence: 0.5 });
        
        faceMesh.onResults((results) => {
            if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
                faceDetectedRef.current = true; // MediaPipe found a face!
                
                const landmarks = results.multiFaceLandmarks[0];
                const nose = landmarks[1];
                const leftEye = landmarks[33];
                const rightEye = landmarks[263];
                
                // Yaw Calculation
                const faceWidth = Math.abs(rightEye.x - leftEye.x);
                const eyeMidX = (leftEye.x + rightEye.x) / 2;
                const yaw = (nose.x - eyeMidX) / faceWidth;
                
                // THRESHOLD: Increased to 0.30 (More forgiving for wide monitors)
                const isStraight = Math.abs(yaw) < 0.30;
                
                isHeadStraightRef.current = isStraight;
                headDirectionRef.current = isStraight ? "STRAIGHT" : (yaw > 0 ? "LEFT" : "RIGHT");
                
                setDebugInfo(prev => ({ ...prev, head: headDirectionRef.current }));

                if (!isStraight) updateTrust(-0.5); // Minor penalty for looking away
            } else {
                faceDetectedRef.current = false; // No face seen
            }
        });

        let active = true;
        const loop = async () => {
            if (active && webcamRef.current?.video?.readyState === 4) {
                await faceMesh.send({ image: webcamRef.current.video });
            }
            requestAnimationFrame(loop); // Run at max browser speed
        };
        loop();
        return () => { active = false; };
    }, []);

    // --- 3. SLOW LOOP: Identity Check (FaceAPI - 1 FPS) ---
    useEffect(() => {
        const interval = setInterval(async () => {
            if (!modelsLoadedRef.current || !storedDescriptorRef.current || !webcamRef.current?.video) return;

            const video = webcamRef.current.video;
            if (video.readyState !== 4) return;

            // PERFORMANCE OPTIMIZATION:
            // 1. If MediaPipe says "No Face", trust it. Don't waste CPU on FaceAPI.
            if (!faceDetectedRef.current) {
                updateTrust(-2);
                setStatus("⚠ NO FACE DETECTED");
                return;
            }

            // 2. If Head is turned, PAUSE Identity Check.
            // FaceAPI fails on side profiles. Trust that it's the same person looking away.
            if (!isHeadStraightRef.current) {
                setStatus(`⚠ Looking ${headDirectionRef.current}`);
                return; 
            }

            // 3. Run FaceAPI (Identity) only if straight & present
            // inputSize: 160 is much faster than default (416)
            const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.3 });
            const detections = await faceapi.detectAllFaces(video, options).withFaceLandmarks().withFaceDescriptors();

            if (detections.length === 0) {
                // MediaPipe saw a face, but FaceAPI missed it (maybe motion blur). 
                // Ignore this frame (Benefit of the doubt).
                setStatus("Adjusting Focus..."); 
            } 
            else if (detections.length > 1) {
                updateTrust(-10);
                setStatus("⚠ MULTIPLE PEOPLE");
            } 
            else {
                // Identity Verification
                const dist = faceapi.euclideanDistance(detections[0].descriptor, storedDescriptorRef.current);
                setDebugInfo(prev => ({ ...prev, dist: dist.toFixed(2) }));

                // 0.55 is a standard biometric threshold
                if (dist > 0.55) {
                    updateTrust(-15); // Fast drop for imposters
                    setStatus(`⛔ IMPERSONATION`);
                } else {
                    updateTrust(5); // Heal score
                    setStatus("✅ Secure");
                }
            }

        }, 1000); // Only run every 1000ms (1 second) to save CPU

        return () => clearInterval(interval);
    }, []);

    // --- 4. TRUST ENGINE ---
    const updateTrust = (amount) => {
        let newScore = trustScoreRef.current + amount;
        newScore = Math.max(0, Math.min(100, newScore));
        trustScoreRef.current = newScore;
        setTrustScore(newScore);

        if (newScore < 40 && !isBlocked) {
            setIsBlocked(true);
            if (onExamBlock) onExamBlock();
            logViolation("TRUST_DEPLETED", "Suspicious behavior persisted");
        }
        
        if (newScore > 60 && isBlocked) setIsBlocked(false);
    };

    const logViolation = async (type, desc) => {
        if (!examId || !studentId) return;
        try {
            await fetch(`http://localhost:8080/api/users/${studentId}/log`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ examId, type, description: desc })
            });
        } catch (e) {}
    };

    if (isBlocked) return (
        <div className="fixed inset-0 bg-red-900/95 z-[100] flex flex-col items-center justify-center text-white text-center backdrop-blur-sm animate-pulse">
            <h1 className="text-6xl font-bold mb-4">⛔</h1>
            <h2 className="text-4xl font-bold mb-2">TEST PAUSED</h2>
            <div className="w-64 h-4 bg-gray-700 rounded-full overflow-hidden border border-white/30">
                <div className="h-full bg-red-500 transition-all duration-300" style={{ width: `${trustScore}%` }} />
            </div>
            <p className="mt-2 text-sm">Trust Score: {trustScore}%</p>
        </div>
    );

    const barColor = trustScore > 80 ? 'bg-green-500' : trustScore > 50 ? 'bg-yellow-500' : 'bg-red-500';

    return (
        <div className="relative w-full h-full bg-gray-900 rounded-xl overflow-hidden shadow-2xl border border-gray-700 group">
            <Webcam 
                ref={webcamRef}
                className="absolute inset-0 w-full h-full object-cover opacity-90"
                videoConstraints={{ width: 320, height: 240, facingMode: 'user' }}
                mirrored={false}
            />
            
            <div className="absolute top-0 inset-x-0 p-2 bg-gradient-to-b from-black/80 to-transparent">
                <div className="flex justify-between items-center text-xs text-white font-mono">
                    <span className={status.includes("✅") ? "text-green-400" : "text-yellow-400"}>{status}</span>
                </div>
            </div>

            <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/90 to-transparent">
                <div className="flex items-center justify-between text-xs text-gray-300 mb-1">
                    <span>Integrity Score</span>
                    <span className={trustScore < 60 ? "text-red-400 font-bold animate-pulse" : "text-white"}>{Math.round(trustScore)}%</span>
                </div>
                <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} transition-all duration-500`} style={{ width: `${trustScore}%` }} />
                </div>
            </div>
        </div>
    );
};

export default ExamProctor;