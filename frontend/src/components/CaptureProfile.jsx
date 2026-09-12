import React, { useRef, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as faceapi from 'face-api.js';

import { getApiBase } from '../utils/apiBase.js';

const API_BASE = getApiBase();

// GLOBAL LOCK: Prevents double-loading in React Strict Mode
let isLoadingModels = false;

// OPTIMIZATION: TinyFace for speed (matches ExamVerification / ExamProctor fast path).
// Descriptors still come from faceRecognitionNet, so stored embeddings stay compatible.
const tinyFaceOptions = new faceapi.TinyFaceDetectorOptions({
    inputSize: 224, // Smaller = Faster
    scoreThreshold: 0.4
});

const CaptureProfile = () => {
    const { userId } = useParams();
    const navigate = useNavigate();
    const videoRef = useRef(null);
    const streamRef = useRef(null); // Keep track of stream for cleanup
    const [image, setImage] = useState(null);
    const [faceDescriptor, setFaceDescriptor] = useState(null);
    const [status, setStatus] = useState('Initializing...');
    const [modelsReady, setModelsReady] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    // Cleanup camera stream on unmount
    useEffect(() => {
        return () => {
            stopCamera();
        };
    }, []);

    // Stop camera helper function
    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    };

    // Load face-api models
    useEffect(() => {
        const loadModels = async () => {
            if (isLoadingModels) return;
            isLoadingModels = true;

            try {
                setStatus('Loading AI models...');
                const MODEL_URL = '/models';
                await Promise.all([
                    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
                    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
                ]);
                setModelsReady(true);
                setStatus('Ready - Position your face in the frame');
                startCamera();
            } catch (err) {
                console.error("Model Error:", err);
                setStatus('Error loading AI models. Please refresh.');
            }
        };
        loadModels();
    }, []);

    // Start Camera
    const startCamera = () => {
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(stream => {
                streamRef.current = stream; // Store for cleanup
                if (videoRef.current) videoRef.current.srcObject = stream;
            })
            .catch(err => {
                console.error("Camera Error:", err);
                setStatus('Camera permission denied');
            });
    };

    // Capture face photo AND extract descriptor
    const captureVerificationPhoto = async () => {
        if (!videoRef.current || !modelsReady) return;
        
        setIsProcessing(true);
        setStatus('Scanning face...');

        try {
            const video = videoRef.current;
            const scale = Math.min(1, 640 / video.videoWidth);
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

            // Show the captured photo immediately (no waiting on detection)
            setImage(canvas.toDataURL('image/jpeg', 0.8));
            video.pause();

            // Detect face and extract descriptor in the background
            const detection = await faceapi.detectSingleFace(canvas, tinyFaceOptions)
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (detection) {
                setFaceDescriptor(Array.from(detection.descriptor));
                setStatus('✅ Face captured successfully!');
            } else {
                setStatus('❌ No face detected. Please look directly at the camera.');
            }
        } catch (err) {
            console.error("Face detection error:", err);
            setStatus('Error scanning face. Please try again.');
        } finally {
            setIsProcessing(false);
        }
    };

    // Retake photo
    const handleRetake = () => {
        setImage(null);
        setFaceDescriptor(null);
        setStatus('Ready - Position your face in the frame');
        if (videoRef.current) {
            videoRef.current.play();
        }
    };

    // Submit for admin verification
    const submitForVerification = async () => {
        if (!image || !faceDescriptor) {
            alert("Please capture your face first.");
            return;
        }

        setIsProcessing(true);
        setStatus('Uploading...');

        try {
            const res = await fetch(`${API_BASE}/enroll/upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    userId: parseInt(userId),
                    faceDescriptor: faceDescriptor,
                    photoBase64: image
                })
            });

            const data = await res.json();
            
            if (data.success) {
                stopCamera(); // Stop camera before navigating
                alert("Face verification photo submitted!\n\nAn administrator will verify your identity. You'll be notified once approved.");
                navigate('/login');
            } else {
                alert("Submission failed: " + data.message);
            }
        } catch (err) {
            console.error("Submit error:", err);
            alert("Server error. Please try again.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 flex items-center justify-center p-6">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden">
                {/* Header */}
                <div className="bg-indigo-600 text-white p-6">
                    <h1 className="text-2xl font-bold flex items-center gap-3">
                        <span className="text-3xl">🔐</span>
                        Identity Verification
                    </h1>
                    <p className="text-indigo-200 mt-2">
                        This photo will be used to verify your identity during exams. It is kept private and secure.
                    </p>
                </div>

                {/* Content */}
                <div className="p-6">
                    {/* Status Badge */}
                    <div className={`text-center py-2 px-4 rounded-lg mb-4 ${
                        status.includes('✅') ? 'bg-green-100 text-green-800' :
                        status.includes('❌') ? 'bg-red-100 text-red-800' :
                        status.includes('Error') ? 'bg-red-100 text-red-800' :
                        'bg-blue-100 text-blue-800'
                    }`}>
                        <p className="font-medium">{status}</p>
                    </div>

                    {/* Video/Image Preview */}
                    <div className="border-4 border-gray-200 rounded-xl overflow-hidden aspect-video bg-black relative">
                        {!image ? (
                            <video 
                                ref={videoRef} 
                                autoPlay 
                                muted 
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <img 
                                src={image} 
                                alt="Captured" 
                                className="w-full h-full object-cover"
                            />
                        )}

                        {/* Overlay guide */}
                        {!image && modelsReady && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-48 h-60 border-4 border-dashed border-white/50 rounded-full"></div>
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-6 flex justify-center gap-4">
                        {!image ? (
                            <button 
                                onClick={captureVerificationPhoto} 
                                disabled={!modelsReady || isProcessing}
                                className={`px-8 py-3 rounded-xl font-bold text-lg transition ${
                                    modelsReady && !isProcessing 
                                        ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                }`}
                            >
                                {isProcessing ? '⏳ Processing...' : '📸 Capture Face'}
                            </button>
                        ) : (
                            <>
                                <button 
                                    onClick={handleRetake} 
                                    disabled={isProcessing}
                                    className="px-6 py-3 bg-gray-500 text-white rounded-xl font-medium hover:bg-gray-600 transition"
                                >
                                    🔄 Retake
                                </button>
                                <button 
                                    onClick={submitForVerification} 
                                    disabled={isProcessing}
                                    className={`px-8 py-3 rounded-xl font-bold transition ${
                                        isProcessing 
                                            ? 'bg-gray-300 text-gray-500' 
                                            : 'bg-green-600 text-white hover:bg-green-700'
                                    }`}
                                >
                                    {isProcessing ? '⏳ Submitting...' : '✅ Submit for Verification'}
                                </button>
                            </>
                        )}
                    </div>

                    {/* Info Box */}
                    <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <h3 className="font-bold text-amber-800 flex items-center gap-2">
                            <span>⚠️</span> Important Guidelines
                        </h3>
                        <ul className="mt-2 text-sm text-amber-700 space-y-1">
                            <li>• Look directly at the camera with good lighting</li>
                            <li>• Remove glasses, hats, or anything covering your face</li>
                            <li>• This photo is for <strong>identity verification only</strong></li>
                            <li>• An admin will verify your photo before you can access exams</li>
                            <li>• Your photo is stored securely and used only for proctoring</li>
                        </ul>
                    </div>

                    {/* Privacy Notice */}
                    <div className="mt-4 text-center text-sm text-gray-500">
                        <p>🔒 Your face data is encrypted and used only for exam verification.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CaptureProfile;