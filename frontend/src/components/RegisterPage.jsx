import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const RegisterPage = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!formData.name || !formData.email || !formData.password) return alert("Please fill all fields");
    
    setLoading(true);
    try {
        // 1. Create the User Profile ONLY (No Face Data yet)
        const res = await fetch('http://localhost:8080/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name: formData.name, 
                email: formData.email, 
                password: formData.password,
                faceDescriptor: null // We will handle this later
            }) 
        });

        const data = await res.json();
        
        if (data.success) {
            // 2. Success! Go to the "Take Profile Photo" page
            alert(`Account Created! ID: ${data.user.id}`);
            navigate(`/capture-profile/${data.user.id}`);
        } else {
            alert("Error: " + data.message);
        }
    } catch (err) {
        alert("Server connection failed");
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6 font-sans">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md space-y-6">
        <h1 className="text-3xl font-bold text-center text-gray-800">Create Student Profile</h1>
        
        <div className="space-y-4">
            <input className="w-full p-4 border rounded-lg" placeholder="Full Name" onChange={e => setFormData({...formData, name: e.target.value})} />
            <input className="w-full p-4 border rounded-lg" placeholder="Email Address" onChange={e => setFormData({...formData, email: e.target.value})} />
            <input className="w-full p-4 border rounded-lg" type="password" placeholder="Password" onChange={e => setFormData({...formData, password: e.target.value})} />
        </div>

        <button 
            onClick={handleRegister} 
            disabled={loading}
            className="w-full py-4 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition"
        >
            {loading ? 'Creating Profile...' : 'Next: Upload Photo'}
        </button>
      </div>
    </div>
  );
};

export default RegisterPage;