import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const StudentDashboard = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  
  const [student, setStudent] = useState(null);
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);

  // 1. Fetch Data
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch User Details (Optional, for name)
        // const userRes = await fetch(`http://localhost:8080/api/users/${userId}`);
        
        // Fetch Exams (This returns the list AND completion status/score)
        const examRes = await fetch(`http://localhost:8080/api/exams?studentId=${userId}`);
        const examData = await examRes.json();

        if (examData.success) {
            setExams(examData.exams);
        }
      } catch (err) {
        console.error("Error loading dashboard:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId]);

  // 2. The Missing Function
  const handleStartExam = (examId) => {
    // Navigate to the Exam Page: /exam/:examId/:studentId
    navigate(`/exam/${examId}/${userId}`);
  };

  if (loading) return <div className="flex h-screen items-center justify-center text-gray-500">Loading Dashboard...</div>;

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
            <span className="text-sm text-gray-500">Student ID: {userId}</span>
            <div className="w-8 h-8 bg-gray-200 rounded-full border border-gray-300"></div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900">Your Exams</h2>
          <p className="text-gray-500 mt-1">Access your assigned assessments below.</p>
        </div>

        {/* Exam Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {exams.map((exam) => (
                <div key={exam.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 transition hover:shadow-md">
                    <div className="flex justify-between items-start mb-4">
                        <h3 className="text-xl font-bold text-gray-800">{exam.title}</h3>
                        <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded">
                            {exam.duration_minutes || exam.duration} mins
                        </span>
                    </div>
                    
                    <p className="text-gray-500 text-sm mb-6 line-clamp-2">{exam.description}</p>
                    
                    {/* CONDITIONAL RENDERING: Button vs Score */}
                    {exam.is_completed ? (
                        <div className="w-full bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                            <p className="text-sm text-green-600 font-bold uppercase tracking-wide">Exam Completed</p>
                            <p className="text-3xl font-extrabold text-green-700 mt-1">
                                {exam.score !== null ? exam.score : 0} 
                                <span className="text-base font-medium text-green-500 ml-1">/ 100</span>
                            </p>
                        </div>
                    ) : (
                        <button 
                            onClick={() => handleStartExam(exam.id)}
                            className="w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 transition flex items-center justify-center gap-2"
                        >
                            <span>Start Attempt</span>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                        </button>
                    )}
                </div>
            ))}
        </div>
      </main>
    </div>
  );
};

export default StudentDashboard;