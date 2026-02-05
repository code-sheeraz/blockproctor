import React, { useState } from 'react';
import FaceEnrollment from '../components/FaceEnrollment'; // The component we made earlier
import { useParams, useNavigate } from 'react-router-dom';

const EnrollmentPage = () => {
  const { userId } = useParams(); // or get from Context/LocalStorage
  const navigate = useNavigate();
  const [isEnrolled, setIsEnrolled] = useState(false);

  const handleEnrollmentComplete = () => {
    setIsEnrolled(true);
    // Automatically redirect to exam dashboard after 2 seconds
    setTimeout(() => {
        navigate('/student/dashboard'); 
    }, 2000);
  };

  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h1>Exam Security Setup</h1>
      <p>We need to scan your face to verify your identity during the exam.</p>
      
      {!isEnrolled ? (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
            <FaceEnrollment 
                userId={userId} 
                onEnrollComplete={handleEnrollmentComplete} 
            />
        </div>
      ) : (
        <div style={{ color: 'green' }}>
            <h2>✅ Enrollment Complete!</h2>
            <p>Redirecting you to the dashboard...</p>
        </div>
      )}
    </div>
  );
};

export default EnrollmentPage;