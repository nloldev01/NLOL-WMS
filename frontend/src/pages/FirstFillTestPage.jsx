import { useState, useEffect } from 'react'
import Topbar from '../components/Topbar'
import Sidebar from '../components/Sidebar'
import { apiFetch, getApiError, hasAccess } from '../utils/api'
import { generateFirstFillTestReportPdf } from '../utils/firstFillTestReport'

const canEdit = hasAccess('first_fill_test', 'full')

const STATUS_CONFIG = {
  draft:    { label: 'Draft',    color: 'bg-slate-100 text-slate-600' },
  reviewed: { label: 'Reviewed', color: 'bg-blue-50 text-blue-700' },
  issued:   { label: 'Issued',   color: 'bg-green-50 text-green-700' },
}

const VERDICT_CONFIG = {
  pending:        { label: 'Pending',        color: 'bg-slate-100 text-slate-600' },
  conforms:       { label: 'Conforms',       color: 'bg-green-50 text-green-700' },
  non_conforming: { label: 'Non-conforming', color: 'bg-red-50 text-red-600' },
}

const QUALITY_CONFIG = {
  pending:  { label: 'Pending Test', color: 'bg-slate-100 text-slate-600' },
  passed:   { label: 'Passed',       color: 'bg-green-50 text-green-700' },
  failed:   { label: 'Failed',       color: 'bg-amber-50 text-amber-700' },
  rejected: { label: 'Rejected',     color: 'bg-red-50 text-red-600' },
}

// Mirrors production/verdict.py compute_verdict() — for live preview only;
// the server recomputes authoritatively on submit.
const previewVerdict = (row, resultText) => {
  if (row.spec_type === 'Report') return 'NA'
  if (row.value_type === 'text') return 'NA'
  let text = (resultText ?? '').trim()
  if (!text) return 'NA'
  if (text[0] === '<' || text[0] === '>') text = text.slice(1).trim()
  const num = parseFloat(text)
  if (Number.isNaN(num)) return 'NA'
  if (row.spec_type === 'Min') return row.min_value !== null && num >= parseFloat(row.min_value) ? 'Pass' : 'Fail'
  if (row.spec_type === 'Max') return row.max_value !== null && num <= parseFloat(row.max_value) ? 'Pass' : 'Fail'
  if (row.spec_type === 'Range') return (row.min_value !== null && row.max_value !== null && num >= parseFloat(row.min_value) && num <= parseFloat(row.max_value)) ? 'Pass' : 'Fail'
  return 'NA'
}

const FirstFillTestPage = () => {
  const [queueBatches, setQueueBatches] = useState([])
  const [tests, setTests]               = useState([])
  const [testDefs, setTestDefs]         = useState([])
  const [selectedFormat, setSelectedFormat] = useState({}) // batch.id -> test_definition id
  const [queueLoading, setQueueLoading] = useState(true)
  const [testsLoading, setTestsLoading] = useState(true)
  const [actionError, setActionError]   = useState('')
  const [actionLoading, setActionLoading] = useState(null)

  // Active test modal (filling in results)
  const [activeTest, setActiveTest]     = useState(null)
  const [resultRows, setResultRows]     = useState([])
  const [remarks, setRemarks]           = useState('')
  const [submitting, setSubmitting]     = useState(false)
  const [issuing, setIssuing]           = useState(false)

  useEffect(() => { fetchQueue(); fetchTests(); fetchTestDefs() }, [])

  const fetchTestDefs = async () => {
    try {
      const res = await apiFetch('/master-data/test-definitions/')
      if (res?.ok) {
        const d = await res.json()
        const items = (Array.isArray(d) ? d : (d.results ?? [])).filter(t => t.is_active)
        setTestDefs(items)
      }
    } catch { /* ignore */ }
  }

  const fetchQueue = async () => {
    setQueueLoading(true)
    try {
      const res = await apiFetch('/inventory-core/batches/?batch_type=PRD')
      if (res?.ok) {
        const d = await res.json()
        const items = Array.isArray(d) ? d : (d.results ?? [])
        setQueueBatches(items.filter(b => ['pending', 'failed'].includes(b.quality_status)))
      }
    } catch { /* ignore */ }
    finally { setQueueLoading(false) }
  }

  const fetchTests = async () => {
    setTestsLoading(true)
    try {
      const res = await apiFetch('/production/first-fill-tests/')
      if (res?.ok) {
        const d = await res.json()
        setTests(Array.isArray(d) ? d : (d.results ?? []))
      }
    } catch { /* ignore */ }
    finally { setTestsLoading(false) }
  }

  // ── Start / continue a test ───────────────────────────────────────────────
  const startTest = async (batch) => {
    setActionError(''); setActionLoading(batch.id)
    try {
      // When more than one active format exists, the operator must pick which
      // one applies; with a single format the server auto-resolves it.
      const td = selectedFormat[batch.id] || (testDefs.length === 1 ? testDefs[0].id : null)
      if (testDefs.length > 1 && !td) {
        setActionError('Choose a test format before starting.')
        setActionLoading(null)
        return
      }
      const body = td ? { batch_id: batch.id, test_definition_id: td } : { batch_id: batch.id }
      const res = await apiFetch('/production/first-fill-tests/start/', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (res?.ok) {
        const data = await res.json()
        openTestModal(data)
        fetchQueue(); fetchTests()
      } else setActionError(await getApiError(res))
    } catch { setActionError('Connection error — check your network') }
    finally { setActionLoading(null) }
  }

  const openTestModal = (test) => {
    setActiveTest(test)
    setResultRows(test.results.map(r => ({ ...r })))
    setRemarks(test.remarks || '')
  }

  const updateResultText = (id, value) => {
    setResultRows(rows => rows.map(r => r.id === id ? { ...r, result_text: value, verdict: previewVerdict(r, value) } : r))
  }

  const updateManualVerdict = (id, verdict) => {
    setResultRows(rows => rows.map(r => r.id === id ? { ...r, verdict } : r))
  }

  const submitTest = async () => {
    if (!activeTest) return
    setSubmitting(true); setActionError('')
    try {
      const res = await apiFetch(`/production/first-fill-tests/${activeTest.id}/submit/`, {
        method: 'POST',
        body: JSON.stringify({
          results: resultRows.map(r => ({ id: r.id, result_text: r.result_text, verdict: r.value_type === 'text' ? r.verdict : undefined })),
          remarks,
        }),
      })
      if (res?.ok) {
        const data = await res.json()
        setActiveTest(data)
        setResultRows(data.results.map(r => ({ ...r })))
        fetchQueue(); fetchTests()
      } else setActionError(await getApiError(res))
    } catch { setActionError('Connection error — check your network') }
    finally { setSubmitting(false) }
  }

  const issueTest = async () => {
    if (!activeTest) return
    if (!confirm('Issue this certificate? Once issued it can no longer be edited.')) return
    setIssuing(true); setActionError('')
    try {
      const res = await apiFetch(`/production/first-fill-tests/${activeTest.id}/issue/`, { method: 'POST' })
      if (res?.ok) {
        const data = await res.json()
        setActiveTest(data)
        fetchQueue(); fetchTests()
      } else setActionError(await getApiError(res))
    } catch { setActionError('Connection error — check your network') }
    finally { setIssuing(false) }
  }

  const rejectBatch = async (test) => {
    if (!confirm(`Reject batch ${test.batch_code}? This is permanent — the batch can never be retested or sent to Assembly.`)) return
    setActionError(''); setActionLoading(test.id)
    try {
      const res = await apiFetch(`/production/first-fill-tests/${test.id}/reject-batch/`, { method: 'POST' })
      if (res?.ok) { fetchQueue(); fetchTests() }
      else setActionError(await getApiError(res))
    } catch { setActionError('Connection error — check your network') }
    finally { setActionLoading(null) }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <Sidebar />
      <div className="md:ml-16">
        <Topbar />
        <main className="p-6">
          <p className="text-xs text-gray-400 mb-3">Production / Test</p>

          {actionError && <div className="mb-3 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{actionError}</div>}

          {/* ── Pending / Failed Queue ──────────────────────────────────── */}
          <div className="rounded-xl bg-white shadow-sm mb-4">
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
                <h3 className="text-sm font-semibold text-gray-800">Awaiting Test</h3>
                <span className="text-[10px] text-gray-400 font-normal">PRD batches from Mixing that must pass before Assembly can use them</span>
              </div>
              <button onClick={fetchQueue} className="text-[10px] text-orange-500 hover:underline">Refresh</button>
            </div>
            {queueLoading ? (
              <div className="px-6 py-4 text-xs text-gray-400">Loading...</div>
            ) : queueBatches.length === 0 ? (
              <div className="px-6 py-4 text-xs text-gray-400 italic">No PRD batches waiting on a test.</div>
            ) : (
              <div className="px-6 py-3 flex flex-wrap gap-2">
                {queueBatches.map(batch => (
                  <div key={batch.id} className="flex flex-col text-left p-3 rounded-lg border border-gray-200 bg-white min-w-[190px]">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-mono text-[10px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100 font-bold">{batch.batch_code}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${QUALITY_CONFIG[batch.quality_status]?.color}`}>{QUALITY_CONFIG[batch.quality_status]?.label}</span>
                    </div>
                    <div className="text-xs font-medium text-gray-700 mb-2">{batch.product_name}</div>
                    {canEdit && testDefs.length > 1 && (
                      <select
                        value={selectedFormat[batch.id] || ''}
                        onChange={e => setSelectedFormat(s => ({ ...s, [batch.id]: e.target.value }))}
                        className="mb-2 w-full rounded-md border border-gray-200 px-1.5 py-1 text-[10px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-teal-400"
                      >
                        <option value="">Select test format…</option>
                        {testDefs.map(td => (
                          <option key={td.id} value={td.id}>{td.name}</option>
                        ))}
                      </select>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => startTest(batch)}
                        disabled={actionLoading === batch.id}
                        className="rounded-md bg-teal-500 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-teal-600 disabled:opacity-50"
                      >
                        {batch.quality_status === 'failed' ? 'Retest' : 'Start Test'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Test Records Table ──────────────────────────────────────── */}
          <div className="rounded-xl bg-white shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Tests</h2>
              <p className="text-[10px] text-gray-400 mt-0.5">Every test attempt, including retests, kept for traceability</p>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">Batch</th>
                  <th className="px-4 py-2 text-left">Product</th>
                  <th className="px-4 py-2 text-left">Format</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Verdict</th>
                  <th className="px-4 py-2 text-left">Date of Analysis</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {testsLoading ? (
                  <tr><td colSpan={7} className="px-4 py-4 text-center text-gray-400">Loading...</td></tr>
                ) : tests.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-4 text-center text-gray-400 italic">No tests recorded yet.</td></tr>
                ) : tests.map(test => (
                  <tr key={test.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-mono text-orange-600">{test.batch_code}</td>
                    <td className="px-4 py-2">{test.product_name}</td>
                    <td className="px-4 py-2 text-gray-500">{test.test_definition_name}</td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${STATUS_CONFIG[test.status]?.color}`}>{STATUS_CONFIG[test.status]?.label}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${VERDICT_CONFIG[test.overall_verdict]?.color}`}>{VERDICT_CONFIG[test.overall_verdict]?.label}</span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{test.date_of_analysis || '—'}</td>
                    <td className="px-4 py-2 text-right space-x-1.5">
                      {test.status !== 'issued' && canEdit && (
                        <button onClick={() => openTestModal(test)} className="rounded-md bg-blue-500 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-blue-600">Continue</button>
                      )}
                      {test.status === 'issued' && (
                        <button onClick={() => generateFirstFillTestReportPdf(test)} className="rounded-md bg-slate-500 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-slate-600">Report</button>
                      )}
                      {test.status === 'issued' && test.overall_verdict === 'non_conforming' && canEdit && (
                        <button onClick={() => rejectBatch(test)} disabled={actionLoading === test.id} className="rounded-md bg-red-500 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-red-600 disabled:opacity-50">Reject Batch</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      {/* ── Test Form Modal ─────────────────────────────────────────────── */}
      {activeTest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-semibold text-gray-900">{activeTest.test_definition_name}</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">{activeTest.batch_code} — {activeTest.product_name}</p>
              </div>
              <button onClick={() => setActiveTest(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Product Category</label>
                  <div className="mt-1 px-3 py-2 text-xs text-gray-600">{activeTest.product_category || '—'}</div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Batch Quantity</label>
                  <div className="mt-1 px-3 py-2 text-xs text-gray-600">
                    {activeTest.batch_quantity != null
                      ? `${parseFloat(activeTest.batch_quantity).toLocaleString()} ${activeTest.quantity_unit || activeTest.product_unit_symbol || ''}`.trim()
                      : '—'}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Date of Sample Receipt</label>
                  <div className="mt-1 px-3 py-2 text-xs text-gray-600">{activeTest.date_of_sample_receipt}</div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Status</label>
                  <div className="mt-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${STATUS_CONFIG[activeTest.status]?.color}`}>{STATUS_CONFIG[activeTest.status]?.label}</span>
                  </div>
                </div>
              </div>

              <table className="w-full text-xs border border-gray-100 rounded-lg overflow-hidden">
                <thead className="bg-slate-50 text-gray-500">
                  <tr>
                    <th className="px-2 py-2 text-left">Sr.No</th>
                    <th className="px-2 py-2 text-left">Characteristics</th>
                    <th className="px-2 py-2 text-left">Unit</th>
                    <th className="px-2 py-2 text-left">Test Method</th>
                    <th className="px-2 py-2 text-left">Specification</th>
                    <th className="px-2 py-2 text-left w-32">Result</th>
                    <th className="px-2 py-2 text-center">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {resultRows.map(row => (
                    <tr key={row.id} className="border-t border-gray-100">
                      <td className="px-2 py-1.5">{row.sr_no}</td>
                      <td className="px-2 py-1.5">{row.characteristic}</td>
                      <td className="px-2 py-1.5 text-gray-500">{row.unit}</td>
                      <td className="px-2 py-1.5 text-gray-500">{row.test_method}</td>
                      <td className="px-2 py-1.5 text-gray-500">{row.specification}</td>
                      <td className="px-2 py-1.5">
                        <input
                          value={row.result_text || ''}
                          onChange={e => updateResultText(row.id, e.target.value)}
                          disabled={activeTest.status === 'issued'}
                          className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:border-indigo-500 outline-none disabled:bg-slate-50"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {row.value_type === 'text' ? (
                          <select
                            value={row.verdict || 'NA'}
                            onChange={e => updateManualVerdict(row.id, e.target.value)}
                            disabled={activeTest.status === 'issued'}
                            className="rounded border border-gray-200 text-[10px] px-1 py-0.5 disabled:bg-slate-50"
                          >
                            <option value="NA">N/A</option>
                            <option value="Pass">Pass</option>
                            <option value="Fail">Fail</option>
                          </select>
                        ) : (
                          <span className={
                            row.verdict === 'Pass' ? 'text-green-600 font-bold'
                            : row.verdict === 'Fail' ? 'text-red-500 font-bold'
                            : 'text-gray-400'
                          }>{row.verdict === 'NA' ? '—' : row.verdict}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase">Remarks</label>
                <textarea
                  value={remarks} onChange={e => setRemarks(e.target.value)}
                  disabled={activeTest.status === 'issued'}
                  rows={2}
                  className="w-full mt-1 rounded-lg border border-gray-200 px-3 py-2 text-xs focus:border-indigo-500 outline-none disabled:bg-slate-50"
                />
              </div>

              {activeTest.status !== 'draft' && (
                <div className={`p-3 rounded-lg text-sm font-bold ${
                  activeTest.overall_verdict === 'conforms' ? 'bg-green-50 text-green-700'
                  : activeTest.overall_verdict === 'non_conforming' ? 'bg-red-50 text-red-600'
                  : 'bg-slate-50 text-slate-500'
                }`}>
                  Overall Verdict: {VERDICT_CONFIG[activeTest.overall_verdict]?.label}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 bg-slate-50/30">
              {activeTest.status === 'issued' ? (
                <button onClick={() => generateFirstFillTestReportPdf(activeTest)} className="rounded-lg bg-slate-600 px-6 py-2 text-sm font-bold text-white hover:bg-slate-700">Download Report</button>
              ) : (
                <>
                  <button onClick={submitTest} disabled={submitting} className="rounded-lg bg-orange-500 px-6 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">
                    {submitting ? 'Saving...' : 'Save Results'}
                  </button>
                  {activeTest.status === 'reviewed' && (
                    <button onClick={issueTest} disabled={issuing} className="rounded-lg bg-teal-600 px-6 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50">
                      {issuing ? 'Issuing...' : 'Issue Report'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FirstFillTestPage
