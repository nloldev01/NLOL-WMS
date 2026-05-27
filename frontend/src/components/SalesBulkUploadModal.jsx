import { useCallback, useRef, useState } from 'react'

const SalesBulkUploadModal = ({ onClose, onUploadSuccess }) => {
  const [dragActive, setDragActive] = useState(false)
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('idle')
  const [preview, setPreview] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [uploadResult, setUploadResult] = useState(null)
  const inputRef = useRef(null)

  const REQUIRED_HEADERS = ['customer_code', 'customer_name']

  const parseCSV = (text) => {
    const lines = text.trim().split('\n').filter(Boolean)
    if (lines.length < 2) throw new Error('File must have a header row and at least one data row.')
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''))
    const missing = REQUIRED_HEADERS.filter((r) => !headers.includes(r))
    if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}`)
    const rows = lines.slice(1, 6).map((line) =>
      line.split(',').map((c) => c.trim().replace(/"/g, ''))
    )
    return { headers, rows, total: lines.length - 1 }
  }

  const handleFile = useCallback((f) => {
    if (!f) return
    const ext = f.name.split('.').pop().toLowerCase()
    if (ext !== 'csv') {
      setErrorMsg('Only CSV files are supported.')
      setStatus('error')
      return
    }

    setFile(f)
    setStatus('parsing')
    setErrorMsg('')
    setPreview(null)
    setUploadResult(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        setPreview(parseCSV(e.target.result))
        setStatus('ready')
      } catch (err) {
        setErrorMsg(err.message)
        setStatus('error')
      }
    }
    reader.onerror = () => { setErrorMsg('Failed to read the file.') ; setStatus('error') }
    reader.readAsText(f)
  }, [])

  const onDrop = (e) => {
    e.preventDefault()
    setDragActive(false)
    handleFile(e.dataTransfer.files[0])
  }

  const handleConfirm = async () => {
    if (!file) return
    setStatus('uploading')
    try {
      const formData = new FormData()
      formData.append('file', file)

      const token = localStorage.getItem('access') || sessionStorage.getItem('access')
      const response = await fetch('http://localhost:8000/api/sales/customers/bulk-upload/', {
        method: 'POST',
        body: formData,
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      })

      const data = await response.json()

      if (!response.ok && response.status !== 207) {
        setErrorMsg(data.detail || 'Upload failed. Please try again.')
        setStatus('error')
        return
      }

      setUploadResult(data)
      setStatus('done')
      if (onUploadSuccess) onUploadSuccess(data)
    } catch {
      setErrorMsg('Network error. Please check your connection and try again.')
      setStatus('error')
    }
  }

  const reset = () => {
    setFile(null)
    setStatus('idle')
    setPreview(null)
    setErrorMsg('')
    setUploadResult(null)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative w-full max-w-2xl mx-4 bg-white rounded-xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-green-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Bulk Upload Customers</h2>
              <p className="text-xs text-gray-500 mt-0.5">CSV format · Required: customer_code, customer_name</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-blue-50 border border-blue-200">
            <span className="text-xs text-blue-700 flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download the template for an easy import
            </span>
            <a
              href="http://localhost:8000/api/sales/customers/bulk-upload/template/"
              download="customers_template.csv"
              className="text-xs font-medium text-blue-600 hover:text-blue-800 underline underline-offset-2 transition-colors whitespace-nowrap ml-3"
            >
              Download CSV
            </a>
          </div>

          {(status === 'idle' || status === 'error') && (
            <div
              onDrop={onDrop}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
              onDragLeave={() => setDragActive(false)}
              onClick={() => inputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed cursor-pointer transition-all py-12
                ${dragActive
                  ? 'border-green-400 bg-green-50'
                  : status === 'error'
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-300 bg-gray-50 hover:border-green-400 hover:bg-green-50/30'
                }`}
            >
              <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
              {status === 'error' ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-red-700">{errorMsg}</p>
                    <p className="text-xs text-red-500 mt-1">Click to try again</p>
                  </div>
                </>
              ) : (
                <>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${dragActive ? 'bg-green-100' : 'bg-gray-200'}`}>
                    <svg className={`w-6 h-6 transition-colors ${dragActive ? 'text-green-600' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-800">{dragActive ? 'Drop your CSV file here' : 'Drag & drop your CSV file here'}</p>
                    <p className="text-xs text-gray-500 mt-1">or <span className="text-green-600 font-medium">click to browse</span></p>
                  </div>
                </>
              )}
            </div>
          )}

          {(status === 'parsing' || status === 'uploading') && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <div className="w-10 h-10 border-4 border-green-200 border-t-green-600 rounded-full animate-spin" />
              <p className="text-sm text-gray-600">{status === 'parsing' ? 'Reading your file…' : 'Uploading customers…'}</p>
            </div>
          )}

          {status === 'ready' && preview && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-green-200 bg-green-50">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-green-900 truncate">{file.name}</p>
                  <p className="text-xs text-green-700">{preview.total} row{preview.total !== 1 ? 's' : ''} ready</p>
                </div>
                <button onClick={reset} className="text-green-600 hover:text-green-700 transition-colors flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-700 mb-2">Preview (first 5 rows)</p>
                <div className="rounded-lg border border-gray-300 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-100 border-b border-gray-300">
                          {preview.headers.map((h) => (
                            <th key={h} className="text-left px-3 py-2 font-semibold text-gray-700 whitespace-nowrap">
                              {h.replace(/_/g, ' ')}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((row, ri) => (
                          <tr key={ri} className="border-b border-gray-200 last:border-0 hover:bg-gray-50">
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                                {cell || <span className="text-gray-400 italic">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {preview.total > 5 && (
                    <p className="text-xs text-gray-500 mt-2 text-right">
                      + {preview.total - 5} more row{preview.total - 5 !== 1 ? 's' : ''} not shown
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {status === 'done' && uploadResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center justify-center rounded-lg bg-gray-50 border border-gray-300 py-3 px-2">
                  <span className="text-2xl font-bold text-gray-800">{uploadResult.summary.total_rows}</span>
                  <span className="text-xs text-gray-600 mt-1 font-medium">Total</span>
                </div>
                <div className="flex flex-col items-center justify-center rounded-lg bg-green-50 border border-green-300 py-3 px-2">
                  <span className="text-2xl font-bold text-green-700">{uploadResult.summary.created}</span>
                  <span className="text-xs text-green-700 mt-1 font-medium">Created</span>
                </div>
                <div className={`flex flex-col items-center justify-center rounded-lg py-3 px-2 border ${uploadResult.summary.failed > 0 ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-300'}`}>
                  <span className={`text-2xl font-bold ${uploadResult.summary.failed > 0 ? 'text-red-700' : 'text-gray-600'}`}>{uploadResult.summary.failed}</span>
                  <span className={`text-xs mt-1 font-medium ${uploadResult.summary.failed > 0 ? 'text-red-700' : 'text-gray-600'}`}>Failed</span>
                </div>
              </div>

              {uploadResult.errors?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-700 mb-2">Failed rows</p>
                  <div className="rounded-lg border border-red-300 divide-y divide-red-200 max-h-40 overflow-y-auto bg-red-50">
                    {uploadResult.errors.map((err, i) => (
                      <div key={i} className="px-3 py-2">
                        <p className="text-xs font-semibold text-red-800">Row {err.row}</p>
                        <p className="text-xs text-red-700 mt-0.5">
                          {Object.entries(err.errors).map(([field, msgs]) => `${field}: ${msgs.join(', ')}`).join(' · ')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          {status === 'done' ? (
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition-colors"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-5 py-2 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={status !== 'ready'}
                className={`px-5 py-2 rounded-lg text-sm font-medium text-white transition-all
                  ${status === 'ready'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
              >
                Import {status === 'ready' && preview ? `${preview.total} customers` : 'customers'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default SalesBulkUploadModal
