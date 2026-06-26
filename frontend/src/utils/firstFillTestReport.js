// Generates a COA-style Test Report PDF, drawn manually with jsPDF primitives
// (matches the existing manual-drawing approach used for labels in
// LocationTable.jsx — no autotable dependency needed).
//
// Two layouts are supported, picked by `test.test_definition_template`:
//   layout_A — Engine Oil COA: full header, 6-column results table.
//   layout_B — Grease COA: short header, 4-column results table (no Unit/Spec).
// Both share the same company letterhead at the top and signature block at
// the bottom. Adding a 3rd layout is a new `if` branch here, driven by the
// `template` value already stored on TestDefinition — never a schema change.

const COMPANY = {
  name: 'Nepal Lube Oil Limited',
  address: 'Amlekhgunj, Bara, Nepal',
  phone: 'Tel +977-53-570104',
  contact: 'email: nlol@nepallubeoil.com, website: www.nepallubeoil.com',
}

const loadLogoAsPngDataUrl = async () => {
  const url = `${import.meta.env.BASE_URL}images/gulf-logo.svg`
  const img = new Image()
  img.crossOrigin = 'anonymous'
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
    img.src = url
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || 200
  canvas.height = img.naturalHeight || 200
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

export const generateFirstFillTestReportPdf = async (test) => {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const pageWidth = 210
  const marginX = 14
  const usableWidth = pageWidth - marginX * 2
  let y = 14

  // ── Letterhead: logo + company block, fully centered ─────────────────────
  try {
    const logoDataUrl = await loadLogoAsPngDataUrl()
    pdf.addImage(logoDataUrl, 'PNG', pageWidth / 2 - 10, y, 20, 20)
  } catch {
    // Logo failed to load (e.g. offline) — continue without it rather than
    // blocking report generation.
  }
  y += 28
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(12)
  pdf.text(COMPANY.name, pageWidth / 2, y, { align: 'center' })
  y += 5
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8.5)
  pdf.text(COMPANY.address, pageWidth / 2, y, { align: 'center' })
  y += 4.5
  pdf.text(COMPANY.phone, pageWidth / 2, y, { align: 'center' })
  y += 4.5
  pdf.text(COMPANY.contact, pageWidth / 2, y, { align: 'center' })
  y += 5
  pdf.setDrawColor(0)
  pdf.line(marginX, y, marginX + usableWidth, y)
  y += 6

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(13)
  pdf.text('Test Report', pageWidth / 2, y, { align: 'center' })
  y += 8

  if (test.test_definition_template === 'layout_B') {
    y = renderLayoutB(pdf, test, y, marginX, usableWidth)
  } else {
    y = renderLayoutA(pdf, test, y, marginX, usableWidth)
  }

  pdf.save(`Test-Report-${test.batch_code || test.id}.pdf`)
}

// ── Layout A: Engine Oil COA — full header, 6-column results table ────────
const renderLayoutA = (pdf, test, y, marginX, usableWidth) => {
  const headerRows = [
    ['Product Name', test.product_name || '—'],
    ['Product Category', test.product_category || '—'],
    ['Batch No', test.batch_code || '—'],
    ['Date of Sample Receipt', formatDate(test.date_of_sample_receipt)],
    ['Date Of Analysis', formatDate(test.date_of_analysis)],
    ['Date of Issue', formatDate(test.date_of_issue)],
    ['Batch Quantity', test.batch_quantity ? `${test.batch_quantity} ${test.quantity_unit || test.product_unit_symbol || ''}`.trim() : '—'],
  ]
  y = drawKeyValueTable(pdf, headerRows, y, marginX, usableWidth, 55)
  y += 6

  const cols = [
    { key: 'sr_no', label: 'Sr.No', w: 12 },
    { key: 'characteristic', label: 'Characteristics', w: 50 },
    { key: 'unit', label: 'Unit', w: 18 },
    { key: 'test_method', label: 'Test Method', w: 32 },
    { key: 'specification', label: 'Specification', w: 32 },
    { key: 'result_text', label: 'Result', w: usableWidth - (12 + 50 + 18 + 32 + 32) },
  ]
  y = drawResultsTable(pdf, test, cols, y, marginX)
  y += 8

  y = drawVerdictBadge(pdf, test, y, marginX)
  y += 6

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.text('Remarks:', marginX, y)
  y += 5
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  const remarkLines = [
    '1. The sample tested is meeting the specification and tested as per the test method(s) listed above.',
    '2. Latest version of test methods are used.',
    '3. The test result pertains to the sample(s) received and tested without prejudice of its lot, batches, source or process.',
    '4. This report shall not be published/reproduced for commercial/advertisement purpose without written approval.',
    '5. No deviation from the specified mode of operation & no unusual features observed.',
    ...(test.remarks ? [`6. ${test.remarks}`] : []),
  ]
  remarkLines.forEach(line => {
    pdf.text(pdf.splitTextToSize(line, usableWidth), marginX, y)
    y += 5
  })

  return y
}

// ── Layout B: Grease COA — short header, 4-column results table ───────────
const renderLayoutB = (pdf, test, y, marginX, usableWidth) => {
  const headerRows = [
    ['Product name', test.product_name || '—'],
    ['Batch Number', test.batch_code || '—'],
    ['Date', formatDate(test.date_of_analysis)],
  ]
  y = drawKeyValueTable(pdf, headerRows, y, marginX, usableWidth, 45)
  y += 6

  const cols = [
    { key: 'sr_no', label: 'S.No', w: 14 },
    { key: 'characteristic', label: 'Characteristics', w: 60 },
    { key: 'test_method', label: 'Test Method', w: 40 },
    { key: 'result_text', label: 'Results', w: usableWidth - (14 + 60 + 40) },
  ]
  y = drawResultsTable(pdf, test, cols, y, marginX)
  y += 8

  y = drawVerdictBadge(pdf, test, y, marginX)
  y += 6

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.text(`REMARKS : ${test.remarks || 'QC OK'}`, marginX, y)
  y += 4

  return y
}

// ── Shared drawing helpers ───────────────────────────────────────────────
const drawKeyValueTable = (pdf, rows, y, marginX, usableWidth, labelW) => {
  const rowH = 7
  pdf.setFontSize(9)
  rows.forEach(([label, value]) => {
    pdf.setFont('helvetica', 'bold')
    pdf.rect(marginX, y, labelW, rowH)
    pdf.text(label, marginX + 2, y + rowH / 2 + 1.2)
    pdf.setFont('helvetica', 'normal')
    pdf.rect(marginX + labelW, y, usableWidth - labelW, rowH)
    pdf.text(String(value), marginX + labelW + 2, y + rowH / 2 + 1.2)
    y += rowH
  })
  return y
}

const drawResultsTable = (pdf, test, cols, y, marginX) => {
  const rowH = 8
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8.5)
  let x = marginX
  cols.forEach(col => {
    pdf.rect(x, y, col.w, rowH)
    pdf.text(col.label, x + 1.5, y + rowH / 2 + 1)
    x += col.w
  })
  y += rowH

  pdf.setFont('helvetica', 'normal')
  ;(test.results || []).forEach(row => {
    x = marginX
    const values = {
      sr_no: String(row.sr_no ?? ''),
      characteristic: row.characteristic || '',
      unit: row.unit || '',
      test_method: row.test_method || '',
      specification: row.specification || '',
      result_text: row.result_text || '',
    }
    cols.forEach(col => {
      pdf.rect(x, y, col.w, rowH)
      const lines = pdf.splitTextToSize(values[col.key], col.w - 3)
      pdf.text(lines.slice(0, 2), x + 1.5, y + 3.5)
      x += col.w
    })
    y += rowH
  })
  return y
}

// Highlighted Passed/Failed/Pending badge — a filled colored box rather
// than plain colored text, so the QC outcome is unmissable on the printout.
const drawVerdictBadge = (pdf, test, y, marginX) => {
  const BADGES = {
    conforms:       { label: 'PASSED',  fill: [22, 163, 74] },
    non_conforming: { label: 'FAILED',  fill: [220, 38, 38] },
    pending:        { label: 'PENDING', fill: [148, 163, 184] },
  }
  const badge = BADGES[test.overall_verdict] || BADGES.pending
  const boxW = 40
  const boxH = 8
  pdf.setFillColor(...badge.fill)
  pdf.rect(marginX, y, boxW, boxH, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.text(badge.label, marginX + boxW / 2, y + boxH / 2 + 1.2, { align: 'center' })
  pdf.setTextColor(0, 0, 0)
  return y + boxH
}

const formatDate = (value) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
