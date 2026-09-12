import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import usePagination from '../hooks/usePagination.js';
import Pagination from '../components/Pagination.jsx';

import { getApiBase } from '../utils/apiBase.js';

const API_BASE = getApiBase();

/**
 * Instructor Dashboard – central hub for instructors to manage classes, exams,
 * students, and proctoring results. Renders tab-based views for overview stats,
 * class management, pending student approvals, exam CRUD, and related modals.
 */
const InstructorDashboard = () => {
    const { instructorId } = useParams();
    const navigate = useNavigate();
    
    const [activeTab, setActiveTab] = useState('dashboard');
    const [loading, setLoading] = useState(false);
    
    // Data states
    const [instructorInfo, setInstructorInfo] = useState(null);
    const [dashboardStats, setDashboardStats] = useState(null);
    const [classes, setClasses] = useState([]);
    const [pendingStudents, setPendingStudents] = useState([]);
    const [selectedClass, setSelectedClass] = useState(null);
    const [selectedClassInfo, setSelectedClassInfo] = useState(null);
    const [classStudents, setClassStudents] = useState([]);
    const [classStudentSearch, setClassStudentSearch] = useState('');
    const [exams, setExams] = useState([]);
    const [classToDelete, setClassToDelete] = useState(null);
    const [deleteReason, setDeleteReason] = useState('');
    const [showDeleteClassModal, setShowDeleteClassModal] = useState(false);

    // Class students list search + pagination
    const filteredClassStudents = classStudents.filter(s =>
        (s.name || '').toLowerCase().includes(classStudentSearch.toLowerCase()) ||
        (s.email || '').toLowerCase().includes(classStudentSearch.toLowerCase()) ||
        (s.student_id || '').toLowerCase().includes(classStudentSearch.toLowerCase())
    );
    const classStudentPager = usePagination(filteredClassStudents, 8);
    
    // Modal states
    const [showCreateClassModal, setShowCreateClassModal] = useState(false);
    const [showCreateExamModal, setShowCreateExamModal] = useState(false);
    const [showAddStudentModal, setShowAddStudentModal] = useState(false);
    const [showClassStudentsModal, setShowClassStudentsModal] = useState(false);
    const [showEditExamModal, setShowEditExamModal] = useState(false);
    const [editingExam, setEditingExam] = useState(null);
    const [studentToAdd, setStudentToAdd] = useState(null); // Track which student we're adding
    
    // Form states
    const [newClass, setNewClass] = useState({ name: '', code: '', description: '' });
    const [showExportDropdown, setShowExportDropdown] = useState(null);
    
    // Export functionality for instructors
    const exportClassStudents = (format) => {
        if (!classStudents.length || !selectedClassInfo) return;
        
        const exportData = {
            class: {
                name: selectedClassInfo.name,
                code: selectedClassInfo.code
            },
            exportedAt: new Date().toISOString(),
            students: classStudents.map(s => ({
                name: s.name,
                email: s.email,
                student_id: s.student_id,
                batch: s.batch_name,
                enrolled_at: s.enrolled_at,
                exam_attempts: s.exam_attempts
            }))
        };

        if (format === 'csv') {
            const headers = ['Name', 'Email', 'Student ID', 'Batch', 'Enrolled At', 'Exam Attempts'];
            const rows = exportData.students.map(s => [
                `"${s.name || ''}"`,
                `"${s.email || ''}"`,
                `"${s.student_id || ''}"`,
                `"${s.batch || ''}"`,
                `"${s.enrolled_at || ''}"`,
                s.exam_attempts || 0
            ]);
            const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `class_${selectedClassInfo.code}_students_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } else {
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `class_${selectedClassInfo.code}_students_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }
        setShowExportDropdown(null);
    };
    
    const [newExam, setNewExam] = useState({ 
        title: '', 
        description: '', 
        class_id: '', 
        duration_minutes: 60,
        start_time: '',
        end_time: '',
        questions: []
    });
    
    // MCQ Builder state
    const [currentQuestion, setCurrentQuestion] = useState({
        question: '',
        options: ['', '', '', ''],
        correctAnswerIndex: null
    });

    /**
     * Data fetching – functions that retrieve dashboard stats, classes,
     * pending students, class rosters, and exams from the API. Each
     * fetcher sets the corresponding state and manages loading state.
     */
    // ═══════════════════════════════════════════════════════════════════════════════
    // DATA FETCHING
    // ═══════════════════════════════════════════════════════════════════════════════

    const fetchDashboard = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/instructors/${instructorId}/dashboard`);
            const data = await res.json();
            if (data.success) {
                setDashboardStats(data.stats);
                if (data.instructor) {
                    setInstructorInfo(data.instructor);
                }
            }
        } catch (err) {
            console.error('Failed to fetch dashboard:', err);
        }
        setLoading(false);
    };

    const fetchClasses = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/instructors/${instructorId}/classes`);
            const data = await res.json();
            if (data.success) {
                setClasses(data.classes);
            }
        } catch (err) {
            console.error('Failed to fetch classes:', err);
        }
        setLoading(false);
    };

    const fetchPendingStudents = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/instructors/${instructorId}/pending-students`);
            const data = await res.json();
            if (data.success) {
                setPendingStudents(data.students);
            }
        } catch (err) {
            console.error('Failed to fetch pending students:', err);
        }
        setLoading(false);
    };

    const fetchClassStudents = async (classId) => {
        try {
            const res = await fetch(`${API_BASE}/instructors/${instructorId}/classes/${classId}/students`);
            const data = await res.json();
            if (data.success) {
                setClassStudents(data.students);
                setSelectedClassInfo(data.class);
            }
        } catch (err) {
            console.error('Failed to fetch class students:', err);
        }
    };

    const fetchExams = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/instructors/${instructorId}/exams`);
            const data = await res.json();
            if (data.success) {
                setExams(data.exams);
            }
        } catch (err) {
            console.error('Failed to fetch exams:', err);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (activeTab === 'dashboard') fetchDashboard();
        else if (activeTab === 'classes') fetchClasses();
        else if (activeTab === 'students') fetchPendingStudents();
        else if (activeTab === 'exams') fetchExams();
    }, [activeTab, instructorId]);

    /**
     * Actions – mutation handlers for creating, updating, and deleting
     * classes and exams, as well as managing student enrollment (add/remove).
     * Each handler POSTs/PUTs/DELETEs via the API and refreshes relevant state.
     */
    // ═══════════════════════════════════════════════════════════════════════════════
    // ACTIONS
    // ═══════════════════════════════════════════════════════════════════════════════

    const handleCreateClass = async () => {
        if (!newClass.name || !newClass.code) {
            return alert('Please fill class name and code');
        }
        try {
            const res = await fetch(`${API_BASE}/instructors/${instructorId}/classes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newClass)
            });
            const data = await res.json();
            if (data.success) {
                alert('Class created successfully!');
                setShowCreateClassModal(false);
                setNewClass({ name: '', code: '', description: '' });
                fetchClasses();
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Failed to create class');
        }
    };

    const handleAddStudentToClass = async (studentId) => {
        if (!selectedClass) {
            return alert('Please select a class first');
        }
        try {
            const res = await fetch(`${API_BASE}/instructors/${instructorId}/classes/${selectedClass}/students`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ student_id: studentId })
            });
            const data = await res.json();
            if (data.success) {
                alert('Student added to class!');
                setShowAddStudentModal(false);
                setStudentToAdd(null);
                setSelectedClass(null);
                fetchPendingStudents();
                fetchClasses();
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Failed to add student');
        }
    };

    const openAddStudentModal = async (student) => {
        setStudentToAdd(student);
        setSelectedClass(null);
        setShowAddStudentModal(true);
        // Fetch classes when modal opens to ensure dropdown is populated
        try {
            const res = await fetch(`${API_BASE}/instructors/${instructorId}/classes`);
            const data = await res.json();
            if (data.success) {
                setClasses(data.classes);
            }
        } catch (err) {
            console.error('Failed to fetch classes for modal:', err);
        }
    };

    const handleRemoveStudentFromClass = async (classId, studentId, studentName) => {
        if (!confirm(`Are you sure you want to remove ${studentName} from this class?`)) {
            return;
        }
        try {
            const res = await fetch(`${API_BASE}/instructors/${instructorId}/classes/${classId}/students/${studentId}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                alert('Student removed from class');
                fetchClassStudents(classId);
                fetchClasses(); // Refresh class counts
                fetchPendingStudents(); // Refresh pending list
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Failed to remove student');
        }
    };

    const openDeleteClassModal = (cls) => {
        setClassToDelete(cls);
        setDeleteReason('');
        setShowDeleteClassModal(true);
    };

    const handleDeleteClass = async () => {
        if (!classToDelete) return;
        
        try {
            const res = await fetch(`${API_BASE}/instructors/${instructorId}/classes/${classToDelete.id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: deleteReason || 'No reason provided' })
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                setShowDeleteClassModal(false);
                setClassToDelete(null);
                setDeleteReason('');
                fetchClasses();
                fetchDashboard();
                fetchPendingStudents();
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Failed to delete class');
        }
    };

    const handleCreateExam = async () => {
        if (!newExam.title || !newExam.class_id || !newExam.duration_minutes) {
            return alert('Please fill all required fields');
        }
        if (newExam.questions.length === 0) {
            return alert('Please add at least one question');
        }
        try {
            const res = await fetch(`${API_BASE}/instructors/${instructorId}/exams`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: newExam.title,
                    description: newExam.description || null,
                    class_id: newExam.class_id,
                    duration_minutes: newExam.duration_minutes,
                    start_time: newExam.start_time || null,
                    end_time: newExam.end_time || null,
                    randomize_questions: newExam.randomize_questions || false,
                    questions_json: newExam.questions
                })
            });
            const data = await res.json();
            if (data.success) {
                alert('Exam created successfully with ' + newExam.questions.length + ' questions!');
                setShowCreateExamModal(false);
                setNewExam({ title: '', description: '', class_id: '', duration_minutes: 60, start_time: '', end_time: '', questions: [] });
                setCurrentQuestion({ question: '', options: ['', '', '', ''], correctAnswerIndex: null });
                fetchExams();
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Failed to create exam');
        }
    };
    
    // Add question to exam
    const handleAddQuestion = () => {
        if (!currentQuestion.question.trim()) {
            return alert('Please enter a question');
        }
        const filledOptions = currentQuestion.options.filter(opt => opt.trim());
        if (filledOptions.length < 2) {
            return alert('Please provide at least 2 options');
        }
        if (currentQuestion.correctAnswerIndex === null) {
            return alert('Please select the correct answer');
        }
        
        const correctAnswer = currentQuestion.options[currentQuestion.correctAnswerIndex];
        if (!correctAnswer || !correctAnswer.trim()) {
            return alert('The selected correct answer cannot be empty');
        }
        
        setNewExam({
            ...newExam,
            questions: [...newExam.questions, {
                question: currentQuestion.question,
                options: filledOptions,
                correctAnswer: correctAnswer
            }]
        });
        
        // Reset current question
        setCurrentQuestion({
            question: '',
            options: ['', '', '', ''],
            correctAnswerIndex: null
        });
    };
    
    // Remove question from exam
    const handleRemoveQuestion = (index) => {
        setNewExam({
            ...newExam,
            questions: newExam.questions.filter((_, i) => i !== index)
        });
    };

    const handlePublishExam = async (examId) => {
        try {
            const res = await fetch(`${API_BASE}/instructors/${instructorId}/exams/${examId}/publish`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.success) {
                alert('Exam published!');
                fetchExams();
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Failed to publish exam');
        }
    };

    const handleUnpublishExam = async (examId) => {
        if (!confirm('Unpublish this exam? Students will no longer be able to take it.')) return;
        try {
            const res = await fetch(`${API_BASE}/instructors/${instructorId}/exams/${examId}/unpublish`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.success) {
                alert('Exam unpublished!');
                fetchExams();
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Failed to unpublish exam');
        }
    };

    const handleDuplicateExam = async (exam) => {
        try {
            const res = await fetch(`${API_BASE}/instructors/${instructorId}/exams/${exam.id}/duplicate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (data.success) {
                alert(`Exam duplicated as draft "${data.exam.title}" with ${data.questionCount} question(s). Set the schedule and publish when ready.`);
                fetchExams();
            } else {
                alert('Error: ' + (data.message || 'Failed to duplicate exam'));
            }
        } catch {
            alert('Failed to duplicate exam');
        }
    };

    const handleDeleteExam = async (examId, examTitle) => {
        if (!confirm(`Delete exam "${examTitle}"?\n\nThis will also delete all student attempts for this exam.`)) return;
        try {
            const res = await fetch(`${API_BASE}/instructors/${instructorId}/exams/${examId}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                fetchExams();
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Failed to delete exam');
        }
    };

    const handleEditExam = async (exam) => {
        // Fetch full exam details including questions
        try {
            const res = await fetch(`${API_BASE}/instructors/${instructorId}/exams/${exam.id}`);
            const data = await res.json();
            if (data.success) {
                const examData = data.exam;
                setEditingExam({
                    id: examData.id,
                    title: examData.title || '',
                    description: examData.description || '',
                    class_id: examData.class_id || '',
                    duration_minutes: examData.duration_minutes || 60,
                    start_time: examData.start_time ? examData.start_time.slice(0, 16) : '',
                    end_time: examData.end_time ? examData.end_time.slice(0, 16) : '',
                    randomize_questions: examData.randomize_questions || false,
                    questions: examData.questions_json || []
                });
                setShowEditExamModal(true);
            } else {
                alert('Error loading exam details: ' + data.message);
            }
        } catch (err) {
            console.error('Failed to fetch exam:', err);
            alert('Failed to load exam details');
        }
    };

    const handleUpdateExam = async () => {
        if (!editingExam.title || !editingExam.duration_minutes) {
            return alert('Please fill all required fields');
        }
        if (editingExam.questions.length === 0) {
            return alert('Please add at least one question');
        }
        try {
            const res = await fetch(`${API_BASE}/instructors/${instructorId}/exams/${editingExam.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: editingExam.title,
                    description: editingExam.description || null,
                    duration_minutes: editingExam.duration_minutes,
                    start_time: editingExam.start_time || null,
                    end_time: editingExam.end_time || null,
                    randomize_questions: editingExam.randomize_questions || false,
                    questions_json: editingExam.questions
                })
            });
            const data = await res.json();
            if (data.success) {
                alert('Exam updated successfully!');
                setShowEditExamModal(false);
                setEditingExam(null);
                fetchExams();
            } else {
                alert('Error: ' + data.message);
            }
        } catch {
            alert('Failed to update exam');
        }
    };

    // Edit exam question handlers
    const handleEditExamAddQuestion = () => {
        if (!currentQuestion.question.trim()) {
            return alert('Please enter a question');
        }
        const filledOptions = currentQuestion.options.filter(opt => opt.trim());
        if (filledOptions.length < 2) {
            return alert('Please provide at least 2 options');
        }
        if (currentQuestion.correctAnswerIndex === null) {
            return alert('Please select the correct answer');
        }
        
        const correctAnswer = currentQuestion.options[currentQuestion.correctAnswerIndex];
        if (!correctAnswer || !correctAnswer.trim()) {
            return alert('The selected correct answer cannot be empty');
        }
        
        setEditingExam({
            ...editingExam,
            questions: [...editingExam.questions, {
                question: currentQuestion.question,
                options: filledOptions,
                correctAnswer: correctAnswer
            }]
        });
        
        setCurrentQuestion({
            question: '',
            options: ['', '', '', ''],
            correctAnswerIndex: null
        });
    };

    const handleEditExamRemoveQuestion = (index) => {
        setEditingExam({
            ...editingExam,
            questions: editingExam.questions.filter((_, i) => i !== index)
        });
    };

    const handleLogout = () => {
        localStorage.clear();
        navigate('/login');
    };

    /**
     * Render functions – each returns the JSX for a major tab view:
     * dashboard overview, class cards, pending students table, and exam list.
     */
    // ═══════════════════════════════════════════════════════════════════════════════
    // RENDER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════════

    /** Renders the dashboard overview: stat cards (classes, students, exams, pending) and quick-action buttons. */
    const renderDashboard = () => (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">Dashboard Overview</h2>
            
            {dashboardStats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-white rounded-xl shadow-sm border p-6">
                        <div className="text-3xl font-bold text-indigo-600">{dashboardStats.total_classes}</div>
                        <div className="text-gray-500 text-sm mt-1">My Classes</div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border p-6">
                        <div className="text-3xl font-bold text-green-600">{dashboardStats.total_students}</div>
                        <div className="text-gray-500 text-sm mt-1">Total Students</div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border p-6">
                        <div className="text-3xl font-bold text-purple-600">{dashboardStats.total_exams}</div>
                        <div className="text-gray-500 text-sm mt-1">Exams Created</div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border p-6">
                        <div className="text-3xl font-bold text-orange-600">{dashboardStats.pending_students}</div>
                        <div className="text-gray-500 text-sm mt-1">Pending Students</div>
                    </div>
                </div>
            )}

            {/* Quick Actions */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
                <h3 className="font-semibold text-gray-800 mb-4">Quick Actions</h3>
                <div className="flex gap-4 flex-wrap">
                    <button 
                        onClick={() => { setActiveTab('classes'); setShowCreateClassModal(true); }}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                        + Create Class
                    </button>
                    <button 
                        onClick={() => { setActiveTab('exams'); setShowCreateExamModal(true); }}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                        + Create Exam
                    </button>
                    <button 
                        onClick={() => setActiveTab('students')}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                    >
                        Review Pending Students
                    </button>
                </div>
            </div>
        </div>
    );

    /** Renders the classes tab: grid of class cards with stats, create/delete actions, and a link to view enrolled students. */
    const renderClasses = () => (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">My Classes</h2>
                <button 
                    onClick={() => setShowCreateClassModal(true)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                    + Create Class
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {classes.map(cls => (
                    <div key={cls.id} className="bg-white rounded-xl shadow-sm border p-6">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="font-bold text-gray-800">{cls.name}</h3>
                                <p className="text-sm text-gray-500">Code: {cls.code}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`px-2 py-1 text-xs rounded ${cls.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                    {cls.is_active ? 'Active' : 'Inactive'}
                                </span>
                                <button
                                    onClick={() => openDeleteClassModal(cls)}
                                    className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                                    title="Delete class"
                                >
                                    🗑️
                                </button>
                            </div>
                        </div>
                        <p className="text-sm text-gray-600 mb-4">{cls.description || 'No description'}</p>
                        <div className="flex justify-between items-center text-sm text-gray-500 mb-4">
                            <span>👥 {cls.student_count || 0} students</span>
                            <span>📝 {cls.exam_count || 0} exams</span>
                        </div>
                        <button 
                            onClick={() => {
                                setSelectedClass(cls.id);
                                fetchClassStudents(cls.id);
                                setShowClassStudentsModal(true);
                            }}
                            className="w-full py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 font-medium text-sm"
                        >
                            View Students →
                        </button>
                    </div>
                ))}
            </div>

            {classes.length === 0 && (
                <div className="bg-white rounded-xl shadow-sm border p-12 text-center text-gray-500">
                    No classes created yet. Create your first class to get started!
                </div>
            )}
        </div>
    );

    /** Renders the pending-students tab: table of unassigned students from the instructor's department with an "Add to Class" action. */
    const renderStudents = () => (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Pending Students</h2>
                    <p className="text-gray-500 text-sm">Students from your department waiting to be added to classes</p>
                </div>
            </div>

            {pendingStudents.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border p-12 text-center text-gray-500">
                    No pending students from your department
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">Name</th>
                                <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">Student ID</th>
                                <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">Email</th>
                                <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">Batch</th>
                                <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pendingStudents.map(student => (
                                <tr key={student.id} className="border-t hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium">{student.name}</td>
                                    <td className="px-6 py-4">{student.student_id}</td>
                                    <td className="px-6 py-4 text-sm text-gray-500">{student.email}</td>
                                    <td className="px-6 py-4">{student.batch_name}</td>
                                    <td className="px-6 py-4">
                                        <button 
                                            onClick={() => openAddStudentModal(student)}
                                            className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                                        >
                                            ➕ Add to Class
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );

    /** Renders the exams tab: grid of exam cards showing publish status, question count, duration, attempts, and CRUD actions. */
    const renderExams = () => (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">My Exams</h2>
                <button 
                    onClick={() => {
                        fetchClasses(); // Make sure classes are loaded
                        setShowCreateExamModal(true);
                    }}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                    + Create MCQ Exam
                </button>
            </div>

            {exams.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border p-12 text-center text-gray-500">
                    No exams created yet. Create your first MCQ exam!
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {exams.map(exam => {
                        const questionCount = exam.questions_json ? 
                            (Array.isArray(exam.questions_json) ? exam.questions_json.length : 
                             typeof exam.questions_json === 'string' ? JSON.parse(exam.questions_json).length : 0) : 0;
                        
                        return (
                            <div key={exam.id} className="bg-white rounded-xl shadow-sm border p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="font-bold text-gray-800">{exam.title}</h3>
                                        <p className="text-sm text-gray-500">Class: {exam.class_name}</p>
                                        <p className="text-xs text-purple-600 font-mono">Exam ID: {exam.id}</p>
                                    </div>
                                    <span className={`px-2 py-1 text-xs rounded ${exam.is_published ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                        {exam.is_published ? 'Published' : 'Draft'}
                                    </span>
                                </div>
                                <div className="grid grid-cols-3 gap-4 text-sm mb-4 bg-gray-50 rounded-lg p-3">
                                    <div className="text-center">
                                        <div className="text-lg font-bold text-indigo-600">{questionCount}</div>
                                        <div className="text-gray-500 text-xs">Questions</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-lg font-bold text-green-600">{exam.duration_minutes}</div>
                                        <div className="text-gray-500 text-xs">Minutes</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-lg font-bold text-purple-600">{exam.attempt_count || 0}</div>
                                        <div className="text-gray-500 text-xs">Attempts</div>
                                    </div>
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                    {!exam.is_published ? (
                                        <button 
                                            onClick={() => handlePublishExam(exam.id)}
                                            className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                                        >
                                            ✅ Publish
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={() => handleUnpublishExam(exam.id)}
                                            className="px-3 py-1 bg-yellow-100 text-yellow-700 text-sm rounded hover:bg-yellow-200"
                                        >
                                            ⏸️ Unpublish
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => navigate(`/instructor/${instructorId}/exam/${exam.id}/results`)}
                                        className="px-3 py-1 bg-indigo-100 text-indigo-700 text-sm rounded hover:bg-indigo-200"
                                    >
                                        📊 Results
                                    </button>
                                    <button 
                                        onClick={() => handleEditExam(exam)}
                                        className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded hover:bg-blue-200"
                                    >
                                        ✏️ Edit
                                    </button>
                                    <button 
                                        onClick={() => handleDuplicateExam(exam)}
                                        className="px-3 py-1 bg-purple-100 text-purple-700 text-sm rounded hover:bg-purple-200"
                                    >
                                        📄 Duplicate
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteExam(exam.id, exam.title)}
                                        className="px-3 py-1 text-red-500 hover:bg-red-50 text-sm rounded"
                                    >
                                        🗑️ Delete
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );

    /**
     * Modals – overlay dialogs for creating classes/exams, adding students
     * to classes, viewing enrolled students, editing exams, and confirming
     * destructive actions (delete class).
     */
    // ═══════════════════════════════════════════════════════════════════════════════
    // MODALS
    // ═══════════════════════════════════════════════════════════════════════════════

    const renderDeleteClassModal = () => (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md">
                <h3 className="text-xl font-bold mb-4 text-red-600">⚠️ Delete Class</h3>
                
                {classToDelete && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                        <div className="font-medium text-gray-800">{classToDelete.name}</div>
                        <div className="text-sm text-gray-600">Code: {classToDelete.code}</div>
                        <div className="text-sm text-gray-500 mt-2">
                            👥 {classToDelete.student_count || 0} students enrolled
                        </div>
                        <div className="text-sm text-gray-500">
                            📝 {classToDelete.exam_count || 0} exams
                        </div>
                    </div>
                )}

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-sm text-yellow-800">
                    <strong>Warning:</strong> This will delete the class and all associated exams, attempts, and proctor logs. 
                    All data will be archived for audit purposes.
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Deletion (optional)</label>
                        <textarea
                            value={deleteReason}
                            onChange={(e) => setDeleteReason(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500"
                            rows="2"
                            placeholder="E.g., Course ended, duplicate class..."
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <button 
                        onClick={() => {
                            setShowDeleteClassModal(false);
                            setClassToDelete(null);
                            setDeleteReason('');
                        }}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleDeleteClass}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                        🗑️ Delete Class
                    </button>
                </div>
            </div>
        </div>
    );

    const renderAddStudentModal = () => (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md">
                <h3 className="text-xl font-bold mb-4">Add Student to Class</h3>
                
                {studentToAdd && (
                    <div className="bg-gray-50 rounded-lg p-4 mb-4">
                        <div className="text-sm text-gray-500 mb-1">Student Details</div>
                        <div className="font-medium text-lg">{studentToAdd.name}</div>
                        <div className="text-sm text-gray-600">{studentToAdd.student_id}</div>
                        <div className="text-sm text-gray-500">{studentToAdd.email}</div>
                    </div>
                )}

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Select Class *</label>
                        <select 
                            value={selectedClass || ''} 
                            onChange={(e) => setSelectedClass(parseInt(e.target.value))}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            disabled={classes.length === 0}
                        >
                            <option value="">{classes.length === 0 ? 'Loading classes...' : 'Choose a class...'}</option>
                            {classes.map(cls => (
                                <option key={cls.id} value={cls.id}>
                                    {cls.name} ({cls.code}) - {cls.student_count || 0} students
                                </option>
                            ))}
                        </select>
                        {classes.length === 0 && (
                            <p className="text-sm text-gray-500 mt-1">Loading your classes...</p>
                        )}
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <button 
                        onClick={() => {
                            setShowAddStudentModal(false);
                            setStudentToAdd(null);
                            setSelectedClass(null);
                        }}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={() => studentToAdd && handleAddStudentToClass(studentToAdd.id)}
                        disabled={!selectedClass}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Add to Class
                    </button>
                </div>
            </div>
        </div>
    );

    const renderCreateClassModal = () => (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md">
                <h3 className="text-xl font-bold mb-4">Create New Class</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Class Name *</label>
                        <input 
                            type="text"
                            value={newClass.name}
                            onChange={(e) => setNewClass({...newClass, name: e.target.value})}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            placeholder="Data Structures"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Class Code *</label>
                        <input 
                            type="text"
                            value={newClass.code}
                            onChange={(e) => setNewClass({...newClass, code: e.target.value})}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            placeholder="CS201"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea 
                            value={newClass.description}
                            onChange={(e) => setNewClass({...newClass, description: e.target.value})}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                            rows="3"
                            placeholder="Optional description..."
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                    <button 
                        onClick={() => setShowCreateClassModal(false)}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleCreateClass}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                        Create Class
                    </button>
                </div>
            </div>
        </div>
    );

    const renderCreateExamModal = () => (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto py-8">
            <div className="bg-white rounded-xl p-6 w-full max-w-4xl mx-4 my-auto">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold">Create MCQ Exam</h3>
                    <button 
                        onClick={() => {
                            setShowCreateExamModal(false);
                            setNewExam({ title: '', description: '', class_id: '', duration_minutes: 60, start_time: '', end_time: '', questions: [] });
                            setCurrentQuestion({ question: '', options: ['', '', '', ''], correctAnswerIndex: null });
                        }}
                        className="text-gray-400 hover:text-gray-600 text-2xl"
                    >
                        ×
                    </button>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left: Exam Details & Question Builder */}
                    <div className="space-y-4">
                        <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                            <h4 className="font-semibold text-gray-700">Exam Details</h4>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Exam Title *</label>
                                <input 
                                    type="text"
                                    value={newExam.title}
                                    onChange={(e) => setNewExam({...newExam, title: e.target.value})}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                                    placeholder="Midterm Exam"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Class *</label>
                                    <select 
                                        value={newExam.class_id}
                                        onChange={(e) => setNewExam({...newExam, class_id: parseInt(e.target.value)})}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                                    >
                                        <option value="">Select...</option>
                                        {classes.map(cls => (
                                            <option key={cls.id} value={cls.id}>{cls.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min) *</label>
                                    <input 
                                        type="number"
                                        value={newExam.duration_minutes}
                                        onChange={(e) => setNewExam({...newExam, duration_minutes: parseInt(e.target.value)})}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                                        min="5"
                                    />
                                </div>
                            </div>
                            
                            {/* Scheduling Options */}
                            <div className="border-t pt-4 mt-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <input 
                                        type="checkbox" 
                                        id="enableScheduling"
                                        checked={newExam.enableScheduling || false}
                                        onChange={(e) => setNewExam({...newExam, enableScheduling: e.target.checked})}
                                        className="rounded text-green-600"
                                    />
                                    <label htmlFor="enableScheduling" className="text-sm font-medium text-gray-700">
                                        📅 Set exam availability window
                                    </label>
                                </div>
                                
                                {newExam.enableScheduling && (
                                    <div className="grid grid-cols-2 gap-3 bg-blue-50 p-3 rounded-lg">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">Available From</label>
                                            <input 
                                                type="datetime-local"
                                                value={newExam.start_time || ''}
                                                onChange={(e) => setNewExam({...newExam, start_time: e.target.value})}
                                                className="w-full px-2 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">Available Until</label>
                                            <input 
                                                type="datetime-local"
                                                value={newExam.end_time || ''}
                                                onChange={(e) => setNewExam({...newExam, end_time: e.target.value})}
                                                className="w-full px-2 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <p className="col-span-2 text-xs text-blue-600">
                                            💡 Students can only start the exam during this window
                                        </p>
                                    </div>
                                )}
                                
                                {/* Question Randomization */}
                                <div className="flex items-center gap-2 mt-3">
                                    <input 
                                        type="checkbox" 
                                        id="randomizeQuestions"
                                        checked={newExam.randomize_questions || false}
                                        onChange={(e) => setNewExam({...newExam, randomize_questions: e.target.checked})}
                                        className="rounded text-green-600"
                                    />
                                    <label htmlFor="randomizeQuestions" className="text-sm font-medium text-gray-700">
                                        🔀 Randomize question order for each student
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* MCQ Builder */}
                        <div className="bg-green-50 rounded-lg p-4 space-y-4 border-2 border-green-200">
                            <h4 className="font-semibold text-green-700">➕ Add Question</h4>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Question Text</label>
                                <textarea 
                                    value={currentQuestion.question}
                                    onChange={(e) => setCurrentQuestion({...currentQuestion, question: e.target.value})}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                                    rows="2"
                                    placeholder="Enter your question here..."
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">Options (select correct answer)</label>
                                {currentQuestion.options.map((opt, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <input 
                                            type="radio"
                                            name="correctAnswer"
                                            checked={currentQuestion.correctAnswerIndex === idx}
                                            onChange={() => setCurrentQuestion({...currentQuestion, correctAnswerIndex: idx})}
                                            className="w-4 h-4 text-green-600"
                                        />
                                        <span className="w-6 text-sm font-medium text-gray-500">{String.fromCharCode(65 + idx)}.</span>
                                        <input 
                                            type="text"
                                            value={opt}
                                            onChange={(e) => {
                                                const newOptions = [...currentQuestion.options];
                                                newOptions[idx] = e.target.value;
                                                setCurrentQuestion({...currentQuestion, options: newOptions});
                                            }}
                                            className={`flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 ${currentQuestion.correctAnswerIndex === idx ? 'border-green-500 bg-green-50' : ''}`}
                                            placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                                        />
                                    </div>
                                ))}
                            </div>
                            <button 
                                onClick={handleAddQuestion}
                                className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                            >
                                + Add Question to Exam
                            </button>
                        </div>
                    </div>

                    {/* Right: Question Preview */}
                    <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="font-semibold text-gray-700">📋 Questions ({newExam.questions.length})</h4>
                        </div>
                        
                        {newExam.questions.length === 0 ? (
                            <div className="text-center text-gray-400 py-12 border-2 border-dashed rounded-lg">
                                <p className="text-4xl mb-2">📝</p>
                                <p>No questions added yet</p>
                                <p className="text-sm">Add questions using the form on the left</p>
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-96 overflow-y-auto">
                                {newExam.questions.map((q, idx) => (
                                    <div key={idx} className="bg-white rounded-lg p-3 border shadow-sm">
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <p className="font-medium text-sm text-gray-800">
                                                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs mr-2">Q{idx + 1}</span>
                                                    {q.question}
                                                </p>
                                                <div className="mt-2 space-y-1">
                                                    {q.options.map((opt, optIdx) => (
                                                        <p key={optIdx} className={`text-xs px-2 py-1 rounded ${opt === q.correctAnswer ? 'bg-green-100 text-green-700 font-medium' : 'text-gray-500'}`}>
                                                            {String.fromCharCode(65 + optIdx)}. {opt} {opt === q.correctAnswer && '✓'}
                                                        </p>
                                                    ))}
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => handleRemoveQuestion(idx)}
                                                className="text-red-400 hover:text-red-600 ml-2"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                    <button 
                        onClick={() => {
                            setShowCreateExamModal(false);
                            setNewExam({ title: '', description: '', class_id: '', duration_minutes: 60, start_time: '', end_time: '', questions: [] });
                            setCurrentQuestion({ question: '', options: ['', '', '', ''], correctAnswerIndex: null });
                        }}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleCreateExam}
                        disabled={newExam.questions.length === 0}
                        className={`px-6 py-2 rounded-lg font-medium ${
                            newExam.questions.length > 0 
                                ? 'bg-green-600 text-white hover:bg-green-700' 
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                    >
                        Create Exam ({newExam.questions.length} Questions)
                    </button>
                </div>
            </div>
        </div>
    );

    // Edit Exam Modal
    const renderEditExamModal = () => editingExam && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto py-8">
            <div className="bg-white rounded-xl p-6 w-full max-w-4xl mx-4 my-auto">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold">✏️ Edit Exam</h3>
                    <button 
                        onClick={() => {
                            setShowEditExamModal(false);
                            setEditingExam(null);
                            setCurrentQuestion({ question: '', options: ['', '', '', ''], correctAnswerIndex: null });
                        }}
                        className="text-gray-400 hover:text-gray-600 text-2xl"
                    >
                        ×
                    </button>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left: Exam Details & Question Builder */}
                    <div className="space-y-4">
                        <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                            <h4 className="font-semibold text-gray-700">Exam Details</h4>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Exam Title *</label>
                                <input 
                                    type="text"
                                    value={editingExam.title}
                                    onChange={(e) => setEditingExam({...editingExam, title: e.target.value})}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min) *</label>
                                <input 
                                    type="number"
                                    value={editingExam.duration_minutes}
                                    onChange={(e) => setEditingExam({...editingExam, duration_minutes: parseInt(e.target.value)})}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    min="5"
                                />
                            </div>
                            
                            {/* Scheduling Options */}
                            <div className="border-t pt-4 mt-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <input 
                                        type="checkbox" 
                                        id="editEnableScheduling"
                                        checked={editingExam.enableScheduling || (editingExam.start_time || editingExam.end_time ? true : false)}
                                        onChange={(e) => setEditingExam({
                                            ...editingExam, 
                                            enableScheduling: e.target.checked,
                                            start_time: e.target.checked ? editingExam.start_time : '',
                                            end_time: e.target.checked ? editingExam.end_time : ''
                                        })}
                                        className="rounded text-blue-600"
                                    />
                                    <label htmlFor="editEnableScheduling" className="text-sm font-medium text-gray-700">
                                        📅 Set exam availability window
                                    </label>
                                </div>
                                
                                {(editingExam.enableScheduling || editingExam.start_time || editingExam.end_time) && (
                                    <div className="grid grid-cols-2 gap-3 bg-blue-50 p-3 rounded-lg">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">Available From</label>
                                            <input 
                                                type="datetime-local"
                                                value={editingExam.start_time || ''}
                                                onChange={(e) => setEditingExam({...editingExam, start_time: e.target.value})}
                                                className="w-full px-2 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 mb-1">Available Until</label>
                                            <input 
                                                type="datetime-local"
                                                value={editingExam.end_time || ''}
                                                onChange={(e) => setEditingExam({...editingExam, end_time: e.target.value})}
                                                className="w-full px-2 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                    </div>
                                )}
                                
                                {/* Question Randomization */}
                                <div className="flex items-center gap-2 mt-3">
                                    <input 
                                        type="checkbox" 
                                        id="editRandomizeQuestions"
                                        checked={editingExam.randomize_questions || false}
                                        onChange={(e) => setEditingExam({...editingExam, randomize_questions: e.target.checked})}
                                        className="rounded text-blue-600"
                                    />
                                    <label htmlFor="editRandomizeQuestions" className="text-sm font-medium text-gray-700">
                                        🔀 Randomize question order for each student
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* MCQ Builder */}
                        <div className="bg-blue-50 rounded-lg p-4 space-y-4 border-2 border-blue-200">
                            <h4 className="font-semibold text-blue-700">➕ Add New Question</h4>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Question Text</label>
                                <textarea 
                                    value={currentQuestion.question}
                                    onChange={(e) => setCurrentQuestion({...currentQuestion, question: e.target.value})}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    rows="2"
                                    placeholder="Enter your question here..."
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">Options (select correct answer)</label>
                                {currentQuestion.options.map((opt, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <input 
                                            type="radio"
                                            name="editCorrectAnswer"
                                            checked={currentQuestion.correctAnswerIndex === idx}
                                            onChange={() => setCurrentQuestion({...currentQuestion, correctAnswerIndex: idx})}
                                            className="w-4 h-4 text-blue-600"
                                        />
                                        <span className="w-6 text-sm font-medium text-gray-500">{String.fromCharCode(65 + idx)}.</span>
                                        <input 
                                            type="text"
                                            value={opt}
                                            onChange={(e) => {
                                                const newOptions = [...currentQuestion.options];
                                                newOptions[idx] = e.target.value;
                                                setCurrentQuestion({...currentQuestion, options: newOptions});
                                            }}
                                            className={`flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${currentQuestion.correctAnswerIndex === idx ? 'border-blue-500 bg-blue-50' : ''}`}
                                            placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                                        />
                                    </div>
                                ))}
                            </div>
                            <button 
                                onClick={handleEditExamAddQuestion}
                                className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                            >
                                + Add Question
                            </button>
                        </div>
                    </div>

                    {/* Right: Question Preview */}
                    <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="font-semibold text-gray-700">📋 Questions ({editingExam.questions.length})</h4>
                        </div>
                        
                        {editingExam.questions.length === 0 ? (
                            <div className="text-center text-gray-400 py-12 border-2 border-dashed rounded-lg">
                                <p className="text-4xl mb-2">📝</p>
                                <p>No questions yet</p>
                                <p className="text-sm">Add questions using the form on the left</p>
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-96 overflow-y-auto">
                                {editingExam.questions.map((q, idx) => (
                                    <div key={idx} className="bg-white rounded-lg p-3 border shadow-sm">
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <p className="font-medium text-sm text-gray-800">
                                                    <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs mr-2">Q{idx + 1}</span>
                                                    {q.question}
                                                </p>
                                                <div className="mt-2 space-y-1">
                                                    {q.options.map((opt, optIdx) => (
                                                        <p key={optIdx} className={`text-xs px-2 py-1 rounded ${opt === q.correctAnswer ? 'bg-green-100 text-green-700 font-medium' : 'text-gray-500'}`}>
                                                            {String.fromCharCode(65 + optIdx)}. {opt} {opt === q.correctAnswer && '✓'}
                                                        </p>
                                                    ))}
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => handleEditExamRemoveQuestion(idx)}
                                                className="text-red-400 hover:text-red-600 ml-2"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                    <button 
                        onClick={() => {
                            setShowEditExamModal(false);
                            setEditingExam(null);
                            setCurrentQuestion({ question: '', options: ['', '', '', ''], correctAnswerIndex: null });
                        }}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleUpdateExam}
                        disabled={editingExam.questions.length === 0}
                        className={`px-6 py-2 rounded-lg font-medium ${
                            editingExam.questions.length > 0 
                                ? 'bg-blue-600 text-white hover:bg-blue-700' 
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                    >
                        💾 Save Changes ({editingExam.questions.length} Questions)
                    </button>
                </div>
            </div>
        </div>
    );
    
    // Class Students Modal
    const renderClassStudentsModal = () => (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto py-8">
            <div className="bg-white rounded-xl p-6 w-full max-w-4xl mx-4 my-auto">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-xl font-bold">Class Students</h3>
                        {selectedClassInfo && (
                            <p className="text-gray-500 text-sm">{selectedClassInfo.name} ({selectedClassInfo.code})</p>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {classStudents.length > 0 && (
                            <>
                                <input
                                    type="text"
                                    value={classStudentSearch}
                                    onChange={(e) => { setClassStudentSearch(e.target.value); classStudentPager.setPage(1); }}
                                    placeholder="🔍 Search students..."
                                    className="px-3 py-1.5 border rounded-lg text-sm w-56"
                                />
                                <div className="relative">
                                    <button 
                                        onClick={() => setShowExportDropdown(showExportDropdown === 'class' ? null : 'class')}
                                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                                    >
                                        📥 Export ▾
                                    </button>
                                    {showExportDropdown === 'class' && (
                                        <div className="absolute right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 min-w-[140px]">
                                            <button onClick={() => exportClassStudents('json')} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100">📄 JSON</button>
                                            <button onClick={() => exportClassStudents('csv')} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100">📊 CSV (Excel)</button>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                        <button 
                            onClick={() => {
                                setShowClassStudentsModal(false);
                                setClassStudents([]);
                                setSelectedClassInfo(null);
                                setShowExportDropdown(null);
                            }}
                            className="text-gray-400 hover:text-gray-600 text-2xl"
                        >
                            ×
                        </button>
                    </div>
                </div>
                
                {classStudents.length === 0 ? (
                    <div className="text-center text-gray-400 py-12 border-2 border-dashed rounded-lg">
                        <p className="text-4xl mb-2">👥</p>
                        <p>No students enrolled in this class yet</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Photo</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Name</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Student ID</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Email</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Batch</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Exams</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Avg Score</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredClassStudents.length === 0 ? (
                                    <tr>
                                        <td colSpan="8" className="px-4 py-8 text-center text-gray-400">
                                            {classStudents.length === 0 ? 'No students enrolled in this class yet' : 'No students match your search'}
                                        </td>
                                    </tr>
                                ) : classStudentPager.pageItems.map(student => (
                                    <tr key={student.id} className="border-t hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            {student.face_verification_photo ? (
                                                <img 
                                                    src={student.face_verification_photo} 
                                                    alt={student.name}
                                                    className="w-10 h-10 rounded-full object-cover border-2 border-gray-200"
                                                />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-400">
                                                    👤
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 font-medium">{student.name}</td>
                                        <td className="px-4 py-3 text-gray-600">{student.student_id}</td>
                                        <td className="px-4 py-3 text-gray-500 text-sm">{student.email}</td>
                                        <td className="px-4 py-3 text-gray-600">{student.batch_name || '-'}</td>
                                        <td className="px-4 py-3">
                                            <span className="bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-sm">
                                                {student.exam_attempts || 0} taken
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            {student.avg_score !== null ? (
                                                <span className={`font-medium ${parseFloat(student.avg_score) >= 70 ? 'text-green-600' : parseFloat(student.avg_score) >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                    {parseFloat(student.avg_score).toFixed(1)}%
                                                </span>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => handleRemoveStudentFromClass(selectedClassInfo.id, student.id, student.name)}
                                                className="px-2 py-1 text-red-600 hover:bg-red-50 rounded text-sm"
                                                title="Remove from class"
                                            >
                                                🗑️ Remove
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredClassStudents.length > 0 && (
                            <Pagination page={classStudentPager.page} totalPages={classStudentPager.totalPages} onPageChange={classStudentPager.setPage} />
                        )}
                    </div>
                )}
                
                <div className="flex justify-end mt-6 pt-4 border-t">
                    <button 
                        onClick={() => {
                            setShowClassStudentsModal(false);
                            setClassStudents([]);
                            setSelectedClassInfo(null);
                        }}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );

    /**
     * Main render – assembles the page shell (header, tab bar, content area)
     * and conditionally mounts the active tab view and any open modals.
     */
    // ═══════════════════════════════════════════════════════════════════════════════
    // MAIN RENDER
    // ═══════════════════════════════════════════════════════════════════════════════

    return (
        <div className="min-h-screen bg-gray-100">
            {/* Header */}
            <header className="bg-white shadow-sm border-b">
                <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">B</div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">Instructor Dashboard</h1>
                            <p className="text-xs text-gray-500">BlockProctor LMS</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        {instructorInfo && (
                            <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 rounded-lg">
                                <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white font-medium text-sm">
                                    {instructorInfo.name?.charAt(0).toUpperCase() || 'I'}
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-medium text-gray-800">{instructorInfo.name}</div>
                                    <div className="text-xs text-gray-500">{instructorInfo.department_name || 'Instructor'}</div>
                                </div>
                            </div>
                        )}
                        <button 
                            onClick={handleLogout}
                            className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg border border-red-200"
                        >
                            🚪 Logout
                        </button>
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto px-6 py-8">
                {/* Tabs */}
                <div className="flex gap-2 mb-8 bg-white rounded-lg p-1 shadow-sm w-fit">
                    {[
                        { key: 'dashboard', label: '📊 Dashboard' },
                        { key: 'classes', label: '📚 Classes' },
                        { key: 'students', label: '👥 Students' },
                        { key: 'exams', label: '📝 Exams' },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                                activeTab === tab.key 
                                    ? 'bg-green-600 text-white' 
                                    : 'text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                {loading ? (
                    <div className="text-center text-gray-500 py-12">Loading...</div>
                ) : (
                    <>
                        {activeTab === 'dashboard' && renderDashboard()}
                        {activeTab === 'classes' && renderClasses()}
                        {activeTab === 'students' && renderStudents()}
                        {activeTab === 'exams' && renderExams()}
                    </>
                )}
            </div>

            {/* Modals */}
            {showDeleteClassModal && renderDeleteClassModal()}
            {showAddStudentModal && renderAddStudentModal()}
            {showCreateClassModal && renderCreateClassModal()}
            {showCreateExamModal && renderCreateExamModal()}
            {showEditExamModal && renderEditExamModal()}
            {showClassStudentsModal && renderClassStudentsModal()}
        </div>
    );
};

export default InstructorDashboard;
