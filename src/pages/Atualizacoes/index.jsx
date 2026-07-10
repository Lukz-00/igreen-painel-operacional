import { useEffect, useMemo, useState } from 'react'
import { Download, FileSpreadsheet, Pencil, Play, Search } from 'lucide-react'
import { UploadBox } from '../../components/ui/UploadBox'
import { ColumnMapper } from '../../components/ui/ColumnMapper'
import { LogPanel } from '../../components/ui/LogPanel'
import { MetricCard } from '../../components/ui/MetricCard'
import { Button } from '../../components/ui/Button'
import { TabBar } from '../../components/ui/TabBar'
import {
  downloadUrl,
  previewSpreadsheetSheet,
  processAtualizacoes,
  uploadSpreadsheet,
  workbookAtualizacoesUrl,
} from '../../utils/pythonApi'

const FONTES = {
  atualizacao: { label: 'Atualizacoes GV', sub: 'Aba Para atualizar', schema: 'atu_update' },
  faturamento: { label: 'Faturamento Consolidado', sub: 'PLANILHA_UNIFICADA_CONSOLIDADA', schema: 'atu_faturamento' },
  rec: { label: 'Recebiveis', sub: 'Busca IDRCB antigo', schema: 'atu_rec' },
  pag_northen: { label: 'Pagadoria Northen', sub: 'Fallback Northen', schema: 'atu_pag' },
  pag_interna: { label: 'Pagadoria Interna', sub: 'Fallback interna / IUGU', schema: 'atu_pag' },
}

const ABAS = [
  { key: 'atualizacoes', label: 'Atualizacoes', cor: '#22c55e' },
  { key: 'pendencias', label: 'Pendencias', cor: '#f59e0b' },
  { key: 'auditoria', label: 'Auditoria', cor: '#3b82f6' },
]

const COLUNAS = {
  atualizacoes: [
    'IDRCB', 'FAVORECIDO', 'COD. Cliente', 'DISTRIBUIDORA', 'NOME DO CLIENTE',
    'UNIDADE CONSUMIDORA (UC)', 'MÊS DE REFERÊNCIA', 'VALOR DA FATURA (R$)',
    'CÓDIGO DE BARRAS', 'NOVA DATA DE VENCIMENTO', 'ID Cobrança', 'IUGU',
  ],
  pendencias: ['IDRCB', 'COD. Cliente', 'NOME DO CLIENTE', 'UNIDADE CONSUMIDORA (UC)', 'MÊS DE REFERÊNCIA', 'Criticos faltantes', 'Match Recebiveis', 'Match Faturamento', 'Match Pagadoria Northen', 'Match Pagadoria Interna'],
  auditoria: ['IDRCB', 'COD. Cliente', 'NOME DO CLIENTE', 'UNIDADE CONSUMIDORA (UC)', 'MÊS DE REFERÊNCIA', 'Fonte IDRCB', 'Match Recebiveis', 'Match Faturamento', 'Match Pagadoria Northen', 'Match Pagadoria Interna', 'Criticos faltantes'],
}

function normText(value) {
  return String(value || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function escolherAbaPadrao(key, sheets = [], fallback = '') {
  const normalized = sheets.map(name => ({ name, lower: String(name).toLowerCase() }))
  if (key === 'atualizacao') {
    return normalized.find(s => s.lower.includes('para atualizar'))?.name || fallback
  }
  if (key === 'faturamento') {
    return normalized.find(s => s.lower.includes('unificada'))?.name
      || normalized.find(s => s.lower === 'sheet1')?.name
      || fallback
  }
  if (key === 'pag_northen' || key === 'pag_interna') {
    return normalized.find(s => s.lower === 'planilha1')?.name || fallback
  }
  return fallback
}

function addHora(logs) {
  const hora = new Date().toLocaleTimeString('pt-BR')
  return (logs || []).map(item => ({ ...item, hora }))
}

export function Atualizacoes() {
  const keys = Object.keys(FONTES)
  const [uploads, setUploads] = useState({})
  const [raw, setRaw] = useState({})
  const [headers, setHeaders] = useState({})
  const [nomes, setNomes] = useState({})
  const [sheetNames, setSheetNames] = useState({})
  const [selectedSheets, setSelectedSheets] = useState({})
  const [mappings, setMappings] = useState({})
  const [mapper, setMapper] = useState({ open: false, key: '' })
  const [logs, setLogs] = useState([])
  const [resultado, setResultado] = useState(null)
  const [jobId, setJobId] = useState(null)
  const [abaAtiva, setAbaAtiva] = useState('atualizacoes')
  const [busca, setBusca] = useState('')
  const [processando, setProcessando] = useState(false)

  const handleFile = key => async file => {
    try {
      setLogs(prev => [...prev, { msg: `Enviando ${file.name}...`, tipo: 'info', hora: new Date().toLocaleTimeString('pt-BR') }])
      const uploaded = await uploadSpreadsheet(file)
      const sheets = uploaded.sheets || []
      const sheetName = escolherAbaPadrao(key, sheets, uploaded.sheet_name || '')
      const preview = sheetName && sheetName !== uploaded.sheet_name
        ? await previewSpreadsheetSheet(uploaded.upload_id, sheetName)
        : uploaded
      setUploads(prev => ({ ...prev, [key]: uploaded }))
      setRaw(prev => ({ ...prev, [key]: preview.rows || [] }))
      setHeaders(prev => ({ ...prev, [key]: preview.headers || Object.keys(preview.rows?.[0] || {}) }))
      setNomes(prev => ({ ...prev, [key]: file.name }))
      setSheetNames(prev => ({ ...prev, [key]: sheets }))
      setSelectedSheets(prev => ({ ...prev, [key]: sheetName || '' }))
      setMappings(prev => ({ ...prev, [key]: null }))
      setMapper({ open: true, key })
      setResultado(null)
      setJobId(null)
      setLogs(prev => [...prev, { msg: `${FONTES[key].label}: ${preview.row_count.toLocaleString('pt-BR')} linhas${sheetName ? ` / ${sheetName}` : ''}`, tipo: 'ok', hora: new Date().toLocaleTimeString('pt-BR') }])
    } catch (err) {
      setLogs(prev => [...prev, { msg: `Erro ao enviar ${file.name}: ${err.message}`, tipo: 'err', hora: new Date().toLocaleTimeString('pt-BR') }])
    }
  }

  const handleSheetChange = key => async sheetName => {
    if (!uploads[key]) return
    try {
      const preview = await previewSpreadsheetSheet(uploads[key].upload_id, sheetName)
      setSelectedSheets(prev => ({ ...prev, [key]: preview.sheet_name || sheetName }))
      setRaw(prev => ({ ...prev, [key]: preview.rows || [] }))
      setHeaders(prev => ({ ...prev, [key]: preview.headers || Object.keys(preview.rows?.[0] || {}) }))
      setMappings(prev => ({ ...prev, [key]: null }))
      setMapper({ open: true, key })
      setResultado(null)
      setJobId(null)
    } catch (err) {
      setLogs(prev => [...prev, { msg: `Erro ao trocar aba: ${err.message}`, tipo: 'err', hora: new Date().toLocaleTimeString('pt-BR') }])
    }
  }

  const handleMapperConfirm = (_remapped, mapping) => {
    const key = mapper.key
    setMappings(prev => ({ ...prev, [key]: mapping }))
    setMapper({ open: false, key: '' })
    setLogs(prev => [...prev, { msg: `${FONTES[key].label}: mapeamento confirmado`, tipo: 'ok', hora: new Date().toLocaleTimeString('pt-BR') }])
  }

  const pronto = keys.every(key => uploads[key] && mappings[key])

  const processar = async () => {
    if (!pronto) return
    setProcessando(true)
    setResultado(null)
    setJobId(null)
    setLogs([])
    try {
      const source = key => ({ upload_id: uploads[key].upload_id, mapping: mappings[key] || {}, sheet_name: selectedSheets[key] || null })
      const response = await processAtualizacoes({
        atualizacao: source('atualizacao'),
        faturamento: source('faturamento'),
        rec: source('rec'),
        pag_northen: source('pag_northen'),
        pag_interna: source('pag_interna'),
      })
      setResultado(response)
      setJobId(response.job_id)
      setLogs(addHora(response.logs))
      setAbaAtiva((response.counts?.linhasComPendencias || 0) > 0 ? 'pendencias' : 'atualizacoes')
    } catch (err) {
      setLogs([{ msg: `Erro: ${err.message}`, tipo: 'err', hora: new Date().toLocaleTimeString('pt-BR') }])
    } finally {
      setProcessando(false)
    }
  }

  const abasComCount = ABAS.map(aba => ({
    ...aba,
    count: resultado
      ? aba.key === 'atualizacoes'
        ? resultado.counts?.totalAtualizacoes || 0
        : aba.key === 'pendencias'
          ? resultado.counts?.linhasComPendencias || 0
          : resultado.counts?.totalAtualizacoes || 0
      : undefined,
  }))

  const rowsAtivas = useMemo(() => {
    const rows = resultado?.rows?.[abaAtiva] || []
    const q = normText(busca)
    return rows.filter(row => !q || normText(Object.values(row).join(' ')).includes(q))
  }, [resultado, abaAtiva, busca])

  return (
    <div className="p-7 space-y-5">
      <ColumnMapper
        open={mapper.open}
        raw={raw[mapper.key] || []}
        headers={headers[mapper.key] || []}
        schemaKey={FONTES[mapper.key]?.schema}
        title={`Mapear colunas - ${FONTES[mapper.key]?.label || ''}`}
        fileName={nomes[mapper.key]}
        savedMapping={mappings[mapper.key]}
        onConfirm={handleMapperConfirm}
        onCancel={() => setMapper({ open: false, key: '' })}
      />

      <div className="pb-5 border-b border-bd">
        <h1 className="text-xl font-bold text-tx mb-1">Atualizacoes</h1>
        <p className="text-sm text-tx3">Monta a planilha de boletos atualizados usando Atualizacoes GV, faturamento consolidado, Recebiveis e Pagadorias Northen/Interna.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        {keys.map(key => (
          <UploadSlot
            key={key}
            label={FONTES[key].label}
            sublabel={FONTES[key].sub}
            loaded={!!uploads[key]}
            mapped={!!mappings[key]}
            fileName={nomes[key]}
            sheets={sheetNames[key] || []}
            selectedSheet={selectedSheets[key]}
            onSheetChange={handleSheetChange(key)}
            onFile={handleFile(key)}
            onReabrir={() => uploads[key] && setMapper({ open: true, key })}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-4 bg-bg2 border border-bd rounded-xl p-4">
        <div className="flex items-center gap-3">
          <FileSpreadsheet size={15} className="text-acc" />
          <span className="text-xs text-tx3">A planilha Atualizacoes tem prioridade; as outras bases completam apenas campos faltantes.</span>
        </div>
        <Button variant="primary" onClick={processar} disabled={!pronto || processando}>
          <Play size={14} />
          {processando ? 'Processando...' : 'Processar'}
        </Button>
      </div>

      <LogPanel logs={logs} />

      {resultado && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <MetricCard label="Atualizacoes" value={resultado.counts?.totalAtualizacoes || 0} sub="linhas analisadas" color="#22c55e" onClick={() => setAbaAtiva('atualizacoes')} />
            <MetricCard label="Prontas" value={resultado.counts?.linhasProntas || 0} sub="criticos preenchidos" color="#22c55e" />
            <MetricCard label="Pendencias" value={resultado.counts?.linhasComPendencias || 0} sub="criticos faltando" color="#f59e0b" onClick={() => setAbaAtiva('pendencias')} />
            <MetricCard label="Recebiveis" value={resultado.counts?.encontradasRecebiveis || 0} sub="IDRCB localizado" color="#3b82f6" />
            <MetricCard label="Faturamento" value={resultado.counts?.encontradasFaturamento || 0} sub="consolidada" color="#a855f7" />
            <MetricCard label="Pagadorias" value={(resultado.counts?.encontradasPagadoriaNorthen || 0) + (resultado.counts?.encontradasPagadoriaInterna || 0)} sub="Northen + Interna" color="#f97316" />
          </div>

          <div className="rounded-xl border border-bd bg-s1 overflow-hidden">
            <div className="p-4 border-b border-bd flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[260px] max-w-md">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx3" />
                <input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar cliente, UC, IDRCB ou boleto"
                  className="w-full bg-bg border border-bd rounded-lg pl-9 pr-3 py-2 text-sm text-tx outline-none focus:border-acc"
                />
              </div>
              <div className="ml-auto text-xs text-tx3">{rowsAtivas.length.toLocaleString('pt-BR')} registros exibidos</div>
              <Button variant="default" onClick={() => jobId && downloadUrl(workbookAtualizacoesUrl(jobId))}>
                <Download size={14} />
                Exportar
              </Button>
            </div>
            <div className="px-4 pt-4">
              <TabBar abas={abasComCount} abaAtiva={abaAtiva} onTab={setAbaAtiva} />
            </div>
            <ResultTable rows={rowsAtivas} aba={abaAtiva} />
          </div>
        </div>
      )}
    </div>
  )
}

function UploadSlot({ label, sublabel, loaded, mapped, fileName, sheets = [], selectedSheet, onSheetChange, onFile, onReabrir }) {
  return (
    <div className="relative space-y-2">
      <UploadBox label={label} sublabel={mapped ? 'Mapeamento confirmado' : sublabel} loaded={loaded} fileName={fileName} onFile={onFile} />
      {loaded && (
        <button
          onClick={onReabrir}
          title="Editar mapeamento de colunas"
          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg border border-acc/30 bg-acc/10 text-acc hover:bg-acc/20 transition-colors z-10"
        >
          <Pencil size={13} />
        </button>
      )}
      {loaded && sheets.length > 1 && (
        <select
          value={selectedSheet || ''}
          onChange={e => onSheetChange(e.target.value)}
          className="w-full bg-s1 border border-bd rounded-lg px-3 py-2 text-xs text-tx outline-none focus:border-acc"
        >
          {sheets.map(sheet => <option key={sheet} value={sheet}>{sheet}</option>)}
        </select>
      )}
    </div>
  )
}

function ResultTable({ rows, aba }) {
  const [pagina, setPagina] = useState(0)
  const porPagina = 120
  const totalPaginas = Math.ceil(rows.length / porPagina)
  const slice = rows.slice(pagina * porPagina, (pagina + 1) * porPagina)
  const colunas = COLUNAS[aba] || Object.keys(rows[0] || {})

  useEffect(() => {
    setPagina(0)
  }, [rows, aba])

  if (!rows.length) {
    return <div className="py-12 text-center text-sm text-tx3">Nenhum registro encontrado nesta aba.</div>
  }

  return (
    <div>
      <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              {colunas.map(col => (
                <th key={col} className="sticky top-0 bg-s2 border-b border-bd px-3 py-2.5 text-left text-[10px] font-semibold uppercase text-tx3 whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((row, index) => (
              <tr key={index} className="border-b border-bd hover:bg-s2/50 transition-colors">
                {colunas.map(col => {
                  const hot = ['Criticos faltantes', 'IDRCB', 'ID Cobrança', 'IUGU'].includes(col)
                  return (
                    <td key={col} className={`px-3 py-2.5 whitespace-nowrap max-w-[320px] truncate ${hot ? 'text-warn font-semibold' : 'text-tx2'}`} title={String(row[col] ?? '')}>
                      {String(row[col] ?? '-')}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPaginas > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-bd bg-s2 text-[11px] text-tx3">
          <span>{rows.length.toLocaleString('pt-BR')} registros - pagina {pagina + 1} de {totalPaginas}</span>
          <div className="flex gap-2">
            <button onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={pagina === 0} className="px-3 py-1 border border-bd rounded hover:bg-s3 disabled:opacity-40">Anterior</button>
            <button onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))} disabled={pagina === totalPaginas - 1} className="px-3 py-1 border border-bd rounded hover:bg-s3 disabled:opacity-40">Proxima</button>
          </div>
        </div>
      )}
    </div>
  )
}
