// src/hooks/usePagination.test.js
import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import React from 'react';
import usePagination from './usePagination.js';

function Harness({ items, pageSize, onState }) {
    const pagination = usePagination(items, pageSize);
    onState(pagination);
    return null;
}

function renderHookState(items, pageSize) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const out = {};
    act(() => {
        createRoot(container).render(
            React.createElement(Harness, { items, pageSize, onState: (s) => (out.state = s) })
        );
    });
    return { state: () => out.state, container };
}

const ITEMS = Array.from({ length: 21 }, (_, i) => i + 1);

describe('usePagination', () => {
    it('computes total pages from item count and page size', () => {
        const { state, container } = renderHookState(ITEMS, 8);
        expect(state().totalPages).toBe(3);
        expect(state().pageSize).toBe(8);
        container.remove();
    });

    it('returns the first page of items', () => {
        const { state, container } = renderHookState(ITEMS, 8);
        expect(state().pageItems).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        expect(state().page).toBe(1);
        container.remove();
    });

    it('pages forward and clamps at the last page', () => {
        const { state, container } = renderHookState(ITEMS, 8);
        act(() => state().setPage(3));
        expect(state().pageItems).toEqual([17, 18, 19, 20, 21]);
        act(() => state().setPage(99));
        expect(state().page).toBe(3);
        container.remove();
    });

    it('handles empty item lists', () => {
        const { state, container } = renderHookState([], 8);
        expect(state().totalPages).toBe(1);
        expect(state().pageItems).toEqual([]);
        container.remove();
    });

    it('handles null item lists', () => {
        const { state, container } = renderHookState(null, 8);
        expect(state().totalPages).toBe(1);
        expect(state().pageItems).toEqual([]);
        container.remove();
    });
});
