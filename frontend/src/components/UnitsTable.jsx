import { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';

const PAGE_SIZE = 10;
const EMPTY_FORM = { name: '', code: '', symbol: '', unit_type: 'primary', icon: 'other', base_unit: '' };

const UNIT_ICON_CHOICES = [
  { value: 'bottle',  label: 'Bottle',   path: 'M10 2h4v3.5c0 .5.2 1 .5 1.4L16 9v10a1 1 0 01-1 1H9a1 1 0 01-1-1V9L9.5 6.9c.3-.4.5-.9.5-1.4V2z' },
  { value: 'can',     label: 'Can',      path: 'M8 3h8v2H8V3zm-1 2h10v12a2 2 0 01-2 2H9a2 2 0 01-2-2V5z' },
  { value: 'pail',    label: 'Pail',     path: 'M7 4h10l-1.5 13H8.5L7 4zM5 4h14M9 4V2h6v2' },
  { value: 'drum',    label: 'Drum',     path: 'M6 5h12v14H6V5zm0 0c0-2 2-3 6-3s6 1 6 3M6 19c0 2 2 3 6 3s6-1 6-3M6 12h12' },
  { value: 'pouch',   label: 'Pouch',    path: 'M8 3h8l2 4v12H6V7l2-4zm0 0V1m8 2V1' },
  { value: 'box',     label: 'Box',      path: 'M3 6l9-4 9 4v12l-9 4-9-4V6zm9-4v16M3 6l9 4 9-4' },
  { value: 'jug',     label: 'Jug',      path: 'M7 2h10v18H7V2zm0 8h4m4-4h2a2 2 0 010 4h-2' },
  { value: 'jar',     label: 'Jar',      path: 'M8 2h8v3H8V2zm-2 3h12v13a2 2 0 01-2 2H8a2 2 0 01-2-2V5zM6 8h12' },
  { value: 'other',   label: 'Other',    path: 'M20 7H4a1 1 0 00-1 1v10a1 1 0 001 1h16a1 1 0 001-1V8a1 1 0 00-1-1zM4 7V5a1 1 0 011-1h14a1 1 0 011 1v2' },
];

export default function UnitsTable() {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editUnit, setEditUnit] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchUnits = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/master-data/units/');
      if (res && res.ok) {
        const data = await res.json();
        setUnits(Array.isArray(data) ? data : data.results ?? []);
      }
    } catch (err) {
      console.error('Failed to fetch units:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnits();
  }, []);

  const filtered = units.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.code.toLowerCase().includes(search.toLowerCase()) ||
    u.symbol.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openAdd = () => {
    setEditUnit(null);
    setForm(EMPTY_FORM);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (unit) => {
    setEditUnit(unit);
    setForm({ name: unit.name, code: unit.code, symbol: unit.symbol, unit_type: unit.unit_type || 'primary', icon: unit.icon || 'other', base_unit: unit.base_unit ? String(unit.base_unit) : '' });
    setError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditUnit(null);
    setForm(EMPTY_FORM);
    setError('');
  };

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(f => ({
      ...f,
      [name]: value,
      ...(name === 'unit_type' && value === 'secondary' ? { base_unit: '', icon: 'other' } : {}),
    }))
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) return setError('Unit name is required.');
    if (!form.code.trim()) return setError('Code is required.');
    if (!form.symbol.trim()) return setError('Symbol is required.');

    setSubmitting(true);
    setError('');

    try {
      const endpoint = editUnit
        ? `/master-data/units/${editUnit.id}/`
        : '/master-data/units/';
      const method = editUnit ? 'PUT' : 'POST';

      const payload = { ...form, base_unit: form.base_unit ? parseInt(form.base_unit) : null }
      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify(payload),
      });

      if (!res) return;

      if (!res.ok) {
        const data = await res.json();
        const firstError = Object.values(data).flat()[0];
        return setError(firstError || 'Something went wrong.');
      }

      await fetchUnits();
      closeModal();
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="rounded-xl bg-white shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Units</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 rounded-lg bg-green-500 text-white px-3 py-1.5 text-xs font-medium hover:bg-green-600"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Add Unit
            </button>
            <div className="relative">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search unit..."
                className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-2 focus:ring-orange-300 w-44"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-gray-400 text-sm">Loading...</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="bg-primary text-white text-xs uppercase">
              <tr>
                <th className="px-6 py-3 w-10">No</th>
                <th className="px-6 py-3">Unit Name</th>
                <th className="px-6 py-3">Code</th>
                <th className="px-6 py-3">Symbol</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Base Unit</th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-10 text-center text-gray-400"
                  >
                    No units found
                  </td>
                </tr>
              ) : (
                paginated.map((unit, idx) => (
                  <tr
                    key={unit.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-3 text-gray-400">
                      {(page - 1) * PAGE_SIZE + idx + 1}
                    </td>
                    <td className="px-6 py-3 font-medium text-gray-900">
                      {unit.name}
                    </td>
                    <td className="px-6 py-3">
                      <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-xs font-mono font-medium">
                        {unit.code}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span className="px-2 py-0.5 rounded-md bg-orange-50 text-orange-600 text-xs font-medium">
                        {unit.symbol}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                        unit.unit_type === 'secondary'
                          ? 'bg-purple-50 text-purple-600'
                          : 'bg-blue-50 text-blue-600'
                      }`}>
                        {unit.unit_type === 'secondary' ? 'Secondary' : 'Primary'}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      {unit.base_unit_symbol ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 text-xs font-medium">
                          → {unit.base_unit_symbol}
                          <span className="text-teal-400 font-normal">{unit.base_unit_name}</span>
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <button
                        onClick={() => openEdit(unit)}
                        className="rounded-md bg-green-500 px-3 py-1 text-xs font-medium text-white hover:bg-green-600"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            Showing {filtered.length === 0
              ? 0
              : (page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30"
            >
              ‹
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-7 h-7 rounded text-xs font-medium ${page === p
                    ? 'bg-orange-500 text-white'
                    : 'text-gray-500 hover:bg-gray-100'
                  }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-30"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">
                {editUnit ? 'Edit Unit' : 'Add New Unit'}
              </h3>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {error && (
                <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Unit Name *
                </label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="e.g. Kilogram"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Code *
                  </label>
                  <input
                    name="code"
                    value={form.code}
                    onChange={handleChange}
                    placeholder="e.g. KG"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Symbol *
                  </label>
                  <input
                    name="symbol"
                    value={form.symbol}
                    onChange={handleChange}
                    placeholder="e.g. kg"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Unit Type *
                </label>
                <select
                  name="unit_type"
                  value={form.unit_type}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                >
                  <option value="primary">Primary</option>
                  <option value="secondary">Secondary</option>
                </select>
              </div>
              {form.unit_type === 'primary' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Base Unit <span className="text-gray-400 font-normal">(volume unit this maps to)</span></label>
                  <select
                    name="base_unit"
                    value={form.base_unit}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
                  >
                    <option value="">None</option>
                    {units.filter(u => u.unit_type === 'secondary' && u.id !== editUnit?.id).map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-400 mt-0.5">e.g. Bottle → Litre, Pail → Litre</p>
                </div>
              )}
              {form.unit_type === 'primary' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Container Icon</label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {UNIT_ICON_CHOICES.map(ic => (
                      <button key={ic.value} type="button"
                        onClick={() => setForm(f => ({ ...f, icon: ic.value }))}
                        title={ic.label}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors ${
                          form.icon === ic.value
                            ? 'border-orange-400 bg-orange-50 text-orange-600'
                            : 'border-gray-200 hover:border-gray-300 text-gray-400'
                        }`}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={ic.path} />
                        </svg>
                        <span className="text-[9px] leading-tight text-center">{ic.label.split(' /')[0]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-lg bg-orange-500 px-6 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {submitting ? 'Saving...' : editUnit ? 'Update Unit' : 'Create Unit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}