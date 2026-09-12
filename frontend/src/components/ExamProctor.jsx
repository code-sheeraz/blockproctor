import React, { useEffect, useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import * as faceapi from 'face-api.js';
import { FaceMesh } from '@mediapipe/face_mesh';

import { getApiBase } from '../utils/apiBase.js';
import { calculateHeadPose } from '../utils/headPose.js';
import { clampTrust, shouldBlock, shouldUnblock } from '../utils/trustEngine.js';

const API_BASE = getApiBase();

// ═══════════════════════════════════════════════════════════════════════════════
// PROCTORING CONFIGURATION - Tunable Parameters
// Focus: UDLR Detection, Multi-Face, Identity Verification (NO GAZE)
// ═══════════════════════════════════════════════════════════════════════════════
const CONFIG = {
    // Head Pose Thresholds
    HEAD_YAW_THRESHOLD: 0.25,        // Left/Right sensitivity (lower = stricter)
    HEAD_PITCH_THRESHOLD: 0.20,      // Up/Down sensitivity
    
    // Absence Detection
    ABSENCE_GRACE_PERIOD: 3000,      // ms before absence is flagged
    ABSENCE_CRITICAL_THRESHOLD: 8000, // ms before critical absence violation
    
    // Identity Verification - tuned to keep main-thread blocking imperceptible
    IDENTITY_DISTANCE_THRESHOLD: 0.55,  // Standard biometric threshold
    IDENTITY_CHECK_INTERVAL: 3000,      // ms between checks (heavy ~0.9s pipeline)

    // Multi-Face Detection
    MULTI_FACE_TOLERANCE: 500,       // ms before multi-face flagged

    // Frame pacing: feed FaceMesh every Nth animation frame (~30 FPS rAF ÷ 3
    // ≈ 10 FPS effective). Detection logic and all thresholds are wall-clock
    // based, so behaviour is unchanged — this only frees the main thread so
    // the exam timer stays accurate and buttons stay responsive.
    FRAME_PACING_DIVISOR: 3,
    
    // Trust Score
    PENALTY_HEAD_TURN: -0.5,
    PENALTY_ABSENCE_MINOR: -1,
    PENALTY_ABSENCE_MAJOR: -3,
    PENALTY_MULTI_FACE: -10,
    PENALTY_IMPERSONATION: -20,
    RECOVERY_RATE: 2,
};

const ExamProctor = ({ studentId, examId, sessionId, onLogsUpdate, onExamBlock, onViolation, active = true }) => {
    const webcamRef = useRef(null);
    // Mirror the `active` prop for use inside []-dependency loops/intervals
    const activeRef = useRef(true);
    useEffect(() => { activeRef.current = active; }, [active]);
    
    // UI State
    const [status, setStatus] = useState("🔄 Initializing...");
    const [trustScore, setTrustScore] = useState(100);
    const [debugInfo, setDebugInfo] = useState({ 
        dist: "-", 
        head: "CENTER",
        pitch: "LEVEL",
        faces: 0
    });
    const [isBlocked, setIsBlocked] = useState(false);
    const [violationHistory, setViolationHistory] = useState([]);

    // Logic Refs
    const trustScoreRef = useRef(100); 
    const isHeadStraightRef = useRef(true);
    const lastTrustStateUpdate = useRef(0);
    const headDirectionRef = useRef({ yaw: "CENTER", pitch: "LEVEL" });
    const storedDescriptorRef = useRef(null);
    const modelsLoadedRef = useRef(false);
    const faceDetectedRef = useRef(false);
    
    // Detection Refs
    const absenceStartRef = useRef(null);
    const multiFaceStartRef = useRef(null);
    const faceCountRef = useRef(0);
    const consecutiveMatchFailsRef = useRef(0);
    const isCheckingIdentityRef = useRef(false); // Prevent overlapping checks
    const lastHeadTurnLogRef = useRef(0); // Debounce head turn logging

    // ═══════════════════════════════════════════════════════════════════════════════
    // HEAD POSE CALCULATION (Optimized for UDLR)
    // Pure math lives in utils/headPose.js (unit-tested against thesis Table 3.2);
    // thresholds below stay the single runtime source of truth.
    // ═══════════════════════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════════════════════
    // 1. LOAD RESOURCES (Optimized - Only TinyFaceDetector, no SSD)
    // ═══════════════════════════════════════════════════════════════════════════════
    useEffect(() => {
        const loadResources = async () => {
            try {
                setStatus("🔄 Loading AI...");
                const MODEL_URL = '/models';
                await faceapi.tf.setBackend('cpu');
                await faceapi.tf.ready();
                
                // OPTIMIZED: Only load essential models
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
                ]);

                if (studentId) {
                    setStatus("🔄 Loading Profile...");
                    const res = await fetch(`${API_BASE}/users/${studentId}/face`);
                    if (res.ok) {
                        const data = await res.json();
                        const desc = data.faceDescriptor || data.face_descriptor;
                        if (desc) {
                            storedDescriptorRef.current = new Float32Array(desc);
                            modelsLoadedRef.current = true;
                            setStatus("✅ Proctor Active");
                        }
                    } else {
                        setStatus("⚠️ No face profile");
                    }
                }
            } catch (err) {
                console.error("Init Error:", err);
                setStatus("❌ AI Failed");
            }
        };
        loadResources();
    }, [studentId]);

    // ═══════════════════════════════════════════════════════════════════════════════
    // 2. FAST LOOP: Head Pose (UDLR) & Presence Detection (MediaPipe)
    // ═══════════════════════════════════════════════════════════════════════════════
    useEffect(() => {
        // Assets are vendored into /mediapipe/face_mesh by scripts/copy-mediapipe.mjs
        // (predev/prebuild) so detection never depends on cdn.jsdelivr.net.
        const faceMesh = new FaceMesh({
            locateFile: (file) => `${import.meta.env.BASE_URL}mediapipe/face_mesh/${file}`,
        });
        
        // OPTIMIZED: refineLandmarks=false (no iris tracking = faster)
        faceMesh.setOptions({ 
            maxNumFaces: 2,
            refineLandmarks: false,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        
        let sawResult = false;
        let resultsWatchdog = null;
        faceMesh.onResults((results) => {
            const now = Date.now();
            sawResult = true;
            if (resultsWatchdog) {
                clearTimeout(resultsWatchdog);
                resultsWatchdog = null;
            }
            const faceCount = results.multiFaceLandmarks?.length || 0;
            faceCountRef.current = faceCount;
            
            // ═══════════════════════════════════════════════════════════════════
            // ABSENCE DETECTION
            // ═══════════════════════════════════════════════════════════════════
            if (faceCount === 0) {
                faceDetectedRef.current = false;
                
                if (!absenceStartRef.current) {
                    absenceStartRef.current = now;
                }
                
                const absenceDuration = now - absenceStartRef.current;
                
                if (absenceDuration > CONFIG.ABSENCE_CRITICAL_THRESHOLD) {
                    updateTrust(CONFIG.PENALTY_ABSENCE_MAJOR);
                    setStatus("⛔ EXTENDED ABSENCE");
                    logViolation("ABSENCE_CRITICAL", `No face for ${Math.round(absenceDuration/1000)}s`);
                } else if (absenceDuration > CONFIG.ABSENCE_GRACE_PERIOD) {
                    updateTrust(CONFIG.PENALTY_ABSENCE_MINOR);
                    setStatus("⚠️ NO FACE");
                }
                
                setDebugInfo(prev => ({ ...prev, head: "ABSENT", pitch: "-", faces: 0 }));
                return;
            }
            
            // Face detected - reset absence timer
            absenceStartRef.current = null;
            faceDetectedRef.current = true;
            
            // ═══════════════════════════════════════════════════════════════════
            // MULTI-FACE DETECTION
            // ═══════════════════════════════════════════════════════════════════
            if (faceCount > 1) {
                if (!multiFaceStartRef.current) {
                    multiFaceStartRef.current = now;
                }
                
                const multiFaceDuration = now - multiFaceStartRef.current;
                
                if (multiFaceDuration > CONFIG.MULTI_FACE_TOLERANCE) {
                    updateTrust(CONFIG.PENALTY_MULTI_FACE);
                    setStatus(`⛔ ${faceCount} FACES!`);
                    logViolation("MULTI_FACE", `${faceCount} faces detected`);
                }
            } else {
                multiFaceStartRef.current = null;
            }
            
            // ═══════════════════════════════════════════════════════════════════
            // HEAD POSE - UDLR Detection
            // ═══════════════════════════════════════════════════════════════════
            const landmarks = results.multiFaceLandmarks[0];
            const headPose = calculateHeadPose(landmarks, {
                yaw: CONFIG.HEAD_YAW_THRESHOLD,
                pitch: CONFIG.HEAD_PITCH_THRESHOLD,
            });
            
            isHeadStraightRef.current = headPose.isStraight;
            headDirectionRef.current = headPose;
            
            if (!headPose.isStraight) {
                updateTrust(CONFIG.PENALTY_HEAD_TURN);
                
                let direction = [];
                if (headPose.yawDirection !== "CENTER") direction.push(headPose.yawDirection);
                if (headPose.pitchDirection !== "LEVEL") direction.push(headPose.pitchDirection);
                
                setStatus(`⚠️ Looking ${direction.join(' & ')}`);
                
                // Log head turns with debounce (max once per 2 seconds)
                if (now - lastHeadTurnLogRef.current > 2000) {
                    lastHeadTurnLogRef.current = now;
                    const turnType = `HEAD_TURN_${direction[0] || 'AWAY'}`;
                    logViolation(turnType, `Looking ${direction.join(' & ')} - yaw: ${headPose.yaw.toFixed(2)}, pitch: ${headPose.pitch.toFixed(2)}`);
                }
            } else if (faceCount === 1 && modelsLoadedRef.current) {
                // Slow trust recovery when looking straight
                updateTrust(CONFIG.RECOVERY_RATE * 0.05);
            }
            
            setDebugInfo(prev => ({ 
                ...prev, 
                head: headPose.yawDirection,
                pitch: headPose.pitchDirection,
                faces: faceCount
            }));
        });

        // Fail-loud watchdog: if FaceMesh never produces a result (assets failed
        // to load, WASM init error, or no camera stream), surface it instead of
        // silently showing a 0 person count forever.
        resultsWatchdog = setTimeout(() => {
            if (!sawResult && activeRef.current) {
                console.error(
                    "ExamProctor: MediaPipe FaceMesh produced no results within 10s. " +
                    "Check that /mediapipe/face_mesh/* assets are served (npm run predev/prebuild) " +
                    "and that the camera is accessible."
                );
                setStatus("⚠️ Detection engine offline");
            }
        }, 10000);

        let active = true;
        let sendFailures = 0;
        let frameTick = 0;
        const loop = async () => {
            if (
                active &&
                activeRef.current && // paused while the exam is submitting
                webcamRef.current?.video?.readyState === 4
            ) {
                frameTick++;
                if (frameTick % CONFIG.FRAME_PACING_DIVISOR === 0) {
                    try {
                        await faceMesh.send({ image: webcamRef.current.video });
                        sendFailures = 0;
                    } catch (err) {
                        sendFailures++;
                        if (sendFailures === 3) {
                            console.error("ExamProctor: faceMesh.send() keeps failing:", err);
                            setStatus("⚠️ Detection engine offline");
                        }
                    }
                }
            }
            if (active) requestAnimationFrame(loop);
        };
        loop();
        
        return () => {
            active = false;
            if (resultsWatchdog) clearTimeout(resultsWatchdog);
            faceMesh.close();
        };
    }, []); // calculateHeadPose is a stable module import; CONFIG thresholds passed at call site

    // ═══════════════════════════════════════════════════════════════════════════════
    // 3. IDENTITY VERIFICATION (OPTIMIZED FOR SPEED)
    // ═══════════════════════════════════════════════════════════════════════════════
    useEffect(() => {
        const checkIdentity = async () => {
            // Prevent overlapping checks
            if (isCheckingIdentityRef.current) return;
            if (!activeRef.current) return; // paused while submitting
            if (!modelsLoadedRef.current || !storedDescriptorRef.current) return;
            if (!webcamRef.current?.video || webcamRef.current.video.readyState !== 4) return;
            if (!faceDetectedRef.current) return;
            if (!isHeadStraightRef.current) return; // Skip if head turned (unreliable)

            isCheckingIdentityRef.current = true;
            
            try {
                const video = webcamRef.current.video;
                
                // OPTIMIZED: Small input = FAST detection
                const options = new faceapi.TinyFaceDetectorOptions({
                    inputSize: 128,  // Small = fast (was 160; 224 originally)
                    scoreThreshold: 0.3
                });
                
                // Use detectSingleFace (faster than detectAllFaces)
                const detection = await faceapi.detectSingleFace(video, options)
                    .withFaceLandmarks()
                    .withFaceDescriptor();

                if (!detection) {
                    setStatus("🔄 Focusing...");
                    isCheckingIdentityRef.current = false;
                    return;
                }

                // Calculate distance to stored descriptor
                const distance = faceapi.euclideanDistance(
                    detection.descriptor, 
                    storedDescriptorRef.current
                );
                
                setDebugInfo(prev => ({ ...prev, dist: distance.toFixed(2) }));

                if (distance <= CONFIG.IDENTITY_DISTANCE_THRESHOLD) {
                    // ✅ MATCH - Student verified
                    consecutiveMatchFailsRef.current = 0;
                    updateTrust(CONFIG.RECOVERY_RATE);
                    setStatus("✅ Verified");
                } else {
                    // ❌ NO MATCH - Potential impersonation
                    consecutiveMatchFailsRef.current++;
                    
                    if (consecutiveMatchFailsRef.current >= 3) {
                        // Confirmed after 3 consecutive fails
                        updateTrust(CONFIG.PENALTY_IMPERSONATION);
                        setStatus("⛔ WRONG PERSON");
                        logViolation("IMPERSONATION", `Distance: ${distance.toFixed(2)}`);
                    } else {
                        setStatus(`⚠️ Verifying... (${consecutiveMatchFailsRef.current}/3)`);
                        updateTrust(-3);
                    }
                }

            } catch (err) {
                console.error("Identity check error:", err);
            }
            
            isCheckingIdentityRef.current = false;
        };

        const interval = setInterval(checkIdentity, CONFIG.IDENTITY_CHECK_INTERVAL);
        return () => clearInterval(interval);
    }, []);

    // ═══════════════════════════════════════════════════════════════════════════════
    // TRUST ENGINE
    // ═══════════════════════════════════════════════════════════════════════════════
    const updateTrust = useCallback((amount) => {
        const newScore = clampTrust(trustScoreRef.current + amount);
        trustScoreRef.current = newScore;

        // Throttle React state updates to max 10/sec to prevent render storms
        const now = Date.now();
        if (now - lastTrustStateUpdate.current > 100) {
            lastTrustStateUpdate.current = now;
            setTrustScore(Math.round(newScore));
        }

        if (shouldBlock(newScore) && !isBlocked) {
            setIsBlocked(true);
            if (onExamBlock) onExamBlock();
            logViolation("BLOCKED", `Trust dropped to ${Math.round(newScore)}%`);
        }

        if (shouldUnblock(newScore) && isBlocked) {
            setIsBlocked(false);
        }
    }, [isBlocked, onExamBlock]);

    const logViolation = useCallback(async (type, description) => {
        if (!examId || !studentId) return;
        
        const currentTrust = trustScoreRef.current;
        const metadata = {
            headDirection: headDirectionRef.current,
            faceCount: faceCountRef.current,
            trustScore: currentTrust
        };
        const violation = { type, description, timestamp: new Date().toISOString(), trustScore: currentTrust };
        setViolationHistory(prev => [...prev.slice(-9), violation]);
        
        if (onLogsUpdate) onLogsUpdate(violation);
        
        // New callback for ExamSession integration
        if (onViolation) {
            onViolation(type, description, metadata);
        }
        
        try {
            await fetch(`${API_BASE}/users/${studentId}/log`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    examId, 
                    sessionId,
                    type, 
                    description,
                    trustScore: currentTrust,
                    metadata
                })
            });
        } catch (e) {
            console.error("Log failed:", e);
        }
    }, [examId, studentId, sessionId, onLogsUpdate, onViolation]);

    // Stop webcam stream on unmount
    useEffect(() => {
        return () => {
            const video = webcamRef.current?.video;
            if (video?.srcObject) {
                video.srcObject.getTracks().forEach(t => t.stop());
            }
        };
    }, []);

    // ═══════════════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════════════
    
    // BLOCKED STATE
    if (isBlocked) return (
        <div className="fixed inset-0 bg-red-900 z-[100] flex flex-col items-center justify-center text-white text-center">
            <h1 className="text-6xl mb-4 animate-pulse">⛔</h1>
            <h2 className="text-3xl font-bold mb-2">EXAM PAUSED</h2>
            <p className="text-red-200 mb-4">Look at camera to continue</p>
            
            <div className="w-64 mb-4">
                <div className="h-3 bg-red-950 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500 transition-all" style={{ width: `${trustScore}%` }} />
                </div>
                <p className="text-xs mt-1">{trustScore}% (need 55%)</p>
            </div>
            
            <div className="text-xs text-red-300 mt-4">
                {violationHistory.slice(-3).map((v, i) => (
                    <p key={i}>{v.type}</p>
                ))}
            </div>
        </div>
    );

    // Normal state colors
    const barColor = trustScore > 70 ? 'bg-green-500' : trustScore > 40 ? 'bg-yellow-500' : 'bg-red-500';
    const statusColor = status.includes("✅") ? "text-green-400" : 
                        status.includes("⚠") ? "text-yellow-400" : 
                        status.includes("⛔") ? "text-red-400" : "text-blue-400";

    return (
        <div className="relative w-full h-full bg-gray-900 rounded-xl overflow-hidden border border-gray-700">
            <Webcam 
                ref={webcamRef}
                className="absolute inset-0 w-full h-full object-cover"
                videoConstraints={{ width: 320, height: 240, facingMode: 'user' }}
                mirrored={false}
            />
            
            {/* Status Bar */}
            <div className="absolute top-0 inset-x-0 p-2 bg-gradient-to-b from-black/80 to-transparent">
                <div className="flex justify-between items-center text-xs font-mono">
                    <span className={statusColor}>{status}</span>
                    <span className="text-gray-400">👤 {debugInfo.faces}</span>
                </div>
            </div>
            
            {/* Debug Overlay */}
            <div className="absolute top-8 left-2 text-[9px] font-mono text-white/50 bg-black/30 p-1 rounded">
                <div>HEAD: {debugInfo.head} | {debugInfo.pitch}</div>
                <div>DIST: {debugInfo.dist}</div>
            </div>

            {/* Trust Bar */}
            <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/90 to-transparent">
                <div className="flex justify-between text-xs text-gray-300 mb-1">
                    <span>Trust</span>
                    <span className={trustScore < 50 ? "text-red-400" : ""}>{trustScore}%</span>
                </div>
                <div className="w-full h-1.5 bg-gray-700 rounded-full">
                    <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${trustScore}%` }} />
                </div>
            </div>
        </div>
    );
};

export default ExamProctor;
