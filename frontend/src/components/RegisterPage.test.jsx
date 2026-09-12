import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import RegisterPage from './RegisterPage';

describe('RegisterPage', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const fetchMock = vi.fn();

    beforeEach(() => {
        window.fetch = fetchMock;
        fetchMock.mockResolvedValueOnce({
            json: async () => ({
                success: true,
                departments: [{ id: 1, name: 'CSE' }],
                batches: [{ id: 2, name: '2026', year: 2026 }],
            }),
        });
    });

    function renderPage() {
        return render(
            <MemoryRouter>
                <RegisterPage />
            </MemoryRouter>
        );
    }

    async function fillForm() {
        const user = userEvent.setup();
        await screen.findByDisplayValue('Select Department');
        await user.type(screen.getByPlaceholderText('John Doe'), 'Jane Doe');
        await user.type(screen.getByPlaceholderText('STU2024001'), 'STU2024007');
        await user.type(screen.getByPlaceholderText('john.doe@university.edu'), 'jane@cs.edu');
        await user.type(screen.getByPlaceholderText('••••••••'), 'secret123');
        await user.selectOptions(screen.getByDisplayValue('Select Department'), '1');
        await user.selectOptions(screen.getByDisplayValue('Select Batch'), '2');
        return user;
    }

    it('loads department and batch options on mount', async () => {
        renderPage();
        const options = await screen.findAllByRole('option');
        expect(options.some((o) => o.textContent === 'CSE')).toBe(true);
        expect(options.some((o) => o.textContent === '2026 (2026)')).toBe(true);
    });

    it('alerts and does not POST when required fields are missing', async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByDisplayValue('Select Department');
        await user.click(screen.getByRole('button', { name: 'Submit for Approval' }));
        expect(alertSpy).toHaveBeenCalledWith('Please fill all fields including department and batch');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('POSTs the form data and navigates to login on success', async () => {
        fetchMock.mockResolvedValueOnce({
            json: async () => ({ success: true, message: 'ok' }),
        });
        renderPage();
        const user = await fillForm();
        await user.click(screen.getByRole('button', { name: 'Submit for Approval' }));
        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });
        const [, registerCall] = fetchMock.mock.calls;
        const [url, opts] = registerCall;
        expect(url.endsWith('/auth/register')).toBe(true);
        expect(opts.method).toBe('POST');
        const body = JSON.parse(opts.body);
        expect(body).toMatchObject({
            name: 'Jane Doe',
            email: 'jane@cs.edu',
            password: 'secret123',
            student_id: 'STU2024007',
            department_id: 1,
            batch_id: 2,
            faceDescriptor: null,
        });
        expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Registration Submitted!'));
    });

    it('alerts the server error message and allows a retry', async () => {
        fetchMock.mockResolvedValueOnce({
            json: async () => ({ success: false, message: 'Email already registered' }),
        });
        renderPage();
        const user = await fillForm();
        await user.click(screen.getByRole('button', { name: 'Submit for Approval' }));
        await waitFor(() => {
            expect(alertSpy).toHaveBeenCalledWith('Error: Email already registered');
        });
        expect(screen.getByRole('button', { name: 'Submit for Approval' })).toBeEnabled();
    });

    it('alerts a connection failure when fetch throws', async () => {
        fetchMock.mockRejectedValueOnce(new Error('network down'));
        renderPage();
        const user = await fillForm();
        await user.click(screen.getByRole('button', { name: 'Submit for Approval' }));
        await waitFor(() => {
            expect(alertSpy).toHaveBeenCalledWith('Server connection failed');
        });
    });
});
