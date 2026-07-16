import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Download, FileSpreadsheet, Pencil, Play, Search } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { UploadBox } from '../../components/ui/UploadBox'
import { MetricCard } from '../../components/ui/MetricCard'
import { TabBar } from '../../components/ui/TabBar'
import { Button } from '../../components/ui/Button'
import { ColumnMapper } from '../../components/ui/ColumnMapper'
import { LogPanel } from '../../components/ui/LogPanel'
import { LoadingSquares } from '../../components/ui/LoadingSquares'
import { ProcessMetaLine } from '../../components/ui/ProcessMetaLine'
import {
  downloadUrl,
  previewSpreadsheetSheet,
  processQualidadeEdp,
  uploadSpreadsheet,
  workbookQualidadeEdpUrl,
} from '../../utils/pythonApi'

const FONTES = {
  cli: { label: 'Base EDP', sub: 'Clientes EDP', schema: 'qualidade_edp_cli' },
  rec: { label: 'BASE_rcb EDP', sub: 'Recebiveis EDP', schema: 'qualidade_edp_rec' },
  pag: { label: 'Pagadoria EDP', sub: 'Boletos e energia compensada', schema: 'qualidade_edp_pag' },
}

const ABAS = [
  { key: 'healthscore', label: 'HealthScore EDP', cor: '#22c55e' },
  { key: 'atencao', label: 'Atencao', cor: '#ef4444' },
  { key: 'semDados', label: 'Sem dados', cor: '#94a3b8' },
  { key: 'resumoCriterios', label: 'Resumo criterios', cor: '#3b82f6' },
]

const COLUNAS = {
  healthscore: [
    'Cobranca',
    'Cliente',
    'N Instalacao',
    'Distribuidora',
    'Mes Referencia',
    'Status Boleto',
    'Valor do Boleto (R$)',
    'HealthScore (%)',
    'Diagnostico',
    'N criterios aplicaveis',
    'C1: Simulado >= Boleto',
    'C2: Consumo vs Media (+/-40%)',
    'C3: Economia vs Media (+/-30%)',
    'C5: Tarifa vs Media (+/-10%)',
    'C6: Sem leitura divergente no mes',
    'C9: Consumo > Disponibilidade',
    'C13: Compensada <= Integral',
    'Consumo Mes (kWh)',
    'Media Consumo UC (kWh)',
    'Disponibilidade (kWh)',
    'Energia Compensada (kWh)',
    'Compensacao Integral Possivel (kWh)',
    'Match Cliente',
    'Match RCB',
    'IDRCB',
  ],
  atencao: [
    'Cobranca',
    'Cliente',
    'N Instalacao',
    'Distribuidora',
    'Mes Referencia',
    'HealthScore (%)',
    'Diagnostico',
    'C1: Simulado >= Boleto',
    'C2: Consumo vs Media (+/-40%)',
    'C3: Economia vs Media (+/-30%)',
    'C5: Tarifa vs Media (+/-10%)',
    'C6: Sem leitura divergente no mes',
    'C9: Consumo > Disponibilidade',
    'C13: Compensada <= Integral',
    'Match Cliente',
    'Match RCB',
  ],
  semDados: [
    'Cobranca',
    'Cliente',
    'N Instalacao',
    'Distribuidora',
    'Mes Referencia',
    'N criterios aplicaveis',
    'Diagnostico',
    'Match Cliente',
    'Match RCB',
  ],
  resumoCriterios: ['Criterio', 'Aplicaveis', 'OK', 'Divergentes', 'N/A'],
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

function addHora(logs) {
  const hora = new Date().toLocaleTimeString('pt-BR')
  return (logs || []).map(item => ({ ...item, hora }))
}

function escolherAbaPadrao(key, sheets = [], fallback = '') {
  const normalized = sheets.map(name => ({ name, lower: String(name).toLowerCase() }))
  if (key === 'pag') {
    return normalized.find(s => s.lower === 'export')?.name
      || normalized.find(s => s.lower.includes('pagadoria'))?.name
      || normalized.find(s => s.lower.includes('planilha1'))?.name
      || fallback
  }
  return normalized.find(s => s.lower.includes('base'))?.name || fallback
}

function scoreColor(score) {
  if (score >= 95) return '#22c55e'
  if (score >= 80) return '#fbbf24'
  return '#ef4444'
}

export function QualidadeInjecao() {
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
  const [abaAtiva, setAbaAtiva] = useState('healthscore')
  const [busca, setBusca] = useState('')
  const [processando, setProcessando] = useState(false)

  const handleFile = key => async file => {
    try {
      setLogs(prev => [...prev, { msg: `Enviando ${file.name} para o motor Polars...`, tipo: 'info', hora: new Date().toLocaleTimeString('pt-BR') }])
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
      const sizeLabel = uploaded.file_size_label ? ` / ${uploaded.file_size_label}` : ''
      setLogs(prev => [...prev, { msg: `${FONTES[key].label}: ${preview.row_count.toLocaleString('pt-BR')} linhas${sheetName ? ` / ${sheetName}` : ''}${sizeLabel}`, tipo: 'ok', hora: new Date().toLocaleTimeString('pt-BR') }])
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
      setResultado(null)
      setJobId(null)
      setMapper({ open: true, key })
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
      const response = await processQualidadeEdp({
        cli: source('cli'),
        rec: source('rec'),
        pag: source('pag'),
      })
      setResultado(response)
      setJobId(response.job_id)
      setLogs(addHora(response.logs))
      setAbaAtiva((response.counts?.atencao || 0) > 0 ? 'atencao' : 'healthscore')
    } catch (err) {
      setLogs([{ msg: `Erro: ${err.message}`, tipo: 'err', hora: new Date().toLocaleTimeString('pt-BR') }])
    } finally {
      setProcessando(false)
    }
  }

  const rowsAtivas = useMemo(() => {
    const rows = resultado?.rows?.[abaAtiva] || []
    const q = normText(busca)
    return rows.filter(row => !q || normText(Object.values(row).join(' ')).includes(q))
  }, [resultado, abaAtiva, busca])

  const abasComCount = ABAS.map(aba => ({
    ...aba,
    count: resultado
      ? aba.key === 'healthscore'
        ? resultado.counts?.totalAnalisado || 0
        : aba.key === 'atencao'
          ? resultado.counts?.atencao || 0
          : aba.key === 'semDados'
            ? resultado.counts?.semDados || 0
            : resultado.rows?.resumoCriterios?.length || 0
      : undefined,
  }))

  const grafico = useMemo(() => {
    const rows = resultado?.rows?.healthscore || []
    const excelentes = rows.filter(r => Number(r['HealthScore (%)'] || 0) >= 95).length
    const bons = rows.filter(r => Number(r['HealthScore (%)'] || 0) >= 80 && Number(r['HealthScore (%)'] || 0) < 95).length
    const ruins = rows.filter(r => Number(r['HealthScore (%)'] || 0) < 80).length
    return {
      pie: [
        { name: 'Excelente >=95%', value: excelentes, fill: '#22c55e' },
        { name: 'Bom 80-94%', value: bons, fill: '#fbbf24' },
        { name: 'Atencao <80%', value: ruins, fill: '#ef4444' },
      ].filter(d => d.value > 0),
      criterios: (resultado?.rows?.resumoCriterios || []).map(row => ({
        name: String(row.Criterio || '').replace(': ', ' '),
        OK: Number(row.OK || 0),
        Divergentes: Number(row.Divergentes || 0),
        'N/A': Number(row['N/A'] || 0),
      })),
    }
  }, [resultado])

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
        <h1 className="text-xl font-bold text-tx mb-1">Qualidade de Injecao EDP</h1>
        <p className="text-sm text-tx3">HealthScore para boletos EDP usando Pagadoria_EDP, BASE_rcb e Base_edp.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {keys.map(key => (
          <UploadSlot
            key={key}
            label={FONTES[key].label}
            sublabel={mappings[key] ? 'Mapeamento confirmado' : FONTES[key].sub}
            loaded={!!uploads[key]}
            mapped={!!mappings[key]}
            fileName={nomes[key]}
            fileSize={uploads[key]?.file_size_label}
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
          <span className="text-xs text-tx3">Criterios C1, C2, C3, C5, C6, C9 e C13; campos sem insumo ficam N/A e nao entram no denominador.</span>
        </div>
        <Button variant="primary" onClick={processar} disabled={!pronto || processando}>
          <Play size={14} />
          {processando ? 'Processando...' : 'Processar HealthScore'}
        </Button>
      </div>

      <LoadingSquares active={processando} label="Processando HealthScore" />

      <LogPanel logs={logs} />
      <ProcessMetaLine meta={resultado?.meta} />

      {resultado && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <MetricCard label="Boletos analisados" value={resultado.counts?.totalAnalisado || 0} sub="Pagadoria EDP" color="#3b82f6" onClick={() => setAbaAtiva('healthscore')} />
            <MetricCard label="HealthScore medio" value={`${resultado.counts?.mediaHealthScore || 0}%`} sub="criterios aplicaveis" color={scoreColor(resultado.counts?.mediaHealthScore || 0)} />
            <MetricCard label="Excelentes" value={resultado.counts?.excelentes || 0} sub=">= 95%" color="#22c55e" />
            <MetricCard label="Atencao" value={resultado.counts?.atencao || 0} sub="< 80% ou divergente" color="#ef4444" onClick={() => setAbaAtiva('atencao')} />
            <MetricCard label="Match Base EDP" value={resultado.counts?.matchesCliente || 0} sub="cliente localizado" color="#a855f7" />
            <MetricCard label="Match BASE_rcb" value={resultado.counts?.matchesRecebiveis || 0} sub="recebivel localizado" color="#06b6d4" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_1.7fr] gap-4">
            <div className="bg-s1 border border-bd rounded-xl p-5">
              <p className="m-0 mb-3 text-xs font-bold text-tx3 uppercase tracking-wider">Distribuicao</p>
              <ResponsiveContainer width="100%" height={210}>
                <PieChart>
                  <Pie data={grafico.pie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={82} label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {grafico.pie.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: 'rgb(var(--color-tx3))' }} />
                  <Tooltip formatter={v => [`${v} registros`]} contentStyle={{ background: 'rgb(var(--color-s1))', border: '1px solid rgb(var(--color-bd))', borderRadius: 8, color: 'rgb(var(--color-tx))', fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-s1 border border-bd rounded-xl p-5">
              <p className="m-0 mb-3 text-xs font-bold text-tx3 uppercase tracking-wider">Cobertura dos criterios</p>
              <ResponsiveContainer width="100%" height={210}>
                <BarChart data={grafico.criterios} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-bd) / 0.65)" />
                  <XAxis dataKey="name" tick={{ fill: 'rgb(var(--color-tx3))', fontSize: 9 }} />
                  <YAxis tick={{ fill: 'rgb(var(--color-tx3))', fontSize: 9 }} />
                  <Tooltip contentStyle={{ background: 'rgb(var(--color-s1))', border: '1px solid rgb(var(--color-bd))', borderRadius: 8, color: 'rgb(var(--color-tx))', fontSize: 11 }} />
                  <Bar dataKey="OK" stackId="a" fill="#22c55e" />
                  <Bar dataKey="Divergentes" stackId="a" fill="#ef4444" />
                  <Bar dataKey="N/A" stackId="a" fill="#94a3b8" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-bd bg-s1 overflow-hidden">
            <div className="p-4 border-b border-bd flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[260px] max-w-md">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx3" />
                <input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar cliente, UC, competencia ou criterio"
                  className="w-full bg-bg border border-bd rounded-lg pl-9 pr-3 py-2 text-sm text-tx outline-none focus:border-acc"
                />
              </div>
              <div className="ml-auto text-xs text-tx3">{rowsAtivas.length.toLocaleString('pt-BR')} registros exibidos</div>
              <Button variant="default" onClick={() => jobId && downloadUrl(workbookQualidadeEdpUrl(jobId))}>
                <Download size={14} />
                Exportar
              </Button>
            </div>
            <div className="px-4 pt-4">
              <TabBar abas={abasComCount} abaAtiva={abaAtiva} onTab={setAbaAtiva} />
            </div>
            {resultado.preview_limit && (resultado.counts?.totalAnalisado || 0) > (resultado.rows?.healthscore?.length || 0) && abaAtiva === 'healthscore' && (
              <p className="px-5 pb-2 text-xs text-tx3">
                Previa das primeiras {(resultado.rows?.healthscore?.length || 0).toLocaleString('pt-BR')} linhas; a exportacao contem todos os registros.
              </p>
            )}
            <ResultTable rows={rowsAtivas} aba={abaAtiva} />
          </div>

          <div className="flex gap-3 rounded-xl border border-warn/30 bg-warn/10 p-4 text-sm text-tx2">
            <AlertTriangle size={18} className="text-warn flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-tx mb-1">Observacao dos criterios</div>
              <div>
                C1 e C3 dependem do valor simulado da distribuidora nos recebiveis. Se a BASE_rcb enviada nao tiver essa coluna, esses criterios ficam N/A e o HealthScore e calculado apenas com os demais criterios aplicaveis.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function UploadSlot({ label, sublabel, loaded, mapped, fileName, fileSize, sheets = [], selectedSheet, onSheetChange, onFile, onReabrir }) {
  return (
    <div className="relative space-y-2">
      <UploadBox label={label} sublabel={sublabel} loaded={loaded} fileName={fileName} onFile={onFile} />
      {loaded && (
        <button
          onClick={onReabrir}
          title="Editar mapeamento de colunas"
          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg border border-acc/30 bg-acc/10 text-acc hover:bg-acc/20 transition-colors z-10"
        >
          <Pencil size={13} />
        </button>
      )}
      {loaded && mapped && (
        <div className="text-[10px] font-semibold text-acc">Mapeamento confirmado</div>
      )}
      {loaded && fileSize && (
        <div className="text-[10px] text-tx3">Tamanho: {fileSize}</div>
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
                  const value = row[col]
                  const hot = String(value || '').includes('Divergente') || col === 'HealthScore (%)'
                  const color = col === 'HealthScore (%)' ? scoreColor(Number(value || 0)) : undefined
                  return (
                    <td key={col} className={`px-3 py-2.5 whitespace-nowrap max-w-[340px] truncate ${hot ? 'font-semibold' : 'text-tx2'}`} style={{ color }} title={String(value ?? '')}>
                      {String(value ?? '-')}
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
