import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Pagination from './Pagination';

describe('Pagination', () => {
    it('renders nothing when there is a single page', () => {
        const { container } = render(<Pagination page={1} totalPages={1} onPageChange={() => {}} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders Prev/Next controls and page numbers', () => {
        render(<Pagination page={2} totalPages={3} onPageChange={() => {}} />);
        expect(screen.getByText('← Prev')).toBeInTheDocument();
        expect(screen.getByText('Next →')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '3' })).toBeInTheDocument();
    });

    it('disables Prev on the first page', () => {
        render(<Pagination page={1} totalPages={3} onPageChange={() => {}} />);
        expect(screen.getByText('← Prev')).toBeDisabled();
        expect(screen.getByText('Next →')).toBeEnabled();
    });

    it('disables Next on the last page', () => {
        render(<Pagination page={3} totalPages={3} onPageChange={() => {}} />);
        expect(screen.getByText('← Prev')).toBeEnabled();
        expect(screen.getByText('Next →')).toBeDisabled();
    });

    it('collapses distant pages into an ellipsis', () => {
        render(<Pagination page={5} totalPages={10} onPageChange={() => {}} />);
        expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '10' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '4' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '5' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '6' })).toBeInTheDocument();
        const ellipses = screen.getAllByText('...');
        expect(ellipses).toHaveLength(2);
        expect(ellipses[0]).toBeDisabled();
    });

    it('calls onPageChange with the target page when a number is clicked', async () => {
        const user = userEvent.setup();
        const onPageChange = vi.fn();
        render(<Pagination page={2} totalPages={5} onPageChange={onPageChange} />);
        await user.click(screen.getByRole('button', { name: '3' }));
        expect(onPageChange).toHaveBeenCalledWith(3);
    });

    it('does not fire onPageChange when the ellipsis is clicked', async () => {
        const user = userEvent.setup();
        const onPageChange = vi.fn();
        render(<Pagination page={5} totalPages={10} onPageChange={onPageChange} />);
        const ellipses = screen.getAllByText('...');
        await user.click(ellipses[0]);
        expect(onPageChange).not.toHaveBeenCalled();
    });

    it('calls onPageChange with page-1 / page+1 for Prev/Next', async () => {
        const user = userEvent.setup();
        const onPageChange = vi.fn();
        render(<Pagination page={3} totalPages={5} onPageChange={onPageChange} />);
        await user.click(screen.getByText('← Prev'));
        expect(onPageChange).toHaveBeenCalledWith(2);
        await user.click(screen.getByText('Next →'));
        expect(onPageChange).toHaveBeenCalledWith(4);
    });
});
