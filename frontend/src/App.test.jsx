import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './App';

function renderAt(path, routes) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/login" element={<div>Login screen</div>} />
                <Route path="/protected" element={routes} />
            </Routes>
        </MemoryRouter>
    );
}

describe('ProtectedRoute', () => {
    it('redirects to /login when no token exists', () => {
        renderAt('/protected', <ProtectedRoute>secret</ProtectedRoute>);
        expect(screen.getByText('Login screen')).toBeInTheDocument();
        expect(screen.queryByText('secret')).not.toBeInTheDocument();
    });

    it('redirects to /login when the role is not allowed', () => {
        localStorage.setItem('token', 'jwt-token');
        localStorage.setItem('userRole', 'student');
        renderAt('/protected', <ProtectedRoute allowedRoles={['admin']}>secret</ProtectedRoute>);
        expect(screen.getByText('Login screen')).toBeInTheDocument();
    });

    it('renders children when the role is allowed', () => {
        localStorage.setItem('token', 'jwt-token');
        localStorage.setItem('userRole', 'instructor');
        renderAt('/protected', <ProtectedRoute allowedRoles={['admin', 'instructor']}>secret</ProtectedRoute>);
        expect(screen.getByText('secret')).toBeInTheDocument();
        expect(screen.queryByText('Login screen')).not.toBeInTheDocument();
    });

    it('renders children without a role restriction when allowedRoles is omitted', () => {
        localStorage.setItem('token', 'jwt-token');
        localStorage.setItem('userRole', 'student');
        renderAt('/protected', <ProtectedRoute>secret</ProtectedRoute>);
        expect(screen.getByText('secret')).toBeInTheDocument();
    });
});
