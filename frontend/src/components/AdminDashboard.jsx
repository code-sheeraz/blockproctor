import React, { useEffect, useState } from 'react';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('enrollments');
  const [enrollments, setEnrollments] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);

  // --- 1. FETCH DATA ---
  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'enrollments') {
        const res = await fetch('http://localhost:8080/api/admin/pending-enrollments');
        const data = await res.json();
        if (data.success) setEnrollments(data.enrollments);
      } else if (activeTab === 'exams') {
        const res = await fetch('http://localhost:8080/api/admin/submitted-exams');
        const data = await res.json();
        if (data.success) setSessions(data.sessions);
      }
    } catch (err) {
      console.error("Fetch error:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  // --- 2. ACTIONS ---
  const handleEnrollment = async (userId, action) => {
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;
    try {
      const res = await fetch(`http://localhost:8080/api/admin/${action}/${userId}`, { 
          method: 'POST' 
      });
      const data = await res.json();
      if (data.success) {
          alert(data.message);
          fetchData(); // Refresh list
      } else {
          alert("Error: " + data.message);
      }
    } catch (err) {
      alert("Action failed");
    }
  };

  const handleResetExam = async (sessionId) => {
    if (!sessionId) {
        alert("Error: Invalid Session ID");
        return;
    }
    if (!confirm("This will delete the student's attempt and allow them to start over. Confirm?")) return;
    
    try {
      const res = await fetch(`http://localhost:8080/api/admin/reset-exam/${sessionId}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        alert("Success: " + data.message);
        fetchData();
      } else {
        alert("Failed: " + data.message);
      }
    } catch (err) {
      console.error(err);
      alert("Server Error during reset");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">Admin Console</h1>
        
        {/* TABS */}
        <div className="flex space-x-4 mb-6 border-b border-gray-300 pb-1">
          <button 
            onClick={() => setActiveTab('enrollments')}
            className={`px-4 py-2 font-medium ${activeTab === 'enrollments' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Pending Enrollments
          </button>
          <button 
            onClick={() => setActiveTab('exams')}
            className={`px-4 py-2 font-medium ${activeTab === 'exams' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Submitted Exams
          </button>
        </div>

        {/* CONTENT */}
        <div className="bg-white rounded-xl shadow p-6">
          {loading ? (
            <div className="text-center py-10 text-gray-500">Loading data...</div>
          ) : activeTab === 'enrollments' ? (
            // --- ENROLLMENT TABLE ---
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 text-sm uppercase">
                    <th className="p-4">Student</th>
                    <th className="p-4">Email</th>
                    <th className="p-4">Photo</th>
                    <th className="p-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments.length === 0 ? <tr><td colSpan="4" className="p-4 text-center text-gray-400">No pending enrollments</td></tr> : 
                   enrollments.map(user => (
                    <tr key={user.id} className="border-t hover:bg-gray-50">
                      <td className="p-4 font-medium">{user.full_name}</td>
                      <td className="p-4 text-gray-600">{user.email}</td>
                      <td className="p-4">
                        <img src={user.profile_photo_url || "https://via.placeholder.com/40"} alt="Profile" className="w-10 h-10 rounded-full object-cover border" />
                      </td>
                      <td className="p-4 space-x-2">
                        <button onClick={() => handleEnrollment(user.id, 'approve')} className="px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 text-sm font-bold">Approve</button>
                        <button onClick={() => handleEnrollment(user.id, 'reject')} className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm font-bold">Reject</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            // --- EXAMS TABLE ---
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 text-sm uppercase">
                    <th className="p-4">Student</th>
                    <th className="p-4">Exam</th>
                    <th className="p-4">Score</th>
                    <th className="p-4">Date</th>
                    <th className="p-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.length === 0 ? <tr><td colSpan="5" className="p-4 text-center text-gray-400">No submitted exams</td></tr> : 
                   sessions.map(session => (
                    <tr key={session.session_id} className="border-t hover:bg-gray-50">
                      <td className="p-4">
                        <div className="font-medium text-gray-900">{session.full_name}</div>
                        <div className="text-xs text-gray-500">{session.email}</div>
                      </td>
                      <td className="p-4 text-gray-700">{session.exam_title}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-sm font-bold ${session.score >= 50 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {session.score !== null ? session.score : 'N/A'}
                        </span>
                      </td>
                      <td className="p-4 text-gray-500 text-sm">
                        {session.finished_at ? new Date(session.finished_at).toLocaleString() : 'Invalid Date'}
                      </td>
                      <td className="p-4">
                        <button 
                            onClick={() => handleResetExam(session.session_id)} 
                            className="text-indigo-600 hover:text-indigo-900 text-sm font-medium border border-indigo-200 px-3 py-1 rounded hover:bg-indigo-50 transition"
                        >
                            Allow Re-attempt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;