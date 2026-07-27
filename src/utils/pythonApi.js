const API_BASE = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
const CONFIGURED_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 10 * 60 * 1000)
const DEFAULT_TIMEOUT_MS = Number.isFinite(CONFIGURED_TIMEOUT_MS) && CONFIGURED_TIMEOUT_MS > 0
  ? CONFIGURED_TIMEOUT_MS
  : 10 * 60 * 1000

async function api(path, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...fetchOptions } = options
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      signal: signal || controller.signal,
    })
    if (!response.ok) {
      let message = `Erro HTTP ${response.status}`
      try {
        const body = await response.json()
        message = body.detail || message
      } catch { /* resposta sem JSON */ }
      throw new Error(message)
    }
    return response
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Tempo limite excedido ao comunicar com o motor de processamento.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
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

export async function processQualidadeEdp(payload) {
  return (await api('/api/qualidade-edp/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })).json()
}

export function workbookQualidadeEdpUrl(jobId) {
  return `${API_BASE}/api/qualidade-edp/jobs/${jobId}/workbook`
}

export async function processBoletosFaltantes(payload) {
  return (await api('/api/boletos-faltantes/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })).json()
}

export function workbookBoletosFaltantesUrl(jobId) {
  return `${API_BASE}/api/boletos-faltantes/jobs/${jobId}/workbook`
}

export function downloadUrl(url) {
  const anchor = document.createElement('a')
  anchor.href = url
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
