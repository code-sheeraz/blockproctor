import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import usePagination from '../hooks/usePagination.js';
import Pagination from '../components/Pagination.jsx';

import { getApiBase } from '../utils/apiBase.js';

const API_BASE = getApiBase();

/**
 * AdminDashboard – Top-level admin panel for BlockProctor.
 *
 * Provides a tabbed interface for managing students, enrollments,
 * proctor sessions, blockchain verification, research data extraction,
 * audit trails, and instructor/department administration.
 */
const AdminDashboard = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [loading, setLoading] = useState(false);
    const [verifying, setVerifying] = useState(null);
    
    // Data states
    const [dashboardStats, setDashboardStats] = useState(null);
    const [pendingEnrollments, setPendingEnrollments] = useState([]);
    const [pendingFaceVerifications, setPendingFaceVerifications] = useState([]);
    const [allStudents, setAllStudents] = useState([]);
    const [studentFilter, setStudentFilter] = useState('all');
    const [studentSearch, setStudentSearch] = useState('');

    // Students list search + pagination
    const filteredStudents = allStudents.filter(s =>
        (s.name || '').toLowerCase().includes(studentSearch.toLowerCase()) ||
        (s.email || '').toLowerCase().includes(studentSearch.toLowerCase()) ||
        (s.student_id || '').toLowerCase().includes(studentSearch.toLowerCase())
    );
    const studentPager = usePagination(filteredStudents, 10);
    const [departments, setDepartments] = useState([]);
    const [batches, setBatches] = useState([]);
    const [instructors, setInstructors] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [researchData, setResearchData] = useState(null);
    const [blockchainData, setBlockchainData] = useState(null);
    
    // Research tab states
    const [researchTab, setResearchTab] = useState('overview');
    const [aiMetrics, setAiMetrics] = useState(null);
    const [systemMetrics, setSystemMetrics] = useState(null);
    const [blockchainMetrics, setBlockchainMetrics] = useState(null);
    
    // Session detail modal
    const [_selectedSession, _setSelectedSession] = useState(null);
    const [sessionDetails, setSessionDetails] = useState(null);
    const [showSessionModal, setShowSessionModal] = useState(false);
    
    // Student logs
    const [studentLogs, setStudentLogs] = useState([]);
    const [studentLogSearch, setStudentLogSearch] = useState('');
    const [_selectedStudentLog, setSelectedStudentLog] = useState(null);
    const [studentLogDetails, setStudentLogDetails] = useState(null);
    const [showStudentLogModal, setShowStudentLogModal] = useState(false);
    
    // Modal states
    const [showAddInstructorModal, setShowAddInstructorModal] = useState(false);
    const [showEditInstructorModal, setShowEditInstructorModal] = useState(false);
    const [editingInstructor, setEditingInstructor] = useState(null);
    const [showAddDepartmentModal, setShowAddDepartmentModal] = useState(false);
    const [showAddBatchModal, setShowAddBatchModal] = useState(false);
    const [showEditStudentModal, setShowEditStudentModal] = useState(false);
    const [editingStudent, setEditingStudent] = useState(null);
    
    // Audit trail states
    const [auditSummary, setAuditSummary] = useState(null);
    const [auditTab, setAuditTab] = useState('summary');
    const [archivedExams, setArchivedExams] = useState([]);
    const [archivedClasses, setArchivedClasses] = useState([]);
    const [_selectedAuditExam, setSelectedAuditExam] = useState(null);
    const [examIntegrityReport, setExamIntegrityReport] = useState(null);
    const [_selectedStudentAudit, setSelectedStudentAudit] = useState(null);
    const [studentAuditReport, setStudentAuditReport] = useState(null);
    
    // Archived record drill-down states
    const [showArchiveModal, setShowArchiveModal] = useState(false);
    const [archiveView, setArchiveView] = useState(null); // { type: 'exam'|'class', record }
    const [archivedAttempts, setArchivedAttempts] = useState([]);
    const [archivedSessions, setArchivedSessions] = useState([]);
    const [archivedHeartbeats, setArchivedHeartbeats] = useState([]);
    const [archivedEnrollments, setArchivedEnrollments] = useState([]);
    const [expandedAttemptLogs, setExpandedAttemptLogs] = useState(null); // attemptId -> logs
    const [loadingArchive, setLoadingArchive] = useState(false);
    
    // Form states
    const [newInstructor, setNewInstructor] = useState({ name: '', email: '', password: '', department_id: '' });
    const [newDepartment, setNewDepartment] = useState({ name: '', code: '' });
    const [newBatch, setNewBatch] = useState({ name: '', year: new Date().getFullYear() });

    // ═══════════════════════════════════════════════════════════════════════════════
    // DATA FETCHING
    // ═══════════════════════════════════════════════════════════════════════════════
    /** Data-fetching helpers – load dashboard stats, students, sessions, etc. */
    
    const fetchDashboardStats = async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/dashboard/stats`);
            const data = await res.json();
            if (data.success) setDashboardStats(data.stats);
        } catch (err) {
            console.error('Failed to fetch stats:', err);
        }
    };

    const fetchPendingEnrollments = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/enrollments/pending`);
            const data = await res.json();
            if (data.success) setPendingEnrollments(data.enrollments);
        } catch (err) {
            console.error('Fetch error:', err);
        }
        setLoading(false);
    };

    const fetchPendingFaceVerifications = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/face-verifications/pending`);
            const data = await res.json();
            if (data.success) setPendingFaceVerifications(data.verifications);
        } catch (err) {
            console.error('Fetch error:', err);
        }
        setLoading(false);
    };

    const fetchDepartments = async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/departments`);
            const data = await res.json();
            if (data.success) setDepartments(data.departments);
        } catch (err) {
            console.error('Failed to fetch departments:', err);
        }
    };

    const fetchBatches = async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/batches`);
            const data = await res.json();
            if (data.success) setBatches(data.batches);
        } catch (err) {
            console.error('Failed to fetch batches:', err);
        }
    };

    const fetchAllStudents = async (status = null) => {
        setLoading(true);
        try {
            const url = status && status !== 'all' 
                ? `${API_BASE}/admin/students?status=${status}`
                : `${API_BASE}/admin/students`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.success) setAllStudents(data.students);
        } catch (err) {
            console.error('Failed to fetch students:', err);
        }
        setLoading(false);
    };

    const fetchInstructors = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/instructors`);
            const data = await res.json();
            if (data.success) setInstructors(data.instructors);
        } catch (err) {
            console.error('Failed to fetch instructors:', err);
        }
        setLoading(false);
    };

    const fetchExams = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/submitted-exams`);
            const data = await res.json();
            if (data.success) setSessions(data.sessions);
        } catch (err) {
            console.error('Fetch error:', err);
        }
        setLoading(false);
    };

    const fetchResearchData = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/research/summary`);
            const data = await res.json();
            if (data.success) setResearchData(data.summary);
        } catch (err) {
            console.error('Fetch error:', err);
        }
        setLoading(false);
    };

    const fetchBlockchainData = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/research/blockchain-metrics`);
            const data = await res.json();
            if (data.success) setBlockchainData(data.blockchain);
        } catch (err) {
            console.error('Fetch error:', err);
        }
        setLoading(false);
    };

    const fetchStudentLogs = async (search = '') => {
        setLoading(true);
        try {
            const url = search 
                ? `${API_BASE}/admin/student-logs?search=${encodeURIComponent(search)}`
                : `${API_BASE}/admin/student-logs`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.success) setStudentLogs(data.students);
        } catch (err) {
            console.error('Fetch error:', err);
        }
        setLoading(false);
    };

    const fetchStudentLogDetails = async (studentId) => {
        try {
            const res = await fetch(`${API_BASE}/admin/student-logs/${studentId}`);
            const data = await res.json();
            if (data.success) {
                setStudentLogDetails(data);
                setShowStudentLogModal(true);
            }
        } catch (err) {
            console.error('Fetch student log details error:', err);
            alert('Failed to load student details');
        }
    };

    const handleAllowRetry = async (studentId, examId) => {
        const notes = prompt('Admin notes for allowing retry (optional):');
        try {
            const res = await fetch(`${API_BASE}/admin/student-logs/${studentId}/exam/${examId}/allow-retry`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminNotes: notes })
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                fetchStudentLogDetails(studentId);
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Failed to allow retry');
        }
    };

    const fetchSessionDetails = async (sessionId) => {
        try {
            const res = await fetch(`${API_BASE}/session/admin/${sessionId}`);
            const data = await res.json();
            if (data.success) {
                setSessionDetails(data);
                setShowSessionModal(true);
            }
        } catch (err) {
            console.error('Fetch session details error:', err);
            alert('Failed to load session details');
        }
    };

    const handleUnlockSession = async (sessionId) => {
        const notes = prompt('Admin notes for unlocking (optional):');
        try {
            const res = await fetch(`${API_BASE}/session/admin/${sessionId}/unlock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminNotes: notes })
            });
            const data = await res.json();
            if (data.success) {
                alert('Session unlocked successfully! If it was terminated/expired, the old attempt was archived and the student can retake the exam.');
                fetchExams();
                if (sessionDetails) fetchSessionDetails(sessionId);
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Failed to unlock session');
        }
    };

    const handleLockSession = async (sessionId) => {
        const reason = prompt('Reason for locking this session:');
        if (!reason) return;
        try {
            const res = await fetch(`${API_BASE}/session/admin/${sessionId}/lock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason })
            });
            const data = await res.json();
            if (data.success) {
                alert('Session locked');
                fetchExams();
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Failed to lock session');
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════════
    // AUDIT TRAIL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════════
    /** Audit-trail helpers – fetch archived exams/classes, integrity reports. */

    const fetchAuditSummary = async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/audit/summary`);
            const data = await res.json();
            if (data.success) setAuditSummary(data.summary);
        } catch (err) {
            console.error('Fetch audit summary error:', err);
        }
    };

    const fetchArchivedExams = async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/audit/exams`);
            const data = await res.json();
            if (data.success) setArchivedExams(data.exams);
        } catch (err) {
            console.error('Fetch archived exams error:', err);
        }
    };

    const fetchArchivedClasses = async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/audit/classes`);
            const data = await res.json();
            if (data.success) setArchivedClasses(data.classes);
        } catch (err) {
            console.error('Fetch archived classes error:', err);
        }
    };

    const fetchExamIntegrityReport = async (examId) => {
        try {
            const res = await fetch(`${API_BASE}/admin/audit/exam-integrity/${examId}`);
            const data = await res.json();
            if (data.success) {
                setExamIntegrityReport(data.report);
                setSelectedAuditExam(examId);
            }
        } catch (err) {
            console.error('Fetch exam integrity error:', err);
            alert('Failed to load integrity report');
        }
    };

    const fetchStudentAuditReport = async (studentId) => {
        try {
            const res = await fetch(`${API_BASE}/admin/audit/identity/${studentId}`);
            const data = await res.json();
            if (data.success) {
                setStudentAuditReport(data);
                setSelectedStudentAudit(studentId);
            }
        } catch (err) {
            console.error('Fetch student audit error:', err);
            alert('Failed to load student audit report');
        }
    };

    const openArchivedExam = async (exam) => {
        setArchiveView({ type: 'exam', record: exam });
        setShowArchiveModal(true);
        setLoadingArchive(true);
        setArchivedAttempts([]);
        setArchivedSessions([]);
        setArchivedHeartbeats([]);
        try {
            const [attRes, sessRes, beatRes] = await Promise.all([
                fetch(`${API_BASE}/admin/audit/exams/${exam.original_id}/attempts`),
                fetch(`${API_BASE}/admin/audit/exams/${exam.original_id}/sessions`),
                fetch(`${API_BASE}/admin/audit/exams/${exam.original_id}/heartbeats`)
            ]);
            const [attData, sessData, beatData] = await Promise.all([attRes.json(), sessRes.json(), beatRes.json()]);
            if (attData.success) setArchivedAttempts(attData.attempts);
            if (sessData.success) setArchivedSessions(sessData.sessions);
            if (beatData.success) setArchivedHeartbeats(beatData.heartbeats);
        } catch (err) {
            console.error('Fetch archived exam details error:', err);
            alert('Failed to load archived exam details');
        }
        setLoadingArchive(false);
    };

    const openArchivedClass = async (cls) => {
        setArchiveView({ type: 'class', record: cls });
        setShowArchiveModal(true);
        setLoadingArchive(true);
        setArchivedEnrollments([]);
        try {
            const res = await fetch(`${API_BASE}/admin/audit/classes/${cls.original_id}/enrollments`);
            const data = await res.json();
            if (data.success) setArchivedEnrollments(data.enrollments);
        } catch (err) {
            console.error('Fetch archived class details error:', err);
            alert('Failed to load archived class details');
        }
        setLoadingArchive(false);
    };

    const toggleAttemptLogs = async (attempt) => {
        if (expandedAttemptLogs?.attemptId === attempt.original_id) {
            setExpandedAttemptLogs(null);
            return;
        }
        try {
            const res = await fetch(`${API_BASE}/admin/audit/attempts/${attempt.original_id}/logs`);
            const data = await res.json();
            setExpandedAttemptLogs({
                attemptId: attempt.original_id,
                logs: data.success ? data.logs : []
            });
        } catch (err) {
            console.error('Fetch archived attempt logs error:', err);
            setExpandedAttemptLogs({ attemptId: attempt.original_id, logs: [] });
        }
    };

    useEffect(() => {
        if (activeTab === 'dashboard') {
            fetchDashboardStats();
            fetchDepartments();
            fetchBatches();
        } else if (activeTab === 'enrollments') fetchPendingEnrollments();
        else if (activeTab === 'face-verify') fetchPendingFaceVerifications();
        else if (activeTab === 'students') fetchAllStudents(studentFilter);
        else if (activeTab === 'instructors') {
            fetchInstructors();
            fetchDepartments();
        }
        else if (activeTab === 'exams') fetchExams();
        else if (activeTab === 'research') fetchResearchData();
        else if (activeTab === 'blockchain') fetchBlockchainData();
        else if (activeTab === 'student-logs') fetchStudentLogs(studentLogSearch);
        else if (activeTab === 'audit') fetchAuditSummary();
    }, [activeTab, studentFilter]);

    // Fetch research sub-tab data
    useEffect(() => {
        const fetchResearchSubTabData = async () => {
            try {
                if (researchTab === 'ai' && !aiMetrics) {
                    const res = await fetch(`${API_BASE}/research/ai-metrics`);
                    const data = await res.json();
                    if (data.success) setAiMetrics(data.aiMetrics);
                } else if (researchTab === 'system' && !systemMetrics) {
                    const res = await fetch(`${API_BASE}/research/system-metrics`);
                    const data = await res.json();
                    if (data.success) setSystemMetrics(data.systemMetrics);
                } else if (researchTab === 'blockchain' && !blockchainMetrics) {
                    const res = await fetch(`${API_BASE}/research/blockchain-metrics`);
                    const data = await res.json();
                    if (data.success) setBlockchainMetrics(data.blockchain);
                }
            } catch (err) {
                console.error('Failed to fetch research sub-tab data:', err);
            }
        };
        
        if (activeTab === 'research') {
            fetchResearchSubTabData();
        }
    }, [activeTab, researchTab, aiMetrics, systemMetrics, blockchainMetrics]);

    // Fetch audit sub-tab data
    useEffect(() => {
        if (activeTab === 'audit') {
            if (auditTab === 'summary' && !auditSummary) {
                fetchAuditSummary();
            } else if (auditTab === 'exams' && archivedExams.length === 0) {
                fetchArchivedExams();
            } else if (auditTab === 'classes' && archivedClasses.length === 0) {
                fetchArchivedClasses();
            }
        }
    }, [activeTab, auditTab]);

    // ═══════════════════════════════════════════════════════════════════════════════
    // ACTIONS
    // ═══════════════════════════════════════════════════════════════════════════════
    /** Action handlers – approve/reject enrollments, manage entities, verify blockchain. */
    
    const handleApproveEnrollment = async (userId) => {
        if (!confirm('Approve this student? They will proceed to face enrollment.')) return;
        try {
            const res = await fetch(`${API_BASE}/admin/enrollments/${userId}/approve`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                alert('Student approved! They can now enroll their face.');
                fetchPendingEnrollments();
                fetchDashboardStats();
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Action failed');
        }
    };

    const handleRejectEnrollment = async (userId) => {
        if (!confirm('Reject this student enrollment?')) return;
        try {
            const res = await fetch(`${API_BASE}/admin/enrollments/${userId}/reject`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                alert('Enrollment rejected');
                fetchPendingEnrollments();
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Action failed');
        }
    };

    const handleApproveFacePhoto = async (userId) => {
        if (!confirm('Verify this face photo? Ensure it matches the student identity documents.')) return;
        try {
            const res = await fetch(`${API_BASE}/admin/face-verifications/${userId}/approve`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                alert('Face photo verified! Student can now be assigned to a class by instructor.');
                fetchPendingFaceVerifications();
                fetchDashboardStats();
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Action failed');
        }
    };

    const handleRejectFacePhoto = async (userId) => {
        const reason = prompt('Reason for rejection (e.g., "Photo is blurry", "Face not clearly visible"):');
        if (!reason) return;
        try {
            const res = await fetch(`${API_BASE}/admin/face-verifications/${userId}/reject`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason })
            });
            const data = await res.json();
            if (data.success) {
                alert('Face photo rejected. Student will need to retake their photo.');
                fetchPendingFaceVerifications();
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Action failed');
        }
    };

    // Student management handlers
    const handleEditStudent = (student) => {
        setEditingStudent({
            id: student.id,
            name: student.name,
            email: student.email,
            student_id: student.student_id || '',
            department_id: student.department_id || '',
            batch_id: student.batch_id || '',
            enrollment_status: student.enrollment_status
        });
        setShowEditStudentModal(true);
    };

    const handleUpdateStudent = async () => {
        if (!editingStudent) return;
        try {
            const res = await fetch(`${API_BASE}/admin/students/${editingStudent.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editingStudent)
            });
            const data = await res.json();
            if (data.success) {
                alert('Student updated successfully!');
                setShowEditStudentModal(false);
                setEditingStudent(null);
                fetchAllStudents(studentFilter);
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Failed to update student');
        }
    };

    const handleDeleteStudent = async (studentId, studentName) => {
        if (!confirm(`⚠️ DELETE STUDENT?\n\nThis will permanently delete "${studentName}" and archive all their:\n- Class enrollments\n- Exam attempts (with blockchain hashes)\n- Proctor logs\n- Exam sessions\n\nArchived records remain viewable in Audit & Verification.\n\nThis action cannot be undone!`)) return;
        
        try {
            const res = await fetch(`${API_BASE}/admin/students/${studentId}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                fetchAllStudents(studentFilter);
                fetchDashboardStats();
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Failed to delete student');
        }
    };

    const handleResetFace = async (studentId, studentName) => {
        if (!confirm(`Reset face enrollment for "${studentName}"?\n\nThis will:\n- Clear their face photo\n- Set status to "pending_face"\n- Require them to upload a new photo`)) return;
        
        try {
            const res = await fetch(`${API_BASE}/admin/students/${studentId}/reset-face`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                fetchAllStudents(studentFilter);
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Failed to reset face');
        }
    };

    const handleAddInstructor = async () => {
        if (!newInstructor.name || !newInstructor.email || !newInstructor.password || !newInstructor.department_id) {
            return alert('Please fill all fields');
        }
        try {
            const res = await fetch(`${API_BASE}/admin/instructors`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newInstructor)
            });
            const data = await res.json();
            if (data.success) {
                alert('Instructor added successfully!');
                setShowAddInstructorModal(false);
                setNewInstructor({ name: '', email: '', password: '', department_id: '' });
                fetchInstructors();
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Failed to add instructor');
        }
    };

    const handleAddDepartment = async () => {
        if (!newDepartment.name || !newDepartment.code) {
            return alert('Please fill all fields');
        }
        try {
            const res = await fetch(`${API_BASE}/admin/departments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newDepartment)
            });
            const data = await res.json();
            if (data.success) {
                alert('Department added!');
                setShowAddDepartmentModal(false);
                setNewDepartment({ name: '', code: '' });
                fetchDepartments();
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Failed to add department');
        }
    };

    const handleAddBatch = async () => {
        if (!newBatch.name || !newBatch.year) {
            return alert('Please fill all fields');
        }
        try {
            const res = await fetch(`${API_BASE}/admin/batches`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newBatch)
            });
            const data = await res.json();
            if (data.success) {
                alert('Batch added!');
                setShowAddBatchModal(false);
                setNewBatch({ name: '', year: new Date().getFullYear() });
                fetchBatches();
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Failed to add batch');
        }
    };

    // Delete handlers for departments, batches, instructors
    const handleDeleteDepartment = async (id, name) => {
        if (!confirm(`Delete department "${name}"?\n\nNote: Cannot delete if students or instructors are assigned.`)) return;
        try {
            const res = await fetch(`${API_BASE}/admin/departments/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                fetchDepartments();
                fetchDashboardStats();
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Failed to delete department');
        }
    };

    const handleDeleteBatch = async (id, name) => {
        if (!confirm(`Delete batch "${name}"?\n\nNote: Cannot delete if students are assigned.`)) return;
        try {
            const res = await fetch(`${API_BASE}/admin/batches/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                fetchBatches();
                fetchDashboardStats();
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Failed to delete batch');
        }
    };

    const handleDeleteInstructor = async (id, name) => {
        if (!confirm(`Delete instructor "${name}"?\n\nNote: Cannot delete if classes are assigned.`)) return;
        try {
            const res = await fetch(`${API_BASE}/admin/instructors/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                fetchInstructors();
                fetchDashboardStats();
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Failed to delete instructor');
        }
    };

    const handleEditInstructor = (instructor) => {
        setEditingInstructor({
            id: instructor.id,
            name: instructor.name,
            email: instructor.email,
            department_id: instructor.department_id || '',
            newPassword: '' // Optional password change
        });
        setShowEditInstructorModal(true);
    };

    const handleUpdateInstructor = async () => {
        if (!editingInstructor.name || !editingInstructor.email) {
            return alert('Name and email are required');
        }
        try {
            const res = await fetch(`${API_BASE}/admin/instructors/${editingInstructor.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: editingInstructor.name,
                    email: editingInstructor.email,
                    department_id: editingInstructor.department_id || null,
                    password: editingInstructor.newPassword || undefined
                })
            });
            const data = await res.json();
            if (data.success) {
                alert('Instructor updated successfully');
                setShowEditInstructorModal(false);
                setEditingInstructor(null);
                fetchInstructors();
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Failed to update instructor');
        }
    };

    const handleToggleInstructorActive = async (id) => {
        try {
            const res = await fetch(`${API_BASE}/admin/instructors/${id}/toggle-active`, { method: 'PUT' });
            const data = await res.json();
            if (data.success) {
                fetchInstructors();
            }
        } catch {
            alert('Failed to update instructor status');
        }
    };

    const handleDeleteAttempt = async (attemptId, studentName, examTitle) => {
        if (!confirm(`⚠️ DELETE ATTEMPT?\n\nDelete "${studentName}"'s attempt at "${examTitle}"?\n\nThis will permanently delete:\n- Exam answers\n- Score record\n- Proctor logs\n- Blockchain hash will be invalidated\n\nThis action cannot be undone!`)) return;
        try {
            const res = await fetch(`${API_BASE}/admin/attempts/${attemptId}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                fetchExams();
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Failed to delete attempt');
        }
    };

    const handleBatchRecordBlockchain = async () => {
        if (!confirm('🔗 Backfill Legacy Records\n\nThis will record all unrecorded exam attempts to the blockchain.\n\nMake sure the blockchain network is running.\n\nContinue?')) return;
        
        try {
            const res = await fetch(`${API_BASE}/blockchain/batch-record-attempts`, { method: 'POST' });
            const data = await res.json();
            
            if (data.success) {
                const message = data.total === 0 
                    ? '✅ All attempts are already recorded on blockchain!'
                    : `✅ Batch Recording Complete!\n\n${data.message}\n\nRecorded: ${data.recorded}\nFailed: ${data.failed}\nSkipped: ${data.skipped}`;
                alert(message);
                
                // Log details to console for debugging
                if (data.details?.length > 0) {
                    console.log('Batch recording details:', data.details);
                }
                
                // Refresh blockchain metrics
                setBlockchainMetrics(null);
                const refreshRes = await fetch(`${API_BASE}/research/blockchain-metrics`);
                const refreshData = await refreshRes.json();
                if (refreshData.success) setBlockchainMetrics(refreshData.blockchain);
            } else {
                alert('Error: ' + (data.error || 'Failed to batch record'));
            }
        } catch (err) {
            alert('Batch recording failed - ensure blockchain is running\n\nError: ' + err.message);
            console.error('Batch record error:', err);
        }
    };

    const verifyIntegrity = async (attemptId) => {
        setVerifying(attemptId);
        try {
            const res = await fetch(`${API_BASE}/research/verify-integrity`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attemptId })
            });
            const data = await res.json();
            if (data.success) {
                const state = data.verification.state || data.verification.integrityStatus;
                const messages = {
                    VERIFIED: '✅ VERIFIED — data matches its on-chain anchor.',
                    STALE_ANCHOR: '⚠️ STALE ANCHOR — data was re-finalized after anchoring (e.g. idempotent lock save). Re-anchor on a fresh chain to refresh.',
                    TAMPERED: '❌ TAMPERED — on-chain record does not match the stored anchor hash!',
                    NOT_RECORDED: '➖ NOT RECORDED — this attempt has no on-chain anchor.'
                };
                const detail = state === 'VERIFIED' || state === 'VALID'
                    ? messages.VERIFIED
                    : messages[state] || `Integrity Check: ${state}`;
                alert(`Integrity Check [${state}]\n\n${detail}\n\nData Hash: ${data.verification.currentDataHash.substring(0, 20)}...`);
            }
        } catch {
            alert('Verification failed');
        }
        setVerifying(null);
    };

    const exportData = async (type, format = 'json') => {
        try {
            const res = await fetch(`${API_BASE}/research/export/${type}?format=${format}`);
            
            if (format === 'csv') {
                const text = await res.text();
                const blob = new Blob([text], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `blockproctor_${type}_${new Date().toISOString().split('T')[0]}.csv`;
                a.click();
                URL.revokeObjectURL(url);
            } else {
                const data = await res.json();
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `blockproctor_${type}_${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (err) {
            console.error('Export error:', err);
            alert('Export failed: ' + err.message);
        }
    };
    
    // State for export dropdown
    const [exportDropdown, setExportDropdown] = useState(null);

    const handleLogout = () => {
        localStorage.clear();
        navigate('/login');
    };

    // ═══════════════════════════════════════════════════════════════════════════════
    // RENDER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════════
    /** Render helpers – each returns JSX for a specific admin tab. */

    /** Renders the dashboard overview – summary stat cards and quick-action links. */
    const renderDashboard = () => (
        <div className="space-y-6">
            {/* Stats Cards */}
            {dashboardStats && (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    <div className="bg-white rounded-xl shadow-sm border p-4">
                        <div className="text-2xl font-bold text-blue-600">{dashboardStats.total_students}</div>
                        <div className="text-gray-500 text-xs mt-1">Total Students</div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border p-4">
                        <div className="text-2xl font-bold text-orange-600">{dashboardStats.pending_students}</div>
                        <div className="text-gray-500 text-xs mt-1">Pending Approvals</div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border p-4">
                        <div className="text-2xl font-bold text-green-600">{dashboardStats.total_instructors}</div>
                        <div className="text-gray-500 text-xs mt-1">Instructors</div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border p-4">
                        <div className="text-2xl font-bold text-purple-600">{dashboardStats.total_classes}</div>
                        <div className="text-gray-500 text-xs mt-1">Classes</div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border p-4">
                        <div className="text-2xl font-bold text-indigo-600">{dashboardStats.total_exams}</div>
                        <div className="text-gray-500 text-xs mt-1">Total Exams</div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border p-4">
                        <div className="text-2xl font-bold text-red-600">{dashboardStats.total_attempts}</div>
                        <div className="text-gray-500 text-xs mt-1">Exam Attempts</div>
                    </div>
                </div>
            )}

            {/* Departments & Batches */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Departments */}
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-semibold text-gray-800">Departments</h3>
                        <button 
                            onClick={() => setShowAddDepartmentModal(true)}
                            className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded text-sm hover:bg-indigo-200"
                        >
                            + Add
                        </button>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                        {departments.map(dept => (
                            <div key={dept.id} className="flex justify-between items-center p-2 bg-gray-50 rounded group">
                                <div>
                                    <span className="font-medium">{dept.name}</span>
                                    <span className="text-sm text-gray-500 ml-2">({dept.code})</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400">{dept.student_count || 0} students</span>
                                    <button 
                                        onClick={() => handleDeleteDepartment(dept.id, dept.name)}
                                        className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition"
                                        title="Delete Department"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Batches */}
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-semibold text-gray-800">Batches / Years</h3>
                        <button 
                            onClick={() => setShowAddBatchModal(true)}
                            className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded text-sm hover:bg-indigo-200"
                        >
                            + Add
                        </button>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                        {batches.map(batch => (
                            <div key={batch.id} className="flex justify-between items-center p-2 bg-gray-50 rounded group">
                                <div>
                                    <span className="font-medium">{batch.name}</span>
                                    <span className="text-sm text-gray-500 ml-2">({batch.year})</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400">{batch.student_count || 0} students</span>
                                    <button 
                                        onClick={() => handleDeleteBatch(batch.id, batch.name)}
                                        className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition"
                                        title="Delete Batch"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
                <h3 className="font-semibold text-gray-800 mb-4">Quick Actions</h3>
                <div className="flex gap-4 flex-wrap">
                    <button 
                        onClick={() => setActiveTab('enrollments')}
                        className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
                    >
                        Review Pending Enrollments ({dashboardStats?.pending_students || 0})
                    </button>
                    <button 
                        onClick={() => setActiveTab('instructors')}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                        Manage Instructors
                    </button>
                    <button 
                        onClick={() => exportData('attempts')}
                        className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                    >
                        📊 Export All Data
                    </button>
                </div>
            </div>
        </div>
    );

    /** Renders the pending-enrollments table – approve or reject student registrations. */
    const renderEnrollments = () => (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="p-4 border-b bg-gray-50">
                <h3 className="font-semibold">Pending Student Enrollments</h3>
                <p className="text-sm text-gray-500">Approve students to allow face enrollment</p>
            </div>
            <table className="w-full">
                <thead className="bg-gray-50 border-b">
                    <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        <th className="p-4">Student</th>
                        <th className="p-4">Student ID</th>
                        <th className="p-4">Department</th>
                        <th className="p-4">Batch</th>
                        <th className="p-4">Registered</th>
                        <th className="p-4">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {pendingEnrollments.length === 0 ? (
                        <tr><td colSpan="6" className="p-8 text-center text-gray-400">No pending enrollments</td></tr>
                    ) : pendingEnrollments.map(user => (
                        <tr key={user.id} className="hover:bg-gray-50">
                            <td className="p-4">
                                <div className="font-medium text-gray-900">{user.name}</div>
                                <div className="text-xs text-gray-500">{user.email}</div>
                            </td>
                            <td className="p-4 text-gray-600">{user.student_id || '-'}</td>
                            <td className="p-4 text-gray-600">{user.department_name || '-'}</td>
                            <td className="p-4 text-gray-600">{user.batch_name || '-'}</td>
                            <td className="p-4 text-sm text-gray-500">
                                {new Date(user.created_at).toLocaleDateString()}
                            </td>
                            <td className="p-4 space-x-2">
                                <button 
                                    onClick={() => handleApproveEnrollment(user.id)} 
                                    className="px-3 py-1.5 bg-green-500 text-white rounded text-sm font-medium hover:bg-green-600"
                                >
                                    ✓ Approve
                                </button>
                                <button 
                                    onClick={() => handleRejectEnrollment(user.id)} 
                                    className="px-3 py-1.5 bg-red-500 text-white rounded text-sm font-medium hover:bg-red-600"
                                >
                                    ✗ Reject
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    /** Renders the pending face-verification queue – approve or deny biometric enrollments. */
    const renderFaceVerifications = () => (
        <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="p-4 border-b bg-gradient-to-r from-purple-50 to-indigo-50">
                    <h3 className="font-semibold text-gray-800">🔐 Face Photo Verification</h3>
                    <p className="text-sm text-gray-500">Verify student identity photos before allowing class enrollment</p>
                </div>
                
                {pendingFaceVerifications.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">
                        <div className="text-4xl mb-2">✅</div>
                        <p>No face photos pending verification</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                        {pendingFaceVerifications.map(student => (
                            <div key={student.id} className="border rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md transition">
                                {/* Face Photo - Large for verification */}
                                <div className="aspect-square bg-gray-900 relative">
                                    {student.face_verification_photo ? (
                                        <img 
                                            src={student.face_verification_photo}
                                            alt="Face Verification"
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-500">
                                            No Photo
                                        </div>
                                    )}
                                    <div className="absolute top-2 right-2 bg-purple-600 text-white text-xs px-2 py-1 rounded">
                                        ID Verification
                                    </div>
                                </div>
                                
                                {/* Student Info */}
                                <div className="p-4">
                                    <h4 className="font-bold text-gray-900">{student.name}</h4>
                                    <p className="text-sm text-gray-500">{student.email}</p>
                                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                        <span className="bg-gray-100 px-2 py-1 rounded">{student.student_id}</span>
                                        <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">{student.department_name}</span>
                                        <span className="bg-green-100 text-green-700 px-2 py-1 rounded">{student.batch_name}</span>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-2">
                                        Uploaded: {new Date(student.updated_at).toLocaleString()}
                                    </p>
                                </div>
                                
                                {/* Action Buttons */}
                                <div className="p-4 pt-0 flex gap-2">
                                    <button
                                        onClick={() => handleApproveFacePhoto(student.id)}
                                        className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition"
                                    >
                                        ✓ Verify
                                    </button>
                                    <button
                                        onClick={() => handleRejectFacePhoto(student.id)}
                                        className="flex-1 px-4 py-2 bg-red-100 text-red-700 rounded-lg font-medium hover:bg-red-200 transition"
                                    >
                                        ✗ Reject
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                <strong>⚠️ Verification Guidelines:</strong>
                <ul className="list-disc ml-5 mt-1">
                    <li>Ensure the face photo clearly shows the student's face</li>
                    <li>Compare with student ID documents if available</li>
                    <li>Reject if photo is blurry, obscured, or doesn't match records</li>
                    <li>This photo will be used for automated identity verification during exams</li>
                </ul>
            </div>
        </div>
    );

    const getStatusBadge = (status, hasFace) => {
        const statusConfig = {
            'pending_admin': { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Pending Approval' },
            'pending_face': { bg: 'bg-orange-100', text: 'text-orange-700', label: hasFace ? '📸 Photo Pending Verify' : 'Awaiting Face Upload' },
            'pending_instructor': { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Awaiting Class' },
            'enrolled': { bg: 'bg-green-100', text: 'text-green-700', label: 'Enrolled ✓' },
            'rejected': { bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
            'PENDING': { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Pending' },
            'APPROVED': { bg: 'bg-green-100', text: 'text-green-700', label: 'Approved' },
            'REJECTED': { bg: 'bg-red-100', text: 'text-red-700', label: 'Rejected' },
        };
        const config = statusConfig[status] || { bg: 'bg-gray-100', text: 'text-gray-700', label: status };
        return (
            <span className={`px-2 py-1 text-xs rounded font-medium ${config.bg} ${config.text}`}>
                {config.label}
            </span>
        );
    };

    /** Renders the students list – search, filter, edit, and manage all registered students. */
    const renderStudents = () => (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-gray-800">All Students</h2>
                    <p className="text-sm text-gray-500">🔒 Face photos are for identity verification only</p>
                </div>
                <div className="flex items-center gap-4">
                    <input
                        type="text"
                        value={studentSearch}
                        onChange={(e) => { setStudentSearch(e.target.value); studentPager.setPage(1); }}
                        placeholder="🔍 Search name, email or ID..."
                        className="px-3 py-2 border rounded-lg text-sm w-64"
                    />
                    <select
                        value={studentFilter}
                        onChange={(e) => setStudentFilter(e.target.value)}
                        className="px-3 py-2 border rounded-lg text-sm"
                    >
                        <option value="all">All Status</option>
                        <option value="pending_admin">Pending Approval</option>
                        <option value="pending_face">Awaiting Face Enrollment</option>
                        <option value="pending_instructor">Awaiting Class Assignment</option>
                        <option value="enrolled">Enrolled</option>
                        <option value="rejected">Rejected</option>
                    </select>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                        <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            <th className="p-4">🔒 ID Photo</th>
                            <th className="p-4">Student</th>
                            <th className="p-4">Student ID</th>
                            <th className="p-4">Department</th>
                            <th className="p-4">Batch</th>
                            <th className="p-4">Status</th>
                            <th className="p-4">Face Data</th>
                            <th className="p-4">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {filteredStudents.length === 0 ? (
                            <tr><td colSpan="8" className="p-8 text-center text-gray-400">No students found</td></tr>
                        ) : studentPager.pageItems.map(student => (
                            <tr key={student.id} className="hover:bg-gray-50">
                                <td className="p-4">
                                    {student.face_verification_photo ? (
                                        <div className="relative">
                                            <img 
                                                src={student.face_verification_photo} 
                                                alt="ID Verification"
                                                className="w-14 h-14 rounded-lg object-cover border-2 border-indigo-200 shadow"
                                                title="Identity Verification Photo - Private"
                                            />
                                            <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[8px] px-1 rounded">ID</span>
                                        </div>
                                    ) : (
                                        <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-sm border-2 border-dashed border-gray-300">
                                            No Photo
                                        </div>
                                    )}
                                </td>
                                <td className="p-4">
                                    <div className="font-medium text-gray-900">{student.name}</div>
                                    <div className="text-xs text-gray-500">{student.email}</div>
                                </td>
                                <td className="p-4 text-gray-600">{student.student_id || '-'}</td>
                                <td className="p-4 text-gray-600">{student.department_name || '-'}</td>
                                <td className="p-4 text-gray-600">{student.batch_name || '-'}</td>
                                <td className="p-4">
                                    {getStatusBadge(student.enrollment_status, student.has_face_enrolled)}
                                </td>
                                <td className="p-4">
                                    {student.has_face_enrolled ? (
                                        <span className="text-green-600 font-medium text-sm">✓ Captured</span>
                                    ) : (
                                        <span className="text-gray-400 text-sm">Pending</span>
                                    )}
                                </td>
                                <td className="p-4">
                                    <div className="flex gap-1">
                                        <button
                                            onClick={() => handleEditStudent(student)}
                                            className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                            title="Edit student"
                                        >
                                            ✏️ Edit
                                        </button>
                                        {student.has_face_enrolled && (
                                            <button
                                                onClick={() => handleResetFace(student.id, student.name)}
                                                className="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
                                                title="Reset face enrollment"
                                            >
                                                🔄 Reset Face
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDeleteStudent(student.id, student.name)}
                                            className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                                            title="Delete student"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredStudents.length > 0 && (
                    <Pagination page={studentPager.page} totalPages={studentPager.totalPages} onPageChange={studentPager.setPage} />
                )}
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
                <strong>🔒 Privacy Notice:</strong> Face verification photos are used exclusively for:
                <ul className="list-disc ml-5 mt-1">
                    <li>Admin identity verification during enrollment approval</li>
                    <li>Automated face matching during proctored exams</li>
                </ul>
                These photos are never displayed publicly or used as profile pictures.
            </div>
        </div>
    );

    /** Renders the instructors list – add, edit, or remove instructor accounts. */
    const renderInstructors = () => (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-800">Instructors</h2>
                <button 
                    onClick={() => setShowAddInstructorModal(true)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                    + Add Instructor
                </button>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                        <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            <th className="p-4">Name</th>
                            <th className="p-4">Email</th>
                            <th className="p-4">Department</th>
                            <th className="p-4">Classes</th>
                            <th className="p-4">Status</th>
                            <th className="p-4">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {instructors.length === 0 ? (
                            <tr><td colSpan="6" className="p-8 text-center text-gray-400">No instructors yet</td></tr>
                        ) : instructors.map(inst => (
                            <tr key={inst.id} className="hover:bg-gray-50">
                                <td className="p-4 font-medium text-gray-900">{inst.name}</td>
                                <td className="p-4 text-gray-600">{inst.email}</td>
                                <td className="p-4 text-gray-600">{inst.department_name}</td>
                                <td className="p-4 text-gray-600">{inst.class_count || 0}</td>
                                <td className="p-4">
                                    <button 
                                        onClick={() => handleToggleInstructorActive(inst.id)}
                                        className={`px-2 py-1 text-xs rounded cursor-pointer ${inst.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                                    >
                                        {inst.is_active ? 'Active' : 'Inactive'}
                                    </button>
                                </td>
                                <td className="p-4">
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => handleEditInstructor(inst)}
                                            className="text-indigo-500 hover:text-indigo-700 text-sm"
                                            title="Edit Instructor"
                                        >
                                            ✏️ Edit
                                        </button>
                                        <button 
                                            onClick={() => handleDeleteInstructor(inst.id, inst.name)}
                                            className="text-red-500 hover:text-red-700 text-sm"
                                            title="Delete Instructor"
                                        >
                                            🗑️ Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    /** Renders the exams list – view and manage all created exams. */
    const renderExams = () => (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                <div>
                    <h3 className="font-semibold">All Exam Attempts</h3>
                    <p className="text-sm text-gray-500">View and manage student exam submissions</p>
                </div>
                <div className="flex gap-2">
                    <div className="relative">
                        <button 
                            onClick={() => setExportDropdown(exportDropdown === 'violations' ? null : 'violations')}
                            className="px-3 py-1.5 bg-red-100 text-red-700 rounded text-sm font-medium hover:bg-red-200"
                        >
                            📊 Export Violations ▾
                        </button>
                        {exportDropdown === 'violations' && (
                            <div className="absolute right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 min-w-[140px]">
                                <button onClick={() => { exportData('violations', 'json'); setExportDropdown(null); }} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100">📄 JSON</button>
                                <button onClick={() => { exportData('violations', 'csv'); setExportDropdown(null); }} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100">📊 CSV (Excel)</button>
                            </div>
                        )}
                    </div>
                    <div className="relative">
                        <button 
                            onClick={() => setExportDropdown(exportDropdown === 'attempts' ? null : 'attempts')}
                            className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded text-sm font-medium hover:bg-blue-200"
                        >
                            📋 Export Attempts ▾
                        </button>
                        {exportDropdown === 'attempts' && (
                            <div className="absolute right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 min-w-[140px]">
                                <button onClick={() => { exportData('attempts', 'json'); setExportDropdown(null); }} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100">📄 JSON</button>
                                <button onClick={() => { exportData('attempts', 'csv'); setExportDropdown(null); }} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100">📊 CSV (Excel)</button>
                            </div>
                        )}
                    </div>
                    <div className="relative">
                        <button 
                            onClick={() => setExportDropdown(exportDropdown === 'sessions' ? null : 'sessions')}
                            className="px-3 py-1.5 bg-green-100 text-green-700 rounded text-sm font-medium hover:bg-green-200"
                        >
                            📁 Export Sessions ▾
                        </button>
                        {exportDropdown === 'sessions' && (
                            <div className="absolute right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 min-w-[140px]">
                                <button onClick={() => { exportData('sessions', 'json'); setExportDropdown(null); }} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100">📄 JSON</button>
                                <button onClick={() => { exportData('sessions', 'csv'); setExportDropdown(null); }} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100">📊 CSV (Excel)</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <table className="w-full">
                <thead className="bg-gray-50 border-b">
                    <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        <th className="p-4">Student</th>
                        <th className="p-4">Exam</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Score</th>
                        <th className="p-4">Violations</th>
                        <th className="p-4">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {sessions.length === 0 ? (
                        <tr><td colSpan="6" className="p-8 text-center text-gray-400">No exam sessions</td></tr>
                    ) : sessions.map(session => (
                        <tr key={session.session_id} className={`hover:bg-gray-50 ${session.is_locked ? 'bg-red-50' : ''}`}>
                            <td className="p-4">
                                <div className="font-medium text-gray-900">{session.full_name}</div>
                                <div className="text-xs text-gray-500">{session.email}</div>
                                <div className="text-xs text-blue-600 font-mono">ID: {session.student_id} | Roll: {session.student_id_number || 'N/A'}</div>
                            </td>
                            <td className="p-4">
                                <div className="text-gray-700">{session.exam_title}</div>
                                <div className="text-xs text-gray-400">{session.class_name}</div>
                                <div className="text-xs text-purple-600 font-mono">Exam ID: {session.exam_id}</div>
                            </td>
                            <td className="p-4">
                                {session.is_locked ? (
                                    <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">🔒 Locked</span>
                                ) : session.status === 'COMPLETED' ? (
                                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">✅ Completed</span>
                                ) : (
                                    <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">🟡 In Progress</span>
                                )}
                            </td>
                            <td className="p-4">
                                <span className={`px-2.5 py-1 rounded-full text-sm font-bold ${
                                    session.score >= 70 ? 'bg-green-100 text-green-700' : 
                                    session.score >= 50 ? 'bg-yellow-100 text-yellow-700' : 
                                    session.score != null ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                                }`}>
                                    {session.score ?? '-'}%
                                </span>
                            </td>
                            <td className="p-4">
                                <div className="flex items-center gap-2">
                                    {session.warning_count > 0 && (
                                        <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs">
                                            ⚠️ {session.warning_count}
                                        </span>
                                    )}
                                    {session.violation_count > 0 && (
                                        <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">
                                            🚨 {session.violation_count}
                                        </span>
                                    )}
                                    {session.violation_log_count > 0 && (
                                        <span className="text-xs text-gray-400">({session.violation_log_count} logs)</span>
                                    )}
                                    {!session.warning_count && !session.violation_count && (
                                        <span className="text-xs text-green-600">✓ Clean</span>
                                    )}
                                </div>
                            </td>
                            <td className="p-4">
                                <div className="flex gap-2 flex-wrap">
                                    <button 
                                        onClick={() => fetchSessionDetails(session.session_id)}
                                        className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs hover:bg-purple-200"
                                    >
                                        📋 View Logs
                                    </button>
                                    {session.attempt_id && (
                                        <button 
                                            onClick={() => verifyIntegrity(session.attempt_id)}
                                            disabled={verifying === session.attempt_id}
                                            className={`px-2 py-1 rounded text-xs ${
                                                verifying === session.attempt_id 
                                                    ? 'bg-gray-100 text-gray-400' 
                                                    : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                            }`}
                                        >
                                            {verifying === session.attempt_id ? '⏳...' : '🔗 Verify'}
                                        </button>
                                    )}
                                    {session.is_locked ? (
                                        <button
                                            onClick={() => handleUnlockSession(session.session_id)}
                                            title="Clears the lock; terminated/expired sessions are fully reset for a fresh retake"
                                            className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200"
                                        >
                                            🔓 Unlock / Allow Retry
                                        </button>
                                    ) : session.status !== 'COMPLETED' && (
                                        <button 
                                            onClick={() => handleLockSession(session.session_id)}
                                            className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200"
                                        >
                                            🔒 Lock
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => handleDeleteAttempt(session.attempt_id || session.session_id, session.full_name, session.exam_title)} 
                                        className="px-2 py-1 text-red-500 hover:text-red-700 text-xs"
                                    >
                                    🗑️
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    /** Renders the research data tab – overview, AI metrics, system metrics, and blockchain analytics. */
    const renderResearch = () => {
        // Fetch additional metrics on tab change
        const fetchMetricsData = async (tab) => {
            try {
                if (tab === 'ai' && !aiMetrics) {
                    const res = await fetch(`${API_BASE}/research/ai-metrics`);
                    const data = await res.json();
                    if (data.success) setAiMetrics(data.aiMetrics);
                } else if (tab === 'system' && !systemMetrics) {
                    const res = await fetch(`${API_BASE}/research/system-metrics`);
                    const data = await res.json();
                    if (data.success) setSystemMetrics(data.systemMetrics);
                } else if (tab === 'blockchain') {
                    // Always fetch fresh blockchain metrics
                    const res = await fetch(`${API_BASE}/research/blockchain-metrics`);
                    const data = await res.json();
                    if (data.success) setBlockchainMetrics(data.blockchain);
                }
            } catch (err) {
                console.error('Failed to fetch metrics:', err);
            }
        };

        return researchData && (
            <div className="space-y-6">
                <div className="flex justify-between items-center flex-wrap gap-4">
                    <h2 className="text-xl font-bold text-gray-800">📊 Research Metrics Dashboard</h2>
                    <div className="flex gap-2 flex-wrap">
                        {/* Export Violations */}
                        <div className="relative">
                            <button
                                onClick={() => setExportDropdown(exportDropdown === 'r-violations' ? null : 'r-violations')}
                                className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm font-medium"
                            >
                                📊 Violations ▾
                            </button>
                            {exportDropdown === 'r-violations' && (
                                <div className="absolute right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 min-w-[140px]">
                                    <button onClick={() => { exportData('violations', 'json'); setExportDropdown(null); }} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100">📄 JSON</button>
                                    <button onClick={() => { exportData('violations', 'csv'); setExportDropdown(null); }} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100">📊 CSV</button>
                                </div>
                            )}
                        </div>
                        {/* Export Attempts */}
                        <div className="relative">
                            <button
                                onClick={() => setExportDropdown(exportDropdown === 'r-attempts' ? null : 'r-attempts')}
                                className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm font-medium"
                            >
                                📋 Attempts ▾
                            </button>
                            {exportDropdown === 'r-attempts' && (
                                <div className="absolute right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 min-w-[140px]">
                                    <button onClick={() => { exportData('attempts', 'json'); setExportDropdown(null); }} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100">📄 JSON</button>
                                    <button onClick={() => { exportData('attempts', 'csv'); setExportDropdown(null); }} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100">📊 CSV</button>
                                </div>
                            )}
                        </div>
                        {/* Export Sessions */}
                        <div className="relative">
                            <button
                                onClick={() => setExportDropdown(exportDropdown === 'r-sessions' ? null : 'r-sessions')}
                                className="px-3 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 text-sm font-medium"
                            >
                                📁 Sessions ▾
                            </button>
                            {exportDropdown === 'r-sessions' && (
                                <div className="absolute right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 min-w-[140px]">
                                    <button onClick={() => { exportData('sessions', 'json'); setExportDropdown(null); }} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100">📄 JSON</button>
                                    <button onClick={() => { exportData('sessions', 'csv'); setExportDropdown(null); }} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100">📊 CSV</button>
                                </div>
                            )}
                        </div>
                        {/* Export Students */}
                        <div className="relative">
                            <button
                                onClick={() => setExportDropdown(exportDropdown === 'r-students' ? null : 'r-students')}
                                className="px-3 py-2 bg-cyan-100 text-cyan-700 rounded-lg hover:bg-cyan-200 text-sm font-medium"
                            >
                                👥 Students ▾
                            </button>
                            {exportDropdown === 'r-students' && (
                                <div className="absolute right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 min-w-[140px]">
                                    <button onClick={() => { exportData('students', 'json'); setExportDropdown(null); }} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100">📄 JSON</button>
                                    <button onClick={() => { exportData('students', 'csv'); setExportDropdown(null); }} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100">📊 CSV</button>
                                </div>
                            )}
                        </div>
                        {/* Export Exams */}
                        <div className="relative">
                            <button
                                onClick={() => setExportDropdown(exportDropdown === 'r-exams' ? null : 'r-exams')}
                                className="px-3 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 text-sm font-medium"
                            >
                                📝 Exams ▾
                            </button>
                            {exportDropdown === 'r-exams' && (
                                <div className="absolute right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 min-w-[140px]">
                                    <button onClick={() => { exportData('exams', 'json'); setExportDropdown(null); }} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100">📄 JSON</button>
                                    <button onClick={() => { exportData('exams', 'csv'); setExportDropdown(null); }} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100">📊 CSV</button>
                                </div>
                            )}
                        </div>
                        {/* Export Violation Summary */}
                        <div className="relative">
                            <button
                                onClick={() => setExportDropdown(exportDropdown === 'r-summary' ? null : 'r-summary')}
                                className="px-3 py-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 text-sm font-medium"
                            >
                                📈 Summary ▾
                            </button>
                            {exportDropdown === 'r-summary' && (
                                <div className="absolute right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 min-w-[140px]">
                                    <button onClick={() => { exportData('violation-summary', 'json'); setExportDropdown(null); }} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100">📄 JSON</button>
                                    <button onClick={() => { exportData('violation-summary', 'csv'); setExportDropdown(null); }} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100">📊 CSV</button>
                                </div>
                            )}
                        </div>
                        {/* Full Export with dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => setExportDropdown(exportDropdown === 'full-export' ? null : 'full-export')}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
                            >
                                📥 Full Export ▾
                            </button>
                            {exportDropdown === 'full-export' && (
                                <div className="absolute right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 min-w-[140px]">
                                    <button 
                                        onClick={async () => {
                                            setExportDropdown(null);
                                            try {
                                                const res = await fetch(`${API_BASE}/research/full-export?format=json`);
                                                const data = await res.json();
                                                if (data.success && data.export) {
                                                    const blob = new Blob([JSON.stringify(data.export, null, 2)], { type: 'application/json' });
                                                    const url = URL.createObjectURL(blob);
                                                    const a = document.createElement('a');
                                                    a.href = url;
                                                    a.download = `blockproctor-full-export-${new Date().toISOString().split('T')[0]}.json`;
                                                    a.click();
                                                    URL.revokeObjectURL(url);
                                                } else {
                                                    alert('Export failed: ' + (data.error || 'Unknown error'));
                                                }
                                            } catch (err) {
                                                alert('Export failed: ' + err.message);
                                            }
                                        }} 
                                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                                    >
                                        📄 JSON
                                    </button>
                                    <button 
                                        onClick={async () => {
                                            setExportDropdown(null);
                                            try {
                                                const res = await fetch(`${API_BASE}/research/full-export?format=csv`);
                                                const text = await res.text();
                                                const blob = new Blob([text], { type: 'text/csv' });
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = `blockproctor-full-export-${new Date().toISOString().split('T')[0]}.csv`;
                                                a.click();
                                                URL.revokeObjectURL(url);
                                            } catch (err) {
                                                alert('Export failed: ' + err.message);
                                            }
                                        }} 
                                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                                    >
                                        📊 CSV
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                
                {/* Research Tabs */}
                <div className="flex gap-2 bg-gray-100 p-1 rounded-lg w-fit">
                    {['overview', 'ai', 'system', 'blockchain'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => { setResearchTab(tab); fetchMetricsData(tab); }}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                                researchTab === tab 
                                    ? 'bg-white text-indigo-600 shadow' 
                                    : 'text-gray-600 hover:text-gray-800'
                            }`}
                        >
                            {tab === 'overview' && '📈 Overview'}
                            {tab === 'ai' && '🤖 AI Detection'}
                            {tab === 'system' && '⚙️ System'}
                            {tab === 'blockchain' && '🔗 Blockchain'}
                        </button>
                    ))}
                </div>

                {/* Overview Tab */}
                {researchTab === 'overview' && (
                    <div className="space-y-6">
                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                                <p className="text-xs text-blue-600 font-medium uppercase">Total Users</p>
                                <p className="text-2xl font-bold text-blue-700">{researchData.systemOverview?.total_users || 0}</p>
                            </div>
                            <div className="bg-cyan-50 rounded-lg p-4 border border-cyan-100">
                                <p className="text-xs text-cyan-600 font-medium uppercase">Students</p>
                                <p className="text-2xl font-bold text-cyan-700">{researchData.systemOverview?.total_students || 0}</p>
                            </div>
                            <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                                <p className="text-xs text-green-600 font-medium uppercase">Exams</p>
                                <p className="text-2xl font-bold text-green-700">{researchData.systemOverview?.total_exams || 0}</p>
                            </div>
                            <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
                                <p className="text-xs text-purple-600 font-medium uppercase">Attempts</p>
                                <p className="text-2xl font-bold text-purple-700">{researchData.systemOverview?.total_attempts || 0}</p>
                            </div>
                            <div className="bg-orange-50 rounded-lg p-4 border border-orange-100">
                                <p className="text-xs text-orange-600 font-medium uppercase">Sessions</p>
                                <p className="text-2xl font-bold text-orange-700">{researchData.systemOverview?.total_sessions || 0}</p>
                            </div>
                            <div className="bg-red-50 rounded-lg p-4 border border-red-100">
                                <p className="text-xs text-red-600 font-medium uppercase">AI Events</p>
                                <p className="text-2xl font-bold text-red-700">{researchData.systemOverview?.total_violations || 0}</p>
                            </div>
                        </div>

                        {/* Score Analysis */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-white rounded-lg p-5 border shadow-sm">
                                <h3 className="font-semibold text-gray-800 mb-4">📊 Score Distribution</h3>
                                <div className="space-y-2">
                                    {researchData.scoreAnalysis?.distribution?.map((item, i) => (
                                        <div key={i} className="flex items-center gap-3">
                                            <div className="w-24 text-sm font-medium text-gray-700">{item.grade_range}</div>
                                            <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                                                <div 
                                                    className={`h-full rounded flex items-center pl-2 ${
                                                        item.grade_range?.includes('A') ? 'bg-green-400' :
                                                        item.grade_range?.includes('B') ? 'bg-blue-400' :
                                                        item.grade_range?.includes('C') ? 'bg-yellow-400' :
                                                        item.grade_range?.includes('D') ? 'bg-orange-400' : 'bg-red-400'
                                                    }`}
                                                    style={{ width: `${item.percentage || 0}%` }}
                                                >
                                                    <span className="text-xs text-white font-bold">{item.count}</span>
                                                </div>
                                            </div>
                                            <span className="text-xs text-gray-500 w-12">{item.percentage}%</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-4 pt-4 border-t">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600">Average Score</span>
                                        <span className="font-bold text-indigo-600">{researchData.scoreAnalysis?.average || 0}%</span>
                                    </div>
                                    <div className="flex justify-between text-sm mt-1">
                                        <span className="text-gray-600">Std Deviation</span>
                                        <span className="font-medium text-gray-700">±{researchData.scoreAnalysis?.standardDeviation || 0}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-lg p-5 border shadow-sm">
                                <h3 className="font-semibold text-gray-800 mb-4">📉 Session Outcomes</h3>
                                <div className="space-y-2">
                                    {researchData.sessionMetrics?.outcomes?.map((item, i) => (
                                        <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                item.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                                                item.status === 'SUBMITTED' ? 'bg-blue-100 text-blue-700' :
                                                item.status === 'TERMINATED' ? 'bg-red-100 text-red-700' :
                                                'bg-gray-100 text-gray-700'
                                            }`}>
                                                {item.status}
                                            </span>
                                            <span className="font-bold text-gray-800">{item.count}</span>
                                            <span className="text-xs text-gray-500">
                                                ~{Math.round(item.avg_duration_minutes || 0)} min avg
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4">
                                    <div className="text-center">
                                        <p className="text-xs text-gray-500">Completion Rate</p>
                                        <p className="text-xl font-bold text-green-600">{researchData.sessionMetrics?.completionRate}</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-xs text-gray-500">Termination Rate</p>
                                        <p className="text-xl font-bold text-red-600">{researchData.sessionMetrics?.terminationRate}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* AI Detection Performance */}
                        <div className="bg-white border rounded-lg p-5 shadow-sm">
                            <h3 className="font-semibold text-gray-800 mb-4">🤖 AI Detection Summary</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                <div className="text-center p-3 bg-gray-50 rounded-lg">
                                    <p className="text-2xl font-bold text-gray-800">{researchData.aiDetectionMetrics?.totalDetections || 0}</p>
                                    <p className="text-xs text-gray-500">Total Detections</p>
                                </div>
                                <div className="text-center p-3 bg-gray-50 rounded-lg">
                                    <p className="text-2xl font-bold text-gray-800">{researchData.aiDetectionMetrics?.avgDetectionsPerAttempt || 0}</p>
                                    <p className="text-xs text-gray-500">Avg per Attempt</p>
                                </div>
                                <div className="text-center p-3 bg-gray-50 rounded-lg">
                                    <p className="text-2xl font-bold text-gray-800">{researchData.aiDetectionMetrics?.breakdown?.length || 0}</p>
                                    <p className="text-xs text-gray-500">Violation Types</p>
                                </div>
                                <div className="text-center p-3 bg-gray-50 rounded-lg">
                                    <p className="text-2xl font-bold text-gray-800">{researchData.systemOverview?.students_attempted || 0}</p>
                                    <p className="text-xs text-gray-500">Students Monitored</p>
                                </div>
                            </div>
                            <div className="space-y-2">
                                {researchData.aiDetectionMetrics?.breakdown?.slice(0, 6).map((item, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <div className="w-36 text-sm font-medium text-gray-700 truncate" title={item.violation_type}>
                                            {item.violation_type}
                                        </div>
                                        <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
                                            <div 
                                                className="h-full bg-gradient-to-r from-red-400 to-red-500 rounded flex items-center justify-end pr-2"
                                                style={{ width: `${Math.min((item.occurrences / Math.max(...researchData.aiDetectionMetrics.breakdown.map(x => x.occurrences))) * 100, 100)}%` }}
                                            >
                                                <span className="text-xs text-white font-bold">{item.occurrences}</span>
                                            </div>
                                        </div>
                                        <span className="text-xs text-gray-500 w-20">Trust: {Math.round(item.avg_trust_after || 0)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* AI Detection Tab */}
                {researchTab === 'ai' && (
                    <div className="space-y-6">
                        {!aiMetrics ? (
                            <div className="text-center py-12 bg-white rounded-lg border">
                                <div className="animate-pulse text-4xl">🔄</div>
                                <p className="mt-2 text-gray-500">Loading AI metrics...</p>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-lg p-4">
                                        <p className="text-blue-100 text-xs uppercase">No Face Detections</p>
                                        <p className="text-3xl font-bold">{aiMetrics.faceDetection?.no_face_detections || 0}</p>
                                    </div>
                                    <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-lg p-4">
                                        <p className="text-purple-100 text-xs uppercase">Multiple Faces</p>
                                        <p className="text-3xl font-bold">{aiMetrics.faceDetection?.multiple_faces_detections || 0}</p>
                                    </div>
                                    <div className="bg-gradient-to-br from-red-500 to-red-600 text-white rounded-lg p-4">
                                        <p className="text-red-100 text-xs uppercase">Different Face</p>
                                        <p className="text-3xl font-bold">{aiMetrics.faceDetection?.different_face_detections || 0}</p>
                                    </div>
                                    <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-lg p-4">
                                        <p className="text-orange-100 text-xs uppercase">Head Turn (UDLR)</p>
                                        <p className="text-3xl font-bold">{aiMetrics.faceDetection?.gaze_violations || 0}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-white rounded-lg p-5 border shadow-sm">
                                        <h3 className="font-semibold text-gray-800 mb-4">🎯 Detection Confidence</h3>
                                        <div className="space-y-4">
                                            <div>
                                                <div className="flex justify-between text-sm mb-1">
                                                    <span className="text-gray-600">Average Confidence</span>
                                                    <span className="font-bold">{parseFloat(aiMetrics.faceDetection?.avg_face_confidence || 0).toFixed(2)}%</span>
                                                </div>
                                                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                                                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${aiMetrics.faceDetection?.avg_face_confidence || 0}%` }}></div>
                                                </div>
                                            </div>
                                            <div>
                                                <div className="flex justify-between text-sm mb-1">
                                                    <span className="text-gray-600">Min Confidence</span>
                                                    <span className="font-bold text-red-600">{parseFloat(aiMetrics.faceDetection?.min_face_confidence || 0).toFixed(2)}%</span>
                                                </div>
                                                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                                                    <div className="h-full bg-red-400 rounded-full" style={{ width: `${aiMetrics.faceDetection?.min_face_confidence || 0}%` }}></div>
                                                </div>
                                            </div>
                                            <div>
                                                <div className="flex justify-between text-sm mb-1">
                                                    <span className="text-gray-600">Max Confidence</span>
                                                    <span className="font-bold text-green-600">{parseFloat(aiMetrics.faceDetection?.max_face_confidence || 0).toFixed(2)}%</span>
                                                </div>
                                                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                                                    <div className="h-full bg-green-400 rounded-full" style={{ width: `${aiMetrics.faceDetection?.max_face_confidence || 0}%` }}></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-lg p-5 border shadow-sm">
                                        <h3 className="font-semibold text-gray-800 mb-4">📊 Detection Breakdown</h3>
                                        <div className="space-y-3">
                                            {aiMetrics.detectionBreakdown?.map((item, i) => (
                                                <div key={i} className="flex items-center justify-between">
                                                    <span className="text-sm text-gray-700">{item.violation_type}</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-gray-800">{item.total_detections}</span>
                                                        <span className="text-xs text-gray-500">(±{parseFloat(item.trust_score_stddev || 0).toFixed(1)})</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white rounded-lg p-5 border shadow-sm">
                                    <h3 className="font-semibold text-gray-800 mb-4">📈 Session-level AI Analysis (Top 10)</h3>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-3 py-2 text-left">Session ID</th>
                                                    <th className="px-3 py-2 text-center">AI Events</th>
                                                    <th className="px-3 py-2 text-center">Violation Types</th>
                                                    <th className="px-3 py-2 text-center">Min Trust</th>
                                                    <th className="px-3 py-2 text-center">Avg Trust</th>
                                                    <th className="px-3 py-2 text-left">Outcome</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {aiMetrics.sessionAnalysis?.slice(0, 10).map((session, i) => (
                                                    <tr key={i} className="border-t">
                                                        <td className="px-3 py-2 font-mono text-xs">{session.session_id}</td>
                                                        <td className="px-3 py-2 text-center font-bold">{session.ai_events_count}</td>
                                                        <td className="px-3 py-2 text-center">{session.unique_violation_types}</td>
                                                        <td className="px-3 py-2 text-center">
                                                            <span className={`font-medium ${session.min_trust < 50 ? 'text-red-600' : 'text-gray-700'}`}>
                                                                {Math.round(session.min_trust || 0)}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2 text-center">{Math.round(session.avg_trust || 0)}</td>
                                                        <td className="px-3 py-2">
                                                            <span className={`px-2 py-0.5 text-xs rounded ${
                                                                session.session_outcome === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                                                                session.session_outcome === 'TERMINATED' ? 'bg-red-100 text-red-700' :
                                                                'bg-gray-100 text-gray-700'
                                                            }`}>
                                                                {session.session_outcome}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* System Tab */}
                {researchTab === 'system' && (
                    <div className="space-y-6">
                        {!systemMetrics ? (
                            <div className="text-center py-12 bg-white rounded-lg border">
                                <div className="animate-pulse text-4xl">🔄</div>
                                <p className="mt-2 text-gray-500">Loading system metrics...</p>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="bg-white rounded-lg p-4 border shadow-sm">
                                        <p className="text-xs text-gray-500 uppercase">Total Sessions</p>
                                        <p className="text-3xl font-bold text-gray-800">{systemMetrics.sessionStatistics?.total_sessions || 0}</p>
                                    </div>
                                    <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                                        <p className="text-xs text-green-600 uppercase">Completed</p>
                                        <p className="text-3xl font-bold text-green-700">{systemMetrics.sessionStatistics?.completed_sessions || 0}</p>
                                    </div>
                                    <div className="bg-red-50 rounded-lg p-4 border border-red-100">
                                        <p className="text-xs text-red-600 uppercase">Terminated</p>
                                        <p className="text-3xl font-bold text-red-700">{systemMetrics.sessionStatistics?.terminated_sessions || 0}</p>
                                    </div>
                                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                                        <p className="text-xs text-blue-600 uppercase">Completion Rate</p>
                                        <p className="text-3xl font-bold text-blue-700">{systemMetrics.sessionStatistics?.completionRate}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-white rounded-lg p-5 border shadow-sm">
                                        <h3 className="font-semibold text-gray-800 mb-4">⏱️ Session Duration Analysis</h3>
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center py-2 border-b">
                                                <span className="text-gray-600">Average Duration</span>
                                                <span className="font-bold text-lg">{systemMetrics.durationAnalysis?.avgDurationMinutes} min</span>
                                            </div>
                                            <div className="flex justify-between items-center py-2 border-b">
                                                <span className="text-gray-600">Median Duration</span>
                                                <span className="font-bold text-lg">{systemMetrics.durationAnalysis?.medianDurationMinutes} min</span>
                                            </div>
                                            <div className="flex justify-between items-center py-2 border-b">
                                                <span className="text-gray-600">Min Duration</span>
                                                <span className="font-medium text-gray-700">{systemMetrics.durationAnalysis?.minDurationMinutes} min</span>
                                            </div>
                                            <div className="flex justify-between items-center py-2">
                                                <span className="text-gray-600">Max Duration</span>
                                                <span className="font-medium text-gray-700">{systemMetrics.durationAnalysis?.maxDurationMinutes} min</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-lg p-5 border shadow-sm">
                                        <h3 className="font-semibold text-gray-800 mb-4">🚫 Termination Analysis</h3>
                                        <div className="space-y-3">
                                            {systemMetrics.terminationAnalysis?.map((item, i) => (
                                                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                                    <span className={`px-2 py-1 rounded text-sm font-medium ${
                                                        item.status === 'TERMINATED' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                                                    }`}>
                                                        {item.status}
                                                    </span>
                                                    <div className="text-right">
                                                        <p className="font-bold text-gray-800">{item.count} sessions</p>
                                                        <p className="text-xs text-gray-500">
                                                            Avg trust at termination: {Math.round(item.avg_min_trust_at_termination || 0)}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                            {(!systemMetrics.terminationAnalysis || systemMetrics.terminationAnalysis.length === 0) && (
                                                <p className="text-gray-400 text-center py-4">No terminations recorded</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white rounded-lg p-5 border shadow-sm">
                                    <h3 className="font-semibold text-gray-800 mb-4">📅 Peak Concurrency (Top Hours)</h3>
                                    <div className="grid grid-cols-5 gap-3">
                                        {systemMetrics.peakConcurrency?.slice(0, 10).map((item, i) => (
                                            <div key={i} className="text-center p-3 bg-gray-50 rounded-lg">
                                                <p className="text-xs text-gray-500">{new Date(item.hour).toLocaleString()}</p>
                                                <p className="text-xl font-bold text-indigo-600">{item.sessions_started}</p>
                                                <p className="text-xs text-gray-400">sessions</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Blockchain Tab */}
                {researchTab === 'blockchain' && (
                    <div className="space-y-6">
                        {!blockchainMetrics ? (
                            <div className="text-center py-12 bg-white rounded-lg border">
                                <div className="animate-pulse text-4xl">🔄</div>
                                <p className="mt-2 text-gray-500">Loading blockchain metrics...</p>
                            </div>
                        ) : (
                            <>
                                <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-6 text-white">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-xl font-bold">🔗 Blockchain Integrity Status</h3>
                                            <p className="text-indigo-100 text-sm mt-1">Auto-recorded on exam publish & submission</p>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <button
                                                onClick={handleBatchRecordBlockchain}
                                                className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg font-medium text-sm"
                                                title="Record any old attempts that were submitted before auto-recording was enabled"
                                            >
                                                🔄 Backfill Legacy Records
                                            </button>
                                            <div className={`px-4 py-2 rounded-lg font-bold ${
                                                blockchainMetrics.integrityStatus === 'HEALTHY' 
                                                    ? 'bg-green-400 text-green-900' 
                                                    : 'bg-yellow-400 text-yellow-900'
                                            }`}>
                                                {blockchainMetrics.integrityStatus}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                    <div className="bg-white rounded-lg p-4 border shadow-sm">
                                        <p className="text-xs text-gray-500 uppercase">Total Attempts</p>
                                        <p className="text-3xl font-bold text-gray-800">{blockchainMetrics.attemptCounts?.total || 0}</p>
                                    </div>
                                    <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                                        <p className="text-xs text-green-600 uppercase">Recorded</p>
                                        <p className="text-3xl font-bold text-green-700">{blockchainMetrics.attemptCounts?.recorded || 0}</p>
                                    </div>
                                    <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-100">
                                        <p className="text-xs text-yellow-600 uppercase">Pending</p>
                                        <p className="text-3xl font-bold text-yellow-700">{blockchainMetrics.attemptCounts?.pending || 0}</p>
                                    </div>
                                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                                        <p className="text-xs text-blue-600 uppercase">Hash Verified</p>
                                        <p className="text-3xl font-bold text-blue-700">{blockchainMetrics.verificationSummary?.verified || 0}</p>
                                    </div>
                                    <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
                                        <p className="text-xs text-purple-600 uppercase">Verification Rate</p>
                                        <p className="text-3xl font-bold text-purple-700">{blockchainMetrics.verificationSummary?.verificationRate || 'N/A'}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-white rounded-lg p-5 border shadow-sm">
                                        <h3 className="font-semibold text-gray-800 mb-4">🔐 Hash Verification Sample</h3>
                                        <p className="text-sm text-gray-500 mb-3">
                                            Sample of {blockchainMetrics.verificationSummary?.sampleSize || 0} records verified
                                        </p>
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                                                <span className="text-green-700 font-medium">✓ Passed Verification</span>
                                                <span className="text-xl font-bold text-green-700">{blockchainMetrics.verificationSummary?.verified || 0}</span>
                                            </div>
                                            <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                                                <span className="text-red-700 font-medium">✗ Hash Mismatches</span>
                                                <span className="text-xl font-bold text-red-700">{blockchainMetrics.verificationSummary?.hashMismatches || 0}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-lg p-5 border shadow-sm">
                                        <h3 className="font-semibold text-gray-800 mb-4">📊 Network Statistics</h3>
                                        <div className="space-y-3">
                                            {blockchainMetrics.networkStatistics && Object.entries(blockchainMetrics.networkStatistics).map(([key, value], i) => (
                                                <div key={i} className="flex justify-between items-center py-2 border-b last:border-0">
                                                    <span className="text-gray-600 text-sm capitalize">{key.replace(/_/g, ' ')}</span>
                                                    <span className="font-mono text-sm font-medium">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white rounded-lg p-5 border shadow-sm">
                                    <h3 className="font-semibold text-gray-800 mb-4">📈 Recording Timeline (Last 30 Days)</h3>
                                    <div className="overflow-x-auto">
                                        <div className="flex gap-2 pb-2" style={{ minWidth: 'max-content' }}>
                                            {blockchainMetrics.recordingTimeline?.map((item, i) => (
                                                <div key={i} className="text-center p-2 bg-gray-50 rounded min-w-16">
                                                    <p className="text-xs text-gray-500">{new Date(item.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                                                    <p className="text-lg font-bold text-indigo-600">{item.attempts_submitted || 0}</p>
                                                    <p className="text-xs text-green-600">{item.blockchain_recorded || 0} ✓</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        );
    };

    // ═══════════════════════════════════════════════════════════════════════════════
    // STUDENT LOGS SECTION
    // ═══════════════════════════════════════════════════════════════════════════════
    /** Student-logs section – view and search detailed per-student activity logs. */

    /** Renders the student logs view – searchable list with drill-down into individual log details. */
    const renderStudentLogs = () => (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center text-2xl">📋</div>
                <div>
                    <h2 className="text-lg font-bold text-gray-800">Student Logs</h2>
                    <p className="text-sm text-gray-500">View all student exam history, violations, and results</p>
                </div>
            </div>

            {/* Search Bar */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex gap-4">
                    <div className="flex-1">
                        <input
                            type="text"
                            placeholder="Search by name, email, or student ID..."
                            value={studentLogSearch}
                            onChange={(e) => setStudentLogSearch(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && fetchStudentLogs(studentLogSearch)}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                    </div>
                    <button
                        onClick={() => fetchStudentLogs(studentLogSearch)}
                        className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"
                    >
                        🔍 Search
                    </button>
                    <button
                        onClick={() => {
                            setStudentLogSearch('');
                            fetchStudentLogs('');
                        }}
                        className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                        Reset
                    </button>
                </div>
            </div>

            {/* Students Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Student</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Department</th>
                                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Attempts</th>
                                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Completed</th>
                                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Locked</th>
                                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Avg Score</th>
                                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Violations</th>
                                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {studentLogs.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="px-4 py-8 text-center text-gray-500">
                                        No students found. Try a different search.
                                    </td>
                                </tr>
                            ) : (
                                studentLogs.map(student => (
                                    <tr key={student.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-gray-800">{student.full_name}</div>
                                            <div className="text-xs text-gray-500">{student.email}</div>
                                            <div className="text-xs text-blue-600 font-mono">
                                                DB ID: {student.id} | Roll: {student.student_id || 'N/A'}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="text-sm text-gray-700">{student.department_name || '-'}</div>
                                            <div className="text-xs text-gray-500">{student.batch_name || ''}</div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="font-semibold text-gray-800">{student.total_attempts || 0}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="text-green-600 font-semibold">{student.completed_exams || 0}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {parseInt(student.locked_exams || 0) > 0 ? (
                                                <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-semibold">
                                                    {student.locked_exams}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400">0</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="font-semibold text-indigo-600">
                                                {Math.round(student.avg_score || 0)}%
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                <span className="text-gray-600">{student.total_violations || 0}</span>
                                                {parseInt(student.critical_violations || 0) > 0 && (
                                                    <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded font-semibold">
                                                        {student.critical_violations} critical
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                onClick={() => {
                                                    setSelectedStudentLog(student);
                                                    fetchStudentLogDetails(student.id);
                                                }}
                                                className="px-3 py-1.5 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 font-medium"
                                            >
                                                View Logs
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Student Log Detail Modal */}
            {showStudentLogModal && studentLogDetails && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-xl flex flex-col">
                        {/* Modal Header */}
                        <div className="bg-purple-600 text-white px-6 py-4 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-bold">{studentLogDetails.student?.full_name}</h3>
                                <p className="text-sm text-purple-200">{studentLogDetails.student?.email} | {studentLogDetails.student?.student_id || 'No ID'}</p>
                            </div>
                            <button 
                                onClick={() => setShowStudentLogModal(false)}
                                className="text-white hover:text-purple-200"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Summary Stats */}
                        <div className="bg-gray-50 px-6 py-4 border-b">
                            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                                <div className="bg-white p-3 rounded-lg border text-center">
                                    <div className="text-2xl font-bold text-gray-800">{studentLogDetails.summary?.totalAttempts || 0}</div>
                                    <div className="text-xs text-gray-500">Total Attempts</div>
                                </div>
                                <div className="bg-white p-3 rounded-lg border text-center">
                                    <div className="text-2xl font-bold text-green-600">{studentLogDetails.summary?.completedExams || 0}</div>
                                    <div className="text-xs text-gray-500">Completed</div>
                                </div>
                                <div className="bg-white p-3 rounded-lg border text-center">
                                    <div className="text-2xl font-bold text-red-600">{studentLogDetails.summary?.lockedExams || 0}</div>
                                    <div className="text-xs text-gray-500">Locked</div>
                                </div>
                                <div className="bg-white p-3 rounded-lg border text-center">
                                    <div className="text-2xl font-bold text-orange-600">{studentLogDetails.summary?.terminatedExams || 0}</div>
                                    <div className="text-xs text-gray-500">Terminated</div>
                                </div>
                                <div className="bg-white p-3 rounded-lg border text-center">
                                    <div className="text-2xl font-bold text-indigo-600">{studentLogDetails.summary?.avgScore || 0}%</div>
                                    <div className="text-xs text-gray-500">Avg Score</div>
                                </div>
                                <div className="bg-white p-3 rounded-lg border text-center">
                                    <div className="text-2xl font-bold text-red-600">{studentLogDetails.summary?.criticalViolations || 0}</div>
                                    <div className="text-xs text-gray-500">Critical Violations</div>
                                </div>
                            </div>
                        </div>

                        {/* Scrollable Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Exam Attempts */}
                            <div>
                                <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                                    📝 Exam Attempts
                                </h4>
                                {studentLogDetails.attempts?.length === 0 ? (
                                    <p className="text-gray-500 text-sm">No exam attempts yet.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {studentLogDetails.attempts?.map((attempt, idx) => (
                                            <div key={idx} className={`border rounded-lg p-4 ${attempt.is_locked ? 'border-red-300 bg-red-50' : attempt.status === 'TERMINATED' ? 'border-orange-300 bg-orange-50' : 'border-gray-200'}`}>
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <div className="font-semibold text-gray-800">{attempt.exam_title}</div>
                                                        <div className="text-xs text-gray-500">
                                                            {attempt.class_name} • {attempt.instructor_name || 'No instructor'}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className={`px-2 py-1 text-xs rounded-full font-semibold ${
                                                            attempt.is_locked ? 'bg-red-600 text-white' :
                                                            attempt.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                                                            attempt.status === 'TERMINATED' ? 'bg-orange-100 text-orange-700' :
                                                            'bg-blue-100 text-blue-700'
                                                        }`}>
                                                            {attempt.is_locked ? '🔒 LOCKED' : attempt.status}
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                <div className="mt-2 grid grid-cols-4 gap-4 text-sm">
                                                    <div>
                                                        <span className="text-gray-500">Score:</span>
                                                        <span className="ml-1 font-semibold text-indigo-600">
                                                            {attempt.score !== null ? `${attempt.score}%` : '-'}
                                                        </span>
                                                        {attempt.correct_count !== null && (
                                                            <span className="text-xs text-gray-500 ml-1">
                                                                ({attempt.correct_count}/{attempt.total_questions})
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-500">Warnings:</span>
                                                        <span className="ml-1 font-semibold text-yellow-600">{attempt.warning_count || 0}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-500">Violations:</span>
                                                        <span className="ml-1 font-semibold text-red-600">{attempt.violation_count || 0}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-500">Started:</span>
                                                        <span className="ml-1">{attempt.started_at ? new Date(attempt.started_at).toLocaleString() : '-'}</span>
                                                    </div>
                                                </div>

                                                {attempt.lock_reason && (
                                                    <div className="mt-2 p-2 bg-red-100 rounded text-sm text-red-700">
                                                        <strong>Lock Reason:</strong> {attempt.lock_reason}
                                                    </div>
                                                )}

                                                {/* Logs for this exam */}
                                                {studentLogDetails.logsByExam?.[attempt.exam_id]?.length > 0 && (
                                                    <div className="mt-3 border-t pt-3">
                                                        <div className="text-xs font-semibold text-gray-600 mb-2">Violation Log:</div>
                                                        <div className="max-h-32 overflow-y-auto space-y-1">
                                                            {studentLogDetails.logsByExam[attempt.exam_id].map((log, logIdx) => (
                                                                <div key={logIdx} className={`text-xs p-2 rounded flex justify-between ${
                                                                    log.severity === 'critical' ? 'bg-red-100 text-red-800' :
                                                                    log.severity === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                                                                    'bg-gray-100 text-gray-600'
                                                                }`}>
                                                                    <span>
                                                                        <strong>{log.violation_type}</strong>: {log.description}
                                                                    </span>
                                                                    <span className="text-gray-400">
                                                                        {new Date(log.created_at).toLocaleTimeString()}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Allow Retry Button for ANY completed/locked/terminated exam */}
                                                {(attempt.is_locked || attempt.status === 'TERMINATED' || attempt.status === 'COMPLETED' || attempt.score !== null) && (
                                                    <div className="mt-3 border-t pt-3">
                                                        <button
                                                            onClick={() => handleAllowRetry(studentLogDetails.student.id, attempt.exam_id)}
                                                            className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium"
                                                        >
                                                            🔄 Allow Re-attempt
                                                        </button>
                                                        <span className="text-xs text-gray-500 ml-2">
                                                            (Old score and logs preserved)
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* All Violations Timeline */}
                            <div>
                                <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                                    ⚠️ All Violations ({studentLogDetails.allLogs?.length || 0})
                                </h4>
                                {studentLogDetails.allLogs?.length === 0 ? (
                                    <p className="text-gray-500 text-sm">No violations recorded.</p>
                                ) : (
                                    <div className="max-h-64 overflow-y-auto">
                                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                                            <thead className="bg-gray-50 sticky top-0">
                                                <tr>
                                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Time</th>
                                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Exam</th>
                                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Type</th>
                                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Description</th>
                                                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">Severity</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {studentLogDetails.allLogs?.map((log, idx) => (
                                                    <tr key={idx} className={log.severity === 'critical' ? 'bg-red-50' : ''}>
                                                        <td className="px-3 py-2 text-xs text-gray-500">
                                                            {new Date(log.created_at).toLocaleString()}
                                                        </td>
                                                        <td className="px-3 py-2 text-xs">{log.exam_title || '-'}</td>
                                                        <td className="px-3 py-2 font-medium">{log.violation_type}</td>
                                                        <td className="px-3 py-2 text-gray-600">{log.description}</td>
                                                        <td className="px-3 py-2 text-center">
                                                            <span className={`px-2 py-0.5 text-xs rounded-full ${
                                                                log.severity === 'critical' ? 'bg-red-600 text-white' :
                                                                log.severity === 'warning' ? 'bg-yellow-500 text-white' :
                                                                'bg-gray-200 text-gray-700'
                                                            }`}>
                                                                {log.severity}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="bg-gray-50 px-6 py-4 border-t flex justify-end">
                            <button
                                onClick={() => setShowStudentLogModal(false)}
                                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    // ═══════════════════════════════════════════════════════════════════════════════
    // AUDIT TRAIL RENDER
    // ═══════════════════════════════════════════════════════════════════════════════
    /** Audit-trail tab – archived exams/classes, integrity reports, student audit drill-down. */

    /** Renders the audit-trail tab – summary stats, archived records, and per-student integrity reports. */
    const renderAuditTrail = () => (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center text-2xl">🔒</div>
                <div>
                    <h2 className="text-lg font-bold text-gray-800">Audit Trail & Data Integrity</h2>
                    <p className="text-sm text-gray-500">Track deleted records, verify data integrity, and review exam/identity logs</p>
                </div>
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-2 bg-gray-100 p-1 rounded-lg w-fit">
                {[
                    { key: 'summary', label: '📊 Summary' },
                    { key: 'exams', label: '📝 Archived Exams' },
                    { key: 'classes', label: '📚 Archived Classes' },
                    { key: 'integrity', label: '✅ Integrity Check' },
                    { key: 'identity', label: '👤 Identity Audit' }
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setAuditTab(tab.key)}
                        className={`px-3 py-1.5 rounded text-sm font-medium transition ${
                            auditTab === tab.key ? 'bg-white shadow text-amber-600' : 'text-gray-600 hover:text-gray-800'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Summary Tab */}
            {auditTab === 'summary' && (
                <div className="space-y-6">
                    {auditSummary ? (
                        <>
                            {/* Archived Records Stats */}
                            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-lg p-4">
                                    <p className="text-blue-100 text-xs uppercase">Archived Exams</p>
                                    <p className="text-3xl font-bold">{auditSummary.archivedRecords?.exams || 0}</p>
                                </div>
                                <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-lg p-4">
                                    <p className="text-purple-100 text-xs uppercase">Archived Classes</p>
                                    <p className="text-3xl font-bold">{auditSummary.archivedRecords?.classes || 0}</p>
                                </div>
                                <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-lg p-4">
                                    <p className="text-green-100 text-xs uppercase">Archived Attempts</p>
                                    <p className="text-3xl font-bold">{auditSummary.archivedRecords?.attempts || 0}</p>
                                </div>
                                <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-lg p-4">
                                    <p className="text-orange-100 text-xs uppercase">Archived Logs</p>
                                    <p className="text-3xl font-bold">{auditSummary.archivedRecords?.proctorLogs || 0}</p>
                                </div>
                                <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 text-white rounded-lg p-4">
                                    <p className="text-cyan-100 text-xs uppercase">Archived Sessions</p>
                                    <p className="text-3xl font-bold">{auditSummary.archivedRecords?.sessions || 0}</p>
                                </div>
                                <div className="bg-gradient-to-br from-teal-500 to-teal-600 text-white rounded-lg p-4">
                                    <p className="text-teal-100 text-xs uppercase">Archived Enrollments</p>
                                    <p className="text-3xl font-bold">{auditSummary.archivedRecords?.enrollments || 0}</p>
                                </div>
                                <div className="bg-gradient-to-br from-rose-500 to-rose-600 text-white rounded-lg p-4">
                                    <p className="text-rose-100 text-xs uppercase">Archived Heartbeats</p>
                                    <p className="text-3xl font-bold">{auditSummary.archivedRecords?.heartbeats || 0}</p>
                                </div>
                            </div>

                            {/* Integrity Issues Alert */}
                            {auditSummary.integrityIssues?.unverifiedAttempts > 0 && (
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                    <div className="flex items-center gap-2 text-yellow-700 font-medium mb-2">
                                        ⚠️ Integrity Alert: {auditSummary.integrityIssues.unverifiedAttempts} attempts without blockchain verification
                                    </div>
                                    <div className="max-h-48 overflow-y-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-yellow-100">
                                                <tr>
                                                    <th className="px-3 py-2 text-left">Student</th>
                                                    <th className="px-3 py-2 text-left">Exam</th>
                                                    <th className="px-3 py-2 text-center">Score</th>
                                                    <th className="px-3 py-2 text-left">Submitted</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {auditSummary.integrityIssues.details?.map((item, i) => (
                                                    <tr key={i} className="border-t border-yellow-100">
                                                        <td className="px-3 py-2">{item.student_name}</td>
                                                        <td className="px-3 py-2">{item.exam_title}</td>
                                                        <td className="px-3 py-2 text-center">{item.score}%</td>
                                                        <td className="px-3 py-2">{new Date(item.submitted_at).toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Recent Deletions */}
                            <div className="bg-white rounded-lg border p-4">
                                <h3 className="font-semibold text-gray-800 mb-4">📋 Recent Deletions</h3>
                                {auditSummary.recentDeletions?.length > 0 ? (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-3 py-2 text-left">Table</th>
                                                    <th className="px-3 py-2 text-left">Deleted By</th>
                                                    <th className="px-3 py-2 text-left">Role</th>
                                                    <th className="px-3 py-2 text-left">Reason</th>
                                                    <th className="px-3 py-2 text-left">Date</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {auditSummary.recentDeletions.map((del, i) => (
                                                    <tr key={i} className="border-t">
                                                        <td className="px-3 py-2">
                                                            <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-medium">
                                                                {del.table_name}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2">{del.deleted_by_name || 'Unknown'}</td>
                                                        <td className="px-3 py-2">
                                                            <span className={`px-2 py-0.5 rounded text-xs ${
                                                                del.deleted_by_role === 'admin' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                                                            }`}>
                                                                {del.deleted_by_role}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2 text-gray-600 max-w-xs truncate" title={del.deletion_reason}>
                                                            {del.deletion_reason || '-'}
                                                        </td>
                                                        <td className="px-3 py-2 text-gray-500">
                                                            {new Date(del.deleted_at).toLocaleString()}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="text-gray-500 text-center py-4">No deletions recorded yet</p>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-8 text-gray-500">Loading audit summary...</div>
                    )}
                </div>
            )}

            {/* Archived Exams Tab */}
            {auditTab === 'exams' && (
                <div className="bg-white rounded-lg border overflow-hidden">
                    <div className="p-4 border-b bg-gray-50">
                        <h3 className="font-semibold text-gray-800">📝 Archived Exams</h3>
                        <p className="text-sm text-gray-500">Exams that have been deleted but preserved for audit</p>
                    </div>
                    {archivedExams.length > 0 ? (
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left">Title</th>
                                    <th className="px-4 py-3 text-left">Class</th>
                                    <th className="px-4 py-3 text-left">Instructor</th>
                                    <th className="px-4 py-3 text-center">Attempts</th>
                                    <th className="px-4 py-3 text-left">Deleted By</th>
                                    <th className="px-4 py-3 text-left">Reason</th>
                                    <th className="px-4 py-3 text-left">Deleted At</th>
                                    <th className="px-4 py-3 text-center">Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {archivedExams.map((exam, i) => (
                                    <tr key={i} className="border-t hover:bg-gray-50">
                                        <td className="px-4 py-3 font-medium">{exam.title}</td>
                                        <td className="px-4 py-3">{exam.class_name || '-'}</td>
                                        <td className="px-4 py-3">{exam.instructor_name}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                                                {exam.archived_attempts || exam.total_attempts || 0}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">{exam.deleted_by_name}</td>
                                        <td className="px-4 py-3 text-gray-500 max-w-xs truncate" title={exam.deletion_reason}>
                                            {exam.deletion_reason || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500">
                                            {new Date(exam.deleted_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                onClick={() => openArchivedExam(exam)}
                                                className="px-3 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 text-sm"
                                            >
                                                View
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="text-center py-8 text-gray-500">No archived exams found</div>
                    )}
                </div>
            )}

            {/* Archived Classes Tab */}
            {auditTab === 'classes' && (
                <div className="bg-white rounded-lg border overflow-hidden">
                    <div className="p-4 border-b bg-gray-50">
                        <h3 className="font-semibold text-gray-800">📚 Archived Classes</h3>
                        <p className="text-sm text-gray-500">Classes that have been deleted but preserved for audit</p>
                    </div>
                    {archivedClasses.length > 0 ? (
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left">Name</th>
                                    <th className="px-4 py-3 text-left">Code</th>
                                    <th className="px-4 py-3 text-left">Instructor</th>
                                    <th className="px-4 py-3 text-center">Students</th>
                                    <th className="px-4 py-3 text-left">Deleted By</th>
                                    <th className="px-4 py-3 text-left">Reason</th>
                                    <th className="px-4 py-3 text-left">Deleted At</th>
                                    <th className="px-4 py-3 text-center">Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {archivedClasses.map((cls, i) => (
                                    <tr key={i} className="border-t hover:bg-gray-50">
                                        <td className="px-4 py-3 font-medium">{cls.name}</td>
                                        <td className="px-4 py-3">{cls.code}</td>
                                        <td className="px-4 py-3">{cls.instructor_name}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs">
                                                {cls.student_count || 0}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">{cls.deleted_by_name}</td>
                                        <td className="px-4 py-3 text-gray-500 max-w-xs truncate" title={cls.deletion_reason}>
                                            {cls.deletion_reason || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500">
                                            {new Date(cls.deleted_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                onClick={() => openArchivedClass(cls)}
                                                className="px-3 py-1 bg-purple-50 text-purple-600 rounded hover:bg-purple-100 text-sm"
                                            >
                                                View
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="text-center py-8 text-gray-500">No archived classes found</div>
                    )}
                </div>
            )}

            {/* Integrity Check Tab */}
            {auditTab === 'integrity' && (
                <div className="space-y-4">
                    <div className="bg-white rounded-lg border p-4">
                        <h3 className="font-semibold text-gray-800 mb-4">✅ Exam Integrity Verification</h3>
                        <p className="text-sm text-gray-500 mb-4">Enter an Exam ID to verify its data integrity and blockchain status</p>
                        <div className="flex gap-2">
                            <input
                                type="number"
                                placeholder="Enter Exam ID..."
                                className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && e.target.value) {
                                        fetchExamIntegrityReport(e.target.value);
                                    }
                                }}
                            />
                            <button
                                onClick={() => {
                                    const input = document.querySelector('input[placeholder="Enter Exam ID..."]');
                                    if (input?.value) fetchExamIntegrityReport(input.value);
                                }}
                                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                            >
                                Check Integrity
                            </button>
                        </div>
                    </div>

                    {examIntegrityReport && (
                        <div className="bg-white rounded-lg border p-4 space-y-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="font-bold text-lg">{examIntegrityReport.exam?.title}</h4>
                                    <p className="text-sm text-gray-500">
                                        {examIntegrityReport.isArchived ? '🗄️ Archived Exam' : '✅ Active Exam'}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <div className={`text-3xl font-bold ${
                                        examIntegrityReport.integrityScore >= 80 ? 'text-green-600' :
                                        examIntegrityReport.integrityScore >= 50 ? 'text-yellow-600' : 'text-red-600'
                                    }`}>
                                        {examIntegrityReport.integrityScore}%
                                    </div>
                                    <p className="text-xs text-gray-500">Integrity Score</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-gray-50 rounded-lg p-3 text-center">
                                    <p className="text-2xl font-bold text-blue-600">{examIntegrityReport.attempts?.total || 0}</p>
                                    <p className="text-xs text-gray-500">Total Attempts</p>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-3 text-center">
                                    <p className="text-2xl font-bold text-green-600">{examIntegrityReport.attempts?.withBlockchainHash || 0}</p>
                                    <p className="text-xs text-gray-500">With Blockchain Hash</p>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-3 text-center">
                                    <p className="text-2xl font-bold text-purple-600">{examIntegrityReport.attempts?.withBlockchainTx || 0}</p>
                                    <p className="text-xs text-gray-500">With TX Confirmation</p>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-3 text-center">
                                    <p className="text-2xl font-bold text-emerald-600">{examIntegrityReport.attempts?.verifiedOnChain || 0}</p>
                                    <p className="text-xs text-gray-500">Verified On-Chain</p>
                                </div>
                            </div>

                            {/* Attempts List */}
                            {examIntegrityReport.attempts?.data?.length > 0 && (
                                <div>
                                    <h5 className="font-medium text-gray-700 mb-2">Attempt Details</h5>
                                    <div className="max-h-64 overflow-y-auto border rounded-lg">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50 sticky top-0">
                                                <tr>
                                                    <th className="px-3 py-2 text-left">Student</th>
                                                    <th className="px-3 py-2 text-center">Score</th>
                                                    <th className="px-3 py-2 text-center">Hash</th>
                                                    <th className="px-3 py-2 text-center">TX</th>
                                                    <th className="px-3 py-2 text-center">Chain</th>
                                                    <th className="px-3 py-2 text-left">Submitted</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {examIntegrityReport.attempts.data.map((att, i) => (
                                                    <tr key={i} className="border-t">
                                                        <td className="px-3 py-2">{att.student_name}</td>
                                                        <td className="px-3 py-2 text-center font-medium">{att.score}%</td>
                                                        <td className="px-3 py-2 text-center">
                                                            {att.blockchain_hash ? 
                                                                <span className="text-green-600">✓</span> : 
                                                                <span className="text-red-500">✗</span>
                                                            }
                                                        </td>
                                                        <td className="px-3 py-2 text-center">
                                                            {att.blockchain_tx ? 
                                                                <span className="text-green-600">✓</span> : 
                                                                <span className="text-red-500">✗</span>
                                                            }
                                                        </td>
                                                        <td className="px-3 py-2 text-center" title={att.onChainVerifiedReason || (att.storedChainHash ? `Chain hash: ${att.storedChainHash}` : '')}>
                                                            {att.onChainVerified === true ? (
                                                                <span className="text-green-600 font-medium">✓ Valid</span>
                                                            ) : att.onChainVerified === false ? (
                                                                <span className="text-red-500 font-medium">✗ Mismatch</span>
                                                            ) : (
                                                                <span className="text-gray-400 text-xs">chain down</span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2 text-gray-500">
                                                            {att.submitted_at ? new Date(att.submitted_at).toLocaleString() : '-'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Identity Audit Tab */}
            {auditTab === 'identity' && (
                <div className="space-y-4">
                    <div className="bg-white rounded-lg border p-4">
                        <h3 className="font-semibold text-gray-800 mb-4">👤 Student Identity Audit</h3>
                        <p className="text-sm text-gray-500 mb-4">Enter a Student ID to view their identity verification history and incidents</p>
                        <div className="flex gap-2">
                            <input
                                type="number"
                                placeholder="Enter Student ID..."
                                className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && e.target.value) {
                                        fetchStudentAuditReport(e.target.value);
                                    }
                                }}
                            />
                            <button
                                onClick={() => {
                                    const input = document.querySelector('input[placeholder="Enter Student ID..."]');
                                    if (input?.value) fetchStudentAuditReport(input.value);
                                }}
                                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                            >
                                View Audit
                            </button>
                        </div>
                    </div>

                    {studentAuditReport && (
                        <div className="bg-white rounded-lg border p-4 space-y-4">
                            {/* Student Info */}
                            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                                {studentAuditReport.student?.face_verification_photo ? (
                                    <img 
                                        src={studentAuditReport.student.face_verification_photo} 
                                        alt="Student" 
                                        className="w-16 h-16 rounded-full object-cover border-2 border-white shadow"
                                    />
                                ) : (
                                    <div className="w-16 h-16 bg-gray-300 rounded-full flex items-center justify-center text-2xl">
                                        👤
                                    </div>
                                )}
                                <div>
                                    <h4 className="font-bold text-lg">{studentAuditReport.student?.full_name}</h4>
                                    <p className="text-sm text-gray-500">{studentAuditReport.student?.email}</p>
                                    <p className="text-sm text-gray-500">ID: {studentAuditReport.student?.student_id}</p>
                                </div>
                                <div className="ml-auto text-right">
                                    <span className={`px-3 py-1 rounded-full text-sm ${
                                        studentAuditReport.student?.enrollment_status === 'approved' ? 'bg-green-100 text-green-700' :
                                        studentAuditReport.student?.enrollment_status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                        'bg-gray-100 text-gray-700'
                                    }`}>
                                        {studentAuditReport.student?.enrollment_status}
                                    </span>
                                </div>
                            </div>

                            {/* Identity Incidents */}
                            <div>
                                <h5 className="font-medium text-gray-700 mb-2">
                                    🚨 Identity Incidents ({studentAuditReport.identityIncidents?.length || 0})
                                </h5>
                                {studentAuditReport.identityIncidents?.length > 0 ? (
                                    <div className="max-h-48 overflow-y-auto border rounded-lg">
                                        <table className="w-full text-sm">
                                            <thead className="bg-red-50 sticky top-0">
                                                <tr>
                                                    <th className="px-3 py-2 text-left">Type</th>
                                                    <th className="px-3 py-2 text-left">Exam</th>
                                                    <th className="px-3 py-2 text-left">Date</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {studentAuditReport.identityIncidents.map((inc, i) => (
                                                    <tr key={i} className="border-t">
                                                        <td className="px-3 py-2">
                                                            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
                                                                {inc.violation_type}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2">{inc.exam_title || '-'}</td>
                                                        <td className="px-3 py-2 text-gray-500">
                                                            {new Date(inc.created_at).toLocaleString()}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="text-green-600 text-sm p-3 bg-green-50 rounded-lg">✓ No identity incidents recorded</p>
                                )}
                            </div>

                            {/* Exam Attempts */}
                            <div>
                                <h5 className="font-medium text-gray-700 mb-2">
                                    📝 Exam Attempts ({studentAuditReport.examAttempts?.length || 0})
                                </h5>
                                {studentAuditReport.examAttempts?.length > 0 ? (
                                    <div className="max-h-48 overflow-y-auto border rounded-lg">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50 sticky top-0">
                                                <tr>
                                                    <th className="px-3 py-2 text-left">Exam</th>
                                                    <th className="px-3 py-2 text-left">Class</th>
                                                    <th className="px-3 py-2 text-center">Score</th>
                                                    <th className="px-3 py-2 text-center">Blockchain</th>
                                                    <th className="px-3 py-2 text-left">Submitted</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {studentAuditReport.examAttempts.map((att, i) => (
                                                    <tr key={i} className="border-t">
                                                        <td className="px-3 py-2 font-medium">{att.exam_title}</td>
                                                        <td className="px-3 py-2">{att.class_name || '-'}</td>
                                                        <td className="px-3 py-2 text-center font-bold">{att.score}%</td>
                                                        <td className="px-3 py-2 text-center">
                                                            {att.blockchain_hash ? 
                                                                <span className="text-green-600">✓ Verified</span> : 
                                                                <span className="text-gray-400">-</span>
                                                            }
                                                        </td>
                                                        <td className="px-3 py-2 text-gray-500">
                                                            {att.submitted_at ? new Date(att.submitted_at).toLocaleString() : '-'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="text-gray-500 text-sm p-3 bg-gray-50 rounded-lg">No exam attempts found</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    /** Renders the blockchain verification tab – integrity checks, hash verification, and chain status. */
    const renderBlockchain = () => (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center text-2xl">🔗</div>
                <div>
                    <h2 className="text-lg font-bold text-gray-800">Blockchain Integrity</h2>
                    <p className="text-sm text-gray-500">ProctorChain Smart Contract</p>
                </div>
            </div>

            {blockchainData ? (
                <>
                    <div className={`p-4 rounded-lg border ${
                        blockchainData.networkStatistics?.networkConnected 
                            ? 'bg-green-50 border-green-200' 
                            : 'bg-yellow-50 border-yellow-200'
                    }`}>
                        <div className="flex items-center gap-2">
                            <span className="text-2xl">{blockchainData.networkStatistics?.networkConnected ? '✅' : '⚠️'}</span>
                            <div>
                                <p className="font-semibold text-gray-800">
                                    {blockchainData.networkStatistics?.networkConnected ? 'Blockchain Connected' : 'Blockchain Offline'}
                                </p>
                                <p className="text-sm text-gray-600">
                                    {blockchainData.integrityStatus || 'Status Unknown'}
                                    {blockchainData.networkStatistics?.contractAddress && (
                                        <span className="ml-2 font-mono text-xs">
                                            ({blockchainData.networkStatistics.contractAddress.slice(0, 10)}...)
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-indigo-50 rounded-lg p-4 text-center border border-indigo-100">
                            <p className="text-xs text-indigo-600 font-medium uppercase">Network</p>
                            <p className="text-lg font-bold text-indigo-700">
                                {blockchainData.networkStatistics?.networkName || 'N/A'}
                            </p>
                            <p className="text-xs text-gray-500">Chain ID: {blockchainData.networkStatistics?.chainId || '-'}</p>
                        </div>
                        <div className="bg-green-50 rounded-lg p-4 text-center border border-green-100">
                            <p className="text-xs text-green-600 font-medium uppercase">Total Recorded</p>
                            <p className="text-3xl font-bold text-green-700">
                                {blockchainData.totalRecordedAttempts || 0}
                            </p>
                        </div>
                        <div className="bg-blue-50 rounded-lg p-4 text-center border border-blue-100">
                            <p className="text-xs text-blue-600 font-medium uppercase">Verified</p>
                            <p className="text-3xl font-bold text-blue-700">
                                {blockchainData.verificationSummary?.verified || 0}
                            </p>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-4 text-center border border-purple-100">
                            <p className="text-xs text-purple-600 font-medium uppercase">Verification Rate</p>
                            <p className="text-xl font-bold text-purple-700">
                                {blockchainData.verificationSummary?.verificationRate || '0%'}
                            </p>
                        </div>
                    </div>

                    {blockchainData.networkStatistics?.note && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                            ℹ️ {blockchainData.networkStatistics.note}
                        </div>
                    )}

                    <div className="bg-gray-50 rounded-lg p-4 border">
                        <h3 className="font-semibold text-gray-700 mb-2">How Blockchain Ensures Integrity</h3>
                        <ul className="text-sm text-gray-600 space-y-1">
                            <li>✓ Exam content hashed and stored on-chain</li>
                            <li>✓ Student answers immutably recorded</li>
                            <li>✓ Proctor violation logs cryptographically secured</li>
                            <li>✓ Tamper-evident audit trail for all activities</li>
                        </ul>
                    </div>

                    {/* Recording Timeline */}
                    {blockchainData.recordingTimeline?.length > 0 && (
                        <div className="bg-white rounded-lg p-4 border">
                            <h3 className="font-semibold text-gray-700 mb-3">📈 Recent Recording Activity</h3>
                            <div className="flex gap-2 overflow-x-auto pb-2">
                                {blockchainData.recordingTimeline.slice(0, 7).map((item, i) => (
                                    <div key={i} className="text-center p-2 bg-gray-50 rounded min-w-20 flex-shrink-0">
                                        <p className="text-xs text-gray-500">
                                            {new Date(item.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </p>
                                        <p className="text-lg font-bold text-indigo-600">{item.attempts_submitted || 0}</p>
                                        <p className="text-xs text-gray-400">attempts</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <div className="text-center py-10 text-gray-400">
                    Loading blockchain data...
                </div>
            )}
        </div>
    );

    // ═══════════════════════════════════════════════════════════════════════════════
    // MODALS
    // ═══════════════════════════════════════════════════════════════════════════════
    /** Modal dialogs – add/edit instructors, departments, batches, and students. */

    const renderAddInstructorModal = () => (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md">
                <h3 className="text-xl font-bold mb-4">Add New Instructor</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                        <input 
                            type="text"
                            value={newInstructor.name}
                            onChange={(e) => setNewInstructor({...newInstructor, name: e.target.value})}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            placeholder="Dr. John Smith"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                        <input 
                            type="email"
                            value={newInstructor.email}
                            onChange={(e) => setNewInstructor({...newInstructor, email: e.target.value})}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            placeholder="john.smith@university.edu"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                        <input 
                            type="password"
                            value={newInstructor.password}
                            onChange={(e) => setNewInstructor({...newInstructor, password: e.target.value})}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            placeholder="••••••••"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
                        <select 
                            value={newInstructor.department_id}
                            onChange={(e) => setNewInstructor({...newInstructor, department_id: parseInt(e.target.value)})}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">Select department...</option>
                            {departments.map(dept => (
                                <option key={dept.id} value={dept.id}>{dept.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                    <button 
                        onClick={() => setShowAddInstructorModal(false)}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleAddInstructor}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                        Add Instructor
                    </button>
                </div>
            </div>
        </div>
    );

    const renderEditInstructorModal = () => (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md">
                <h3 className="text-xl font-bold mb-4">Edit Instructor</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                        <input 
                            type="text"
                            value={editingInstructor?.name || ''}
                            onChange={(e) => setEditingInstructor({...editingInstructor, name: e.target.value})}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                        <input 
                            type="email"
                            value={editingInstructor?.email || ''}
                            onChange={(e) => setEditingInstructor({...editingInstructor, email: e.target.value})}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">New Password (leave blank to keep current)</label>
                        <input 
                            type="password"
                            value={editingInstructor?.newPassword || ''}
                            onChange={(e) => setEditingInstructor({...editingInstructor, newPassword: e.target.value})}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            placeholder="••••••••"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                        <select 
                            value={editingInstructor?.department_id || ''}
                            onChange={(e) => setEditingInstructor({...editingInstructor, department_id: parseInt(e.target.value) || ''})}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">Select department...</option>
                            {departments.map(dept => (
                                <option key={dept.id} value={dept.id}>{dept.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                    <button 
                        onClick={() => { setShowEditInstructorModal(false); setEditingInstructor(null); }}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleUpdateInstructor}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );

    const renderAddDepartmentModal = () => (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md">
                <h3 className="text-xl font-bold mb-4">Add New Department</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Department Name *</label>
                        <input 
                            type="text"
                            value={newDepartment.name}
                            onChange={(e) => setNewDepartment({...newDepartment, name: e.target.value})}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            placeholder="Computer Science"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Department Code *</label>
                        <input 
                            type="text"
                            value={newDepartment.code}
                            onChange={(e) => setNewDepartment({...newDepartment, code: e.target.value})}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            placeholder="CS"
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                    <button 
                        onClick={() => setShowAddDepartmentModal(false)}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleAddDepartment}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                        Add Department
                    </button>
                </div>
            </div>
        </div>
    );

    const renderAddBatchModal = () => (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md">
                <h3 className="text-xl font-bold mb-4">Add New Batch</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Batch Name *</label>
                        <input 
                            type="text"
                            value={newBatch.name}
                            onChange={(e) => setNewBatch({...newBatch, name: e.target.value})}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            placeholder="Fall 2024"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Year *</label>
                        <input 
                            type="number"
                            value={newBatch.year}
                            onChange={(e) => setNewBatch({...newBatch, year: parseInt(e.target.value)})}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            min="2020"
                            max="2030"
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                    <button 
                        onClick={() => setShowAddBatchModal(false)}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleAddBatch}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                        Add Batch
                    </button>
                </div>
            </div>
        </div>
    );

    // ═══════════════════════════════════════════════════════════════════════════════
    // MAIN RENDER
    // ═══════════════════════════════════════════════════════════════════════════════
    /** Main render – assembles the page shell, tab navigation, and active tab content. */
    
    return (
        <div className="min-h-screen bg-gray-100 font-sans">
            {/* Header */}
            <header className="bg-white shadow-sm border-b">
                <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">B</div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">BlockProctor Admin</h1>
                            <p className="text-xs text-gray-500">Super Admin Dashboard</p>
                        </div>
                    </div>
                    <button 
                        onClick={handleLogout}
                        className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                    >
                        Logout
                    </button>
                </div>
            </header>

            <div className="max-w-7xl mx-auto px-6 py-8">
                {/* TABS */}
                <div className="flex flex-wrap gap-1 bg-gray-200 p-1 rounded-lg mb-6 w-fit">
                    {[
                        { key: 'dashboard', label: '📊 Dashboard' },
                        { key: 'enrollments', label: '👤 Enrollments' },
                        { key: 'face-verify', label: '📸 Face Verify' },
                        { key: 'students', label: '🎓 Students' },
                        { key: 'instructors', label: '👨‍🏫 Instructors' },
                        { key: 'exams', label: '📝 Exams' },
                        { key: 'student-logs', label: '📋 Student Logs' },
                        { key: 'audit', label: '🔒 Audit Trail' },
                        { key: 'research', label: '📈 Research' },
                        { key: 'blockchain', label: '🔗 Blockchain' },
                    ].map(tab => (
                        <button 
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-4 py-2 rounded-md font-medium text-sm transition ${
                                activeTab === tab.key 
                                    ? 'bg-white text-indigo-600 shadow' 
                                    : 'text-gray-600 hover:text-gray-800'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* CONTENT */}
                {loading ? (
                    <div className="text-center py-20 text-gray-500">Loading...</div>
                ) : (
                    <>
                        {activeTab === 'dashboard' && renderDashboard()}
                        {activeTab === 'enrollments' && renderEnrollments()}
                        {activeTab === 'face-verify' && renderFaceVerifications()}
                        {activeTab === 'students' && renderStudents()}
                        {activeTab === 'instructors' && renderInstructors()}
                        {activeTab === 'exams' && renderExams()}
                        {activeTab === 'student-logs' && renderStudentLogs()}
                        {activeTab === 'audit' && renderAuditTrail()}
                        {activeTab === 'research' && renderResearch()}
                        {activeTab === 'blockchain' && renderBlockchain()}
                    </>
                )}
            </div>

            {/* Modals */}
            {showAddInstructorModal && renderAddInstructorModal()}
            {showEditInstructorModal && editingInstructor && renderEditInstructorModal()}
            {showAddDepartmentModal && renderAddDepartmentModal()}
            {showAddBatchModal && renderAddBatchModal()}

            {/* Archived Record Drill-down Modal */}
            {showArchiveModal && archiveView && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-4xl shadow-xl max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-gray-800">
                                    🗄️ {archiveView.type === 'exam' ? 'Archived Exam' : 'Archived Class'}: {archiveView.record.title || archiveView.record.name}
                                </h3>
                                <p className="text-sm text-gray-500">
                                    Deleted by {archiveView.record.deleted_by_name || 'Unknown'} · {new Date(archiveView.record.deleted_at).toLocaleString()}
                                    {archiveView.record.deletion_reason ? ` · Reason: ${archiveView.record.deletion_reason}` : ''}
                                </p>
                            </div>
                            <button
                                onClick={() => setShowArchiveModal(false)}
                                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                            >
                                ×
                            </button>
                        </div>

                        {loadingArchive ? (
                            <div className="text-center py-12 text-gray-500">Loading archived details...</div>
                        ) : archiveView.type === 'exam' ? (
                            <div className="space-y-6">
                                {/* Attempts */}
                                <div>
                                    <h4 className="font-bold text-gray-800 mb-3">
                                        📝 Archived Attempts ({archivedAttempts.length})
                                    </h4>
                                    {archivedAttempts.length > 0 ? (
                                        <div className="border rounded-lg overflow-hidden">
                                            <table className="w-full text-sm">
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left">Student</th>
                                                        <th className="px-3 py-2 text-center">Score</th>
                                                        <th className="px-3 py-2 text-center">Blockchain</th>
                                                        <th className="px-3 py-2 text-left">Submitted</th>
                                                        <th className="px-3 py-2 text-center">Logs</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {archivedAttempts.map((att, i) => (
                                                        <>
                                                            <tr key={i} className="border-t hover:bg-gray-50">
                                                                <td className="px-3 py-2">{att.student_name || att.student_identifier || att.student_id}</td>
                                                                <td className="px-3 py-2 text-center font-medium">{att.score}%</td>
                                                                <td className="px-3 py-2 text-center">
                                                                    {att.blockchain_hash && att.blockchain_tx ? (
                                                                        <span className="text-green-600">✓ On-chain</span>
                                                                    ) : att.blockchain_hash ? (
                                                                        <span className="text-yellow-600">✓ Hash only</span>
                                                                    ) : (
                                                                        <span className="text-red-500">✗ None</span>
                                                                    )}
                                                                </td>
                                                                <td className="px-3 py-2 text-gray-500">
                                                                    {att.submitted_at ? new Date(att.submitted_at).toLocaleString() : '-'}
                                                                </td>
                                                                <td className="px-3 py-2 text-center">
                                                                    <button
                                                                        onClick={() => toggleAttemptLogs(att)}
                                                                        className="px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 text-xs"
                                                                    >
                                                                        {expandedAttemptLogs?.attemptId === att.original_id ? 'Hide' : `${att.archived_logs || 0} logs`}
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                            {expandedAttemptLogs?.attemptId === att.original_id && (
                                                                <tr key={`logs-${i}`}>
                                                                    <td colSpan="5" className="px-3 py-2 bg-gray-50">
                                                                        {expandedAttemptLogs.logs.length > 0 ? (
                                                                            <div className="max-h-48 overflow-y-auto space-y-1">
                                                                                {expandedAttemptLogs.logs.map((log, j) => (
                                                                                    <div key={j} className={`p-2 rounded text-xs ${
                                                                                        log.event_type === 'critical' ? 'bg-red-50 border-l-4 border-red-500' :
                                                                                        log.event_type === 'warning' ? 'bg-yellow-50 border-l-4 border-yellow-500' :
                                                                                        'bg-white border-l-4 border-gray-300'
                                                                                    }`}>
                                                                                        <span className="font-medium">{log.event_type}</span>
                                                                                        {log.event_data && <span className="text-gray-500"> — {JSON.stringify(log.event_data).slice(0, 120)}</span>}
                                                                                        <span className="text-gray-400 ml-2">
                                                                                            {log.timestamp ? new Date(log.timestamp).toLocaleString() : ''}
                                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <div className="text-xs text-gray-500 px-2">No archived logs</div>
                                                        )}
                                                    </td>
                                                </tr>
                                            )}
                                            </>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="text-center py-6 text-gray-500">No archived attempts</div>
                        )}
                    </div>

                    {/* Sessions */}
                        <div>
                            <h4 className="font-bold text-gray-800 mb-3">🖥️ Archived Sessions ({archivedSessions.length})</h4>
                            {archivedSessions.length > 0 ? (
                                <div className="border rounded-lg overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-3 py-2 text-left">Student</th>
                                                <th className="px-3 py-2 text-center">Status</th>
                                                <th className="px-3 py-2 text-left">Started</th>
                                                <th className="px-3 py-2 text-left">Submitted</th>
                                                <th className="px-3 py-2 text-left">Ended</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {archivedSessions.map((sess, i) => (
                                                <tr key={i} className="border-t hover:bg-gray-50">
                                                    <td className="px-3 py-2">{sess.student_name || sess.student_id}</td>
                                                    <td className="px-3 py-2 text-center">
                                                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                                                            sess.status === 'completed' ? 'bg-green-100 text-green-700' :
                                                            sess.status === 'active' ? 'bg-blue-100 text-blue-700' :
                                                            sess.status === 'locked' ? 'bg-red-100 text-red-700' :
                                                            'bg-gray-100 text-gray-600'
                                                        }`}>{sess.status}</span>
                                                    </td>
                                                    <td className="px-3 py-2 text-gray-500">{sess.started_at ? new Date(sess.started_at).toLocaleString() : '-'}</td>
                                                    <td className="px-3 py-2 text-gray-500">{sess.submitted_at ? new Date(sess.submitted_at).toLocaleString() : '-'}</td>
                                                    <td className="px-3 py-2 text-gray-500">{sess.ended_at ? new Date(sess.ended_at).toLocaleString() : '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="text-center py-6 text-gray-500">No archived sessions</div>
                            )}
                        </div>

                        {/* Heartbeats */}
                        <div>
                            <h4 className="font-bold text-gray-800 mb-3">💓 Archived Heartbeats ({archivedHeartbeats.length}{archivedHeartbeats.length >= 500 ? '+' : ''})</h4>
                            {archivedHeartbeats.length > 0 ? (
                                <div className="border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 sticky top-0">
                                            <tr>
                                                <th className="px-3 py-2 text-left">Student</th>
                                                <th className="px-3 py-2 text-center">Status</th>
                                                <th className="px-3 py-2 text-left">Timestamp</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {archivedHeartbeats.map((beat, i) => (
                                                <tr key={i} className="border-t">
                                                    <td className="px-3 py-2">{beat.student_name || beat.session_id}</td>
                                                    <td className="px-3 py-2 text-center">
                                                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                                                            beat.event_type === 'active' || beat.event_type === 'reconnected' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                        }`}>{beat.event_type}</span>
                                                    </td>
                                                    <td className="px-3 py-2 text-gray-500">{beat.timestamp ? new Date(beat.timestamp).toLocaleString() : '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="text-center py-6 text-gray-500">No archived heartbeats</div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div>
                        <h4 className="font-bold text-gray-800 mb-3">
                            👥 Archived Enrollments ({archivedEnrollments.length})
                        </h4>
                        {archivedEnrollments.length > 0 ? (
                            <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Student</th>
                                            <th className="px-3 py-2 text-left">Roll No</th>
                                            <th className="px-3 py-2 text-center">Status</th>
                                            <th className="px-3 py-2 text-left">Enrolled At</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {archivedEnrollments.map((enr, i) => (
                                            <tr key={i} className="border-t hover:bg-gray-50">
                                                <td className="px-3 py-2">{enr.student_name || enr.student_id}</td>
                                                <td className="px-3 py-2 text-gray-500">{enr.student_identifier || '-'}</td>
                                                <td className="px-3 py-2 text-center">
                                                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">{enr.status}</span>
                                                </td>
                                                <td className="px-3 py-2 text-gray-500">{enr.enrolled_at ? new Date(enr.enrolled_at).toLocaleString() : '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="text-center py-6 text-gray-500">No archived enrollments</div>
                        )}
                    </div>
                )}
                </div>
            </div>
        )}

            {/* Edit Student Modal */}
            {showEditStudentModal && editingStudent && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
                        <h3 className="text-lg font-bold text-gray-800 mb-4">Edit Student</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                                <input
                                    type="text"
                                    value={editingStudent.name}
                                    onChange={(e) => setEditingStudent({...editingStudent, name: e.target.value})}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                <input
                                    type="email"
                                    value={editingStudent.email}
                                    onChange={(e) => setEditingStudent({...editingStudent, email: e.target.value})}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Student ID</label>
                                <input
                                    type="text"
                                    value={editingStudent.student_id}
                                    onChange={(e) => setEditingStudent({...editingStudent, student_id: e.target.value})}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                                <select
                                    value={editingStudent.department_id}
                                    onChange={(e) => setEditingStudent({...editingStudent, department_id: e.target.value})}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="">Select Department</option>
                                    {departments.map(dept => (
                                        <option key={dept.id} value={dept.id}>{dept.name} ({dept.code})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Batch / Year</label>
                                <select
                                    value={editingStudent.batch_id}
                                    onChange={(e) => setEditingStudent({...editingStudent, batch_id: e.target.value})}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="">Select Batch</option>
                                    {batches.map(batch => (
                                        <option key={batch.id} value={batch.id}>{batch.name} ({batch.year})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Enrollment Status</label>
                                <select
                                    value={editingStudent.enrollment_status}
                                    onChange={(e) => setEditingStudent({...editingStudent, enrollment_status: e.target.value})}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="pending_admin">Pending Admin Approval</option>
                                    <option value="pending_face">Pending Face Enrollment</option>
                                    <option value="pending_instructor">Pending Class Assignment</option>
                                    <option value="enrolled">Enrolled</option>
                                    <option value="rejected">Rejected</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button 
                                onClick={() => { setShowEditStudentModal(false); setEditingStudent(null); }}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleUpdateStudent}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Session Details Modal */}
            {showSessionModal && sessionDetails && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-auto p-4">
                    <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-auto shadow-2xl">
                        {/* Header */}
                        <div className="sticky top-0 bg-white border-b p-6 flex justify-between items-start">
                            <div>
                                <h3 className="text-xl font-bold text-gray-800">Exam Session Details</h3>
                                <p className="text-gray-500">{sessionDetails.session.student_name} - {sessionDetails.session.exam_title}</p>
                            </div>
                            <button onClick={() => { setShowSessionModal(false); setSessionDetails(null); }} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Session Status */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <p className="text-xs text-gray-500 uppercase">Status</p>
                                    <p className={`font-bold ${sessionDetails.session.is_locked ? 'text-red-600' : 'text-green-600'}`}>
                                        {sessionDetails.session.is_locked ? '🔒 LOCKED' : '✅ Active'}
                                    </p>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <p className="text-xs text-gray-500 uppercase">Warnings</p>
                                    <p className="font-bold text-yellow-600">{sessionDetails.session.warning_count || 0}</p>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <p className="text-xs text-gray-500 uppercase">Violations</p>
                                    <p className="font-bold text-red-600">{sessionDetails.session.violation_count || 0}</p>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <p className="text-xs text-gray-500 uppercase">Time Left</p>
                                    <p className="font-bold text-gray-700">
                                        {sessionDetails.session.time_remaining ? `${Math.floor(sessionDetails.session.time_remaining / 60)}m` : '-'}
                                    </p>
                                </div>
                            </div>

                            {/* Lock Reason */}
                            {sessionDetails.session.is_locked && sessionDetails.session.lock_reason && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                    <p className="text-sm font-medium text-red-700">Lock Reason:</p>
                                    <p className="text-red-600">{sessionDetails.session.lock_reason}</p>
                                    <button
                                        onClick={() => handleUnlockSession(sessionDetails.session.id)}
                                        className="mt-3 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                                    >
                                        🔓 Unlock / Allow Retry
                                    </button>
                                </div>
                            )}

                            {/* Violation Timeline */}
                            <div>
                                <h4 className="font-semibold text-gray-800 mb-3">📋 Violation Log ({sessionDetails.violations?.length || 0})</h4>
                                <div className="bg-gray-50 rounded-lg max-h-80 overflow-auto">
                                    {(!sessionDetails.violations || sessionDetails.violations.length === 0) ? (
                                        <p className="p-4 text-gray-500 text-center">No violations recorded</p>
                                    ) : (
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-100 sticky top-0">
                                                <tr>
                                                    <th className="text-left p-3">Time</th>
                                                    <th className="text-left p-3">Type</th>
                                                    <th className="text-left p-3">Severity</th>
                                                    <th className="text-left p-3">Description</th>
                                                    <th className="text-left p-3">Tab Title</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {sessionDetails.violations.map((v, idx) => (
                                                    <tr key={idx} className={`${
                                                        v.severity === 'critical' ? 'bg-red-50' : 
                                                        v.severity === 'warning' ? 'bg-yellow-50' : ''
                                                    }`}>
                                                        <td className="p-3 text-gray-500 whitespace-nowrap">
                                                            {new Date(v.created_at).toLocaleTimeString()}
                                                        </td>
                                                        <td className="p-3 font-mono text-xs">
                                                            <span className={`px-2 py-1 rounded ${
                                                                v.violation_type?.includes('FACE') ? 'bg-purple-100 text-purple-700' :
                                                                v.violation_type?.includes('TAB') ? 'bg-orange-100 text-orange-700' :
                                                                'bg-gray-100 text-gray-700'
                                                            }`}>
                                                                {v.violation_type}
                                                            </span>
                                                        </td>
                                                        <td className="p-3">
                                                            <span className={`px-2 py-1 rounded text-xs ${
                                                                v.severity === 'critical' ? 'bg-red-100 text-red-700' :
                                                                v.severity === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                                                                'bg-blue-100 text-blue-700'
                                                            }`}>
                                                                {v.severity || 'info'}
                                                            </span>
                                                        </td>
                                                        <td className="p-3 text-gray-600 max-w-xs truncate">
                                                            {v.description}
                                                        </td>
                                                        <td className="p-3 text-gray-500 text-xs max-w-xs truncate">
                                                            {v.tab_title || '-'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>

                            {/* Heartbeat Timeline */}
                            {sessionDetails.heartbeats && sessionDetails.heartbeats.length > 0 && (
                                <div>
                                    <h4 className="font-semibold text-gray-800 mb-3">💓 Connection Log (Last 50)</h4>
                                    <div className="bg-gray-50 rounded-lg p-4 max-h-40 overflow-auto">
                                        <div className="flex flex-wrap gap-2">
                                            {sessionDetails.heartbeats.map((hb, idx) => (
                                                <span key={idx} className={`px-2 py-1 rounded text-xs ${
                                                    hb.status === 'active' ? 'bg-green-100 text-green-700' :
                                                    hb.status === 'reconnected' ? 'bg-blue-100 text-blue-700' :
                                                    'bg-red-100 text-red-700'
                                                }`}>
                                                    {new Date(hb.timestamp).toLocaleTimeString()} - {hb.status}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer Actions */}
                        <div className="sticky bottom-0 bg-gray-50 border-t p-4 flex justify-between">
                            <div className="flex gap-2">
                                {!sessionDetails.session.is_locked && (
                                    <button
                                        onClick={() => handleLockSession(sessionDetails.session.id)}
                                        className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
                                    >
                                        🔒 Lock Session
                                    </button>
                                )}
                            </div>
                            <button
                                onClick={() => { setShowSessionModal(false); setSessionDetails(null); }}
                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;
