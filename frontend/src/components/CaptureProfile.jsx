import React, { useRef, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const CaptureProfile = () => {
    const { userId } = useParams();
    const navigate = useNavigate();
    const videoRef = useRef(null);
    const [image, setImage] = useState(null);

    // Start Camera (Simple Native HTML5)
    useEffect(() => {
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(stream => {
                if (videoRef.current) videoRef.current.srcObject = stream;
            })
            .catch(err => console.error("Camera Error:", err));
    }, []);

    // Take Snapshot
    const takePhoto = () => {
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        
        // Get the image as a Base64 string
        const photoData = canvas.toDataURL('image/jpeg');
        setImage(photoData);
    };

    const saveProfilePhoto = async () => {
        try {
            // Send the PHOTO to the backend (not the math descriptor)
            // You can store this string in the DB or save as a file
            const res = await fetch(`http://localhost:8080/api/users/${userId}/photo`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ photo: image })
            });

            if (res.ok) {
                alert("Profile Photo Saved! Waiting for Admin Approval.");
                navigate('/');
            } else {
                alert("Failed to save photo.");
            }
        } catch (err) {
            alert("Server Error");
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white p-6">
            <h1 className="text-2xl font-bold mb-4">Set Profile Photo</h1>
            
            <div className="border-4 border-white rounded-lg overflow-hidden w-full max-w-lg aspect-video bg-black relative">
                {!image ? (
                    <video ref={videoRef} autoPlay muted className="w-full h-full object-cover" />
                ) : (
                    <img src={image} alt="Taken" className="w-full h-full object-cover" />
                )}
            </div>

            <div className="mt-6 flex gap-4">
                {!image ? (
                    <button onClick={takePhoto} className="px-8 py-3 bg-blue-600 rounded-full font-bold text-lg">
                        📸 Snap Photo
                    </button>
                ) : (
                    <>
                        <button onClick={() => setImage(null)} className="px-6 py-3 bg-gray-600 rounded-lg">Retake</button>
                        <button onClick={saveProfilePhoto} className="px-8 py-3 bg-green-600 rounded-lg font-bold">
                            ✅ Save & Finish
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default CaptureProfile;