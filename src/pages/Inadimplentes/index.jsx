import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Download, FileSearch, Pencil, Play, Search } from 'lucide-react'
import { UploadBox } from '../../components/ui/UploadBox'
import { MetricCard } from '../../components/ui/MetricCard'
import { TabBar } from '../../components/ui/TabBar'
import { Button } from '../../components/ui/Button'
import { ColumnMapper } from '../../components/ui/ColumnMapper'
import { LogPanel } from '../../components/ui/LogPanel'
import {
  downloadUrl,
  previewSpreadsheetSheet,
  processInadimplentes,
  uploadSpreadsheet,
  workbookInadimplentesUrl,
} from '../../utils/pythonApi'

const ABAS = [
  { key: 'inadimplentes', label: 'Inadimplentes', cor: '#ef4444' },
  { key: 'atrasoFaturamento', label: 'Atraso de Faturamento', cor: '#f59e0b' },
  { key: 'erroInterno', label: 'Erro Interno', cor: '#a855f7' },
  { key: 'atrasoBackoffice', label: 'Atraso Backoffice', cor: '#06b6d4' },
]

const COLUNAS = {
  inadimplentes: [
    'Cliente',
    'Codigo cliente',
    'CPF/CNPJ',
    'Instalacao',
    'Numero cliente',
    'Numero telefone',
    'Fornecedora',
    'Origem GV',
    'Origem base cliente',
    'Boletos esperados',
    'Boletos vencidos',
    'Meses vencidos',
    'Meses analisados',
    'Status vencidos',
    'Motivo',
  ],
  atrasoFaturamento: [
    'Cliente',
    'Codigo cliente',
    'CPF/CNPJ',
    'Instalacao',
    'Numero cliente',
    'Numero telefone',
    'Fornecedora',
    'Origem GV',
    'Origem base cliente',
    'Boletos esperados',
    'Qtd. Pagadoria',
    'Qtd. Recebiveis',
    'Qtd. faltas faturamento',
    'Qtd. meses com atraso',
    'Falta na Pagadoria',
    'Falta nos Recebiveis',
    'Falta nos dois lados',
    'Competencias esperadas',
    'Motivo',
  ],
  erroInterno: [
    'Cliente',
    'Codigo cliente',
    'CPF/CNPJ',
    'Instalacao',
    'Numero cliente',
    'Numero telefone',
    'Fornecedora',
    'Origem GV',
    'Origem base cliente',
    'Boletos esperados',
    'Qtd. Pagadoria',
    'Qtd. Recebiveis',
    'Qtd. Inclusao',
    'Meses Erro Interno',
    'Falta nos Recebiveis',
    'Tambem falta na Pagadoria',
    'Status Inclusao',
    'Vencimento Inclusao',
    'Valor Inclusao',
    'Codigo barras Inclusao',
    'Arquivo origem',
    'Criterio Inclusao',
    'Motivo',
  ],
  atrasoBackoffice: [
    'Cliente',
    'Codigo cliente',
    'CPF/CNPJ',
    'Instalacao',
    'Numero cliente',
    'Numero telefone',
    'Fornecedora',
    'Origem GV',
    'Origem base cliente',
    'Mes referencia',
    'Mes esperado emissao/inclusao',
    'Data emissao boleto',
    'Fonte emissao',
    'Data inclusao backoffice',
    'Atraso emissao (meses)',
    'Atraso inclusao (meses)',
    'ID RCB LAB',
    'Status LAB',
    'Vencimento LAB',
    'Valor LAB',
    'Motivo',
  ],
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
  if (key === 'pag' || key === 'pagNorthen') {
    return normalized.find(s => s.lower === 'planilha1')?.name
      || normalized.find(s => s.lower.includes('pagadoria'))?.name
      || normalized.find(s => s.lower.includes('northen'))?.name
      || normalized.find(s => s.lower.includes('norten'))?.name
      || fallback
  }
  if (key === 'pagCmu') {
    return normalized.find(s => s.lower.includes('recebimentos'))?.name
      || normalized.find(s => s.lower === 'planilha1')?.name
      || fallback
  }
  if (key === 'rec') {
    return normalized.find(s => s.lower.includes('base_rcb'))?.name
      || normalized.find(s => s.lower.includes('receb'))?.name
      || fallback
  }
  if (key === 'inc') {
    return normalized.find(s => s.lower.includes('unificada'))?.name
      || normalized.find(s => s.lower.includes('consolidada'))?.name
      || normalized.find(s => s.lower === 'sheet1')?.name
      || fallback
  }
  if (key === 'lab') {
    return normalized.find(s => s.lower.includes('sheet0'))?.name
      || normalized.find(s => s.lower.includes('gv pagos'))?.name
      || normalized.find(s => s.lower.includes('pagos'))?.name
      || normalized.find(s => s.lower.includes('vencidos'))?.name
      || fallback
  }
  return normalized.find(s => s.lower.includes('base_gv'))?.name
    || normalized.find(s => s.lower.includes('cliente'))?.name
    || fallback
}

function ResultTable({ rows, aba }) {
  const [pagina, setPagina] = useState(0)
  const porPagina = 120
  const totalPaginas = Math.ceil(rows.length / porPagina)
  const slice = rows.slice(pagina * porPagina, (pagina + 1) * porPagina)
  const colunas = COLUNAS[aba] || []

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
              <tr key={`${row._sortKey || ''}-${index}`} className="border-b border-bd hover:bg-s2/50 transition-colors">
                {colunas.map(col => {
                  const hot = ['Boletos vencidos', 'Qtd. faltas faturamento', 'Falta na Pagadoria', 'Falta nos Recebiveis', 'Falta nos dois lados', 'Meses Erro Interno', 'Qtd. Inclusao', 'Atraso emissao (meses)', 'Atraso inclusao (meses)'].includes(col)
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

export function Inadimplentes() {
  const labels = { pag: 'Pagadoria Interna', pagCmu: 'Pagadoria GV-CMU', pagNorthen: 'Pagadoria GV-Northen', rec: 'Recebiveis', cli: 'Base Clientes', inc: 'Inclusao Consolidada', lab: 'GV-Recebiveis' }
  const [uploads, setUploads] = useState({ pag: null, pagCmu: null, pagNorthen: null, rec: null, cli: null, inc: null, lab: null })
  const [raw, setRaw] = useState({ pag: [], pagCmu: [], pagNorthen: [], rec: [], cli: [], inc: [], lab: [] })
  const [headers, setHeaders] = useState({ pag: [], pagCmu: [], pagNorthen: [], rec: [], cli: [], inc: [], lab: [] })
  const [nomes, setNomes] = useState({ pag: '', pagCmu: '', pagNorthen: '', rec: '', cli: '', inc: '', lab: '' })
  const [sheetNames, setSheetNames] = useState({ pag: [], pagCmu: [], pagNorthen: [], rec: [], cli: [], inc: [], lab: [] })
  const [selectedSheets, setSelectedSheets] = useState({ pag: '', pagCmu: '', pagNorthen: '', rec: '', cli: '', inc: '', lab: '' })
  const [mappings, setMappings] = useState({})
  const [mapper, setMapper] = useState({ open: false, key: '' })
  const [logs, setLogs] = useState([])
  const [resultado, setResultado] = useState(null)
  const [jobId, setJobId] = useState(null)
  const [abaAtiva, setAbaAtiva] = useState('inadimplentes')
  const [busca, setBusca] = useState('')
  const [minVencidos, setMinVencidos] = useState(2)
  const [minFaltas, setMinFaltas] = useState(0)
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
      setLogs(prev => [...prev, { msg: `${preview.row_count.toLocaleString('pt-BR')} linhas detectadas em ${file.name}${sheetName ? ` / ${sheetName}` : ''}`, tipo: 'ok', hora: new Date().toLocaleTimeString('pt-BR') }])
    } catch (err) {
      setLogs(prev => [...prev, { msg: `Erro ao enviar ${file.name}: ${err.message}`, tipo: 'err', hora: new Date().toLocaleTimeString('pt-BR') }])
    }
  }

  const reabrirMapper = key => {
    if (!uploads[key]) return
    setMapper({ open: true, key })
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
      setLogs(prev => [...prev, { msg: `${labels[key] || key}: aba ${preview.sheet_name || sheetName} selecionada`, tipo: 'ok', hora: new Date().toLocaleTimeString('pt-BR') }])
    } catch (err) {
      setLogs(prev => [...prev, { msg: `Erro ao trocar aba: ${err.message}`, tipo: 'err', hora: new Date().toLocaleTimeString('pt-BR') }])
    }
  }

  const handleMapperConfirm = (_remapped, mapping) => {
    const key = mapper.key
    setMappings(prev => ({ ...prev, [key]: mapping }))
    setMapper({ open: false, key: '' })
    const label = labels[key] || key
    setLogs(prev => [...prev, { msg: `${label}: mapeamento confirmado`, tipo: 'ok', hora: new Date().toLocaleTimeString('pt-BR') }])
  }

  const pronto = uploads.pag && uploads.pagCmu && uploads.pagNorthen && uploads.rec && uploads.cli && uploads.inc && uploads.lab && mappings.pag && mappings.pagCmu && mappings.pagNorthen && mappings.rec && mappings.cli && mappings.inc && mappings.lab

  const processar = async () => {
    if (!pronto) return
    setProcessando(true)
    setResultado(null)
    setJobId(null)
    setLogs([])
    try {
      const payload = {
        pag: { upload_id: uploads.pag.upload_id, mapping: mappings.pag || {}, sheet_name: selectedSheets.pag || null },
        rec: { upload_id: uploads.rec.upload_id, mapping: mappings.rec || {}, sheet_name: selectedSheets.rec || null },
        cli: { upload_id: uploads.cli.upload_id, mapping: mappings.cli || {}, sheet_name: selectedSheets.cli || null },
        pag_cmu: { upload_id: uploads.pagCmu.upload_id, mapping: mappings.pagCmu || {}, sheet_name: selectedSheets.pagCmu || null },
        pag_northen: { upload_id: uploads.pagNorthen.upload_id, mapping: mappings.pagNorthen || {}, sheet_name: selectedSheets.pagNorthen || null },
        inc: { upload_id: uploads.inc.upload_id, mapping: mappings.inc || {}, sheet_name: selectedSheets.inc || null },
        lab: { upload_id: uploads.lab.upload_id, mapping: mappings.lab || {}, sheet_name: selectedSheets.lab || null },
        min_overdue: Number(minVencidos) || 2,
      }
      const response = await processInadimplentes(payload)
      setResultado(response)
      setJobId(response.job_id)
      setLogs(addHora(response.logs))
      setAbaAtiva((response.counts?.atrasoBackoffice || 0) > 0 ? 'atrasoBackoffice' : (response.counts?.erroInterno || 0) > 0 ? 'erroInterno' : (response.counts?.inadimplentes || 0) > 0 ? 'inadimplentes' : 'atrasoFaturamento')
    } catch (err) {
      setLogs([{ msg: `Erro: ${err.message}`, tipo: 'err', hora: new Date().toLocaleTimeString('pt-BR') }])
    } finally {
      setProcessando(false)
    }
  }

  const abasComCount = ABAS.map(aba => ({
    ...aba,
    count: resultado ? resultado.counts?.[aba.key] || 0 : undefined,
  }))

  const rowsAtivas = useMemo(() => {
    const rows = resultado?.rows?.[abaAtiva] || []
    const q = normText(busca)
    return rows.filter(row => {
      if (abaAtiva === 'atrasoFaturamento' && Number(row['Qtd. faltas faturamento'] || 0) < Number(minFaltas || 0)) return false
      if (!q) return true
      return normText(Object.values(row).join(' ')).includes(q)
    })
  }, [resultado, abaAtiva, busca, minFaltas])

  return (
    <div className="p-7 space-y-5">
      <ColumnMapper
        open={mapper.open}
        raw={raw[mapper.key] || []}
        headers={headers[mapper.key] || []}
        schemaKey={mapper.key === 'pag' || mapper.key === 'pagCmu' || mapper.key === 'pagNorthen' ? 'inad_pag' : mapper.key === 'rec' ? 'inad_rec' : mapper.key === 'inc' ? 'inad_inc' : mapper.key === 'lab' ? 'inad_gv_recebiveis' : 'inad_cli'}
        title={`Mapear colunas - ${labels[mapper.key] || ''}`}
        fileName={nomes[mapper.key]}
        savedMapping={mappings[mapper.key]}
        onConfirm={handleMapperConfirm}
        onCancel={() => setMapper({ open: false, key: '' })}
      />

      <div className="pb-5 border-b border-bd">
        <h1 className="text-xl font-bold text-tx mb-1">Inadimplentes</h1>
        <p className="text-sm text-tx3">Cruza Pagadorias Interna, GV-CMU e GV-Northen, Recebiveis, Base Clientes, Inclusao Consolidada e GV-Recebiveis para separar inadimplencia, atraso de faturamento, erro interno e entrada tardia no backoffice.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7 gap-4">
        <UploadSlot label="Pagadoria Interna" sublabel="Competencia, status e vencimento" loaded={!!uploads.pag} mapped={!!mappings.pag} fileName={nomes.pag} sheets={sheetNames.pag} selectedSheet={selectedSheets.pag} onSheetChange={handleSheetChange('pag')} onFile={handleFile('pag')} onReabrir={() => reabrirMapper('pag')} />
        <UploadSlot label="Pagadoria GV-CMU" sublabel="Recebimentos CMU" loaded={!!uploads.pagCmu} mapped={!!mappings.pagCmu} fileName={nomes.pagCmu} sheets={sheetNames.pagCmu} selectedSheet={selectedSheets.pagCmu} onSheetChange={handleSheetChange('pagCmu')} onFile={handleFile('pagCmu')} onReabrir={() => reabrirMapper('pagCmu')} />
        <UploadSlot label="Pagadoria GV-Northen" sublabel="Planilha1 Northen" loaded={!!uploads.pagNorthen} mapped={!!mappings.pagNorthen} fileName={nomes.pagNorthen} sheets={sheetNames.pagNorthen} selectedSheet={selectedSheets.pagNorthen} onSheetChange={handleSheetChange('pagNorthen')} onFile={handleFile('pagNorthen')} onReabrir={() => reabrirMapper('pagNorthen')} />
        <UploadSlot label="Base Recebiveis" sublabel="Boletos emitidos e status" loaded={!!uploads.rec} mapped={!!mappings.rec} fileName={nomes.rec} sheets={sheetNames.rec} selectedSheet={selectedSheets.rec} onSheetChange={handleSheetChange('rec')} onFile={handleFile('rec')} onReabrir={() => reabrirMapper('rec')} />
        <UploadSlot label="Base Clientes" sublabel="Codigo, UC, CPF e fornecedor" loaded={!!uploads.cli} mapped={!!mappings.cli} fileName={nomes.cli} sheets={sheetNames.cli} selectedSheet={selectedSheets.cli} onSheetChange={handleSheetChange('cli')} onFile={handleFile('cli')} onReabrir={() => reabrirMapper('cli')} />
        <UploadSlot label="Inclusao Consolidada" sublabel="Planilha unificada de entrada" loaded={!!uploads.inc} mapped={!!mappings.inc} fileName={nomes.inc} sheets={sheetNames.inc} selectedSheet={selectedSheets.inc} onSheetChange={handleSheetChange('inc')} onFile={handleFile('inc')} onReabrir={() => reabrirMapper('inc')} />
        <UploadSlot label="GV-Recebiveis" sublabel="Competencia, vencimento e status" loaded={!!uploads.lab} mapped={!!mappings.lab} fileName={nomes.lab} sheets={sheetNames.lab} selectedSheet={selectedSheets.lab} onSheetChange={handleSheetChange('lab')} onFile={handleFile('lab')} onReabrir={() => reabrirMapper('lab')} />
      </div>

      <div className="flex items-center justify-between gap-4 bg-bg2 border border-bd rounded-xl p-4">
        <div className="flex items-center gap-3">
          <FileSearch size={15} className="text-acc" />
          <span className="text-xs text-tx3">Use as tres pagadorias e as quatro bases de apoio para manter a ponte por cliente, validar inclusao e identificar boletos que entraram tarde no backoffice.</span>
        </div>
        <label className="flex items-center gap-2 text-xs text-tx3">
          Min. boletos vencidos
          <input
            type="number"
            min="1"
            max="24"
            value={minVencidos}
            onChange={e => setMinVencidos(e.target.value)}
            className="w-16 bg-s1 border border-bd rounded-lg px-2 py-1.5 text-tx outline-none focus:border-acc"
          />
        </label>
        <Button variant="primary" onClick={processar} disabled={!pronto || processando}>
          <Play size={14} />
          {processando ? 'Processando...' : 'Processar'}
        </Button>
      </div>

      <LogPanel logs={logs} />

      {resultado && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <MetricCard label="Clientes nos dois lados" value={resultado.counts?.clientesComBoletosNosDoisLados || 0} sub="Pagadoria + Recebiveis" color="#3b82f6" />
            <MetricCard label="Inadimplentes" value={resultado.counts?.inadimplentes || 0} sub={`>= ${resultado.counts?.minBoletosVencidos || minVencidos} vencidos`} color="#ef4444" onClick={() => setAbaAtiva('inadimplentes')} />
            <MetricCard label="Atraso Faturamento" value={resultado.counts?.atrasoFaturamento || 0} sub="competencias faltando" color="#f59e0b" onClick={() => setAbaAtiva('atrasoFaturamento')} />
            <MetricCard label="Erro Interno" value={resultado.counts?.erroInterno || 0} sub="consta na inclusao" color="#a855f7" onClick={() => setAbaAtiva('erroInterno')} />
            <MetricCard label="Atraso Backoffice" value={resultado.counts?.atrasoBackoffice || 0} sub="emissao/inclusao tardia" color="#06b6d4" onClick={() => setAbaAtiva('atrasoBackoffice')} />
            <MetricCard label="OK completos" value={resultado.counts?.clientesCompletosOk || 0} sub="sem atraso e abaixo do limite" color="#22c55e" />
          </div>

          <div className="rounded-xl border border-bd bg-s1 overflow-hidden">
            <div className="p-4 border-b border-bd flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[260px] max-w-md">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx3" />
                <input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar cliente, UC, CPF ou competencia"
                  className="w-full bg-bg border border-bd rounded-lg pl-9 pr-3 py-2 text-sm text-tx outline-none focus:border-acc"
                />
              </div>
              {abaAtiva === 'atrasoFaturamento' && (
                <label className="flex items-center gap-2 text-xs text-tx3">
                  Min. faltas
                  <input
                    type="number"
                    min="0"
                    value={minFaltas}
                    onChange={e => setMinFaltas(e.target.value)}
                    className="w-16 bg-bg border border-bd rounded-lg px-2 py-1.5 text-tx outline-none focus:border-acc"
                  />
                </label>
              )}
              <div className="ml-auto text-xs text-tx3">
                {rowsAtivas.length.toLocaleString('pt-BR')} registros exibidos
              </div>
              <Button variant="default" onClick={() => jobId && downloadUrl(workbookInadimplentesUrl(jobId))}>
                <Download size={14} />
                Exportar
              </Button>
            </div>
            <div className="px-4 pt-4">
              <TabBar abas={abasComCount} abaAtiva={abaAtiva} onTab={setAbaAtiva} />
            </div>
            {resultado.preview_limit && (resultado.counts?.[abaAtiva] || 0) > (resultado.rows?.[abaAtiva]?.length || 0) && (
              <p className="px-5 pb-2 text-xs text-tx3">
                Previa das primeiras {(resultado.rows?.[abaAtiva]?.length || 0).toLocaleString('pt-BR')} linhas; a exportacao contem todos os registros.
              </p>
            )}
            <ResultTable rows={rowsAtivas} aba={abaAtiva} />
          </div>

          <div className="flex gap-3 rounded-xl border border-warn/30 bg-warn/10 p-4 text-sm text-tx2">
            <AlertTriangle size={18} className="text-warn flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-tx mb-1">Criterio aplicado</div>
              <div>
                Inadimplencia exige competencias presentes nos dois lados. Quando falta mes no Recebiveis, mas ele consta na Inclusao Consolidada, o caso vai para Erro Interno. A GV-Recebiveis compara mes de referencia com emissao e inclusao no backoffice quando essas datas existirem; referencia 04 deve ser emitida e incluida em 05.
              </div>
            </div>
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
