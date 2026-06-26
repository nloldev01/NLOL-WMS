export default function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
    .reduce((acc, p, idx, arr) => {
      if (idx > 0 && p - arr[idx - 1] > 1) acc.push('…');
      acc.push(p);
      return acc;
    }, []);

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30"
      >
        ‹
      </button>
      {pages.map((p, idx) =>
        p === '…' ? (
          <span key={`ellipsis-${idx}`} className="w-7 h-7 flex items-center justify-center text-xs text-gray-400">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`w-7 h-7 rounded text-xs font-medium ${
              page === p ? 'bg-orange-500 text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30"
      >
        ›
      </button>
    </div>
  );
}
