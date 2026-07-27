import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Download, FileSearch, Pencil, Play, Search } from 'lucide-react'
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
  processBoletosFaltantes,
  uploadSpreadsheet,
  workbookBoletosFaltantesUrl,
} from '../../utils/pythonApi'

const DASH = '-'

const ABAS = [
  { key: 'todos', label: 'Todos', cor: '#3b82f6' },
  { key: 'responsabilidade', label: 'Responsabilidade', cor: '#0f766e' },
  { key: 'faltamRecebiveis', label: 'Falta nos Recebiveis', cor: '#f59e0b' },
  { key: 'faltamPagadoria', label: 'Falta na Pagadoria', cor: '#a855f7' },
  { key: 'faltamAmbos', label: 'Falta nos dois lados', cor: '#ef4444' },
  { key: 'erroInterno', label: 'Erro Interno', cor: '#dc2626' },
  { key: 'erroFornecedora', label: 'Erro Fornecedora', cor: '#c2410c' },
]

const COLUNAS_PADRAO = [
  'Cliente',
  'Codigo cliente',
  'CPF/CNPJ',
  'Instalacao',
  'Numero cliente',
  'Nova instalacao',
  'Fornecedora',
  'Região',
  'Valor',
  'Falta nos Recebiveis',
  'Falta na Pagadoria',
  'Falta nos dois lados',
  'Existe no Faturamento',
  'Meses no Faturamento',
  'Meses sem Faturamento',
  'Arquivo de origem',
  'Origem por competencia',
  'Flag origem entrada',
  'Flag responsabilidade',
  'Responsabilidade por competencia',
  'Meses Pagadoria',
  'Meses Pagadoria ignorados',
  'Meses Recebiveis',
  'Qtd. Pagadoria',
  'Qtd. Pagadoria ignorados',
  'Qtd. Recebiveis',
  'Primeira competencia',
  'Ultima competencia',
  'Origem do match',
  'Motivo',
]

const COLUNAS_ERRO_INTERNO = [
  'Cliente',
  'Cliente Faturamento',
  'Codigo cliente',
  'Codigo cliente Faturamento',
  'CPF/CNPJ',
  'Instalacao',
  'UC Faturamento',
  'Numero cliente',
  'Nova instalacao',
  'Fornecedora',
  'Região',
  'Mes de referencia',
  'Valor',
  'Existe na Pagadoria',
  'Existe nos Recebiveis',
  'Existe no Faturamento',
  'Faturamento elegivel',
  'Arquivo de origem',
  'Status Faturamento',
  'Valor Faturamento',
  'Vencimento Faturamento',
  'Data emissao Faturamento',
  'Codigo de barras Faturamento',
  'Qtd. registros Faturamento',
  'Possivel duplicidade Faturamento',
  'Flag origem entrada',
  'Flag responsabilidade',
  'Motivo responsabilidade',
  'Origem do match',
  'Motivo',
]

const COLUNAS_RESPONSABILIDADE = [
  'Cliente',
  'Codigo cliente',
  'CPF/CNPJ',
  'Instalacao',
  'Numero cliente',
  'Nova instalacao',
  'Fornecedora',
  'Região',
  'Mes de referencia',
  'Valor',
  'Existe na Pagadoria',
  'Pagadoria ignorada',
  'Status Pagadoria',
  'Legenda Pagadoria',
  'Existe nos Recebiveis',
  'Status Recebiveis',
  'Existe no Faturamento',
  'Na cobertura do Faturamento',
  'Faturamento elegivel',
  'Arquivo de origem',
  'Status Faturamento',
  'Valor Faturamento',
  'Vencimento Faturamento',
  'Data emissao Faturamento',
  'Codigo de barras Faturamento',
  'Qtd. registros Pagadoria',
  'Qtd. registros Recebiveis',
  'Qtd. registros Faturamento',
  'Possivel duplicidade Faturamento',
  'Flag origem entrada',
  'Flag responsabilidade',
  'Motivo responsabilidade',
  'Origem do match',
]

const LABELS = {
  pag: 'Pagadoria',
  gv: 'Base GV',
  rec: 'Recebiveis',
  fat: 'Faturamento Consolidado',
}

function hora() {
  return new Date().toLocaleTimeString('pt-BR')
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

function withHora(logs) {
  const fallback = hora()
  return (logs || []).map(log => ({ ...log, hora: log.hora || fallback }))
}

function ResultadoTable({ rows, columns }) {
  const [pagina, setPagina] = useState(0)
  const porPagina = 120
  const totalPaginas = Math.ceil(rows.length / porPagina)
  const slice = rows.slice(pagina * porPagina, (pagina + 1) * porPagina)

  useEffect(() => {
    setPagina(0)
  }, [rows])

  if (!rows.length) {
    return <div className="py-12 text-center text-sm text-tx3">Nenhum boleto faltante encontrado nesta aba.</div>
  }

  return (
    <div>
      <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col} className="sticky top-0 bg-s2 border-b border-bd px-3 py-2.5 text-left text-[10px] font-semibold uppercase text-tx3 whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((row, index) => (
              <tr key={`${row._sortKey || row.Cliente}-${index}`} className="border-b border-bd hover:bg-s2/50 transition-colors">
                {columns.map(col => {
                  const destaque = ['Falta nos Recebiveis', 'Falta na Pagadoria', 'Falta nos dois lados'].includes(col) && row[col] !== DASH
                  return (
                    <td key={col} className={`px-3 py-2.5 whitespace-nowrap max-w-[280px] truncate ${destaque ? 'text-warn font-semibold' : 'text-tx2'}`} title={String(row[col] ?? '')}>
                      {String(row[col] ?? DASH)}
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

export function BoletosFaltantes() {
  const [uploads, setUploads] = useState({ pag: null, gv: null, rec: null, fat: null })
  const [raw, setRaw] = useState({ pag: [], gv: [], rec: [], fat: [] })
  const [headers, setHeaders] = useState({ pag: [], gv: [], rec: [], fat: [] })
  const [nomes, setNomes] = useState({ pag: '', gv: '', rec: '', fat: '' })
  const [mappings, setMappings] = useState({})
  const [mapper, setMapper] = useState({ open: false, key: '' })
  const [logs, setLogs] = useState([])
  const [resultado, setResultado] = useState(null)
  const [jobId, setJobId] = useState(null)
  const [abaAtiva, setAbaAtiva] = useState('todos')
  const [processando, setProcessando] = useState(false)
  const [busca, setBusca] = useState('')

  const addLog = (msg, tipo = 'info') => {
    setLogs(prev => [...prev, { msg, tipo, hora: hora() }])
  }

  const handleFile = key => async file => {
    try {
      addLog(`Enviando ${file.name} para o motor Polars...`)
      const uploaded = await uploadSpreadsheet(file)
      const rows = uploaded.rows || []
      const cols = uploaded.headers || Object.keys(rows[0] || {})
      if (!cols.length) {
        addLog(`Planilha vazia: ${file.name}`, 'err')
        return
      }
      setUploads(prev => ({ ...prev, [key]: uploaded }))
      setRaw(prev => ({ ...prev, [key]: rows }))
      setHeaders(prev => ({ ...prev, [key]: cols }))
      setNomes(prev => ({ ...prev, [key]: file.name }))
      setMappings(prev => ({ ...prev, [key]: null }))
      setResultado(null)
      setJobId(null)
      setMapper({ open: true, key })
      addLog(`${(uploaded.row_count || rows.length).toLocaleString('pt-BR')} linhas detectadas em ${file.name}`, 'ok')
    } catch (err) {
      addLog(`Erro ao enviar ${file.name}: ${err.message}`, 'err')
    }
  }

  const reabrirMapper = key => {
    if (!uploads[key]) return
    setMapper({ open: true, key })
  }

  const handleMapperConfirm = (_remapped, mapping) => {
    const key = mapper.key
    setMappings(prev => ({ ...prev, [key]: mapping }))
    setMapper({ open: false, key: '' })
    addLog(`${LABELS[key] || key}: mapeamento confirmado`, 'ok')
  }

  const pronto = uploads.pag && uploads.gv && uploads.rec && uploads.fat
    && mappings.pag && mappings.gv && mappings.rec && mappings.fat

  const source = key => ({
    upload_id: uploads[key].upload_id,
    mapping: mappings[key] || {},
    sheet_name: uploads[key].sheet_name || null,
  })

  const processar = async () => {
    if (!pronto) return
    setProcessando(true)
    setResultado(null)
    setJobId(null)
    setLogs([])
    try {
      const response = await processBoletosFaltantes({
        pag: source('pag'),
        gv: source('gv'),
        rec: source('rec'),
        fat: source('fat'),
      })
      const res = {
        ...(response.rows || {}),
        counts: response.counts || {},
        meta: response.meta || {},
        previewLimit: response.preview_limit || 0,
      }
      setResultado(res)
      setJobId(response.job_id)
      const primeiraAba = ABAS.find(aba => {
        if (aba.key === 'todos') return (res.todos || []).length > 0
        return (res[aba.key] || []).length > 0
      })?.key || 'todos'
      setAbaAtiva(primeiraAba)
      setLogs(withHora(response.logs))
      addLog(`Analise concluida: ${(res.counts.clientesComPendencia || 0).toLocaleString('pt-BR')} clientes com pendencia`, 'ok')
    } catch (err) {
      addLog(`Erro ao processar: ${err.message}`, 'err')
    } finally {
      setProcessando(false)
    }
  }

  const abasComCount = ABAS.map(aba => {
    if (!resultado) return { ...aba }
    const countKeys = {
      todos: 'clientesComPendencia',
      responsabilidade: 'boletosAuditados',
      faltamRecebiveis: 'mesesFaltamRecebiveis',
      faltamPagadoria: 'mesesFaltamPagadoria',
      faltamAmbos: 'mesesFaltamAmbos',
      erroInterno: 'errosInternos',
      erroFornecedora: 'errosFornecedora',
    }
    const count = resultado.counts[countKeys[aba.key]]
    return { ...aba, count: count || 0 }
  })

  const rowsAtivas = useMemo(() => {
    if (!resultado) return []
    const rows = resultado[abaAtiva] || []
    const q = normText(busca)
    if (!q) return rows
    return rows.filter(row => (row._search || normText(Object.values(row).join(' '))).includes(q))
  }, [resultado, abaAtiva, busca])

  const colunasAtivas = abaAtiva === 'erroInterno'
    ? COLUNAS_ERRO_INTERNO
    : ['responsabilidade', 'erroFornecedora'].includes(abaAtiva)
      ? COLUNAS_RESPONSABILIDADE
      : COLUNAS_PADRAO

  return (
    <div className="p-7 space-y-5">
      <ColumnMapper
        open={mapper.open}
        raw={raw[mapper.key] || []}
        headers={headers[mapper.key] || []}
        schemaKey={mapper.key === 'pag' ? 'boletos_pag' : mapper.key === 'gv' ? 'boletos_gv' : mapper.key === 'rec' ? 'boletos_rec' : 'boletos_fat'}
        title={mapper.key === 'pag' ? 'Mapear colunas - Pagadoria' : mapper.key === 'gv' ? 'Mapear colunas - Base GV' : mapper.key === 'rec' ? 'Mapear colunas - Recebiveis' : 'Mapear colunas - Faturamento Consolidado'}
        fileName={nomes[mapper.key]}
        savedMapping={mappings[mapper.key]}
        onConfirm={handleMapperConfirm}
        onCancel={() => setMapper({ open: false, key: '' })}
      />

      <div className="pb-5 border-b border-bd">
        <h1 className="text-xl font-bold text-tx mb-1">Boletos Faltantes</h1>
        <p className="text-sm text-tx3">Cruza Pagadoria, Recebiveis, Base GV e Faturamento Consolidado por cliente e competencia para rastrear a origem e separar responsabilidade interna e da fornecedora.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <UploadSlot
          label="Base Pagadoria"
          sublabel="Planilha de faturas da fornecedora"
          loaded={!!uploads.pag}
          fileName={nomes.pag}
          onFile={handleFile('pag')}
          onReabrir={() => reabrirMapper('pag')}
        />
        <UploadSlot
          label="Base GV"
          sublabel="Clientes cadastrados no sistema"
          loaded={!!uploads.gv}
          fileName={nomes.gv}
          onFile={handleFile('gv')}
          onReabrir={() => reabrirMapper('gv')}
        />
        <UploadSlot
          label="Base Recebiveis GV"
          sublabel="Boletos emitidos no sistema"
          loaded={!!uploads.rec}
          fileName={nomes.rec}
          onFile={handleFile('rec')}
          onReabrir={() => reabrirMapper('rec')}
        />
        <UploadSlot
          label="Faturamento Consolidado"
          sublabel="PLANILHA_UNIFICADA_CONSOLIDADA"
          loaded={!!uploads.fat}
          fileName={nomes.fat}
          onFile={handleFile('fat')}
          onReabrir={() => reabrirMapper('fat')}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-tx3">
          <FileSearch size={14} className="text-acc" />
          <span>Obrigatorio carregar as 4 bases; a Base GV continua sendo a ponte entre todas as fontes.</span>
        </div>
        <Button variant="primary" onClick={processar} disabled={!pronto || processando}>
          <Play size={14} />
          {processando ? 'Processando...' : 'Processar boletos'}
        </Button>
      </div>

      <LoadingSquares active={processando} label="Processando boletos" />

      <LogPanel logs={logs} />
      <ProcessMetaLine meta={resultado?.meta} />

      {resultado && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <MetricCard label="Clientes analisados" value={resultado.counts.clientesAnalisados || 0} sub="com boletos nos dois lados" color="#3b82f6" />
            <MetricCard label="Boletos auditados" value={resultado.counts.boletosAuditados || 0} sub="cliente e competencia" color="#0f766e" onClick={() => setAbaAtiva('responsabilidade')} />
            <MetricCard label="Clientes com pendencia" value={resultado.counts.clientesComPendencia || 0} sub="qualquer lacuna" color="#ef4444" onClick={() => setAbaAtiva('todos')} />
            <MetricCard label="Falta nos Recebiveis" value={resultado.counts.mesesFaltamRecebiveis || 0} sub="meses da Pagadoria sem RCB" color="#f59e0b" onClick={() => setAbaAtiva('faltamRecebiveis')} />
            <MetricCard label="Falta na Pagadoria" value={resultado.counts.mesesFaltamPagadoria || 0} sub="meses do RCB sem Pagadoria" color="#a855f7" onClick={() => setAbaAtiva('faltamPagadoria')} />
            <MetricCard label="Falta nos dois lados" value={resultado.counts.mesesFaltamAmbos || 0} sub="lacunas internas" color="#ef4444" onClick={() => setAbaAtiva('faltamAmbos')} />
            <MetricCard label="Erro interno" value={resultado.counts.errosInternos || 0} sub="no faturamento, ausente no RCB" color="#dc2626" onClick={() => setAbaAtiva('erroInterno')} />
            <MetricCard label="Erro da fornecedora" value={resultado.counts.errosFornecedora || 0} sub="divergencia na Pagadoria ou no envio" color="#c2410c" onClick={() => setAbaAtiva('erroFornecedora')} />
            <MetricCard label="Revisao manual" value={resultado.counts.revisaoResponsabilidade || 0} sub="evidencia insuficiente ou nao elegivel" color="#64748b" onClick={() => setAbaAtiva('responsabilidade')} />
          </div>

          {((resultado.counts.clientesSoPagadoria || 0) > 0 || (resultado.counts.clientesSoRecebiveis || 0) > 0) && (
            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="So na Pagadoria" value={resultado.counts.clientesSoPagadoria || 0} sub="nao entra como boleto faltante" color="#64748b" />
              <MetricCard label="So nos Recebiveis" value={resultado.counts.clientesSoRecebiveis || 0} sub="nao entra como boleto faltante" color="#64748b" />
            </div>
          )}

          <div className="rounded-xl border border-bd bg-s1 overflow-hidden">
            <div className="p-4 border-b border-bd flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx3" />
                <input
                  value={busca}
                  onChange={event => setBusca(event.target.value)}
                  placeholder="Buscar cliente, UC, CPF ou competencia"
                  className="w-full bg-bg border border-bd rounded-lg pl-9 pr-3 py-2 text-sm text-tx outline-none focus:border-acc"
                />
              </div>
              <div className="ml-auto text-xs text-tx3">
                {rowsAtivas.length.toLocaleString('pt-BR')} registros exibidos
              </div>
              <Button variant="default" disabled={!jobId} onClick={() => jobId && downloadUrl(workbookBoletosFaltantesUrl(jobId))}>
                <Download size={14} />
                Exportar completo
              </Button>
            </div>
            <div className="px-4 pt-4">
              <TabBar abas={abasComCount} abaAtiva={abaAtiva} onTab={setAbaAtiva} />
            </div>
            <ResultadoTable rows={rowsAtivas} columns={colunasAtivas} />
          </div>

          <div className="flex gap-3 rounded-xl border border-warn/30 bg-warn/10 p-4 text-sm text-tx2">
            <AlertTriangle size={18} className="text-warn flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-tx mb-1">Observacao sobre a leitura</div>
              <div>
                A tela exibe uma previsualizacao dos primeiros registros retornados pelo backend. A exportacao em Excel continua completa. A aba Responsabilidade cruza cada competencia com as tres fontes; registros sem evidencia suficiente ou com Faturamento nao elegivel ficam em Revisar e nao sao atribuidos automaticamente.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function UploadSlot({ label, sublabel, loaded, fileName, onFile, onReabrir }) {
  return (
    <div className="relative">
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
    </div>
  )
}
