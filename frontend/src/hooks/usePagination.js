import { useState, useMemo } from 'react';

// Client-side pagination helper
const usePagination = (items, pageSize = 8) => {
    const totalPages = Math.max(1, Math.ceil((items?.length || 0) / pageSize));
    const [page, setPage] = useState(1);
    const currentPage = Math.min(page, totalPages);

    const pageItems = useMemo(() => {
        const list = items || [];
        return list.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    }, [items, currentPage, pageSize]);

    return { page: currentPage, setPage, totalPages, pageItems, pageSize };
};

export default usePagination;
