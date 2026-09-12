import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

describe('ErrorBoundary', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    it('renders its children when no error occurs', () => {
        render(
            <ErrorBoundary>
                <div>Healthy content</div>
            </ErrorBoundary>
        );
        expect(screen.getByText('Healthy content')).toBeInTheDocument();
    });

    it('renders the fallback UI when a child throws', () => {
        const Bomb = () => {
            throw new Error('boom');
        };
        render(
            <ErrorBoundary>
                <Bomb />
            </ErrorBoundary>
        );
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
        expect(screen.getByText('boom')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument();
        expect(consoleSpy).toHaveBeenCalled();
    });
});
