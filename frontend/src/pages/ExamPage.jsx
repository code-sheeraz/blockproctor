import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ExamProctor from '../components/ExamProctor.jsx';

const ExamPage = () => {
  const { examId, userId } = useParams(); // <--- We get 'userId' from the URL here
  const navigate = useNavigate();
  
  const [examData, setExamData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    fetch(`http://localhost:8080/api/exams/${examId}`)
      .then(res => res.json())
      .then(data => {
          if(data.success) setExamData(data.exam);
      })
      .catch(err => console.error("Failed to load exam", err));
  }, [examId]);

  const handleSubmit = async () => {
    try {
        const res = await fetch('http://localhost:8080/api/exams/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            examId,
            studentId: userId,
            answers: Object.values(answers) 
          })
        });
        
        const result = await res.json();
        if(result.success) {
            alert(`Exam Submitted!\n\nScore: ${result.score}`);
            navigate(`/dashboard/${userId}`);
        } else {
            alert("Submission failed: " + result.message);
        }
    } catch(err) {
        console.error(err);
        alert("Server error during submission.");
    }
  };

  if (!examData) return <div className="flex items-center justify-center h-screen text-xl font-semibold text-gray-600">Loading Exam Content...</div>;
  
  // RED SCREEN BLOCK (Tailwind Styles)
  if (isBlocked) return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-red-600 text-white">
        <h1 className="text-6xl font-bold mb-4">⛔ EXAM BLOCKED</h1>
        <p className="text-2xl mb-8">Suspicious activity detected. Administrator has been notified.</p>
        <button 
            onClick={() => navigate(`/dashboard/${userId}`)} 
            className="px-8 py-3 bg-white text-red-600 font-bold rounded-lg shadow-lg hover:bg-gray-100 transition"
        >
            Return to Dashboard
        </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 font-sans relative">
      
      {/* --- FLOATING PROCTOR WIDGET (Top Right) --- */}
      {/* FLOATING PROCTOR WIDGET (Bottom Right) */}
{/* Increased size: w-80 h-60 for better visibility */}
<div className="fixed bottom-6 right-6 w-80 h-60 border-4 border-gray-800 rounded-xl shadow-2xl z-50 bg-black overflow-hidden transition-all hover:scale-105">
    <ExamProctor 
        studentId={userId} 
        examId={examId} 
        onExamBlock={() => setIsBlocked(true)} 
    />
</div>

      {/* --- MAIN EXAM CONTENT (Centered) --- */}
      <div className="max-w-4xl mx-auto py-12 px-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 mb-8">
            <h1 className="text-3xl font-bold text-gray-800 border-b pb-4 mb-4">{examData.title}</h1>
            <p className="text-gray-500">{examData.description}</p>
        </div>
        
        <div className="space-y-6">
            {examData.questions_json && examData.questions_json.map((q, index) => (
            <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 transition hover:shadow-md">
                <p className="text-lg font-medium text-gray-800 mb-6 flex items-start">
                    <span className="bg-indigo-50 text-indigo-600 font-bold py-1 px-3 rounded-lg mr-4 text-sm mt-1">Q{index + 1}</span> 
                    {q.question || q.questionText || 'Question text not available'}
                </p>
                
                <div className="space-y-3 pl-14">
                    {q.options.map(opt => (
                    <label key={opt} className="flex items-center group cursor-pointer p-3 rounded-lg border border-transparent hover:bg-indigo-50 hover:border-indigo-100 transition">
                        <div className="relative flex items-center justify-center w-5 h-5 mr-4">
                            <input 
                                type="radio" 
                                name={`q-${index}`} 
                                value={opt}
                                onChange={(e) => setAnswers({...answers, [index]: e.target.value})}
                                className="peer appearance-none w-5 h-5 border-2 border-gray-300 rounded-full checked:border-indigo-600 checked:bg-indigo-600 transition"
                            />
                            <div className="absolute w-2 h-2 bg-white rounded-full opacity-0 peer-checked:opacity-100"></div>
                        </div>
                        <span className="text-gray-600 group-hover:text-indigo-700">{opt}</span>
                    </label>
                    ))}
                </div>
            </div>
            ))}
        </div>

        <div className="mt-12 flex justify-end">
            <button 
                onClick={handleSubmit} 
                className="bg-green-600 text-white text-xl font-bold py-4 px-12 rounded-xl shadow-lg hover:bg-green-700 hover:scale-105 transform transition duration-200"
            >
                Submit Exam
            </button>
        </div>
      </div>
    </div>
  );
};

export default ExamPage;