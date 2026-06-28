// Shared rows-per-page selector + defaults, so every log/list page stays consistent.
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
export const DEFAULT_PAGE_SIZE = 10

export default function PageSizeSelector({ pageSize, onChange }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-gray-400">
      <span>Rows</span>
      <select
        value={pageSize}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-400"
      >
        {PAGE_SIZE_OPTIONS.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </label>
  )
}
