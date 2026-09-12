import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setToken } from '../utils/api';

import { getApiBase } from '../utils/apiBase.js';

const API_BASE = getApiBase();

/**
 * Login and registration page. Supports three roles (student, instructor, admin)
 * and routes each to their respective dashboard after authentication.
 * Students with pending approval see an enrollment-status banner instead of
 * being redirected to the exam dashboard.
 */
const LoginPage = () => {
    const navigate = useNavigate();
    const [mode, setMode] = useState('login');
    const [role, setRole] = useState('student');
    const [formData, setFormData] = useState({ email: '', password: '' });
    const [regData, setRegData] = useState({ name: '', email: '', password: '', student_id: '', department_id: '', batch_id: '' });
    const [departments, setDepartments] = useState([]);
    const [batches, setBatches] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (mode === 'register') {
            fetch(`${API_BASE}/auth/registration-options`)
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        setDepartments(data.departments);
                        setBatches(data.batches);
                    }
                })
                .catch(() => {});
        }
    }, [mode]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: formData.email, password: formData.password, role })
            });
            
            const data = await res.json();
            
            if (data.success) {
                if (data.token) setToken(data.token);
                localStorage.setItem('userId', data.user.id);
                localStorage.setItem('userRole', data.user.role);
                localStorage.setItem('userName', data.user.name);
                
                if (data.user.role === 'admin') {
                    navigate('/admin');
                } else if (data.user.role === 'instructor') {
                    navigate(`/instructor/${data.user.id}`);
                } else {
                    if (data.user.enrollment_status === 'pending_admin') {
                        setError('Your enrollment is pending admin approval.');
                    } else if (data.user.enrollment_status === 'pending_face') {
                        navigate(`/capture-profile/${data.user.id}`);
                    } else if (data.user.enrollment_status === 'pending_instructor') {
                        setError('Waiting for instructor to add you to a class.');
                    } else {
                        navigate(`/dashboard/${data.user.id}`);
                    }
                }
            } else {
                setError(data.message || 'Login failed');
            }
        } catch {
            setError('Server error. Please try again.');
        }
        
        setLoading(false);
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        if (!regData.name || !regData.email || !regData.password || !regData.student_id || !regData.department_id || !regData.batch_id) {
            setError('Please fill all fields');
            setLoading(false);
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: regData.name,
                    email: regData.email,
                    password: regData.password,
                    student_id: regData.student_id,
                    department_id: parseInt(regData.department_id),
                    batch_id: parseInt(regData.batch_id),
                    faceDescriptor: null
                })
            });

            const data = await res.json();

            if (data.success) {
                alert('Registration Submitted!\n\nYour enrollment is pending admin approval.\nYou\'ll be notified once approved.');
                setMode('login');
                setFormData({ email: regData.email, password: '' });
                setRegData({ name: '', email: '', password: '', student_id: '', department_id: '', batch_id: '' });
            } else {
                setError(data.message || 'Registration failed');
            }
        } catch {
            setError('Server connection failed');
        }

        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-800 flex items-center justify-center p-6">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-white rounded-2xl mx-auto flex items-center justify-center shadow-xl mb-4">
                        <span className="text-3xl font-bold text-indigo-600">B</span>
                    </div>
                    <h1 className="text-3xl font-bold text-white">BlockProctor</h1>
                    <p className="text-indigo-200 mt-2">Secure Blockchain-Based Exam Proctoring</p>
                </div>

                <div className="bg-white rounded-2xl shadow-2xl p-8">
                    <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
                        <button
                            onClick={() => { setMode('login'); setError(''); }}
                            className={`flex-1 py-2 rounded-md text-sm font-semibold transition ${
                                mode === 'login' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'
                            }`}
                        >
                            Sign In
                        </button>
                        <button
                            onClick={() => { setMode('register'); setError(''); }}
                            className={`flex-1 py-2 rounded-md text-sm font-semibold transition ${
                                mode === 'register' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'
                            }`}
                        >
                            Register
                        </button>
                    </div>

                    {mode === 'login' && (
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Sign in as:</label>
                            <div className="grid grid-cols-3 gap-2">
                                {['student', 'instructor', 'admin'].map(r => (
                                    <button
                                        key={r}
                                        type="button"
                                        onClick={() => setRole(r)}
                                        className={`py-2 px-3 rounded-lg text-sm font-medium transition border-2 capitalize ${
                                            role === r
                                                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                                : 'border-gray-200 text-gray-500 hover:border-gray-300'
                                        }`}
                                    >
                                        {r === 'student' ? '🎓' : r === 'instructor' ? '👨‍🏫' : '🛡️'} {r}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm mb-4">
                            {error}
                        </div>
                    )}

                    {mode === 'login' ? (
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    placeholder="you@example.com"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                                <input
                                    type="password"
                                    value={formData.password}
                                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:opacity-50"
                            >
                                {loading ? 'Please wait...' : 'Sign In'}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleRegister} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                                    <input
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                        placeholder="John Doe"
                                        value={regData.name}
                                        onChange={e => setRegData({...regData, name: e.target.value})}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Student ID</label>
                                    <input
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                        placeholder="STU2024001"
                                        value={regData.student_id}
                                        onChange={e => setRegData({...regData, student_id: e.target.value})}
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                                <input
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    type="email"
                                    placeholder="john.doe@university.edu"
                                    value={regData.email}
                                    onChange={e => setRegData({...regData, email: e.target.value})}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                                <input
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    type="password"
                                    placeholder="••••••••"
                                    value={regData.password}
                                    onChange={e => setRegData({...regData, password: e.target.value})}
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                                    <select
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                                        value={regData.department_id}
                                        onChange={e => setRegData({...regData, department_id: e.target.value})}
                                        required
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
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                                        value={regData.batch_id}
                                        onChange={e => setRegData({...regData, batch_id: e.target.value})}
                                        required
                                    >
                                        <option value="">Select Batch</option>
                                        {batches.map(batch => (
                                            <option key={batch.id} value={batch.id}>{batch.name} ({batch.year})</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:opacity-50"
                            >
                                {loading ? 'Submitting...' : 'Submit for Approval'}
                            </button>
                        </form>
                    )}

                    {mode === 'login' && (
                        <div className="mt-6 pt-6 border-t text-center">
                            <p className="text-sm text-gray-500">Demo Accounts:</p>
                            <div className="mt-2 space-y-1 text-xs text-gray-400">
                                <p>Admin: admin@blockproctor.com / admin123</p>
                                <p>Instructor: instructor@cs.edu / instructor123</p>
                                <p>Student: (Register as new student)</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-8 grid grid-cols-3 gap-4 text-center">
                    <div className="text-indigo-200">
                        <div className="text-2xl mb-1">🔗</div>
                        <p className="text-xs">Blockchain Secured</p>
                    </div>
                    <div className="text-indigo-200">
                        <div className="text-2xl mb-1">👁️</div>
                        <p className="text-xs">AI Proctoring</p>
                    </div>
                    <div className="text-indigo-200">
                        <div className="text-2xl mb-1">🛡️</div>
                        <p className="text-xs">Privacy First</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
