const API_BASE = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

async function api(path, options) {
  const response = await fetch(`${API_BASE}${path}`, options)
  if (!response.ok) {
    let message = `Erro HTTP ${response.status}`
    try {
      const body = await response.json()
      message = body.detail || message
    } catch { /* resposta sem JSON */ }
    throw new Error(message)
  }
  return response
}

export async function uploadSpreadsheet(file) {
  const form = new FormData()
  form.append('file', file)
  return (await api('/api/faturamento/upload', { method: 'POST', body: form })).json()
}

export async function previewSpreadsheetSheet(uploadId, sheetName) {
  const query = sheetName ? `?sheet_name=${encodeURIComponent(sheetName)}` : ''
  return (await api(`/api/uploads/${uploadId}/preview${query}`)).json()
}

export async function processFaturamento(payload) {
  return (await api('/api/faturamento/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })).json()
}

export function workbookUrl(jobId) {
  return `${API_BASE}/api/faturamento/jobs/${jobId}/workbook`
}

export function categoryUrl(jobId, category, years = []) {
  const query = years.length ? `?years=${encodeURIComponent(years.join(','))}` : ''
  return `${API_BASE}/api/faturamento/jobs/${jobId}/category/${encodeURIComponent(category)}${query}`
}

export async function processConciliacao(payload) {
  return (await api('/api/conciliacao/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })).json()
}

export function workbookConciliacaoUrl(jobId) {
  return `${API_BASE}/api/conciliacao/jobs/${jobId}/workbook`
}

export async function processInadimplentes(payload) {
  return (await api('/api/inadimplentes/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })).json()
}

export function workbookInadimplentesUrl(jobId) {
  return `${API_BASE}/api/inadimplentes/jobs/${jobId}/workbook`
}

export async function processAtualizacoes(payload) {
  return (await api('/api/atualizacoes/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })).json()
}

export function workbookAtualizacoesUrl(jobId) {
  return `${API_BASE}/api/atualizacoes/jobs/${jobId}/workbook`
}

export function downloadUrl(url) {
  const anchor = document.createElement('a')
  anchor.href = url
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
