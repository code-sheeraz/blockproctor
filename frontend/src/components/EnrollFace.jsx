import React, { useRef, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as faceapi from 'face-api.js';
import { loadModels } from '../faceUtils';

import { getApiBase } from '../utils/apiBase.js';

const API_BASE = getApiBase();

// OPTIMIZATION: TinyFace for speed (matches ExamVerification / ExamProctor fast path).
// Descriptors still come from faceRecognitionNet, so stored embeddings stay compatible.
const tinyFaceOptions = new faceapi.TinyFaceDetectorOptions({
    inputSize: 224, // Smaller = Faster
    scoreThreshold: 0.4
});

const EnrollFace = () => {
    const { userId } = useParams();
    const navigate = useNavigate();
    const videoRef = useRef();
    const streamRef = useRef();
    const [status, setStatus] = useState("Initializing Camera...");
    const [isScanning, setIsScanning] = useState(false);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [photo, setPhoto] = useState(null);

    const startVideo = () => {
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(stream => { 
                streamRef.current = stream;
                if(videoRef.current) {
                    videoRef.current.srcObject = stream; 
                    setStatus("Ready to Scan");
                }
            })
            .catch(err => {
                console.error(err);
                setStatus("Camera Error: Permission Denied");
            });
    };

    useEffect(() => {
        const init = async () => {
            const loaded = await loadModels();
            if (loaded) {
                setModelsLoaded(true);
                startVideo();
            } else {
                setStatus("AI Models Failed to Load");
            }
        };
        init();
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            }
        };
    }, []);

    const captureFace = async () => {
        if (isScanning || !videoRef.current || !modelsLoaded) return;
        setIsScanning(true);
        setStatus("Scanning...");

        try {
            // 1. Capture to Canvas (downscaled for fast inference + smaller upload)
            const video = videoRef.current;
            const scale = Math.min(1, 640 / video.videoWidth);
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // 2. Show the captured photo immediately (no waiting on detection)
            const photoBase64 = canvas.toDataURL('image/jpeg', 0.8);
            setPhoto(photoBase64);
            setStatus("✅ Face Captured! Saving...");
            video.pause();

            // 3. Generate Face Descriptor in the background (TinyFace = fast)
            const detection = await faceapi
                .detectSingleFace(canvas, tinyFaceOptions)
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (detection) {
                // 4. Convert descriptor to array
                const descriptorArray = Array.from(detection.descriptor);

                // 5. Send both photo and descriptor to enrollment endpoint
                await saveEnrollment(descriptorArray, photoBase64);
            } else {
                setStatus("❌ No Face Found. Move closer & check lighting.");
                setPhoto(null);
                setIsScanning(false);
                video.play();
            }
        } catch (err) {
            console.error("Scan Error:", err);
            setStatus("AI Error. Refresh Page.");
            setPhoto(null);
            setIsScanning(false);
        }
    };

    const saveEnrollment = async (faceDescriptor, photoBase64) => {
        try {
            const res = await fetch(`${API_BASE}/enroll/upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    userId,
                    faceDescriptor,
                    photoBase64 
                })
            });

            const data = await res.json();

            if (res.ok) {
                setStatus("✅ Photo uploaded! Admin will verify your identity.");
                setIsScanning(false);
                setTimeout(() => {
                    navigate('/login'); // Return to login - they need to wait for admin verification
                }, 3000);
            } else {
                setStatus(data.message || "Save Failed. Try Again.");
                setPhoto(null);
                setIsScanning(false);
                videoRef.current.play();
            }
        } catch (err) {
            console.error("Enrollment Error:", err);
            setStatus("Server Error. Please try again.");
            setPhoto(null);
            setIsScanning(false);
            videoRef.current.play();
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white p-4">
            <h1 className="text-3xl font-bold mb-2 text-indigo-400">Setup Face ID</h1>
            <p className="text-gray-400 mb-6">User ID: {userId}</p>

            <div className="relative border-4 border-indigo-600 rounded-xl overflow-hidden shadow-2xl w-full max-w-[640px] aspect-video bg-black">
                {!photo ? (
                    <video ref={videoRef} autoPlay muted className="w-full h-full object-cover" />
                ) : (
                    <img src={photo} alt="Captured" className="w-full h-full object-cover" />
                )}
                <div className="absolute top-4 w-full text-center">
                    <span className="bg-white/90 px-4 py-2 rounded-full font-bold text-sm text-black">
                        {status}
                    </span>
                </div>
            </div>

            <div className="mt-8 flex gap-4">
                {!photo && (
                    <button 
                        onClick={captureFace} 
                        disabled={isScanning || !modelsLoaded}
                        className="px-8 py-4 bg-indigo-600 rounded-lg font-bold text-lg hover:bg-indigo-500 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isScanning ? 'Processing...' : !modelsLoaded ? 'Loading AI...' : '📸 Scan My Face'}
                    </button>
                )}
                <button onClick={() => navigate('/')} className="px-6 py-4 text-gray-400 hover:text-white">Cancel</button>
            </div>
        </div>
    );
};

export default EnrollFace;