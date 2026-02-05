import React, { useRef, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as faceapi from 'face-api.js';
import { FaceMesh } from '@mediapipe/face_mesh';
import { loadModels } from '../faceUtils';

// OPTIMIZATION: TinyFace for Speed (15-20 FPS)
const tinyFaceOptions = new faceapi.TinyFaceDetectorOptions({
    inputSize: 224, // Smaller = Faster
    scoreThreshold: 0.4 
});

const ExamVerification = () => {
    const { userId } = useParams();
    const navigate = useNavigate();
    const videoRef = useRef();
    const canvasRef = useRef();

    // UI State
    const [status, setStatus] = useState("Initializing System...");
    const [matchScore, setMatchScore] = useState(0); 
    const [isVerified, setIsVerified] = useState(false);
    const [headStatus, setHeadStatus] = useState("Scan to start");
    const [bgColor, setBgColor] = useState("bg-gray-900"); // Dynamic Background

    // AI Data
    const [storedDescriptor, setStoredDescriptor] = useState(null);
    const failCounter = useRef(0);
    const faceMeshRef = useRef(null);
    const faceMeshInitializedRef = useRef(false);

    // TUNING: "Red Warning ASAP" Settings
    const FAIL_THRESHOLD = 5;       // Only 5 bad frames (~0.5s) to trigger RED ALERT
    const DISTANCE_LIMIT = 0.55;    // Strictness (0.6 is standard, 0.55 is strict)

    useEffect(() => {
        const init = async () => {
            const loaded = await loadModels();
            if (loaded) {
                await fetchEnrolledFace();
            } else {
                setStatus("System Error: AI Models Failed");
            }
        };
        init();
    }, []);

    // 1. Check Enrollment Status & Fetch Face Descriptor
    const fetchEnrolledFace = async () => {
        try {
            setStatus("Checking Enrollment Status...");
            
            // First check enrollment status
            const statusRes = await fetch(`http://localhost:8080/api/users/${userId}/enrollment-status`);
            const statusData = await statusRes.json();
            
            if (!statusData.success || statusData.enrollment_status !== 'APPROVED') {
                if (statusData.enrollment_status === 'PENDING') {
                    alert("Your face enrollment is pending admin approval. Please wait.");
                    navigate(`/dashboard/${userId}`);
                    return;
                } else if (statusData.enrollment_status === 'REJECTED') {
                    alert("Your face photo was rejected. Please re-enroll.");
                    navigate(`/enroll-face/${userId}`);
                    return;
                } else {
                    alert("You must enroll your face first!");
                    navigate(`/enroll-face/${userId}`);
                    return;
                }
            }

            // Enrollment approved - fetch face descriptor
            setStatus("Loading Face ID...");
            const res = await fetch(`http://localhost:8080/api/users/${userId}/face`);
            
            if (res.status === 404) {
                alert("Face descriptor not found. Please re-enroll.");
                navigate(`/enroll-face/${userId}`);
                return;
            }

            const data = await res.json();
            // CRITICAL: Convert Array back to Float32Array for face-api
            const descriptor = new Float32Array(data.faceDescriptor);
            
            setStoredDescriptor(descriptor);
            setStatus("✅ Face ID Loaded. Starting Camera...");
            startVideo();
        } catch (err) {
            console.error(err);
            setStatus("Network Error: Could not load Face ID");
        }
    };

    const startVideo = () => {
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(stream => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => videoRef.current.play();
                }
            })
            .catch(() => setStatus("Camera Permission Denied"));
    };

    // 2. MediaPipe Logic (Head Pose)
    const initFaceMesh = () => {
        if (faceMeshInitializedRef.current) return;
        const faceMesh = new FaceMesh({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });
        faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: false, minDetectionConfidence: 0.5 });
        faceMesh.onResults((results) => {
            if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
                checkHeadDirection(results.multiFaceLandmarks[0]);
            }
        });
        faceMeshRef.current = faceMesh;
        faceMeshInitializedRef.current = true;
        
        const loop = async () => {
            if (videoRef.current && !videoRef.current.paused) {
                await faceMesh.send({ image: videoRef.current });
            }
            requestAnimationFrame(loop);
        };
        loop();
    };

    const checkHeadDirection = (landmarks) => {
        const nose = landmarks[1];
        const leftEye = landmarks[33];
        const rightEye = landmarks[263];
        
        const eyeMidX = (leftEye.x + rightEye.x) / 2;
        const noseOffsetX = nose.x - eyeMidX;

        if (noseOffsetX < -0.05) setHeadStatus("⬅ Looking Right");
        else if (noseOffsetX > 0.05) setHeadStatus("Looking Left ➡");
        else setHeadStatus("⬆ Forward");
    };

    const handleVideoPlay = () => {
        initFaceMesh();
        detectFrame();
    };

    // 3. The Main Security Loop
    const detectFrame = async () => {
        if (!videoRef.current || videoRef.current.paused) {
            requestAnimationFrame(detectFrame);
            return;
        }

        try {
            // Detect Face
            const detection = await faceapi.detectSingleFace(videoRef.current, tinyFaceOptions)
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (detection && storedDescriptor) {
                // Calculate Match
                const distance = faceapi.euclideanDistance(storedDescriptor, detection.descriptor);
                
                // Score for UI (0.0 distance = 100% Match)
                const score = Math.max(0, Math.round((1 - distance) * 100));
                setMatchScore(score);

                // --- SECURITY LOGIC ---
                if (distance < DISTANCE_LIMIT) {
                    // MATCH: Reset Alert
                    failCounter.current = 0;
                    setIsVerified(true);
                    setStatus("✅ VERIFIED");
                    setBgColor("bg-gray-900"); // Normal
                } else {
                    // NO MATCH: Immediate Warning Logic
                    failCounter.current++;
                    
                    if (failCounter.current > FAIL_THRESHOLD) { // > 5 frames (~0.5s)
                        setIsVerified(false);
                        setStatus("⛔ WARNING: IMPERSONATOR DETECTED");
                        setBgColor("bg-red-900"); // RED ALERT BACKGROUND
                    } else {
                        setStatus("⚠️ Verifying...");
                    }
                }
            } else if (!detection) {
                // No face found?
                setStatus("🔍 Looking for face...");
                setBgColor("bg-gray-800");
            }
        } catch (e) {
            console.warn("Detection Loop Error", e);
        }

        requestAnimationFrame(detectFrame);
    };

    return (
        <div className={`min-h-screen ${bgColor} text-white flex flex-col items-center justify-center p-5 transition-colors duration-300`}>
            <h1 className="text-2xl font-bold mb-4">Exam Proctoring</h1>

            <div className={`relative border-4 ${isVerified ? 'border-green-500' : 'border-red-600'} rounded-xl overflow-hidden shadow-2xl w-full max-w-lg aspect-video bg-black`}>
                <video ref={videoRef} autoPlay muted onPlay={handleVideoPlay} className="absolute inset-0 w-full h-full object-cover" />
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
                
                {/* HEADS UP DISPLAY */}
                <div className="absolute top-4 left-4 bg-black/80 p-4 rounded-lg text-sm font-mono space-y-2 w-64 z-10 backdrop-blur-sm">
                    <div className="flex justify-between border-b border-gray-600 pb-2">
                        <span>Identity:</span>
                        <span className={isVerified ? "text-green-400 font-bold" : "text-red-500 font-bold text-lg animate-pulse"}>
                            {matchScore}%
                        </span>
                    </div>
                    
                    <div className="flex justify-between pt-1">
                        <span>Status:</span>
                        <span className={isVerified ? "text-blue-300" : "text-red-400 font-bold"}>
                            {status}
                        </span>
                    </div>

                    <div className="flex justify-between pt-1 text-xs text-gray-400">
                        <span>Head:</span>
                        <span>{headStatus}</span>
                    </div>
                </div>
            </div>

            <div className="mt-6 flex gap-4">
                <button 
                    onClick={() => navigate('/')}
                    className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                >
                    Quit Exam
                </button>
            </div>
        </div>
    );
};

export default ExamVerification;