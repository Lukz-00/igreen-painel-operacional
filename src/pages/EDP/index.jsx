import { useState, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { Play, Download, Pencil } from 'lucide-react'
import { UploadBox } from '../../components/ui/UploadBox'
import { MetricCard } from '../../components/ui/MetricCard'
import { DataTable } from '../../components/ui/DataTable'
import { DivergentesTable } from '../../components/ui/DivergentesTable'
import { LogPanel } from '../../components/ui/LogPanel'
import { TabBar } from '../../components/ui/TabBar'
import { Button } from '../../components/ui/Button'
import { ColumnMapper } from '../../components/ui/ColumnMapper'
import { edpCruzar } from '../../utils/edpCruzar'
import { normalizarRows } from '../../utils/normalizadores'
import { addDebugLog, addErrorLog, downloadLogs } from '../../utils/logErros'

// ── Apara o !ref de sheets com colunas fantasma (ex: BC Mem. Cálculo) ────
function _colLetterToNum(col) {
  let n = 0
  for (let i = 0; i < col.length; i++) n = n * 26 + (col.charCodeAt(i) - 64)
  return n
}
function _colNumToLetter(n) {
  let s = ''
  while (n > 0) { const r = (n-1)%26; s = String.fromCharCode(65+r)+s; n = Math.floor((n-1)/26) }
  return s
}
function trimSheetRef(ws) {
  if (!ws || !ws['!ref']) return ws
  try {
    const range = XLSX.utils.decode_range(ws['!ref'])
    let maxCol = 0, maxRow = range.e.r
    for (const key of Object.keys(ws)) {
      if (key.startsWith('!')) continue
      const m = key.match(/^([A-Z]+)(\d+)$/)
      if (!m) continue
      const cv = ws[key]
      if (cv && cv.v !== undefined && cv.v !== null && cv.v !== '') {
        const c = _colLetterToNum(m[1]); if (c > maxCol) maxCol = c
        const r = parseInt(m[2], 10) - 1; if (r > maxRow) maxRow = r
      }
    }
    if (maxCol === 0) return ws
    const endRef = _colNumToLetter(maxCol + 5) + (maxRow + 1)
    ws['!ref'] = `${XLSX.utils.encode_cell({ r: range.s.r, c: range.s.c })}:${endRef}`
  } catch (_) {}
  return ws
}

// ── Leitura de XLSX ──────────────────────────────────────────────────────────
function lerXlsx(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        addDebugLog('EDP: lendo arquivo', { nome: file.name, tamanho: file.size })
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true })
        let ws  = trimSheetRef(wb.Sheets[wb.SheetNames[0]])
        let raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
        if (!raw.length) {
          const wb2 = XLSX.read(e.target.result, { type: 'array', cellDates: true, dense: true })
          ws  = wb2.Sheets[wb2.SheetNames[0]]
          raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })
        }
        resolve(normalizarRows(raw))
      } catch (err) {
        addErrorLog('EDP_LEITURA', err.message, { stack: err.stack })
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

// Campos internos de raw para expandir no export
const RAW_FIELD_MAP = [
  { key: '_rawPag', prefix: '[PAG] ' },
  { key: '_rawRec', prefix: '[REC] ' },
  { key: '_rawBol', prefix: '[BOL] ' },
  { key: '_rawBko', prefix: '[BKO] ' },
]

function cleanForExport(row) {
  const o = {}
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith('_')) continue
    o[k] = v ?? ''
  }
  for (const { key, prefix } of RAW_FIELD_MAP) {
    const raw = row[key]
    if (!raw || typeof raw !== 'object') continue
    for (const [k, v] of Object.entries(raw)) {
      if (k.startsWith('_')) continue
      const label = `${prefix}${k}`
      if (!(label in o)) o[label] = v === null || v === undefined ? '' : v
    }
  }
  return o
}

function exportXlsx(rows, filename) {
  if (!rows.length) return
  const wb  = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map(cleanForExport)), 'Dados')
  const buf  = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], { type: 'application/octet-stream' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

function fmtBRL(v) {
  if (!v) return 'R$ 0'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

// ── Abas da tabela de resultados ────────────────────────────────────────────
const ABAS = [
  { key: 'inadimplente',     label: 'Inadimplente',          cor: '#ef4444' },
  { key: 'naoEmitida',       label: 'Não Emitida',           cor: '#f97316' },
  { key: 'emAberto',         label: 'Em Aberto',              cor: '#f59e0b' },
  { key: 'vencidos',         label: 'Vencidos (REC)',         cor: '#a78bfa' },
  { key: 'darBaixa',         label: 'Dar Baixa',              cor: '#22c55e' },
  { key: 'divergentes',      label: 'Divergentes',            cor: '#fb923c' },
  { key: 'faltaNaPagadoria', label: 'Falta na Pagadoria',    cor: '#a855f7' },
  { key: 'resumo',           label: 'Resumo Clientes',        cor: '#38bdf8' },
]

// ── Normalização das rows para exibição ────────────────────────────────────
import { saveHistoryLog } from '../../utils/history'

function normalizarResultado(res) {
  if (!res) return {}
  const fmt = rows => rows.map(r => {
    const o = { ...r }
    if (o.valor !== undefined)    o['Valor (R$)']   = fmtBRL(o.valor)
    if (o.totalAberto !== undefined) o['Total Em Aberto'] = fmtBRL(o.totalAberto)
    return o
  })
  return {
    inadimplente:     fmt(res.inadimplente      || []),
    naoEmitida:       fmt(res.naoEmitida         || []),
    emAberto:         fmt(res.emAberto           || []),
    vencidos:         fmt(res.vencidos           || []),
    darBaixa:         fmt(res.darBaixa           || []),
    divergentes:      res.divergentes             || [],
    faltaNaPagadoria: fmt(res.faltaNaPagadoria   || []),
    resumo:           fmt(res.resumoClientes      || []),
  }
}

// ── Componente principal ────────────────────────────────────────────────────
export function EDP() {
  const [rawBko, setRawBko] = useState(null)
  const [rawRec, setRawRec] = useState(null)
  const [rawBol, setRawBol] = useState(null)
  const [dfBko,  setDfBko]  = useState(null)
  const [dfRec,  setDfRec]  = useState(null)
  const [dfBol,  setDfBol]  = useState(null)
  const [nomeBko, setNomeBko] = useState('')
  const [nomeRec, setNomeRec] = useState('')
  const [nomeBol, setNomeBol] = useState('')

  const [mapperOpen,    setMapperOpen]    = useState(false)
  const [mapperKey,     setMapperKey]     = useState('bko')
  const [mapperRaw,     setMapperRaw]     = useState([])
  const [mapperHeaders, setMapperHeaders] = useState([])

  const [resultado,    setResultado]   = useState(null)
  const [abaAtiva,     setAbaAtiva]    = useState('inadimplente')
  const [logs,         setLogs]        = useState([])
  const [processando,  setProcessando] = useState(false)

  const addLog = (msg, tipo = 'info') => {
    const hora = new Date().toLocaleTimeString('pt-BR')
    setLogs(prev => [...prev, { msg, tipo, hora }])
  }

  const handleFile = async (file, key) => {
    try {
      const rows = await lerXlsx(file)
      if (!rows?.length) { addLog(`Planilha vazia: ${file.name}`, 'err'); return }
      if (key === 'bko') { setRawBko(rows); setNomeBko(file.name) }
      else if (key === 'rec') { setRawRec(rows); setNomeRec(file.name) }
      else { setRawBol(rows); setNomeBol(file.name) }
      setMapperKey(key)
      setMapperRaw(rows)
      setMapperHeaders(Object.keys(rows[0]))
      setMapperOpen(true)
    } catch (e) {
      addLog(`Erro ao ler ${file.name}: ${e.message}`, 'err')
    }
  }

  const reabrirMapper = key => {
    const rows = key === 'bko' ? rawBko : key === 'rec' ? rawRec : rawBol
    if (!rows) return
    setMapperKey(key); setMapperRaw(rows); setMapperHeaders(Object.keys(rows[0])); setMapperOpen(true)
  }

  const handleMapperConfirm = (remapped, mapping) => {
    setMapperOpen(false)
    if (mapperKey === 'bko') {
      setDfBko(remapped)
      addLog(`BackOffice: ${remapped.length.toLocaleString('pt-BR')} clientes`, 'ok')
    } else if (mapperKey === 'rec') {
      setDfRec(remapped)
      addLog(`Recebíveis: ${remapped.length.toLocaleString('pt-BR')} registros`, 'ok')
    } else {
      setDfBol(remapped)
      addLog(`Pagadoria EDP: ${remapped.length.toLocaleString('pt-BR')} registros`, 'ok')
    }
  }

  const processar = async () => {
    if (!dfBko || !dfRec) return
    setProcessando(true); setLogs([]); setResultado(null)
    try {
      await new Promise(r => setTimeout(r, 50))
      const res = edpCruzar(dfBko, dfRec, dfBol || null, addLog)
      setResultado(res)
      
      // Salvar histórico
      saveHistoryLog('EDP', {
        bko: nomeBko || 'N/A',
        rec: nomeRec || 'N/A',
        bol: nomeBol || 'N/A'
      }, {
        inadimplentes:    (res.inadimplente    || []).length,
        naoEmitida:       (res.naoEmitida      || []).length,
        emAberto:         (res.emAberto        || []).length,
        vencidos:         (res.vencidos        || []).length,
        darBaixa:         (res.darBaixa        || []).length,
        divergentes:      (res.divergentes     || []).length,
        faltaNaPagadoria: (res.faltaNaPagadoria|| []).length,
      })

      // Ativa a primeira aba com dados
      const first = ABAS.find(a => {
        const rows = normalizarResultado(res)[a.key] || []
        return rows.length > 0
      })
      setAbaAtiva(first?.key || 'inadimplente')
    } catch (e) {
      addLog(`Erro: ${e.message}`, 'err')
    } finally {
      setProcessando(false)
    }
  }

  const res = useMemo(() => normalizarResultado(resultado), [resultado])
  const m   = resultado?.metrics || {}

  const abasComCount = ABAS.map(a => ({
    ...a, count: res[a.key]?.length ?? undefined
  }))

  const mapperSchema = mapperKey === 'bko' ? 'fat_cli' : mapperKey === 'rec' ? 'fat_rec' : 'fat_pag'
  const mapperTitle  = mapperKey === 'bko'
    ? 'Análise de colunas — BackOffice Clientes EDP'
    : mapperKey === 'rec'
    ? 'Análise de colunas — Recebíveis Internos'
    : 'Análise de colunas — Pagadoria EDP (Boletos)'
  const mapperFile   = mapperKey === 'bko' ? nomeBko : mapperKey === 'rec' ? nomeRec : nomeBol

  const dateStr = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')

  const uploadBtn = (key, label, sublabel, df, nome) => (
    <div className="relative">
      <UploadBox
        label={label} sublabel={sublabel}
        onFile={f => handleFile(f, key)}
        loaded={!!df} fileName={nome}
      />
      {df && (
        <button onClick={() => reabrirMapper(key)} title="Editar mapeamento"
          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg border border-acc/30 bg-acc/10 text-acc hover:bg-acc/20 transition-colors z-10">
          <Pencil size={13} />
        </button>
      )}
    </div>
  )

  return (
    <div className="p-7 space-y-5">

      {/* Mapper */}
      <ColumnMapper
        open={mapperOpen} raw={mapperRaw} headers={mapperHeaders}
        schemaKey={mapperSchema} title={mapperTitle} fileName={mapperFile}
        onConfirm={handleMapperConfirm} onCancel={() => setMapperOpen(false)}
      />

      {/* Header */}
      <div className="pb-5 border-b border-bd">
        <h1 className="text-xl font-bold text-tx mb-1">EDP — Ativos Em Aberto</h1>
        <p className="text-sm text-tx3">Cruzamento BackOffice × Recebíveis × Pagadoria EDP. Identifica inadimplentes, vencidos e boletos para dar baixa.</p>
      </div>

      {/* Uploads — 3 colunas */}
      <div className="grid grid-cols-3 gap-4">
        {uploadBtn('bko', 'BackOffice Clientes EDP', 'Clientes com Data Ativo', dfBko, nomeBko)}
        {uploadBtn('rec', 'Recebíveis Internos',     'CMU BackOffice iGreen',   dfRec, nomeRec)}
        {uploadBtn('bol', 'Pagadoria EDP (opcional)', 'Boletos EDP exportados', dfBol, nomeBol)}
      </div>

      {/* Botões */}
      <div className="flex justify-between gap-3">
        <Button variant="default" onClick={downloadLogs}>
          <Download size={14} /> Baixar Logs de Erros
        </Button>
        <Button variant="primary" onClick={processar} disabled={!dfBko || !dfRec || processando}>
          <Play size={14} />
          {processando ? 'Processando…' : 'Processar Cruzamento'}
        </Button>
      </div>

      {/* Log */}
      <LogPanel logs={logs} />

      {/* Resultado */}
      {resultado && (
        <div className="space-y-5">

          {/* MetricCards — linha 1: totais */}
          <div className="grid grid-cols-4 gap-3">
            <MetricCard label="Clientes BKO"     value={m.totalBko}    sub="total BackOffice"  color="#38bdf8" />
            <MetricCard label="Ativos (c/ Data)"  value={m.totalAtivos} sub="Data Ativo preen." color="#22c55e" />
            <MetricCard label="Recebíveis (REC)"  value={m.totalRec}    sub="registros internos" color="#94a3b8" />
            <MetricCard label="Boletos EDP (BOL)" value={m.totalBol || '—'} sub="pagadoria EDP"  color="#94a3b8" />
          </div>

          {/* MetricCards — linha 2: categorias clicáveis */}
          <div className="grid grid-cols-4 gap-3">
            <MetricCard label="Inadimplente"     value={m.inadimplente}  sub="boleto vencido EDP"   color="#ef4444" onClick={() => setAbaAtiva('inadimplente')} />
            <MetricCard label="Não Emitida"      value={m.naoEmitida}    sub="fatura não gerada"    color="#f97316" onClick={() => setAbaAtiva('naoEmitida')} />
            <MetricCard label="Em Aberto"        value={m.emAberto}      sub="regular / a vencer"   color="#f59e0b" onClick={() => setAbaAtiva('emAberto')} />
            <MetricCard label="Vencidos (REC)"   value={m.vencidos}      sub="vencido no sistema"   color="#a78bfa" onClick={() => setAbaAtiva('vencidos')} />
          </div>

          <div className="grid grid-cols-4 gap-3">
            <MetricCard label="Dar Baixa"          value={m.darBaixa}         sub="PAG pago ≠ REC vencido"  color="#22c55e" onClick={() => setAbaAtiva('darBaixa')} />
            <MetricCard label="Divergentes"        value={m.divergentes}      sub="status BOL × REC"        color="#fb923c" onClick={() => setAbaAtiva('divergentes')} />
            <MetricCard label="Falta na Pagadoria" value={m.faltaNaPagadoria || 0} sub="REC sem boleto EDP" color="#a855f7" onClick={() => setAbaAtiva('faltaNaPagadoria')} />
            <MetricCard label="Clientes Únicos"    value={m.clientesUnicos}   sub="em aberto ou vencido"    color="#38bdf8" onClick={() => setAbaAtiva('resumo')} />
          </div>

          {/* Auditoria BOL x REC */}
          {resultado.auditoria && resultado.auditoria.totalBol > 0 && (
            <div className="p-5 rounded-xl border border-bd bg-bg2">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-tx">Auditoria — Reconciliação Pagadoria × Recebíveis</h3>
                <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-acc/10 text-acc">
                  Cobertura: {resultado.auditoria.taxaCobertura}%
                </span>
              </div>
              <div className="grid grid-cols-4 gap-4 text-center">
                <div className="p-3 rounded-lg bg-s1 border border-bd">
                  <div className="text-xs text-tx3 uppercase tracking-wider mb-1">Total BOL (Pagadoria)</div>
                  <div className="text-2xl font-bold text-tx">{resultado.auditoria.totalBol.toLocaleString('pt-BR')}</div>
                </div>
                <div className="p-3 rounded-lg bg-s1 border border-bd">
                  <div className="text-xs text-tx3 uppercase tracking-wider mb-1">Total REC (Recebíveis)</div>
                  <div className="text-2xl font-bold text-tx">{resultado.auditoria.totalRec.toLocaleString('pt-BR')}</div>
                </div>
                <div className="p-3 rounded-lg bg-s1 border border-red-500/20">
                  <div className="text-xs text-tx3 uppercase tracking-wider mb-1">Só no REC (sem BOL)</div>
                  <div className="text-2xl font-bold text-red-500">{resultado.auditoria.soNaRec.toLocaleString('pt-BR')}</div>
                  <div className="text-[10px] text-tx3 mt-1">boletos ausentes na Pagadoria</div>
                </div>
                <div className="p-3 rounded-lg bg-s1 border border-orange-500/20">
                  <div className="text-xs text-tx3 uppercase tracking-wider mb-1">Só na PAG (sem REC)</div>
                  <div className="text-2xl font-bold text-orange-500">{resultado.auditoria.soNaPag.toLocaleString('pt-BR')}</div>
                  <div className="text-[10px] text-tx3 mt-1">boletos não registrados internamente</div>
                </div>
              </div>
            </div>
          )}

          {/* Exportar */}
          <div className="flex justify-end gap-2">
            <Button variant="default" onClick={() => {
              const wb = XLSX.utils.book_new()
              ABAS.forEach(a => {
                const rows = res[a.key] || []
                if (rows.length) {
                  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map(cleanForExport)), a.label.slice(0,31))
                }
              })
              const buf = XLSX.write(wb, { bookType:'xlsx', type:'array' })
              const blob = new Blob([buf], { type:'application/octet-stream' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href=url; a.download=`edp_cruzamento_${dateStr}.xlsx`
              document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
            }}>
              <Download size={14} /> Exportar tudo (todas as abas)
            </Button>
          </div>

          {/* Tabela por abas */}
          <div className="bg-s1 border border-bd rounded-xl overflow-hidden">
            <div className="px-5 pt-5">
              <TabBar abas={abasComCount} abaAtiva={abaAtiva} onTab={setAbaAtiva} />
            </div>
            <div className="px-5 pb-5">
              {abaAtiva === 'divergentes'
                ? <DivergentesTable rows={res.divergentes || []} />
                : <DataTable
                    rows={res[abaAtiva] || []}
                    label={ABAS.find(a => a.key === abaAtiva)?.label?.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'') || abaAtiva}
                  />
              }
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
