import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import LoginPage from './pages/LoginPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { getToken } from './utils/api';

// Heavy views are code-split and loaded on demand
const StudentDashboard = lazy(() => import('./components/StudentDashboard'));
const ExamSession = lazy(() => import('./pages/ExamSession'));
const ExamResults = lazy(() => import('./pages/ExamResults'));
const RegisterPage = lazy(() => import('./components/RegisterPage'));
const EnrollFace = lazy(() => import('./components/EnrollFace'));
const CaptureProfile = lazy(() => import('./components/CaptureProfile'));
const ExamVerification = lazy(() => import('./components/ExamVerification'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const InstructorDashboard = lazy(() => import('./components/InstructorDashboard'));

export function ProtectedRoute({ children, allowedRoles }) {
    const token = getToken();
    const role = localStorage.getItem('userRole');
    
    if (!token) return <Navigate to="/login" replace />;
    if (allowedRoles && !allowedRoles.includes(role)) return <Navigate to="/login" replace />;
    return children;
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>}>
      <Routes>
        {/* Default route - Login */}
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<LoginPage />} />
        
        <Route path="/register" element={<RegisterPage />} />
        
        {/* Dashboards */}
        <Route path="/dashboard/:userId" element={
          <ProtectedRoute allowedRoles={['student', 'admin', 'instructor']}>
            <ErrorBoundary><StudentDashboard /></ErrorBoundary>
          </ProtectedRoute>
        } />
        <Route path="/admin" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <ErrorBoundary><AdminDashboard /></ErrorBoundary>
          </ProtectedRoute>
        } />
        <Route path="/instructor/:instructorId" element={
          <ProtectedRoute allowedRoles={['instructor', 'admin']}>
            <ErrorBoundary><InstructorDashboard /></ErrorBoundary>
          </ProtectedRoute>
        } />

        {/* Exam Routes */}
        <Route path="/exam/:examId/:userId" element={
          <ProtectedRoute allowedRoles={['student', 'admin']}>
            <ErrorBoundary><ExamSession /></ErrorBoundary>
          </ProtectedRoute>
        } />
        <Route path="/instructor/:instructorId/exam/:examId/results" element={
          <ProtectedRoute allowedRoles={['instructor', 'admin']}>
            <ExamResults />
          </ProtectedRoute>
        } />
        
        {/* Onboarding Routes */}
        <Route path="/enroll-face/:userId" element={
          <ProtectedRoute allowedRoles={['student', 'admin']}>
            <EnrollFace />
          </ProtectedRoute>
        } />
        <Route path="/capture-profile/:userId" element={
          <ProtectedRoute allowedRoles={['student', 'admin']}>
            <CaptureProfile />
          </ProtectedRoute>
        } />
        <Route path="/verify/:userId" element={
          <ProtectedRoute allowedRoles={['student', 'admin']}>
            <ExamVerification />
          </ProtectedRoute>
        } />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;