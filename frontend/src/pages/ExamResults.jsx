import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import usePagination from '../hooks/usePagination.js';
import Pagination from '../components/Pagination.jsx';

import { getApiBase } from '../utils/apiBase.js';

const API_BASE = getApiBase();

const ExamResults = () => {
    const { instructorId, examId } = useParams();
    const navigate = useNavigate();
    
    const [loading, setLoading] = useState(true);
    const [exam, setExam] = useState(null);
    const [attempts, setAttempts] = useState([]);
    const [stats, setStats] = useState(null);
    const [selectedAttempt, setSelectedAttempt] = useState(null);
    const [attemptDetails, setAttemptDetails] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [sortBy, setSortBy] = useState('score');
    const [sortOrder, setSortOrder] = useState('desc');
    const [search, setSearch] = useState('');
    const [showExamDetails, setShowExamDetails] = useState(false);

    const [showExportDropdown, setShowExportDropdown] = useState(false);

    // Export functionality
    const exportResults = (format) => {
        const exportData = {
            exam: exam,
            stats: stats,
            exportedAt: new Date().toISOString(),
            attempts: attempts.map(a => ({
                student_name: a.student_name,
                student_email: a.student_email,
                student_id: a.student_roll_no,
                score: a.score,
                started_at: a.started_at,
                submitted_at: a.submitted_at,
                trust_score: a.min_trust_score,
                violation_count: a.violation_count || 0,
                status: a.status
            }))
        };

        if (format === 'csv') {
            // Convert to CSV
            const headers = ['Student Name', 'Email', 'Student ID', 'Score', 'Trust Score', 'Violations', 'Started At', 'Submitted At', 'Status'];
            const rows = exportData.attempts.map(a => [
                `"${a.student_name || ''}"`,
                `"${a.student_email || ''}"`,
                `"${a.student_id || ''}"`,
                a.score || 0,
                a.trust_score || 100,
                a.violation_count || 0,
                `"${a.started_at || ''}"`,
                `"${a.submitted_at || ''}"`,
                `"${a.status || ''}"`
            ]);
            const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `exam_${examId}_results_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } else {
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `exam_${examId}_results_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        }
        setShowExportDropdown(false);
    };

    useEffect(() => {
        fetchResults();
    }, [examId, instructorId]);

    const fetchResults = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/instructors/${instructorId}/exams/${examId}/results`);
            const data = await res.json();
            
            if (data.success) {
                setExam(data.exam);
                setAttempts(data.attempts);
                setStats(data.stats);
            }
        } catch (err) {
            console.error('Failed to fetch results:', err);
        }
        setLoading(false);
    };

    const fetchAttemptDetails = async (attempt) => {
        // Proctor logs are embedded per-attempt in the instructor results response
        const logs = attempt.logs || [];
        setAttemptDetails({
            success: true,
            logs,
            user: {
                full_name: attempt.student_name,
                email: attempt.student_email,
                student_id: attempt.student_roll_no
            }
        });
        setShowDetailsModal(true);
    };

    const handleSort = (field) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder('desc');
        }
    };

    const sortedAttempts = [...attempts].sort((a, b) => {
        const numericFields = new Set(['score', 'trust_score', 'min_trust_score', 'violation_count']);
        let aVal = a[sortBy];
        let bVal = b[sortBy];
        
        if (sortBy === 'student_name') {
            aVal = aVal?.toLowerCase() || '';
            bVal = bVal?.toLowerCase() || '';
        } else if (numericFields.has(sortBy)) {
            aVal = Number(aVal ?? 0);
            bVal = Number(bVal ?? 0);
        }
        
        if (sortOrder === 'asc') {
            return aVal > bVal ? 1 : -1;
        }
        return aVal < bVal ? 1 : -1;
    });

    const getScoreColor = (score) => {
        if (score >= 80) return 'text-green-600 bg-green-50';
        if (score >= 60) return 'text-yellow-600 bg-yellow-50';
        if (score >= 40) return 'text-orange-600 bg-orange-50';
        return 'text-red-600 bg-red-50';
    };

    const getTrustColor = (trust) => {
        if (!trust) return 'text-gray-400';
        if (trust >= 80) return 'text-green-600';
        if (trust >= 50) return 'text-yellow-600';
        return 'text-red-600';
    };

    // Parse an attempt's answers (answers_json may be array or JSON string)
    const parseAnswers = (attempt) => {
        try {
            if (typeof attempt?.answers_json === 'string') return JSON.parse(attempt.answers_json);
            return attempt?.answers_json || [];
        } catch {
            return [];
        }
    };

    // Filtered + sorted attempts for the table
    const filteredAttempts = sortedAttempts.filter(a =>
        (a.student_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (a.student_email || '').toLowerCase().includes(search.toLowerCase()) ||
        String(a.student_roll_no || '').toLowerCase().includes(search.toLowerCase())
    );
    const attemptPager = usePagination(filteredAttempts, 8);

    const getCorrectAnswer = (q) => q?.answer || q?.correctAnswer || '';

    // Per-question stats across all attempts
    const questions = (typeof exam?.questions_json === 'string'
        ? JSON.parse(exam.questions_json)
        : exam?.questions_json) || [];
    const questionStats = questions.map((q, idx) => {
        const correctAnswer = getCorrectAnswer(q);
        let correct = 0, total = 0;
        attempts.forEach(a => {
            const ans = parseAnswers(a);
            if (Array.isArray(ans) && idx < ans.length && ans[idx] !== '' && ans[idx] !== null && ans[idx] !== undefined) {
                total++;
                if (String(ans[idx]).trim().toLowerCase() === String(correctAnswer).trim().toLowerCase()) correct++;
            }
        });
        return { correct, total, accuracy: total > 0 ? Math.round((correct / total) * 100) : 0 };
    });

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-500">Loading Results...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 shadow-sm">
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button 
                                onClick={() => navigate(`/instructor/${instructorId}`)}
                                className="text-gray-500 hover:text-indigo-600"
                            >
                                ← Back to Dashboard
                            </button>
                            <div className="h-6 w-px bg-gray-300"></div>
                            <div>
                                <h1 className="text-xl font-bold text-gray-800">{exam?.title}</h1>
                                <p className="text-sm text-gray-500">
                                    Exam Results & Analytics 
                                    <span className="ml-2 text-purple-600 font-mono">Exam ID: {examId}</span>
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <div className="relative">
                                <button 
                                    onClick={() => setShowExportDropdown(!showExportDropdown)}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                                >
                                    📥 Export ▾
                                </button>
                                {showExportDropdown && (
                                    <div className="absolute right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 min-w-[140px]">
                                        <button onClick={() => exportResults('json')} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100">📄 JSON</button>
                                        <button onClick={() => exportResults('csv')} className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100">📊 CSV (Excel)</button>
                                    </div>
                                )}
                            </div>
                            <button 
                                onClick={fetchResults}
                                className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 flex items-center gap-2"
                            >
                                🔄 Refresh
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-8">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
                    <div className="bg-white rounded-xl shadow-sm border p-4">
                        <div className="text-3xl font-bold text-indigo-600">{stats?.total_attempts || 0}</div>
                        <div className="text-sm text-gray-500">Total Attempts</div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border p-4">
                        <div className="text-3xl font-bold text-green-600">
                            {stats?.avg_score ? parseFloat(stats.avg_score).toFixed(1) : 0}%
                        </div>
                        <div className="text-sm text-gray-500">Average Score</div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border p-4">
                        <div className="text-3xl font-bold text-blue-600">{stats?.max_score || 0}%</div>
                        <div className="text-sm text-gray-500">Highest Score</div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border p-4">
                        <div className="text-3xl font-bold text-orange-600">{stats?.min_score || 0}%</div>
                        <div className="text-sm text-gray-500">Lowest Score</div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border p-4">
                        <div className="text-3xl font-bold text-red-600">{stats?.total_violations || 0}</div>
                        <div className="text-sm text-gray-500">Total Violations</div>
                    </div>
                </div>

                {/* Score Distribution */}
                <div className="bg-white rounded-xl shadow-sm border p-6 mb-8">
                    <h2 className="text-lg font-bold mb-4">Score Distribution</h2>
                    <div className="flex items-end gap-2 h-32">
                        {[
                            { range: '0-20', color: 'bg-red-400' },
                            { range: '21-40', color: 'bg-orange-400' },
                            { range: '41-60', color: 'bg-yellow-400' },
                            { range: '61-80', color: 'bg-blue-400' },
                            { range: '81-100', color: 'bg-green-400' },
                        ].map(({ range, color }) => {
                            const [min, max] = range.split('-').map(Number);
                            const count = attempts.filter(a => a.score >= min && a.score <= max).length;
                            const height = attempts.length > 0 ? (count / attempts.length) * 100 : 0;
                            
                            return (
                                <div key={range} className="flex-1 flex flex-col items-center">
                                    <div className="text-xs font-bold text-gray-600 mb-1">{count}</div>
                                    <div 
                                        className={`w-full ${color} rounded-t transition-all`} 
                                        style={{ height: `${Math.max(height, 5)}%` }}
                                    ></div>
                                    <div className="text-xs text-gray-500 mt-2">{range}%</div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Exam Details */}
                {exam && (
                    <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-8">
                        <button
                            onClick={() => setShowExamDetails(!showExamDetails)}
                            className="w-full p-4 border-b bg-gray-50 flex justify-between items-center hover:bg-gray-100 transition"
                        >
                            <h2 className="text-lg font-bold">📋 Exam Details</h2>
                            <span className="text-gray-500">{showExamDetails ? '▲' : '▼'}</span>
                        </button>
                        {showExamDetails && (
                            <div className="p-6">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                    <div className="bg-gray-50 rounded-lg p-3">
                                        <div className="text-xs text-gray-500 uppercase tracking-wider">Duration</div>
                                        <div className="font-bold text-gray-800 mt-1">{exam.duration_minutes || 'N/A'} mins</div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-3">
                                        <div className="text-xs text-gray-500 uppercase tracking-wider">Questions</div>
                                        <div className="font-bold text-gray-800 mt-1">{questions.length}</div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-3">
                                        <div className="text-xs text-gray-500 uppercase tracking-wider">Starts</div>
                                        <div className="font-bold text-gray-800 mt-1 text-sm">
                                            {exam.start_time ? new Date(exam.start_time).toLocaleString() : 'N/A'}
                                        </div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-3">
                                        <div className="text-xs text-gray-500 uppercase tracking-wider">Ends</div>
                                        <div className="font-bold text-gray-800 mt-1 text-sm">
                                            {exam.end_time ? new Date(exam.end_time).toLocaleString() : 'N/A'}
                                        </div>
                                    </div>
                                </div>

                                {exam.description && (
                                    <p className="text-gray-600 text-sm mb-6">{exam.description}</p>
                                )}

                                <h3 className="font-bold text-gray-800 mb-3">Question Breakdown</h3>
                                <div className="space-y-3">
                                    {questions.map((q, idx) => {
                                        const qs = questionStats[idx];
                                        const accuracyColor = qs.accuracy >= 70 ? 'bg-green-100 text-green-700' :
                                                            qs.accuracy >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
                                        return (
                                            <div key={idx} className="border rounded-lg p-4">
                                                <div className="flex justify-between items-start gap-4">
                                                    <div>
                                                        <p className="font-medium text-gray-800">
                                                            <span className="text-indigo-600 font-bold">Q{idx + 1}.</span> {q.question}
                                                        </p>
                                                        <p className="text-sm text-gray-500 mt-1">
                                                            ✅ Correct answer: <span className="text-green-600 font-medium">{getCorrectAnswer(q)}</span>
                                                        </p>
                                                    </div>
                                                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${accuracyColor}`}>
                                                        {qs.accuracy}% correct ({qs.correct}/{qs.total} students)
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Results Table */}
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <div className="p-4 border-b bg-gray-50 flex justify-between items-center gap-4 flex-wrap">
                        <h2 className="text-lg font-bold">Student Results ({attempts.length})</h2>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); attemptPager.setPage(1); }}
                            placeholder="🔍 Search by name, email or ID..."
                            className="px-3 py-2 border rounded-lg text-sm w-72"
                        />
                    </div>
                    
                    {attempts.length === 0 ? (
                        <div className="p-12 text-center text-gray-500">
                            <div className="text-4xl mb-4">📝</div>
                            <p>No attempts yet</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                            Rank
                                        </th>
                                        <th 
                                            className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                            onClick={() => handleSort('student_name')}
                                        >
                                            Student {sortBy === 'student_name' && (sortOrder === 'asc' ? '↑' : '↓')}
                                        </th>
                                        <th 
                                            className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                            onClick={() => handleSort('score')}
                                        >
                                            Score {sortBy === 'score' && (sortOrder === 'asc' ? '↑' : '↓')}
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                            Questions
                                        </th>
                                        <th 
                                            className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                            onClick={() => handleSort('violation_count')}
                                        >
                                            Violations {sortBy === 'violation_count' && (sortOrder === 'asc' ? '↑' : '↓')}
                                        </th>
                                        <th 
                                            className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                            onClick={() => handleSort('min_trust_score')}
                                        >
                                            Trust Score {sortBy === 'min_trust_score' && (sortOrder === 'asc' ? '↑' : '↓')}
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                            Submitted
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {attemptPager.pageItems.map((attempt, idx) => (
                                        <tr key={attempt.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3">
                                                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                                    (attemptPager.page - 1) * attemptPager.pageSize + idx === 0 ? 'bg-yellow-100 text-yellow-700' :
                                                    (attemptPager.page - 1) * attemptPager.pageSize + idx === 1 ? 'bg-gray-100 text-gray-700' :
                                                    (attemptPager.page - 1) * attemptPager.pageSize + idx === 2 ? 'bg-orange-100 text-orange-700' :
                                                    'bg-gray-50 text-gray-500'
                                                }`}>
                                                    {(attemptPager.page - 1) * attemptPager.pageSize + idx + 1}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-gray-800">{attempt.student_name}</div>
                                                <div className="text-xs text-blue-600 font-mono">
                                                    ID: {attempt.student_db_id} | Roll: {attempt.student_roll_no || 'N/A'}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`px-3 py-1 rounded-full text-sm font-bold ${getScoreColor(attempt.score)}`}>
                                                    {attempt.score}%
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-600">
                                                {attempt.correct_count || 0}/{attempt.total_questions || 0}
                                            </td>
                                            <td className="px-4 py-3">
                                                {attempt.violation_count > 0 ? (
                                                    <span className="px-2 py-1 bg-red-50 text-red-600 rounded-full text-sm font-medium">
                                                        ⚠️ {attempt.violation_count}
                                                    </span>
                                                ) : (
                                                    <span className="text-green-600 text-sm">✓ Clean</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`font-medium ${getTrustColor(attempt.min_trust_score)}`}>
                                                    {attempt.min_trust_score !== null ? `${attempt.min_trust_score}%` : '100%'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-500">
                                                {new Date(attempt.submitted_at).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3">
                                                <button
                                                    onClick={() => {
                                                        setSelectedAttempt(attempt);
                                                        fetchAttemptDetails(attempt);
                                                    }}
                                                    className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 text-sm"
                                                >
                                                    View Details
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {filteredAttempts.length > 0 && (
                        <Pagination page={attemptPager.page} totalPages={attemptPager.totalPages} onPageChange={attemptPager.setPage} />
                    )}
                </div>
            </main>

            {/* Details Modal */}
            {showDetailsModal && attemptDetails && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
                        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-bold">{selectedAttempt?.student_name}</h3>
                                <p className="text-sm text-gray-500">Attempt Details</p>
                            </div>
                            <button 
                                onClick={() => {
                                    setShowDetailsModal(false);
                                    setAttemptDetails(null);
                                }}
                                className="text-gray-500 hover:text-gray-700 text-xl"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                            {/* Attempt Summary */}
                            <div className="grid grid-cols-4 gap-4 mb-6">
                                <div className="bg-indigo-50 rounded-lg p-3 text-center">
                                    <div className="text-2xl font-bold text-indigo-600">{selectedAttempt?.score}%</div>
                                    <div className="text-xs text-indigo-500">Score</div>
                                </div>
                                <div className="bg-green-50 rounded-lg p-3 text-center">
                                    <div className="text-2xl font-bold text-green-600">
                                        {selectedAttempt?.correct_count}/{selectedAttempt?.total_questions}
                                    </div>
                                    <div className="text-xs text-green-500">Correct</div>
                                </div>
                                <div className="bg-red-50 rounded-lg p-3 text-center">
                                    <div className="text-2xl font-bold text-red-600">{selectedAttempt?.violation_count || 0}</div>
                                    <div className="text-xs text-red-500">Violations</div>
                                </div>
                                <div className="bg-yellow-50 rounded-lg p-3 text-center">
                                    <div className="text-2xl font-bold text-yellow-600">
                                        {selectedAttempt?.min_trust_score || 100}%
                                    </div>
                                    <div className="text-xs text-yellow-500">Min Trust</div>
                                </div>
                            </div>

                            {/* Violations Log (filtered to this exam) */}
                            {(() => {
                                const examLogs = attemptDetails.logsByExam?.[examId] || attemptDetails.logs || [];
                                if (examLogs.length === 0) return null;
                                return (
                                    <div className="mb-6">
                                        <h4 className="font-bold text-gray-800 mb-3">Proctoring Log ({examLogs.length} events)</h4>
                                        <div className="bg-gray-50 rounded-lg p-4 max-h-60 overflow-y-auto space-y-2">
                                            {examLogs.map((log, idx) => (
                                                <div key={idx} className={`p-2 rounded ${
                                                    log.severity === 'critical' ? 'bg-red-50 border-l-4 border-red-500' :
                                                    log.severity === 'warning' ? 'bg-yellow-50 border-l-4 border-yellow-500' :
                                                    'bg-gray-100 border-l-4 border-gray-300'
                                                }`}>
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <span className="font-medium text-sm">{log.violation_type}</span>
                                                            <p className="text-xs text-gray-500">{log.description}</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className={`text-xs font-medium ${
                                                                log.severity === 'critical' ? 'text-red-600' :
                                                                log.severity === 'warning' ? 'text-yellow-600' : 'text-gray-500'
                                                            }`}>
                                                                {log.severity}
                                                            </span>
                                                            <p className="text-xs text-gray-400">
                                                                {new Date(log.created_at).toLocaleTimeString()}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Answer Review */}
                            {(() => {
                                const answers = parseAnswers(selectedAttempt);
                                if (questions.length === 0 || !Array.isArray(answers)) return null;
                                return (
                                    <div className="mb-6">
                                        <h4 className="font-bold text-gray-800 mb-3">Answer Review</h4>
                                        <div className="space-y-3">
                                            {questions.map((q, idx) => {
                                                const studentAnswer = answers[idx];
                                                const answered = studentAnswer !== '' && studentAnswer !== null && studentAnswer !== undefined;
                                                const isCorrect = answered && String(studentAnswer).trim().toLowerCase() === String(getCorrectAnswer(q)).trim().toLowerCase();
                                                return (
                                                    <div key={idx} className={`border rounded-lg p-3 ${
                                                        !answered ? 'border-gray-200 bg-gray-50' :
                                                        isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                                                    }`}>
                                                        <p className="font-medium text-gray-800 text-sm">
                                                            <span className="text-indigo-600 font-bold">Q{idx + 1}.</span> {q.question}
                                                        </p>
                                                        <div className="flex flex-wrap gap-3 mt-2 text-sm">
                                                            <span className="text-green-700">
                                                                ✅ Correct: {getCorrectAnswer(q)}
                                                            </span>
                                                            <span className={!answered ? 'text-gray-400' : isCorrect ? 'text-green-700' : 'text-red-700'}>
                                                                {!answered ? '❌ Not Answered' : isCorrect ? '✓ Student: ' + studentAnswer : '✗ Student: ' + studentAnswer}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ExamResults;
