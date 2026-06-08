import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../utils/api';

const PAGE_SIZE = 10;

const CUSTOMER_TYPES = [
  { value: 'industry', label: 'Industry', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { value: 'dealer',   label: 'Dealer',   color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'retail',   label: 'Retail',   color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'no-type',  label: 'Not Set',  color: 'bg-gray-100 text-gray-500 border-gray-200' },
];

const typeConfig = Object.fromEntries(CUSTOMER_TYPES.map(t => [t.value, t]));

const EMPTY_FORM = {
  customer_code: '', customer_name: '', customer_type: 'no-type',
  address: '', phone: '', is_active: true,
};

export default function CustomersTable({ onBulkUpload }) {
  const [customers, setCustomers]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(1);
  const [modalOpen, setModalOpen]   = useState(false);
  const [editCustomer, setEditCustomer] = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [error, setError]           = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [typePopover, setTypePopover] = useState(null); // customer id with open popover
  const popoverRef = useRef(null);

  useEffect(() => { fetchCustomers(); }, []);

  useEffect(() => {
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) setTypePopover(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/sales/customers/?page_size=200');
      if (res?.ok) {
        const data = await res.json();
        setCustomers(Array.isArray(data) ? data : (data.results ?? []));
      }
    } finally { setLoading(false); }
  };

  const filtered = customers.filter(c =>
    c.customer_code?.toLowerCase().includes(search.toLowerCase()) ||
    c.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openAdd = () => { setEditCustomer(null); setForm(EMPTY_FORM); setError(''); setModalOpen(true); };
  const openEdit = (c) => {
    setEditCustomer(c);
    setForm({ customer_code: c.customer_code || '', customer_name: c.customer_name || '',
      customer_type: c.customer_type || 'no-type', address: c.address || '',
      phone: c.phone || '', is_active: c.is_active !== false });
    setError(''); setModalOpen(true);
  };
  const closeModal = () => { setModalOpen(false); setForm(EMPTY_FORM); setError(''); };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setSubmitting(true);
    if (!form.customer_code || !form.customer_name) {
      setError('Customer Code and Name are required'); setSubmitting(false); return;
    }
    try {
      const method = editCustomer ? 'PATCH' : 'POST';
      const url = editCustomer ? `/sales/customers/${editCustomer.id}/` : '/sales/customers/';
      const res = await apiFetch(url, { method, body: JSON.stringify(form) });
      if (!res?.ok) { const d = await res?.json(); setError(d?.detail || 'Failed to save'); setSubmitting(false); return; }
      const saved = await res.json();
      setCustomers(prev => editCustomer ? prev.map(c => c.id === editCustomer.id ? saved : c) : [saved, ...prev]);
      closeModal();
    } catch (err) { setError(err.message || 'An error occurred'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this customer?')) return;
    const res = await apiFetch(`/sales/customers/${id}/`, { method: 'DELETE' });
    if (res?.ok || res?.status === 204) setCustomers(prev => prev.filter(c => c.id !== id));
  };

  // Inline type change — PATCH only the type field
  const handleTypeChange = async (customer, newType) => {
    setTypePopover(null);
    const res = await apiFetch(`/sales/customers/${customer.id}/`, {
      method: 'PATCH', body: JSON.stringify({ customer_type: newType }),
    });
    if (res?.ok) {
      const saved = await res.json();
      setCustomers(prev => prev.map(c => c.id === customer.id ? saved : c));
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap gap-3 items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Customers</h2>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search code, name or phone…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-52 focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
          <button onClick={onBulkUpload}
            className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition text-gray-700">
            Bulk Upload
          </button>
          <button onClick={openAdd}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-green-500 hover:bg-green-600 text-white rounded-lg transition">
            + Add Customer
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{error}</div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Loading...</div>
        ) : paginated.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            {search ? 'No customers match your search.' : 'No customers yet.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-primary text-white text-xs uppercase">
              <tr>
                <th className="px-6 py-3">Code</th>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Phone</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map(customer => {
                const tc = typeConfig[customer.customer_type] || typeConfig['no-type'];
                return (
                  <tr key={customer.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-6 py-3 font-mono text-xs text-gray-500">{customer.customer_code}</td>
                    <td className="px-6 py-3 font-medium text-gray-900">{customer.customer_name}</td>
                    <td className="px-6 py-3 relative">
                      {/* Inline type switcher */}
                      <button
                        onClick={() => setTypePopover(prev => prev === customer.id ? null : customer.id)}
                        className={`px-2.5 py-1 rounded-md border text-xs font-semibold transition-all hover:opacity-80 ${tc.color}`}
                      >
                        {tc.label} ▾
                      </button>
                      {typePopover === customer.id && (
                        <div ref={popoverRef}
                          className="absolute left-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg p-1.5 min-w-[130px]">
                          {CUSTOMER_TYPES.map(t => (
                            <button
                              key={t.value}
                              onClick={() => handleTypeChange(customer, t.value)}
                              className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                customer.customer_type === t.value
                                  ? t.color + ' border'
                                  : 'text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-500">{customer.phone || '—'}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        customer.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                      }`}>
                        {customer.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(customer)}
                          className="rounded-md bg-green-500 px-3 py-1 text-xs font-medium text-white hover:bg-green-600">
                          Edit
                        </button>
                        <button onClick={() => handleDelete(customer.id)}
                          className="rounded-md bg-red-50 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-100 border border-red-100">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
          <span>{filtered.length} customer{filtered.length !== 1 ? 's' : ''}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-2 py-1 rounded text-xs hover:bg-gray-100 disabled:opacity-30">‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)}
                className={`w-7 h-7 rounded text-xs font-medium ${page === p ? 'bg-orange-500 text-white' : 'hover:bg-gray-100 text-gray-600'}`}>
                {p}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-2 py-1 rounded text-xs hover:bg-gray-100 disabled:opacity-30">›</button>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">
                {editCustomer ? 'Edit Customer' : 'Add Customer'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {error && <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{error}</div>}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Customer Code *</label>
                  <input name="customer_code" value={form.customer_code}
                    onChange={e => setForm(f => ({ ...f, customer_code: e.target.value }))}
                    placeholder="e.g. CUST001"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                  <input name="phone" value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="Phone number"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Customer Name *</label>
                <input name="customer_name" value={form.customer_name}
                  onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
                  placeholder="Customer name"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Customer Type</label>
                <div className="flex flex-wrap gap-2">
                  {CUSTOMER_TYPES.map(t => (
                    <button key={t.value} type="button"
                      onClick={() => setForm(f => ({ ...f, customer_type: t.value }))}
                      className={`px-3 py-1.5 rounded-lg border-2 text-xs font-semibold transition-all ${
                        form.customer_type === t.value
                          ? t.color + ' border-current'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
                <textarea name="address" value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="Customer address" rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none" />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-700">Active</p>
                  <p className="text-xs text-gray-400">Customer can be used in invoices</p>
                </div>
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_active ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting}
                  className="flex-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                  {submitting ? 'Saving…' : editCustomer ? 'Update' : 'Create'}
                </button>
                <button type="button" onClick={closeModal}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
