import { BrowserRouter, Routes, Route } from 'react-router-dom';
import StudentDashboard from './components/StudentDashboard';
import ExamPage from './pages/ExamPage';
import RegisterPage from './components/RegisterPage';
import EnrollFace from './components/EnrollFace';
import CaptureProfile from './components/CaptureProfile';
import ExamVerification from './components/ExamVerification';
import AdminDashboard from './components/AdminDashboard';
// import Login from './pages/Login'; // Ensure you import Login if you have it

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/*<Route path="/" element={<Login />} /> Default route */}
        
        <Route path="/register" element={<RegisterPage />} />
        
        {/* Dashboards */}
        <Route path="/dashboard/:userId" element={<StudentDashboard />} />
        <Route path="/admin" element={<AdminDashboard />} />

        {/* --- FIX: Removed '/user/' to match your navigation --- */}
        <Route path="/exam/:examId/:userId" element={<ExamPage />} />
        
        {/* Onboarding Routes */}
        <Route path="/enroll-face/:userId" element={<EnrollFace />} />
        <Route path="/capture-profile/:userId" element={<CaptureProfile />} />
        <Route path="/verify/:userId" element={<ExamVerification />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;