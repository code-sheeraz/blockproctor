import React, { useRef, useEffect, useState } from 'react';
import * as faceapi from 'face-api.js';
import { useNavigate } from 'react-router-dom';

// GLOBAL LOCK: Prevents double-loading in React Strict Mode
let isResolving = false;

const RegisterPage = () => {
    const videoRef = useRef();
    const canvasRef = useRef(); // Hidden canvas for stability
    const navigate = useNavigate();
    
    // State
    const [formData, setFormData] = useState({ name: '', email: '', password: '' });
    const [status, setStatus] = useState("Initializing...");
    const [faceDescriptor, setFaceDescriptor] = useState(null);
    const [registeredUser, setRegisteredUser] = useState(null);
    const [modelsReady, setModelsReady] = useState(false);

    // 1. Load Models (Clean & Simple)
    useEffect(() => {
        const loadModels = async () => {
            if (isResolving) return; 
            isResolving = true;

            const MODEL_URL = '/models';
            try {
                console.log("Loading AI Models...");
                await Promise.all([
                    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
                    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
                ]);
                console.log("AI Models Loaded");
                setModelsReady(true);
                startVideo();
            } catch (err) {
                console.error("Model Error:", err);
                setStatus("Error loading AI. Refresh page.");
            }
        };
        loadModels();
    }, []);

    // 2. Start Video (Native Method)
    const startVideo = () => {
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(stream => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    setStatus("Ready to Scan");
                }
            })
            .catch(err => {
                console.error("Camera Error:", err);
                setStatus("Camera Permission Denied");
            });
    };

    // 3. Capture Face (Canvas Proxy Method - The Fix)
    const captureFace = async () => {
        if (!videoRef.current || !modelsReady) return;
        
        setStatus("Scanning...");

        try {
            // A. Create a Proxy Canvas
            // We draw the video to this canvas first. This "sanitizes" the data
            // so the AI engine doesn't crash trying to read the raw video stream.
            const video = videoRef.current;
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // B. Detect from the CANVAS (Not the Video)
            const detection = await faceapi.detectSingleFace(canvas) // Using SSD MobileNet (Default)
                .withFaceLandmarks()
                .withFaceDescriptor();
            
            if (detection) {
                setFaceDescriptor(detection.descriptor);
                setStatus("✅ Face Captured Successfully!");
                video.pause(); // Freeze video visually
            } else {
                setStatus("❌ No face detected. Look straight at camera.");
            }
        } catch (err) {
            console.error("Scan Crash:", err);
            setStatus("AI Error. Please Refresh.");
        }
    };

    const handleRetake = () => {
        setFaceDescriptor(null);
        setStatus("Ready to Scan");
        if (videoRef.current) videoRef.current.play();
    };

    // 4. Submit Registration
    const handleSubmit = async () => {
        if (!faceDescriptor) return alert("Please capture your face.");
        if (!formData.name || !formData.email || !formData.password) return alert("Please fill all fields.");

        const descriptorArray = Array.from(faceDescriptor);

        try {
            const res = await fetch('http://localhost:8080/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...formData, faceDescriptor: descriptorArray })
            });

            const data = await res.json();
            if (data.success) {
                setRegisteredUser(data.user);
            } else {
                alert("Registration Failed: " + data.message);
            }
        } catch (err) {
            alert("Server Error");
        }
    };

    // --- SUCCESS VIEW ---
    if (registeredUser) {
        return (
            <div className="min-h-screen bg-green-50 flex items-center justify-center p-6">
                <div className="bg-white p-10 rounded-2xl shadow-xl text-center max-w-lg w-full border-t-8 border-green-500">
                    <div className="text-6xl mb-4">🎉</div>
                    <h1 className="text-3xl font-bold text-gray-800 mb-2">Registration Complete!</h1>
                    <div className="bg-gray-100 p-6 rounded-xl my-6">
                        <p className="text-sm text-gray-500 uppercase font-bold tracking-wider">Your Student ID</p>
                        <p className="text-5xl font-extrabold text-indigo-600 mt-2">{registeredUser.id}</p>
                    </div>
                    <button onClick={() => navigate('/')} className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-indigo-700 shadow-lg">
                        Go to Login
                    </button>
                </div>
            </div>
        );
    }

    // --- MAIN VIEW ---
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6 font-sans">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-5xl flex flex-col md:flex-row gap-8">
                
                {/* LEFT: Form */}
                <div className="flex-1 space-y-6">
                    <h1 className="text-2xl font-bold text-gray-800">Student Enrollment</h1>
                    <div className="space-y-4">
                        <input className="w-full p-3 border rounded-lg" placeholder="Name" onChange={e => setFormData({...formData, name: e.target.value})} />
                        <input className="w-full p-3 border rounded-lg" placeholder="Email" onChange={e => setFormData({...formData, email: e.target.value})} />
                        <input className="w-full p-3 border rounded-lg" type="password" placeholder="Password" onChange={e => setFormData({...formData, password: e.target.value})} />
                    </div>
                    <button onClick={handleSubmit} disabled={!faceDescriptor} className={`w-full py-4 rounded-lg font-bold text-lg text-white ${faceDescriptor ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-gray-400 cursor-not-allowed'}`}>
                        Register
                    </button>
                </div>

                {/* RIGHT: Video */}
                <div className="flex-1 flex flex-col gap-4">
                    <div className="bg-black rounded-xl overflow-hidden relative aspect-video shadow-inner">
                        <video ref={videoRef} autoPlay muted width="100%" height="100%" className="object-cover w-full h-full" />
                        <div className="absolute top-4 w-full text-center">
                            <span className="bg-white/90 px-3 py-1 rounded-full text-xs font-bold text-gray-800">{status}</span>
                        </div>
                    </div>
                    
                    {!faceDescriptor ? (
                        <button onClick={captureFace} disabled={!modelsReady} className="bg-blue-600 text-white py-3 rounded-lg font-bold">Capture Face</button>
                    ) : (
                        <button onClick={handleRetake} className="bg-gray-600 text-white py-3 rounded-lg font-bold">Retake</button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RegisterPage;