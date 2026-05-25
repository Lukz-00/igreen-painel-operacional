import { useState, useMemo, useCallback, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { Download, Search, X, Bug } from 'lucide-react'

// ── Campos normalizados que o fatCruzar.js agora envia ────────────────────────
const COL_SP_NORM = 'Status PAG (norm.)'   // grupo normalizado, ex: "PAGO"
const COL_SR_NORM = 'Status REC (norm.)'   // grupo normalizado, ex: "VENCIDO"
const COL_SP_RAW  = 'Status Pagadoria'     // valor bruto, ex: "Paga"
const COL_SR_RAW  = 'Status Recebíveis'    // valor bruto, ex: "PAGO"
const MES_COL     = 'Mês Referência'
const STATUS_OPTIONS = ['PAGO', 'VENCIDO', 'A RECEBER', 'CANCELADA', 'EXPIRADA', 'CALCULADA']
const PAGE_SIZE = 200

// ── Cores por grupo normalizado ───────────────────────────────────────────────
const STATUS_COLORS = {
  'PAGO':      { bg: '#d1fae5', text: '#065f46', border: '#10b981' },
  'VENCIDO':   { bg: '#fee2e2', text: '#991b1b', border: '#ef4444' },
  'A RECEBER': { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },
  'CANCELADA': { bg: '#f3f4f6', text: '#374151', border: '#6b7280' },
  'EXPIRADA':  { bg: '#ede9fe', text: '#5b21b6', border: '#8b5cf6' },
  'CALCULADA': { bg: '#dbeafe', text: '#1e40af', border: '#3b82f6' },
}

function StatusBadge({ value }) {
  const c = STATUS_COLORS[value] || { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' }
  return (
    <span style={{ background: c.bg, color: c.text, border: `1.5px solid ${c.border}` }}
      className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap leading-5">
      {value || '—'}
    </span>
  )
}

function clean(row) {
  const o = {}
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith('_')) continue
    o[k] = v === null || v === undefined ? '' : v
  }
  return o
}

function exportRows(rows, filename) {
  if (!rows.length) return
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map(clean)), 'STATUS DIVERGENTES')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

// ── Painel de debug ───────────────────────────────────────────────────────────
function DebugPanel({ rows, filtered, fSP, fSR, fMes, search }) {
  if (!rows.length) return null
  const sample = rows[0]
  const hasNorm = COL_SP_NORM in sample
  return (
    <div className="text-[10px] font-mono bg-s2 border border-bd rounded-lg p-3 space-y-1 text-tx3">
      <div className="font-bold text-warn text-[11px] mb-1">Debug — Filtros</div>
      <div>Campos norm. presentes: <span className={hasNorm ? 'text-acc' : 'text-danger font-bold'}>{String(hasNorm)}</span>
        {!hasNorm && <span className="text-danger"> ← PROBLEMA: fatCruzar.js ainda nao foi recarregado</span>}
      </div>
      <div>Total rows: <b className="text-tx">{rows.length}</b> | Filtrados: <b className="text-tx">{filtered.length}</b></div>
      <div>Filtros ativos — SP: <b className="text-tx">"{fSP || '—'}"</b> | SR: <b className="text-tx">"{fSR || '—'}"</b> | Mês: <b className="text-tx">"{fMes || '—'}"</b> | Busca: <b className="text-tx">"{search || '—'}"</b></div>
      {rows[0] && (
        <div>1ª row campos: <b className="text-tx">{COL_SP_NORM}</b>=<span className="text-acc">"{sample[COL_SP_NORM] || '(vazio)'}"</span>
          {' | '}<b className="text-tx">{COL_SP_RAW}</b>=<span className="text-acc">"{sample[COL_SP_RAW] || '(vazio)'}"</span>
          {' | '}<b className="text-tx">{MES_COL}</b>=<span className="text-acc">"{sample[MES_COL] || '(vazio)'}"</span>
        </div>
      )}
    </div>
  )
}

export function DivergentesTable({ rows = [] }) {
  const [search,   setSearch]   = useState('')
  const [fSP,      setFSP]      = useState('')
  const [fSR,      setFSR]      = useState('')
  const [fMes,     setFMes]     = useState('')
  const [pagina,   setPagina]   = useState(0)
  const [showDebug,setShowDebug]= useState(false)

  // Log inicial para inspeção no console
  useEffect(() => {
    if (!rows.length) return
    const sample = rows[0]
    console.group('[DivergentesTable] Diagnóstico de campos')
    console.log('Total rows:', rows.length)
    console.log('Chaves do 1º row:', Object.keys(sample))
    console.log(`"${COL_SP_NORM}" presente?`, COL_SP_NORM in sample, '→', sample[COL_SP_NORM])
    console.log(`"${COL_SR_NORM}" presente?`, COL_SR_NORM in sample, '→', sample[COL_SR_NORM])
    console.log(`"${MES_COL}" presente?`, MES_COL in sample, '→', sample[MES_COL])
    console.log(`"${COL_SP_RAW}" presente?`, COL_SP_RAW in sample, '→', sample[COL_SP_RAW])
    console.groupEnd()
  }, [rows])

  // Opções de mês únicas
  const mesesOpts = useMemo(() =>
    [...new Set(rows.map(r => String(r[MES_COL] || '').trim()).filter(Boolean))].sort()
  , [rows])

  // Colunas visíveis (sem prefixo _)
  const headers = useMemo(() =>
    rows.length ? Object.keys(rows[0]).filter(k => !k.startsWith('_')) : []
  , [rows])

  // ── FILTRO CORRIGIDO ──────────────────────────────────────────────────────
  // Usa COL_SP_NORM / COL_SR_NORM que agora existem no objeto de cada row
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      // Pega o grupo normalizado (ex: "PAGO", "VENCIDO") — campo adicionado no fatCruzar.js
      const sp = String(r[COL_SP_NORM] || '').toUpperCase().trim()
      const sr = String(r[COL_SR_NORM] || '').toUpperCase().trim()
      const mes = String(r[MES_COL]    || '').trim()

      if (fSP  && sp  !== fSP)  return false
      if (fSR  && sr  !== fSR)  return false
      if (fMes && mes !== fMes) return false
      if (q) {
        const txt = Object.values(r).join(' ').toLowerCase()
        if (!txt.includes(q)) return false
      }
      return true
    })
  }, [rows, search, fSP, fSR, fMes])

  // Log quando filtros mudam
  useEffect(() => {
    console.log(`[DivergentesTable] Filtro aplicado → SP:"${fSP}" SR:"${fSR}" Mês:"${fMes}" Busca:"${search}" → ${filtered.length} resultados`)
  }, [filtered.length, fSP, fSR, fMes, search])

  // Reset página ao filtrar
  const handleSearch = useCallback(v => { setSearch(v); setPagina(0) }, [])
  const handleFSP    = useCallback(v => { setFSP(v);    setPagina(0) }, [])
  const handleFSR    = useCallback(v => { setFSR(v);    setPagina(0) }, [])
  const handleFMes   = useCallback(v => { setFMes(v);   setPagina(0) }, [])
  const clearAll     = useCallback(() => { setSearch(''); setFSP(''); setFSR(''); setFMes(''); setPagina(0) }, [])

  const hasFilters = search || fSP || fSR || fMes
  const totalPags  = Math.ceil(filtered.length / PAGE_SIZE) || 1
  const slice      = filtered.slice(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE)
  const dateStr    = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')

  // Colunas de status para colorir
  const STATUS_COLS = new Set([COL_SP_NORM, COL_SR_NORM])

  if (!rows.length) return <div className="text-center py-12 text-tx3 text-sm">Nenhum registro encontrado.</div>

  return (
    <div className="space-y-3">

      {/* Controles */}
      <div className="flex flex-wrap gap-2 items-center">

        {/* Busca */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tx3 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Buscar por UC, cliente, status, mês..."
            className="w-full pl-8 pr-3 py-2 text-xs bg-s1 border border-bd rounded-lg text-tx placeholder-tx3 outline-none focus:border-acc/50 transition-colors"
          />
        </div>

        {/* Filtro Status PAG */}
        <select value={fSP} onChange={e => handleFSP(e.target.value)}
          className="px-2.5 py-2 text-xs bg-s1 border border-bd rounded-lg text-tx outline-none focus:border-acc/50 transition-colors cursor-pointer">
          <option value="">Status PAG — todos</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Filtro Status REC */}
        <select value={fSR} onChange={e => handleFSR(e.target.value)}
          className="px-2.5 py-2 text-xs bg-s1 border border-bd rounded-lg text-tx outline-none focus:border-acc/50 transition-colors cursor-pointer">
          <option value="">Status REC — todos</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Filtro Mês */}
        <select value={fMes} onChange={e => handleFMes(e.target.value)}
          className="px-2.5 py-2 text-xs bg-s1 border border-bd rounded-lg text-tx outline-none focus:border-acc/50 transition-colors cursor-pointer">
          <option value="">Mês — todos</option>
          {mesesOpts.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        {/* Limpar filtros */}
        {hasFilters && (
          <button onClick={clearAll}
            className="flex items-center gap-1 px-2.5 py-2 text-xs text-tx3 border border-bd rounded-lg hover:bg-s3 hover:text-tx transition-colors">
            <X size={12} /> Limpar
          </button>
        )}

        {/* Contador */}
        <span className="text-[11px] text-tx3 whitespace-nowrap ml-auto">
          <span className="font-bold text-tx">{filtered.length.toLocaleString('pt-BR')}</span>
          {' '}de {rows.length.toLocaleString('pt-BR')} registros
        </span>

        {/* Debug toggle */}
        <button onClick={() => setShowDebug(v => !v)}
          title="Painel de diagnóstico"
          className={`p-2 rounded-lg border transition-colors ${showDebug ? 'bg-warn/20 border-warn/40 text-warn' : 'bg-s2 border-bd text-tx3 hover:text-tx hover:bg-s3'}`}>
          <Bug size={13} />
        </button>

        {/* Exportar filtrados */}
        <button
          onClick={() => exportRows(filtered, `divergentes_filtrados_${dateStr}.xlsx`)}
          disabled={!filtered.length}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-s2 border border-bd rounded-lg text-tx hover:bg-s3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">
          <Download size={12} /> Exportar filtrados
        </button>

        {/* Exportar todos */}
        <button
          onClick={() => exportRows(rows, `divergentes_todos_${dateStr}.xlsx`)}
          disabled={!rows.length}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-acc/10 border border-acc/30 rounded-lg text-acc hover:bg-acc/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">
          <Download size={12} /> Exportar todos
        </button>
      </div>

      {/* Painel de debug */}
      {showDebug && (
        <DebugPanel rows={rows} filtered={filtered}
          fSP={fSP} fSR={fSR} fMes={fMes} search={search} />
      )}

      {/* Tabela */}
      <div className="overflow-x-auto max-h-[540px] overflow-y-auto rounded-xl border border-bd">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-tx3 text-sm">
            Nenhum resultado para os filtros aplicados.
            {hasFilters && (
              <button onClick={clearAll} className="block mx-auto mt-2 text-acc text-xs hover:underline">
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-tx3 bg-s2 border-b border-bd whitespace-nowrap sticky top-0 w-10 z-10">#</th>
                {headers.map(h => (
                  <th key={h}
                    className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-tx3 bg-s2 border-b border-bd whitespace-nowrap sticky top-0 z-10">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.map((row, i) => (
                <tr key={i} className="border-b border-bd hover:bg-s2/50 transition-colors">
                  <td className="px-3 py-2.5 text-tx3 text-[11px] text-center">{(pagina * PAGE_SIZE + i + 1).toLocaleString('pt-BR')}</td>
                  {headers.map(h => {
                    const val = String(row[h] ?? '—')
                    // Aplica badge APENAS nas colunas normalizadas (ex: "PAGO", "VENCIDO")
                    if (STATUS_COLS.has(h) && STATUS_COLORS[val.toUpperCase()]) {
                      return (
                        <td key={h} className="px-3 py-2.5 whitespace-nowrap">
                          <StatusBadge value={val.toUpperCase()} />
                        </td>
                      )
                    }
                    return (
                      <td key={h} className="px-3 py-2.5 text-tx2 whitespace-nowrap max-w-[220px] truncate" title={val}>
                        {val}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginação */}
      {totalPags > 1 && (
        <div className="flex items-center justify-between px-1 py-1 text-[11px] text-tx3">
          <span>{filtered.length.toLocaleString('pt-BR')} registros · página {pagina + 1} de {totalPags}</span>
          <div className="flex gap-2">
            <button onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={pagina === 0}
              className="px-3 py-1 border border-bd rounded hover:bg-s3 disabled:opacity-40">← Anterior</button>
            <button onClick={() => setPagina(p => Math.min(totalPags - 1, p + 1))} disabled={pagina === totalPags - 1}
              className="px-3 py-1 border border-bd rounded hover:bg-s3 disabled:opacity-40">Próxima →</button>
          </div>
        </div>
      )}
    </div>
  )
}
