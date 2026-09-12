import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { getApiBase } from '../utils/apiBase.js';

const API_BASE = getApiBase();

const RegisterPage = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ 
    name: '', 
    email: '', 
    password: '',
    student_id: '',
    department_id: '',
    batch_id: ''
  });
  const [loading, setLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false); // Prevent double submission
  const [departments, setDepartments] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  // Fetch departments and batches on mount
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/registration-options`);
        const data = await res.json();
        if (data.success) {
          setDepartments(data.departments);
          setBatches(data.batches);
        }
      } catch (err) {
        console.error('Failed to load registration options:', err);
      } finally {
        setLoadingOptions(false);
      }
    };
    fetchOptions();
  }, []);

  const handleRegister = async () => {
    // Prevent double submission
    if (isSubmitted || loading) return;
    
    if (!formData.name || !formData.email || !formData.password || !formData.student_id || !formData.department_id || !formData.batch_id) {
      return alert("Please fill all fields including department and batch");
    }
    
    setLoading(true);
    setIsSubmitted(true); // Mark as submitted
    try {
        const res = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name: formData.name, 
                email: formData.email, 
                password: formData.password,
                student_id: formData.student_id,
                department_id: parseInt(formData.department_id),
                batch_id: parseInt(formData.batch_id),
                faceDescriptor: null
            }) 
        });

        const data = await res.json();
        
        if (data.success) {
            alert(`Registration Submitted!\n\nYour enrollment is pending admin approval.\nYou'll be notified once approved.`);
            navigate('/login');
        } else {
            alert("Error: " + data.message);
            setIsSubmitted(false); // Allow retry on error
        }
    } catch {
        alert("Server connection failed");
        setIsSubmitted(false); // Allow retry on error
    } finally {
        setLoading(false);
    }
  };

  if (loadingOptions) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-800">
        <div className="text-white text-lg">Loading registration options...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-800 p-6 font-sans">
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="w-14 h-14 bg-indigo-600 rounded-xl mx-auto flex items-center justify-center text-white font-bold text-2xl mb-4">B</div>
          <h1 className="text-2xl font-bold text-gray-800">Student Registration</h1>
          <p className="text-gray-500 text-sm mt-1">Create your BlockProctor account</p>
        </div>

        {/* Enrollment Workflow Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-800 text-sm mb-2">📋 Enrollment Process</h3>
          <ol className="text-xs text-blue-700 space-y-1">
            <li>1. Submit this form → <span className="font-medium">Pending Admin Review</span></li>
            <li>2. Admin approves → <span className="font-medium">Face Enrollment</span></li>
            <li>3. Complete face scan → <span className="font-medium">Instructor Review</span></li>
            <li>4. Instructor adds to class → <span className="font-medium">Access Exams</span></li>
          </ol>
        </div>

        {/* Form Fields */}
        <div className="space-y-4">
          {/* Personal Info Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input 
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" 
                placeholder="John Doe" 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})} 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Student ID</label>
              <input 
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" 
                placeholder="STU2024001" 
                value={formData.student_id}
                onChange={e => setFormData({...formData, student_id: e.target.value})} 
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <input 
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" 
              type="email"
              placeholder="john.doe@university.edu" 
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})} 
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input 
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" 
              type="password" 
              placeholder="••••••••" 
              value={formData.password}
              onChange={e => setFormData({...formData, password: e.target.value})} 
            />
          </div>

          {/* Department & Batch Row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <select
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                value={formData.department_id}
                onChange={e => setFormData({...formData, department_id: e.target.value})}
              >
                <option value="">Select Department</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Batch / Year</label>
              <select
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                value={formData.batch_id}
                onChange={e => setFormData({...formData, batch_id: e.target.value})}
              >
                <option value="">Select Batch</option>
                {batches.map(batch => (
                  <option key={batch.id} value={batch.id}>{batch.name} ({batch.year})</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <button 
            onClick={handleRegister} 
            disabled={loading}
            className="w-full py-4 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
        >
            {loading ? 'Submitting Registration...' : 'Submit for Approval'}
        </button>

        {/* Back to Login */}
        <p className="text-center text-sm text-gray-500">
          Already have an account?{' '}
          <button onClick={() => navigate('/login')} className="text-indigo-600 font-medium hover:underline">
            Sign In
          </button>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;