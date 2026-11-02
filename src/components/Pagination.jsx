import { useState } from 'react';

export const PAGE_SIZE = 25;

// Muestra una página por vez; `resetKey` vuelve a la primera cuando cambian los filtros
export function usePagination(items, resetKey, initialIndex = -1) {
  const [page, setPage] = useState(() => (initialIndex >= 0 ? Math.floor(initialIndex / PAGE_SIZE) + 1 : 1));
  const [lastKey, setLastKey] = useState(resetKey);

  if (resetKey !== lastKey) {
    setLastKey(resetKey);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const start = (current - 1) * PAGE_SIZE;

  return { pageItems: items.slice(start, start + PAGE_SIZE), page: current, totalPages, setPage };
}

export function Pagination({ page, totalPages, setPage }) {
  if (totalPages <= 1) return null;

  return (
    <nav className="pagination" aria-label="Páginas">
      <button type="button" className="btn btn-small" disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button>
      <span className="kpi-sub">Página {page} de {totalPages}</span>
      <button type="button" className="btn btn-small" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Siguiente</button>
    </nav>
  );
}
