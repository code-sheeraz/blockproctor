import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ExamProctor from '../components/ExamProctor.jsx';

import { getApiBase } from '../utils/apiBase.js';

const API_BASE = getApiBase();

/**
 * Full proctored exam experience. Manages the exam lifecycle from session
 * creation through submission, including: wall-clock countdown timer,
 * heartbeat reporting, anti-cheat event forwarding (screen lock, tab
 * visibility, keyboard shortcuts, right-click), answer persistence, and
 * auto-submit on lock or expiry. The ExamProctor child component handles
 * all real-time camera-based detection.
 */
const ExamSession = () => {
    const { examId, userId } = useParams();
    const navigate = useNavigate();
    
    // Session state
    const [session, setSession] = useState(null);
    const [examData, setExamData] = useState(null);
    const [answers, setAnswers] = useState({});
    const [currentQuestion, setCurrentQuestion] = useState(0);
    
    // Timer state
    const [timeRemaining, setTimeRemaining] = useState(null);
    const timerRef = useRef(null);
    // Wall-clock deadline (ms epoch). setInterval fires late under the AI
    // proctor's CPU load; deriving remaining time from Date.now() keeps the
    // countdown accurate regardless of tick jitter.
    const deadlineRef = useRef(null);
    
    // Proctoring state
    const [isLocked, setIsLocked] = useState(false);
    const [lockReason, setLockReason] = useState('');
    const [warningCount, setWarningCount] = useState(0);
    const [violationCount, setViolationCount] = useState(0);
    const [showWarningModal, setShowWarningModal] = useState(false);
    const [warningMessage, setWarningMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
    
    // Connection state
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [connectionLost, setConnectionLost] = useState(false);
    const heartbeatRef = useRef(null);
    const lastHeartbeatRef = useRef(Date.now());
    
    // Tab visibility state
    const tabSwitchCountRef = useRef(0);
    const hasWarnedRef = useRef(false);
    const isShowingAlertRef = useRef(false); // Flag to pause detection during alerts
    
    // Refs mirroring latest state so interval/event callbacks never read stale values
    const sessionRef = useRef(null);
    const examDataRef = useRef(null);
    const answersRef = useRef(null);
    const timeRemainingRef = useRef(0);
    const isSubmittingRef = useRef(false);

    // ═══════════════════════════════════════════════════════════════════════════
    // SESSION INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════════════
    
    useEffect(() => {
        startExamSession();
        
        return () => {
            // Cleanup on unmount
            if (timerRef.current) clearInterval(timerRef.current);
            if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        };
    }, [examId, userId]);

    const startExamSession = async () => {
        try {
            const res = await fetch(`${API_BASE}/session/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId: userId, examId })
            });
            const data = await res.json();
            
            if (!data.success) {
                if (data.locked) {
                    setIsLocked(true);
                    setLockReason(data.message);
                    return;
                }
                if (data.terminated) {
                    setIsLocked(true);
                    setLockReason('⚠️ EXAM TERMINATED: ' + data.message);
                    return;
                }
                if (data.completed) {
                    alert('You have already completed this exam.');
                    navigate(`/dashboard/${userId}`);
                    return;
                }
                if (data.expired) {
                    alert('This exam has expired.');
                    navigate(`/dashboard/${userId}`);
                    return;
                }
                throw new Error(data.message);
            }
            
            setSession(data.session);
            setExamData(data.exam);
            setTimeRemaining(data.session.time_remaining);
            setWarningCount(data.session.warning_count || 0);
            setViolationCount(data.session.violation_count || 0);
            
            // Restore partial answers if resuming
            if (data.resumed && data.session.result) {
                try {
                    const savedData = typeof data.session.result === 'string' 
                        ? JSON.parse(data.session.result) 
                        : data.session.result;
                    if (savedData.partialAnswers && Array.isArray(savedData.partialAnswers)) {
                        const restoredAnswers = {};
                        savedData.partialAnswers.forEach((ans, idx) => {
                            if (ans) restoredAnswers[idx] = ans;
                        });
                        setAnswers(restoredAnswers);
                    }
                } catch (e) {
                    console.error('Failed to restore answers:', e);
                }
            }
            
            // Start timer
            startTimer(data.session.time_remaining);
            
            // Start heartbeat
            startHeartbeat(data.session.id);
            
            if (data.resumed) {
                showWarning('Session Resumed', 'Your exam session has been restored. ⚠️ WARNING: Leaving for more than 10 seconds will TERMINATE your exam!');
            }
            
        } catch (err) {
            console.error('Failed to start session:', err);
            alert('Failed to start exam: ' + err.message);
            navigate(`/dashboard/${userId}`);
        }
    };

    // Keep refs in sync with latest state
    useEffect(() => { sessionRef.current = session; }, [session]);
    useEffect(() => { examDataRef.current = examData; }, [examData]);
    useEffect(() => { answersRef.current = answers; }, [answers]);
    useEffect(() => { timeRemainingRef.current = timeRemaining; }, [timeRemaining]);
    useEffect(() => { isSubmittingRef.current = isSubmitting; }, [isSubmitting]);

    // ═══════════════════════════════════════════════════════════════════════════
    // TIMER
    // ═══════════════════════════════════════════════════════════════════════════
    
    const startTimer = (initialTime) => {
        if (timerRef.current) clearInterval(timerRef.current);

        timeRemainingRef.current = initialTime;
        setTimeRemaining(initialTime);
        deadlineRef.current = Date.now() + initialTime * 1000;

        timerRef.current = setInterval(() => {
            if (deadlineRef.current === null) return;
            const remainingMs = deadlineRef.current - Date.now();
            const remaining = Math.max(0, Math.ceil(remainingMs / 1000));

            // Update state only when the displayed second changes (4x fewer renders)
            if (remaining !== timeRemainingRef.current) {
                timeRemainingRef.current = remaining;
                setTimeRemaining(remaining);
            }

            if (remainingMs <= 0) {
                clearInterval(timerRef.current);
                timerRef.current = null;
                handleTimeUp();
            }
        }, 250);
    };

    const handleTimeUp = () => {
        setIsSubmitting(true);
        showWarning('Time\'s Up!', 'Your exam time has ended. Submitting your answers...');
        setTimeout(() => submitExam(true), 2000);
    };

    const formatTime = (seconds) => {
        if (seconds === null) return '--:--';
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (hrs > 0) {
            return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // HEARTBEAT & RECONNECTION
    // ═══════════════════════════════════════════════════════════════════════════
    
    const startHeartbeat = (sessionId) => {
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        
        heartbeatRef.current = setInterval(async () => {
            try {
                // Convert answers object to array for saving
                const questions = examDataRef.current?.questions_json || [];
                const answersArray = questions.map((_, idx) => answersRef.current?.[idx] || '');

                // Deadline-derived remaining time (immune to render/tick jitter)
                const remaining = deadlineRef.current !== null
                    ? Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000))
                    : timeRemainingRef.current;

                const res = await fetch(`${API_BASE}/session/heartbeat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId,
                        studentId: userId,
                        examId,
                        timeRemaining: remaining,
                        partialAnswers: answersArray // Save answers with each heartbeat
                    })
                });
                const data = await res.json();
                
                if (data.locked) {
                    setIsLocked(true);
                    setLockReason(data.lockReason);
                    clearInterval(heartbeatRef.current);
                    clearInterval(timerRef.current);
                }
                
                lastHeartbeatRef.current = Date.now();
                setConnectionLost(false);
                setIsReconnecting(false);
                
            } catch (err) {
                console.error('Heartbeat failed:', err);
                handleConnectionLoss();
            }
        }, 5000); // Every 5 seconds
    };

    const handleConnectionLoss = () => {
        const timeSinceLastHeartbeat = Date.now() - lastHeartbeatRef.current;
        
        if (timeSinceLastHeartbeat > 30000) { // 30 seconds grace period
            setConnectionLost(true);
            // Don't auto-lock, just show warning
            showWarning('Connection Lost', 'Please check your internet connection. Your answers are saved locally.');
        } else {
            setIsReconnecting(true);
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // SECURITY / ANTI-CHEAT LISTENERS
    // ═══════════════════════════════════════════════════════════════════════════
    
    useEffect(() => {
        // Tab visibility
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        // Window blur (tab switch)
        window.addEventListener('blur', handleWindowBlur);
        
        // Disable right-click
        document.addEventListener('contextmenu', handleContextMenu);
        
        // Disable copy/cut/paste
        document.addEventListener('copy', handleCopyPaste);
        document.addEventListener('cut', handleCopyPaste);
        
        // Disable certain keyboard shortcuts
        document.addEventListener('keydown', handleKeyDown);
        
        // Before unload warning
        window.addEventListener('beforeunload', handleBeforeUnload);
        
        // Cleanup on unmount
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('blur', handleWindowBlur);
            document.removeEventListener('contextmenu', handleContextMenu);
            document.removeEventListener('copy', handleCopyPaste);
            document.removeEventListener('cut', handleCopyPaste);
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, []);

    const handleVisibilityChange = () => {
        // Skip if showing alert or submitting
        if (isShowingAlertRef.current || isSubmitting) return;
        
        if (document.hidden) {
            const metadata = {
                timestamp: new Date().toISOString(),
                switchCount: tabSwitchCountRef.current
            };
            logViolation('TAB_HIDDEN', 'Student minimized or switched away from exam tab', metadata);
        }
    };

    const handleWindowBlur = () => {
        // Skip if we're showing an alert (alerts cause blur events)
        if (isShowingAlertRef.current || isSubmitting) return;
        
        tabSwitchCountRef.current += 1;
        
        // Detailed metadata for logging
        const metadata = {
            tabTitle: document.title,
            switchCount: tabSwitchCountRef.current,
            timestamp: new Date().toISOString(),
            documentHidden: document.hidden,
            visibilityState: document.visibilityState
        };
        
        // Log the violation with details
        logViolation('TAB_SWITCH', `Tab switch detected (count: ${tabSwitchCountRef.current})`, metadata);
        
        if (!hasWarnedRef.current) {
            hasWarnedRef.current = true;
            isShowingAlertRef.current = true;
            showWarning('⚠️ Warning: Tab Switch Detected', 
                'Switching tabs during the exam is not allowed. Further violations may result in automatic exam termination. This is your only warning.');
        }
    };

    const handleContextMenu = (e) => {
        e.preventDefault();
        logViolation('RIGHT_CLICK', 'Right-click attempt blocked', {});
    };

    const handleCopyPaste = (e) => {
        e.preventDefault();
        logViolation('COPY_ATTEMPT', 'Copy/paste attempt blocked', {});
        showWarning('Action Blocked', 'Copy/paste is disabled during the exam.');
    };

    const handleKeyDown = (e) => {
        // Block common shortcuts
        const blockedCombos = [
            { ctrl: true, key: 'c' },   // Copy
            { ctrl: true, key: 'v' },   // Paste
            { ctrl: true, key: 'x' },   // Cut
            { ctrl: true, key: 'a' },   // Select all
            { ctrl: true, key: 'p' },   // Print
            { ctrl: true, key: 's' },   // Save
            { ctrl: true, shift: true, key: 'i' }, // DevTools
            { ctrl: true, shift: true, key: 'j' }, // Console
            { key: 'F12' },             // DevTools
            { key: 'PrintScreen' },     // Screenshot
            { key: 'Insert', shift: true }, // Paste alternative
            { ctrl: true, key: 'u' },   // View source
            { alt: true, key: 'PrintScreen' }, // Window screenshot
        ];
        
        // Block PrintScreen separately (it's tricky)
        if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
            e.preventDefault();
            logViolation('SCREENSHOT_ATTEMPT', 'Print Screen attempt blocked', {});
            showWarning('Screenshot Blocked', 'Screenshots are not allowed during the exam.');
            return;
        }
        
        const isBlocked = blockedCombos.some(combo => {
            const ctrlMatch = combo.ctrl ? (e.ctrlKey || e.metaKey) : !combo.ctrl;
            const shiftMatch = combo.shift ? e.shiftKey : !combo.shift;
            const altMatch = combo.alt ? e.altKey : !combo.alt;
            const keyMatch = e.key.toLowerCase() === (combo.key || '').toLowerCase();
            return ctrlMatch && shiftMatch && altMatch && keyMatch;
        });
        
        if (isBlocked) {
            e.preventDefault();
            logViolation('KEYBOARD_SHORTCUT', `Blocked shortcut: ${e.key}`, { key: e.key, ctrl: e.ctrlKey });
            showWarning('Action Blocked', 'This keyboard shortcut is disabled during the exam.');
        }
    };

    const handleBeforeUnload = (e) => {
        if (!isSubmitting) {
            e.preventDefault();
            e.returnValue = '⚠️ WARNING: Leaving the exam for more than 10 SECONDS will TERMINATE your attempt! You cannot copy questions or use external tools.';
            return e.returnValue;
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // VIOLATION LOGGING
    // ═══════════════════════════════════════════════════════════════════════════
    
    const logViolation = async (type, description, metadata = {}) => {
        const currentSession = sessionRef.current;
        if (!currentSession) return;
        
        // Severe violations that trigger immediate lock
        const SEVERE_VIOLATIONS = ['FACE_MISMATCH', 'IMPERSONATION', 'MULTIPLE_FACES'];
        const isSevere = SEVERE_VIOLATIONS.includes(type);
        
        try {
            const res = await fetch(`${API_BASE}/session/violation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: currentSession.id,
                    studentId: userId,
                    examId,
                    violationType: type,
                    description,
                    metadata,
                    isSevere // Tell backend this is severe
                })
            });
            const data = await res.json();
            
            if (data.locked) {
                setIsLocked(true);
                setLockReason(data.lockReason || 'Too many violations detected');
                clearInterval(timerRef.current);
                clearInterval(heartbeatRef.current);
                
                // AUTO-SUBMIT on lock - save progress and logs as proof
                await forceSubmitOnLock(data.lockReason);
            } else {
                setWarningCount(data.warningCount || 0);
                setViolationCount(data.violationCount || 0);
            }
        } catch (err) {
            console.error('Failed to log violation:', err);
        }
    };

    // Force submit when locked (saves progress as proof)
    const forceSubmitOnLock = useCallback(async (reason) => {
        try {
            const questions = examDataRef.current?.questions_json || [];
            const answersArray = questions.map((_, idx) => answersRef.current?.[idx] || '');
            
            const res = await fetch(`${API_BASE}/session/force-submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: sessionRef.current?.id,
                    studentId: userId,
                    examId,
                    answers: answersArray,
                    lockReason: reason,
                    timeRemaining: timeRemainingRef.current
                })
            });
            await res.json();
        } catch (err) {
            console.error('Failed to save progress on lock:', err);
        }
    }, [userId, examId]);

    // ═══════════════════════════════════════════════════════════════════════════
    // SUBMISSION
    // ═══════════════════════════════════════════════════════════════════════════
    
    const submitExam = useCallback(async (autoSubmit = false) => {
        if (isSubmittingRef.current && !autoSubmit) return;
        isSubmittingRef.current = true;
        setIsSubmitting(true);
        
        try {
            // Clear intervals
            if (timerRef.current) clearInterval(timerRef.current);
            if (heartbeatRef.current) clearInterval(heartbeatRef.current);
            
            // Prepare answers array
            const questions = examDataRef.current?.questions_json || [];
            const answersArray = questions.map((_, idx) => answersRef.current?.[idx] || '');
            
            const res = await fetch(`${API_BASE}/session/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: sessionRef.current.id,
                    studentId: userId,
                    examId,
                    answers: answersArray
                })
            });
            const data = await res.json();
            
            if (data.success) {
                // Remove beforeunload handler
                window.removeEventListener('beforeunload', handleBeforeUnload);
                
                // Set flag to prevent tab switch detection during alert
                isShowingAlertRef.current = true;
                setShowWarningModal(false);
                
                // Show result
                alert(`🎉 Exam Submitted Successfully!\n\nScore: ${data.score}%\nCorrect: ${data.correctCount}/${data.totalQuestions}`);
                navigate(`/dashboard/${userId}`);
            } else {
                throw new Error(data.message);
            }
        } catch (err) {
            isSubmittingRef.current = false;
            setIsSubmitting(false);
            alert('Failed to submit exam: ' + err.message);
        }
    }, [userId, examId, navigate]);

    // ═══════════════════════════════════════════════════════════════════════════
    // WARNING MODAL
    // ═══════════════════════════════════════════════════════════════════════════
    
    const showWarning = (title, message) => {
        isShowingAlertRef.current = true;
        setWarningMessage(`${title}\n\n${message}`);
        setShowWarningModal(true);
    };
    
    const dismissWarning = () => {
        setShowWarningModal(false);
        // Reset flag after a small delay to avoid immediate re-triggering
        setTimeout(() => {
            isShowingAlertRef.current = false;
        }, 500);
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // PROCTORING CALLBACK
    // ═══════════════════════════════════════════════════════════════════════════
    
    const handleProctorViolation = useCallback((type, description, metadata = {}) => {
        logViolation(type, description, metadata);
    }, [session]);

    const handleExamBlock = useCallback(async () => {
        const reason = 'Face verification failed or suspicious activity detected';
        setIsLocked(true);
        setLockReason(reason);
        
        // Clear timers
        if (timerRef.current) clearInterval(timerRef.current);
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        
        // AUTO-SUBMIT: Save progress and logs when blocked
        await forceSubmitOnLock(reason);
    }, [forceSubmitOnLock]);

    // ═══════════════════════════════════════════════════════════════════════════
    // RENDER - LOCKED STATE
    // ═══════════════════════════════════════════════════════════════════════════
    
    if (isLocked) {
        return (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-red-600 to-red-800 text-white">
                <div className="text-center max-w-lg p-8">
                    <div className="text-8xl mb-6">🔒</div>
                    <h1 className="text-4xl font-bold mb-4">Exam Locked</h1>
                    <p className="text-xl mb-6 opacity-90">{lockReason}</p>
                    <div className="bg-white/10 rounded-lg p-4 mb-8">
                        <p className="text-sm">
                            If you believe this is an error, please contact your instructor or administrator 
                            to request access restoration.
                        </p>
                    </div>
                    <button 
                        onClick={() => navigate(`/dashboard/${userId}`)} 
                        className="px-8 py-3 bg-white text-red-600 font-bold rounded-lg shadow-lg hover:bg-gray-100 transition"
                    >
                        Return to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RENDER - LOADING STATE
    // ═══════════════════════════════════════════════════════════════════════════
    
    if (!session || !examData) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-500">Starting Exam Session...</p>
                </div>
            </div>
        );
    }

    const questions = examData.questions_json || [];
    const answeredCount = Object.keys(answers).filter(k => answers[k]).length;

    // ═══════════════════════════════════════════════════════════════════════════
    // RENDER - EXAM UI
    // ═══════════════════════════════════════════════════════════════════════════
    
    return (
        <div 
            className="min-h-screen bg-gray-100 select-none"
            style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
        >
            {/* ═══ ANTI-CHEAT WARNING BANNER ═══ */}
            <div className="fixed top-0 left-0 right-0 bg-red-600 text-white text-center py-1 text-xs font-medium z-50">
                ⚠️ DO NOT leave this page! Closing or switching tabs for more than 10 seconds will TERMINATE your exam.
            </div>
            
            {/* ═══ TOP BAR ═══ */}
            <div className="fixed top-6 left-0 right-0 bg-white shadow-md z-40 px-6 py-3">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    {/* Left: Exam Title */}
                    <div className="flex items-center gap-4">
                        <h1 className="text-lg font-bold text-gray-800 truncate max-w-md">{examData.title}</h1>
                        {connectionLost && (
                            <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded animate-pulse">
                                ⚠️ Connection Lost
                            </span>
                        )}
                        {isReconnecting && (
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded">
                                🔄 Reconnecting...
                            </span>
                        )}
                    </div>
                    
                    {/* Center: Timer */}
                    <div className={`px-6 py-2 rounded-lg font-mono text-2xl font-bold ${
                        timeRemaining <= 60 ? 'bg-red-100 text-red-700 animate-pulse' :
                        timeRemaining <= 300 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                    }`}>
                        ⏱️ {formatTime(timeRemaining)}
                    </div>
                    
                    {/* Right: Status & Submit */}
                    <div className="flex items-center gap-4">
                        {/* Violation indicator */}
                        {(warningCount > 0 || violationCount > 0) && (
                            <div className="flex items-center gap-2 text-sm">
                                {warningCount > 0 && (
                                    <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded">
                                        ⚠️ {warningCount}
                                    </span>
                                )}
                                {violationCount > 0 && (
                                    <span className="px-2 py-1 bg-red-100 text-red-700 rounded">
                                        🚨 {violationCount}
                                    </span>
                                )}
                            </div>
                        )}
                        
                        {/* Progress */}
                        <span className="text-sm text-gray-500">
                            {answeredCount}/{questions.length} answered
                        </span>
                        
                        {/* Submit Button */}
                        <button
                            onClick={() => setShowSubmitConfirm(true)}
                            disabled={isSubmitting}
                            className="px-6 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
                        >
                            {isSubmitting ? '⏳ Submitting...' : 'Submit Exam'}
                        </button>
                    </div>
                </div>
            </div>

            {/* ═══ PROCTOR WIDGET ═══ */}
            <div className="fixed bottom-6 right-6 w-72 h-52 border-4 border-gray-800 rounded-xl shadow-2xl z-50 bg-black overflow-hidden">
                <ExamProctor
                    studentId={userId}
                    examId={examId}
                    sessionId={session.id}
                    active={!isSubmitting}
                    onExamBlock={handleExamBlock}
                    onViolation={handleProctorViolation}
                />
            </div>

            {/* ═══ MAIN CONTENT ═══ */}
            <div className="pt-24 pb-8 px-6">
                <div className="max-w-4xl mx-auto">
                    {/* Question Navigation */}
                    <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
                        <div className="flex flex-wrap gap-2">
                            {questions.map((_, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setCurrentQuestion(idx)}
                                    className={`w-10 h-10 rounded-lg font-semibold text-sm transition ${
                                        currentQuestion === idx
                                            ? 'bg-indigo-600 text-white'
                                            : answers[idx]
                                                ? 'bg-green-100 text-green-700 border border-green-300'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    {idx + 1}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Current Question - ANTI-COPY PROTECTED */}
                    <div 
                        className="bg-white rounded-2xl shadow-sm border p-8"
                        style={{
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                            MozUserSelect: 'none',
                            msUserSelect: 'none',
                            WebkitTouchCallout: 'none'
                        }}
                        onCopy={(e) => e.preventDefault()}
                        onCut={(e) => e.preventDefault()}
                        onDragStart={(e) => e.preventDefault()}
                    >
                        <div className="flex items-start gap-4 mb-6">
                            <span className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg text-lg">
                                Q{currentQuestion + 1}
                            </span>
                            <h2 
                                className="text-xl font-medium text-gray-800 pt-1"
                                style={{ pointerEvents: 'none' }}
                            >
                                {questions[currentQuestion]?.question || questions[currentQuestion]?.questionText || 'Question'}
                            </h2>
                        </div>

                        <div className="space-y-3 ml-16">
                            {(questions[currentQuestion]?.options || []).map((opt, optIdx) => (
                                <label
                                    key={optIdx}
                                    className={`flex items-center p-4 rounded-xl border-2 cursor-pointer transition ${
                                        answers[currentQuestion] === opt
                                            ? 'border-indigo-500 bg-indigo-50'
                                            : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name={`question-${currentQuestion}`}
                                        value={opt}
                                        checked={answers[currentQuestion] === opt}
                                        onChange={(e) => setAnswers({ ...answers, [currentQuestion]: e.target.value })}
                                        className="w-5 h-5 text-indigo-600"
                                    />
                                    <span className="ml-4 text-gray-700">{opt}</span>
                                </label>
                            ))}
                        </div>

                        {/* Navigation Buttons */}
                        <div className="flex justify-between mt-8 pt-6 border-t">
                            <button
                                onClick={() => setCurrentQuestion(Math.max(0, currentQuestion - 1))}
                                disabled={currentQuestion === 0}
                                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition"
                            >
                                ← Previous
                            </button>
                            <button
                                onClick={() => setCurrentQuestion(Math.min(questions.length - 1, currentQuestion + 1))}
                                disabled={currentQuestion === questions.length - 1}
                                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
                            >
                                Next →
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ WARNING MODAL ═══ */}
            {showWarningModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]">
                    <div className="bg-white rounded-2xl p-8 max-w-md mx-4 shadow-2xl">
                        <div className="text-center">
                            <div className="text-6xl mb-4">⚠️</div>
                            <p className="text-gray-700 whitespace-pre-line">{warningMessage}</p>
                            <button
                                onClick={dismissWarning}
                                className="mt-6 px-8 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition"
                            >
                                I Understand
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ SUBMIT CONFIRMATION MODAL ═══ */}
            {showSubmitConfirm && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]">
                    <div className="bg-white rounded-2xl p-8 max-w-md mx-4 shadow-2xl">
                        <h3 className="text-xl font-bold text-gray-800 mb-4">Submit Exam?</h3>
                        <p className="text-gray-600 mb-4">
                            You have answered <strong>{answeredCount}</strong> out of <strong>{questions.length}</strong> questions.
                        </p>
                        {answeredCount < questions.length && (
                            <p className="text-yellow-600 bg-yellow-50 p-3 rounded-lg mb-4 text-sm">
                                ⚠️ You have {questions.length - answeredCount} unanswered question(s). 
                                Unanswered questions will be marked as incorrect.
                            </p>
                        )}
                        <p className="text-gray-600 mb-6">
                            Once submitted, you cannot return to this exam.
                        </p>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setShowSubmitConfirm(false)}
                                className="flex-1 px-6 py-3 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition"
                            >
                                Continue Exam
                            </button>
                            <button
                                onClick={() => {
                                    setShowSubmitConfirm(false);
                                    submitExam();
                                }}
                                disabled={isSubmitting}
                                className="flex-1 px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
                            >
                                {isSubmitting ? 'Submitting...' : 'Submit'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ExamSession;
