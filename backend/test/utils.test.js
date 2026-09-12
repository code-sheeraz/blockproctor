// test/utils.test.js
// Unit tests for pure utilities: scoring, stable serialization, hashing,
// and the integrity score that backs the blockchain verification pipeline.

import { calculateScore, isCorrectAnswer, resolveCorrectAnswer } from '../utils/scoring.js';
import { stableStringify } from '../utils/stableStringify.js';
import { sha256 } from '../utils/hash.js';
import { calculateIntegrityScore } from '../utils/integrityScore.js';

describe('Scoring utility', () => {
    it('should calculate 100% for all correct answers', () => {
        const questions = [{ answer: 'A' }, { answer: 'B' }, { answer: 'C' }];
        const answers = ['A', 'B', 'C'];
        const result = calculateScore(questions, answers);
        expect(result.score).toBe(100);
        expect(result.correct).toBe(3);
        expect(result.total).toBe(3);
    });

    it('should calculate 0% for all incorrect answers', () => {
        const questions = [{ answer: 'A' }, { answer: 'B' }];
        const answers = ['C', 'D'];
        const result = calculateScore(questions, answers);
        expect(result.score).toBe(0);
        expect(result.correct).toBe(0);
    });

    it('should handle case-insensitive comparison', () => {
        const questions = [{ answer: 'A' }, { answer: 'B' }];
        const answers = ['a', 'b'];
        const result = calculateScore(questions, answers);
        expect(result.score).toBe(100);
    });

    it('should handle empty questions array', () => {
        const result = calculateScore([], []);
        expect(result.score).toBe(0);
        expect(result.total).toBe(0);
    });

    it('should not crash on partial answers', () => {
        const questions = [{ answer: 'A' }, { answer: 'B' }];
        const result = calculateScore(questions, ['A']);
        expect(result.total).toBe(2);
        expect(result.correct).toBe(1);
    });

    // ── Numeric-index authoring format (seed/demo exams) ───────────────────
    it('resolves numeric answer indexes through options[] (seed format)', () => {
        const questions = [{
            question: 'What does SQL stand for?',
            options: ['Structured Query Language', 'Simple Query Language', 'Standard Query List'],
            answer: 0,
        }];
        const result = calculateScore(questions, ['Structured Query Language']);
        expect(result.score).toBe(100);
        expect(isCorrectAnswer(questions[0], 'structured query language')).toBe(true);
        expect(isCorrectAnswer(questions[0], 'Simple Query Language')).toBe(false);
    });

    it('handles numeric indexes beyond position zero and string-number keys', () => {
        const q1 = { options: ['A', 'B', 'C'], answer: 2 };
        expect(resolveCorrectAnswer(q1)).toBe('c');
        const q2 = { options: ['X', 'Y'], correctAnswer: '1' }; // string "1"
        expect(resolveCorrectAnswer(q2)).toBe('y');
    });

    it('falls back to verbatim comparison when index cannot resolve', () => {
        // No options array → numeric value compared as literal text
        expect(resolveCorrectAnswer({ answer: 42 })).toBe('42');
        // Out-of-range index → falls back to the raw value
        expect(resolveCorrectAnswer({ options: ['A'], answer: 5 })).toBe('5');
    });

    it('scores a mixed batch of index-format and text-format questions', () => {
        const questions = [
            { options: ['SQL', 'NoSQL'], answer: 0 },                    // index format
            { correctAnswer: '14 AUgust', options: ['15 AUgust', '14 AUgust'] }, // text format
            { answer: 'B' },                                             // plain letter
        ];
        const result = calculateScore(questions, ['SQL', '14 august', 'B']);
        expect(result).toEqual({ score: 100, correct: 3, total: 3 });
    });

    it('never matches when the question has no resolvable key', () => {
        expect(isCorrectAnswer({ options: ['A'] }, 'A')).toBe(false);
        expect(calculateScore([{ options: ['A'] }], ['A']).score).toBe(0);
    });
});

describe('stableStringify utility', () => {
    it('should produce deterministic output regardless of key order', () => {
        const a = { b: 2, a: 1, c: 3 };
        const b = { a: 1, c: 3, b: 2 };
        expect(stableStringify(a)).toBe(stableStringify(b));
    });

    it('should handle nested objects', () => {
        const obj = { z: { b: 2, a: 1 }, y: 3 };
        const result = stableStringify(obj);
        expect(result).toContain('"a":1');
        expect(result).toContain('"b":2');
    });

    it('should handle arrays', () => {
        expect(stableStringify([3, 1, 2])).toBe('[3,1,2]');
    });

    it('should handle nested object key ordering', () => {
        const a = { outer: { x: 1, y: 2 }, list: [{ b: 2, a: 1 }] };
        const b = { list: [{ a: 1, b: 2 }], outer: { y: 2, x: 1 } };
        expect(stableStringify(a)).toBe(stableStringify(b));
    });

    it('should handle primitives and null', () => {
        expect(stableStringify(null)).toBe('null');
        expect(stableStringify(42)).toBe('42');
        expect(stableStringify('str')).toBe('"str"');
        expect(stableStringify(true)).toBe('true');
    });

    it('should not mutate the input object', () => {
        const input = { b: 1, a: 2 };
        stableStringify(input);
        expect(Object.keys(input)).toEqual(['b', 'a']);
    });
});

describe('sha256 utility', () => {
    it('produces a 64-char hex digest', () => {
        expect(sha256('hello')).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic', () => {
        expect(sha256('BlockProctor')).toBe(sha256('BlockProctor'));
    });

    it('differs for different inputs', () => {
        expect(sha256('a')).not.toBe(sha256('b'));
    });

    it('matches a known reference hash', () => {
        expect(sha256('hello')).toBe(
            '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
        );
    });
});

describe('calculateIntegrityScore', () => {
    const attempt = (overrides = {}) => ({
        blockchain_hash: 'abc',
        blockchain_tx: '0xtx',
        onChainVerified: true,
        ...overrides
    });

    it('returns 100 for an empty attempt list', () => {
        expect(calculateIntegrityScore([])).toBe(100);
        expect(calculateIntegrityScore([], true)).toBe(100);
    });

    it('scores 100 when everything is hash + tx + verified on chain', () => {
        const attempts = [attempt(), attempt()];
        expect(calculateIntegrityScore(attempts, true)).toBe(100);
    });

    it('scores 100 without chain readiness when all have hash + tx', () => {
        const attempts = [attempt(), attempt()];
        expect(calculateIntegrityScore(attempts, false)).toBe(100);
    });

    it('weights on-chain verification most heavily when chain is ready', () => {
        const attempts = [attempt(), attempt({ onChainVerified: false })];
        expect(calculateIntegrityScore(attempts, true)).toBe(75);
    });

    it('ignores on-chain verification when chain is not ready', () => {
        const attempts = [attempt(), attempt({ onChainVerified: false })];
        expect(calculateIntegrityScore(attempts, false)).toBe(100);
    });

    it('penalizes missing hashes', () => {
        const attempts = [attempt(), attempt({ blockchain_hash: null })];
        expect(calculateIntegrityScore(attempts, false)).toBe(75);
    });

    it('rounds fractional results', () => {
        const attempts = [attempt(), attempt({ blockchain_hash: null, blockchain_tx: null })];
        expect(calculateIntegrityScore(attempts, false)).toBe(50);
    });
});
