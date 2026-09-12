import React from 'react';

const Pagination = ({ page, totalPages, onPageChange }) => {
    if (totalPages <= 1) return null;

    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) {
            pages.push(i);
        } else if (pages[pages.length - 1] !== '...') {
            pages.push('...');
        }
    }

    return (
        <div className="flex items-center justify-center gap-1 py-4">
            <button
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-100"
            >
                ← Prev
            </button>
            {pages.map((p, idx) => (
                <button
                    key={idx}
                    onClick={() => typeof p === 'number' && onPageChange(p)}
                    disabled={p === '...'}
                    className={`w-9 h-9 text-sm font-medium rounded-lg ${
                        p === page ? 'bg-indigo-600 text-white' : 'border hover:bg-gray-100'
                    }`}
                >
                    {p}
                </button>
            ))}
            <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-100"
            >
                Next →
            </button>
        </div>
    );
};

export default Pagination;
