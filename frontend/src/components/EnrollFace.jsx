import React, { useRef, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as faceapi from 'face-api.js';
import { loadModels } from '../faceUtils';

const EnrollFace = () => {
    const { userId } = useParams();
    const navigate = useNavigate();
    const videoRef = useRef();
    const [status, setStatus] = useState("Initializing Camera...");
    const [isScanning, setIsScanning] = useState(false);
    const [modelsLoaded, setModelsLoaded] = useState(false);

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
    }, []);

    const startVideo = () => {
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(stream => { 
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

    const captureFace = async () => {
        if (isScanning || !videoRef.current || !modelsLoaded) return;
        setIsScanning(true);
        setStatus("Scanning...");

        try {
            // 1. Capture to Canvas
            const video = videoRef.current;
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // 2. Generate Face Descriptor using SSD MobileNet (more accurate for enrollment)
            const detection = await faceapi
                .detectSingleFace(canvas)
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (detection) {
                video.pause();
                setStatus("✅ Face Captured! Saving...");
                
                // 3. Convert canvas to Base64 image for admin review
                const photoBase64 = canvas.toDataURL('image/jpeg', 0.8);
                
                // 4. Convert descriptor to array
                const descriptorArray = Array.from(detection.descriptor);
                
                // 5. Send both photo and descriptor to enrollment endpoint
                await saveEnrollment(descriptorArray, photoBase64);
            } else {
                setStatus("❌ No Face Found. Move closer & check lighting.");
                setIsScanning(false);
            }
        } catch (err) {
            console.error("Scan Error:", err);
            setStatus("AI Error. Refresh Page.");
            setIsScanning(false);
        }
    };

    const saveEnrollment = async (faceDescriptor, photoBase64) => {
        try {
            const res = await fetch(`http://localhost:8080/api/enroll/upload`, {
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
                setStatus("✅ Face uploaded! Waiting for Admin Approval.");
                setTimeout(() => {
                    navigate('/'); // Return to dashboard
                }, 2000);
            } else {
                setStatus(data.message || "Save Failed. Try Again.");
                setIsScanning(false);
                videoRef.current.play();
            }
        } catch (err) {
            console.error("Enrollment Error:", err);
            setStatus("Server Error. Please try again.");
            setIsScanning(false);
            videoRef.current.play();
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white p-4">
            <h1 className="text-3xl font-bold mb-2 text-indigo-400">Setup Face ID</h1>
            <p className="text-gray-400 mb-6">User ID: {userId}</p>

            <div className="relative border-4 border-indigo-600 rounded-xl overflow-hidden shadow-2xl w-full max-w-[640px] aspect-video bg-black">
                <video ref={videoRef} autoPlay muted className="w-full h-full object-cover" />
                <div className="absolute top-4 w-full text-center">
                    <span className="bg-white/90 px-4 py-2 rounded-full font-bold text-sm text-black">
                        {status}
                    </span>
                </div>
            </div>

            <div className="mt-8 flex gap-4">
                <button 
                    onClick={captureFace} 
                    disabled={isScanning || !modelsLoaded}
                    className="px-8 py-4 bg-indigo-600 rounded-lg font-bold text-lg hover:bg-indigo-500 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isScanning ? 'Processing...' : !modelsLoaded ? 'Loading AI...' : '📸 Scan My Face'}
                </button>
                <button onClick={() => navigate('/')} className="px-6 py-4 text-gray-400 hover:text-white">Cancel</button>
            </div>
        </div>
    );
};

export default EnrollFace;