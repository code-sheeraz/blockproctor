import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import usePagination from '../hooks/usePagination.js';
import Pagination from '../components/Pagination.jsx';

import { getApiBase } from '../utils/apiBase.js';

const API_BASE = getApiBase();

const StudentDashboard = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  
  const [student, setStudent] = useState(null);
  const [exams, setExams] = useState([]);
  const [classes, setClasses] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [activeTab, setActiveTab] = useState('exams');
  const [loading, setLoading] = useState(true);
  const [showExportDropdown, setShowExportDropdown] = useState(false);

  // Search & pagination state
  const [examSearch, setExamSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');

  // Profile editing state
  const [profileForm, setProfileForm] = useState({ full_name: '', email: '', currentPassword: '', newPassword: '', confirmPassword: '' });
  const [profileMessage, setProfileMessage] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Filtered lists + pagination
  const filteredExams = exams.filter(e =>
    (e.title || '').toLowerCase().includes(examSearch.toLowerCase()) ||
    (e.class_name || '').toLowerCase().includes(examSearch.toLowerCase())
  );
  const filteredAttempts = attempts.filter(a =>
    (a.exam_title || '').toLowerCase().includes(historySearch.toLowerCase()) ||
    (a.class_name || '').toLowerCase().includes(historySearch.toLowerCase())
  );

  const examPager = usePagination(filteredExams, 6);
  const historyPager = usePagination(filteredAttempts, 8);

  // Export functionality for students
  const exportMyResults = (format) => {
    const exportData = {
      student: {
        name: student?.full_name,
        email: student?.email,
        student_id: student?.student_id
      },
      exportedAt: new Date().toISOString(),
      summary: {
        total_attempts: attempts.length,
        average_score: attempts.length > 0 
          ? (attempts.reduce((sum, a) => sum + Number(a.score || 0), 0) / attempts.length).toFixed(1)
          : 0,
        best_score: attempts.length > 0 ? Math.max(...attempts.map(a => Number(a.score || 0))) : 0,
        passed_exams: attempts.filter(a => Number(a.score || 0) >= 50).length
      },
      attempts: attempts.map(a => ({
        exam_title: a.exam_title,
        class_name: a.class_name,
        score: a.score,
        questions_answered: a.questions_answered,
        total_questions: a.total_questions,
        submitted_at: a.submitted_at,
        status: a.status
      }))
    };

    if (format === 'csv') {
      const headers = ['Exam', 'Class', 'Score', 'Questions Answered', 'Total Questions', 'Submitted At', 'Status'];
      const rows = exportData.attempts.map(a => [
        `"${a.exam_title || ''}"`,
        `"${a.class_name || ''}"`,
        a.score || 0,
        a.questions_answered || 0,
        a.total_questions || 0,
        `"${a.submitted_at || ''}"`,
        `"${a.status || ''}"`
      ]);
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `my_exam_results_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `my_exam_results_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setShowExportDropdown(false);
  };

  // Fetch Dashboard Data
  useEffect(() => {
    const controller = new AbortController();

    const fetchData = async () => {
      try {
        // Fetch student dashboard data in parallel
        const [dashRes, examRes, attemptRes] = await Promise.all([
          fetch(`${API_BASE}/students/${userId}/dashboard`, { signal: controller.signal }),
          fetch(`${API_BASE}/students/${userId}/exams/available`, { signal: controller.signal }),
          fetch(`${API_BASE}/students/${userId}/attempts`, { signal: controller.signal })
        ]);

        const [dashData, examData, attemptData] = await Promise.all([
          dashRes.json(),
          examRes.json(),
          attemptRes.json()
        ]);

        if (dashData.success) {
          setStudent(dashData.student);
          setClasses(dashData.classes || []);
        }

        if (examData.success) {
          setExams(examData.exams);
        }

        if (attemptData.success) {
          setAttempts(attemptData.attempts);
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error("Error loading dashboard:", err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => controller.abort();
  }, [userId]);

  const handleStartExam = (examId) => {
    navigate(`/exam/${examId}/${userId}`);
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  // Sync profile form with loaded student data
  useEffect(() => {
    if (student) {
      setProfileForm(f => ({ ...f, full_name: student.full_name || student.name || '', email: student.email || '' }));
    }
  }, [student]);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileError(null);
    setProfileMessage(null);

    if (!profileForm.currentPassword) {
      setProfileError('Please enter your current password to make changes');
      return;
    }
    if (profileForm.newPassword && profileForm.newPassword.length < 6) {
      setProfileError('New password must be at least 6 characters');
      return;
    }
    if (profileForm.newPassword !== profileForm.confirmPassword) {
      setProfileError('New password and confirmation do not match');
      return;
    }

    setSavingProfile(true);
    try {
      const res = await fetch(`${API_BASE}/students/${userId}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: profileForm.full_name,
          email: profileForm.email,
          currentPassword: profileForm.currentPassword,
          newPassword: profileForm.newPassword || undefined
        })
      });
      const data = await res.json();

      if (data.success) {
        setProfileMessage(data.message);
        localStorage.setItem('userName', data.user.name);
        setStudent(prev => ({ ...prev, name: data.user.name, full_name: data.user.name, email: data.user.email }));
        setProfileForm(f => ({ ...f, currentPassword: '', newPassword: '', confirmPassword: '' }));
      } else {
        setProfileError(data.message || 'Failed to update profile');
      }
    } catch {
      setProfileError('Server error. Please try again.');
    }
    setSavingProfile(false);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  // Handle different enrollment states
  if (student && student.enrollment_status !== 'enrolled') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-800 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md text-center">
          <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">⏳</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Enrollment In Progress</h2>
          
          {student.enrollment_status === 'pending_admin' && (
            <>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <p className="text-yellow-800 font-medium">Waiting for Admin Approval</p>
                <p className="text-yellow-600 text-sm mt-1">Your registration is being reviewed by an administrator.</p>
              </div>
              <div className="text-left bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 font-medium mb-2">Enrollment Steps:</p>
                <ol className="text-sm text-gray-500 space-y-2">
                  <li className="flex items-center gap-2">
                    <span className="w-6 h-6 bg-yellow-500 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                    <span className="font-medium text-yellow-700">Admin Approval</span> ← You are here
                  </li>
                  <li className="flex items-center gap-2 opacity-50">
                    <span className="w-6 h-6 bg-gray-300 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                    Submit ID Verification Photo
                  </li>
                  <li className="flex items-center gap-2 opacity-50">
                    <span className="w-6 h-6 bg-gray-300 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                    Admin Verifies Your Identity
                  </li>
                  <li className="flex items-center gap-2 opacity-50">
                    <span className="w-6 h-6 bg-gray-300 text-white rounded-full flex items-center justify-center text-xs font-bold">4</span>
                    Instructor Adds to Class
                  </li>
                  <li className="flex items-center gap-2 opacity-50">
                    <span className="w-6 h-6 bg-gray-300 text-white rounded-full flex items-center justify-center text-xs font-bold">5</span>
                    Access Exams
                  </li>
                </ol>
              </div>
            </>
          )}

          {student.enrollment_status === 'pending_face' && (
            <>
              {student.face_verification_photo ? (
                // Photo submitted, waiting for admin verification
                <>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                    <p className="text-amber-800 font-medium">🔍 Identity Verification Pending</p>
                    <p className="text-amber-600 text-sm mt-1">Your photo has been submitted. An administrator will verify your identity shortly.</p>
                  </div>
                  <div className="text-left bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 font-medium mb-2">What happens next:</p>
                    <ol className="text-sm text-gray-500 space-y-2">
                      <li className="flex items-center gap-2">
                        <span className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs">✓</span>
                        Photo Submitted
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-6 h-6 bg-amber-500 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                        <span className="font-medium text-amber-700">Admin Verifies Identity</span> ← Current
                      </li>
                      <li className="flex items-center gap-2 opacity-50">
                        <span className="w-6 h-6 bg-gray-300 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                        Instructor Adds to Class
                      </li>
                      <li className="flex items-center gap-2 opacity-50">
                        <span className="w-6 h-6 bg-gray-300 text-white rounded-full flex items-center justify-center text-xs font-bold">4</span>
                        Access Exams
                      </li>
                    </ol>
                  </div>
                </>
              ) : (
                // No photo yet, prompt to submit
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <p className="text-blue-800 font-medium">Identity Verification Required</p>
                    <p className="text-blue-600 text-sm mt-1">Please submit your face photo for admin verification.</p>
                  </div>
                  <button 
                    onClick={() => navigate(`/capture-profile/${userId}`)}
                    className="w-full py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition"
                  >
                    Start Identity Verification →
                  </button>
                </>
              )}
            </>
          )}

          {student.enrollment_status === 'pending_instructor' && (
            <>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
                <p className="text-purple-800 font-medium">Waiting for Class Assignment</p>
                <p className="text-purple-600 text-sm mt-1">An instructor from your department will add you to a class soon.</p>
              </div>
              <div className="text-left bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-500">
                  <strong>Department:</strong> {student.department_name || 'N/A'}<br/>
                  <strong>Batch:</strong> {student.batch_name || 'N/A'}
                </p>
              </div>
            </>
          )}

          <button 
            onClick={handleLogout}
            className="mt-6 text-sm text-gray-500 hover:text-gray-700"
          >
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">B</div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">BlockProctor</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">{student?.name || 'Student'}</p>
              <p className="text-xs text-gray-500">{student?.department_name} • {student?.batch_name}</p>
            </div>
            <button 
              onClick={handleLogout}
              className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="text-3xl font-bold text-indigo-600">{classes.length}</div>
            <div className="text-gray-500 text-sm mt-1">Enrolled Classes</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="text-3xl font-bold text-blue-600">{exams.length}</div>
            <div className="text-gray-500 text-sm mt-1">Total Exams</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="text-3xl font-bold text-green-600">
              {exams.filter(e => e.status === 'available' || e.status === 'in_progress').length}
            </div>
            <div className="text-gray-500 text-sm mt-1">Available to Take</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="text-3xl font-bold text-purple-600">
              {exams.filter(e => e.status === 'completed' || e.status === 'terminated' || e.score !== null).length}
            </div>
            <div className="text-gray-500 text-sm mt-1">Completed</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-white rounded-lg p-1 shadow-sm w-fit">
          <button
            onClick={() => setActiveTab('exams')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              activeTab === 'exams' 
                ? 'bg-indigo-600 text-white' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            📝 My Exams
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              activeTab === 'history' 
                ? 'bg-indigo-600 text-white' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            📊 History
          </button>
          <button
            onClick={() => setActiveTab('classes')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              activeTab === 'classes' 
                ? 'bg-indigo-600 text-white' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            📚 My Classes
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              activeTab === 'profile' 
                ? 'bg-indigo-600 text-white' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            👤 Profile
          </button>
        </div>

        {/* Exams Tab */}
        {activeTab === 'exams' && (
          <div>
            <div className="mb-6 flex justify-between items-center gap-4 flex-wrap">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Available Exams</h2>
                <p className="text-gray-500 mt-1">Exams from your enrolled classes</p>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={examSearch}
                  onChange={(e) => { setExamSearch(e.target.value); examPager.setPage(1); }}
                  placeholder="🔍 Search exams..."
                  className="pl-9 pr-4 py-2 border rounded-lg text-sm w-64"
                />
                <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
              </div>
            </div>

            {filteredExams.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
                <div className="text-5xl mb-4">📋</div>
                <h3 className="text-lg font-semibold text-gray-800">
                  {exams.length === 0 ? 'No Exams Available' : 'No Exams Match Your Search'}
                </h3>
                <p className="text-gray-500 mt-2">
                  {exams.length === 0 ? "Your instructors haven't published any exams yet." : 'Try a different search term.'}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {examPager.pageItems.map((exam) => (
                  <div key={exam.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 transition hover:shadow-md">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="text-lg font-bold text-gray-800">{exam.title}</h3>
                        <p className="text-xs text-indigo-600 font-medium">{exam.class_name}</p>
                      </div>
                      <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded">
                        {exam.duration_minutes || exam.duration} mins
                      </span>
                    </div>
                    
                    <p className="text-gray-500 text-sm mb-4 line-clamp-2">{exam.description || 'No description'}</p>
                    
                    {/* Time Info */}
                    {(exam.start_time || exam.end_time) && (
                      <div className="text-xs text-gray-400 mb-4">
                        {exam.start_time && <p>Starts: {new Date(exam.start_time).toLocaleString()}</p>}
                        {exam.end_time && <p>Ends: {new Date(exam.end_time).toLocaleString()}</p>}
                      </div>
                    )}
                    
                    {/* STATUS-BASED RENDERING */}
                    {exam.status === 'locked' ? (
                      <div className="w-full bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                        <p className="text-sm text-red-600 font-bold uppercase tracking-wide">🔒 Exam Locked</p>
                        <p className="text-xs text-red-500 mt-1">{exam.lock_reason || 'Contact admin for re-attempt'}</p>
                        {exam.score !== null && (
                          <p className="text-lg font-bold text-red-700 mt-2">Score: {exam.score}/100</p>
                        )}
                      </div>
                    ) : exam.status === 'terminated' ? (
                      <div className="w-full bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
                        <p className="text-sm text-orange-600 font-bold uppercase tracking-wide">⚠️ Exam Terminated</p>
                        <p className="text-xs text-orange-500 mt-1">Contact admin for re-attempt</p>
                        {exam.score !== null && (
                          <p className="text-lg font-bold text-orange-700 mt-2">Score: {exam.score}/100</p>
                        )}
                      </div>
                    ) : exam.status === 'completed' || exam.score !== null ? (
                      <div className="w-full bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                        <p className="text-sm text-green-600 font-bold uppercase tracking-wide">✅ Exam Completed</p>
                        <p className="text-3xl font-extrabold text-green-700 mt-1">
                          {exam.score !== null ? exam.score : 0} 
                          <span className="text-base font-medium text-green-500 ml-1">/ 100</span>
                        </p>
                      </div>
                    ) : exam.status === 'in_progress' ? (
                      <button 
                        onClick={() => handleStartExam(exam.id)}
                        className="w-full bg-yellow-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-yellow-600 transition flex items-center justify-center gap-2"
                      >
                        <span>Resume Exam</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </button>
                    ) : exam.status === 'expired' ? (
                      <div className="w-full bg-gray-100 border border-gray-200 rounded-lg p-3 text-center">
                        <p className="text-sm text-gray-500 font-bold uppercase tracking-wide">Exam Expired</p>
                      </div>
                    ) : exam.status === 'upcoming' ? (
                      <div className="w-full bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                        <p className="text-sm text-blue-600 font-bold uppercase tracking-wide">Coming Soon</p>
                        <p className="text-xs text-blue-500 mt-1">Starts: {new Date(exam.start_time).toLocaleString()}</p>
                      </div>
                    ) : (
                      <button 
                        onClick={() => handleStartExam(exam.id)}
                        className="w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 transition flex items-center justify-center gap-2"
                      >
                        <span>Start Attempt</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
                </div>
                <Pagination page={examPager.page} totalPages={examPager.totalPages} onPageChange={examPager.setPage} />
              </>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div>
            <div className="mb-6 flex justify-between items-center gap-4 flex-wrap">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Exam History</h2>
                <p className="text-gray-500 mt-1">Your past exam attempts and scores</p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => { setHistorySearch(e.target.value); historyPager.setPage(1); }}
                  placeholder="🔍 Search history..."
                  className="px-4 py-2 border rounded-lg text-sm w-56"
                />
                {attempts.length > 0 && (
                <div className="relative">
                  <button 
                    onClick={() => setShowExportDropdown(!showExportDropdown)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                  >
                    📥 Export My Results ▾
                  </button>
                  {showExportDropdown && (
                    <div className="absolute right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 min-w-[140px]">
                      <button onClick={() => exportMyResults('json')} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100">📄 JSON</button>
                      <button onClick={() => exportMyResults('csv')} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100">📊 CSV (Excel)</button>
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>

            {attempts.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
                <div className="text-5xl mb-4">📊</div>
                <h3 className="text-lg font-semibold text-gray-800">No Exam History</h3>
                <p className="text-gray-500 mt-2">Your completed exams will appear here.</p>
              </div>
            ) : filteredAttempts.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
                <div className="text-5xl mb-4">🔍</div>
                <h3 className="text-lg font-semibold text-gray-800">No Matches</h3>
                <p className="text-gray-500 mt-2">No attempts match your search term.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Stats Summary */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
                    <div className="text-3xl font-bold text-indigo-600">{attempts.length}</div>
                    <div className="text-sm text-gray-500">Total Attempts</div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
                    <div className="text-3xl font-bold text-green-600">
                      {attempts.length > 0 
                        ? (attempts.reduce((sum, a) => sum + Number(a.score || 0), 0) / attempts.length).toFixed(1)
                        : 0}%
                    </div>
                    <div className="text-sm text-gray-500">Average Score</div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
                    <div className="text-3xl font-bold text-blue-600">
                      {attempts.length > 0 ? Math.max(...attempts.map(a => a.score || 0)) : 0}%
                    </div>
                    <div className="text-sm text-gray-500">Best Score</div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border p-4 text-center">
                    <div className="text-3xl font-bold text-purple-600">
                      {attempts.filter(a => a.score >= 50).length}
                    </div>
                    <div className="text-sm text-gray-500">Passed Exams</div>
                  </div>
                </div>

                {/* Attempts List */}
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        <th className="p-4">Exam</th>
                        <th className="p-4">Class</th>
                        <th className="p-4">Score</th>
                        <th className="p-4">Questions</th>
                        <th className="p-4">Date</th>
                        <th className="p-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {historyPager.pageItems.map(attempt => (
                        <tr key={attempt.id} className="hover:bg-gray-50">
                          <td className="p-4">
                            <div className="font-medium text-gray-800">{attempt.exam_title}</div>
                          </td>
                          <td className="p-4 text-gray-600">{attempt.class_name}</td>
                          <td className="p-4">
                            <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                              attempt.score >= 80 ? 'bg-green-100 text-green-700' :
                              attempt.score >= 60 ? 'bg-yellow-100 text-yellow-700' :
                              attempt.score >= 40 ? 'bg-orange-100 text-orange-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {attempt.score}%
                            </span>
                          </td>
                          <td className="p-4 text-gray-600">
                            {attempt.correct_count}/{attempt.total_questions}
                          </td>
                          <td className="p-4 text-gray-500 text-sm">
                            {new Date(attempt.submitted_at).toLocaleString()}
                          </td>
                          <td className="p-4">
                            {attempt.score >= 50 ? (
                              <span className="text-green-600 font-medium">✓ Passed</span>
                            ) : (
                              <span className="text-red-600 font-medium">✗ Failed</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={historyPager.page} totalPages={historyPager.totalPages} onPageChange={historyPager.setPage} />
              </div>
            )}
          </div>
        )}

        {/* Classes Tab */}
        {activeTab === 'classes' && (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900">My Classes</h2>
              <p className="text-gray-500 mt-1">Classes you're enrolled in</p>
            </div>

            {classes.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
                <div className="text-5xl mb-4">📚</div>
                <h3 className="text-lg font-semibold text-gray-800">No Classes Yet</h3>
                <p className="text-gray-500 mt-2">Wait for an instructor to add you to a class.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {classes.map((cls) => (
                  <div key={cls.id} className="bg-white rounded-xl shadow-sm border p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-gray-800">{cls.name}</h3>
                        <p className="text-sm text-gray-500">Code: {cls.code}</p>
                      </div>
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                        Enrolled
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">{cls.description || 'No description'}</p>
                    <div className="text-sm text-gray-500">
                      <p>👨‍🏫 {cls.instructor_name}</p>
                      <p>📅 Enrolled: {new Date(cls.enrolled_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900">My Profile</h2>
              <p className="text-gray-500 mt-1">Update your name, email, and password</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-8 max-w-2xl">
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-xs text-gray-500 uppercase tracking-wider">Student ID</div>
                  <div className="font-bold text-gray-800 mt-1">{student?.student_id || '-'}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-xs text-gray-500 uppercase tracking-wider">Department • Batch</div>
                  <div className="font-bold text-gray-800 mt-1">
                    {student?.department_name || 'N/A'} • {student?.batch_name || 'N/A'}
                  </div>
                </div>
              </div>

              <form onSubmit={handleProfileSubmit} className="space-y-4">
                {profileMessage && (
                  <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">
                    ✅ {profileMessage}
                  </div>
                )}
                {profileError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                    ⚠️ {profileError}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={profileForm.full_name}
                    onChange={(e) => setProfileForm(f => ({ ...f, full_name: e.target.value }))}
                    required
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm(f => ({ ...f, email: e.target.value }))}
                    required
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">🔒 Change Password <span className="text-gray-400 font-normal">(optional — leave blank to keep current)</span></p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <input
                        type="password"
                        value={profileForm.newPassword}
                        onChange={(e) => setProfileForm(f => ({ ...f, newPassword: e.target.value }))}
                        placeholder="New password"
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <input
                        type="password"
                        value={profileForm.confirmPassword}
                        onChange={(e) => setProfileForm(f => ({ ...f, confirmPassword: e.target.value }))}
                        placeholder="Confirm new password"
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                    <div className="flex items-center text-xs text-gray-400">
                      Minimum 6 characters
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Current Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={profileForm.currentPassword}
                    onChange={(e) => setProfileForm(f => ({ ...f, currentPassword: e.target.value }))}
                    required
                    placeholder="Enter your current password to save changes"
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingProfile}
                  className="w-full py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                  {savingProfile ? 'Saving...' : '💾 Save Changes'}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default StudentDashboard;