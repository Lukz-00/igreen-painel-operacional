import { useState, useMemo } from 'react'
import { Play, Pencil, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend
} from 'recharts'
import { UploadBox } from '../../components/ui/UploadBox'
import { MetricCard } from '../../components/ui/MetricCard'
import { TabBar } from '../../components/ui/TabBar'
import { Button } from '../../components/ui/Button'
import { ColumnMapper } from '../../components/ui/ColumnMapper'
import { LogPanel } from '../../components/ui/LogPanel'
import { normalizarRows, normalizarMes, getField } from '../../utils/normalizadores'

function normUC(x) {
  if (!x) return ''
  return String(x).replace(/\D/g, '').replace(/^0+/, '')
}

function toNum(x) {
  if (x === null || x === undefined || x === '') return 0
  if (typeof x === 'number') return x
  const s = String(x).replace(/[^\d,.-]/g, '').replace(',', '.')
  return parseFloat(s) || 0
}

function deduzirDisponibilidade(total, comp) {
  const diff = total - comp
  if (diff <= 0) return 30
  if (Math.abs(diff - 100) <= 15) return 100
  if (Math.abs(diff - 50) <= 10) return 50
  if (Math.abs(diff - 30) <= 8) return 30
  if (diff < 40) return 30
  if (diff < 75) return 50
  return 100
}

const normName = (s) =>
  String(s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

function pick(row, key, aliases) {
  const mapped = row?.[`_gmap_${key}`]
  if (mapped !== undefined && mapped !== null && mapped !== '') return mapped
  return getField(row || {}, aliases)
}

function lerXlsx(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
        resolve(normalizarRows(raw))
      } catch (err) { reject(err) }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

function calcularInjecao(rowsPag, rowsCli) {
  const cliByNum = {}
  const cliByName = {}

  if (rowsCli && rowsCli.length) {
    rowsCli.forEach(c => {
      const numCli = normUC(pick(c, 'numero_cliente', ['Numero Cliente', 'Número Cliente', 'numero_cliente', 'Código', 'Codigo', 'codigo', 'cod_cliente', 'UC']))
      const inst = normUC(pick(c, 'instalacao', ['Instalacao', 'Instalação', 'instalacao', 'UC', 'num_instalacao']))
      const novaInst = normUC(pick(c, 'nova_instalacao', ['Nova Instalacao', 'Nova Instalação', 'nova_instalacao']))
      
      if (numCli) cliByNum[numCli] = c
      if (inst) cliByNum[inst] = c
      if (novaInst) cliByNum[novaInst] = c
      
      const nome = normName(pick(c, 'nome', ['Nome', 'Cliente', 'Nome Cliente', 'nome_cliente']))
      if (nome) cliByName[nome] = c
    })
  }

  const coincidentes = []
  const ucDivergente = []
  const semMatch = []
  const semDados = []

  rowsPag.forEach(p => {
    const compensado = toNum(
      pick(p, 'compensado', ['Energia Compensada (kWh)', 'Energia Compensada', 'energia_compensada', 'Compensado', 'Compensado (kWh)']) || 0
    )
    if (compensado <= 0) {
      semDados.push({ ...p, Motivo: 'Sem Energia Compensada' })
      return
    }

    const saldoAcumulado = toNum(
      pick(p, 'saldo_acumulado', ['Saldo acumulado (kWh)', 'Saldo Acumulado (kWh)', 'saldo_acumulado', 'Saldo Acumulado']) || 0
    )
    const ucOriginal = pick(p, 'instalacao', ['Número da Instalação', 'Nº da Instalação', 'Numero da Instalacao', 'Instalação', 'Instalacao', 'UC', 'uc', 'numinstalacao', 'num_instalacao'])
    const ucNorm = normUC(ucOriginal)
    const mes    = normalizarMes(
      pick(p, 'mes', ['Mês de Referência', 'Mes de Referencia', 'Mês de referência', 'Mês', 'Mes', 'mes', 'Data Referencia', 'mes_referencia', 'mesreferencia'])
    )

    let cliRow = cliByNum[ucNorm] || null
    let tipoMatch = 'semMatch'

    if (!cliRow) {
      const nomePag = normName(pick(p, 'cliente', ['Cliente', 'nome_cliente', 'Favorecido', 'Consorciado', 'Nome']))
      if (nomePag && cliByName[nomePag]) {
        cliRow = cliByName[nomePag]
        tipoMatch = 'ucDivergente'
      }
    } else {
      tipoMatch = 'coincidentes'
    }

    const mediaConsumo = cliRow ? toNum(pick(cliRow, 'media_consumo', ['Media Consumo', 'Média Consumo', 'media_consumo', 'Consumo', 'Consumo Total'])) : 0
    const totalFinal   = mediaConsumo > 0 ? mediaConsumo : compensado + 30
    const disp         = deduzirDisponibilidade(totalFinal, compensado)
    const denominador  = totalFinal - disp
    let indice = denominador <= 0 ? 1.0 : compensado / denominador
    if (indice > 1) indice = 1.0
    if (indice < 0) indice = 0.0

    const rowResult = {
      UC:              ucOriginal || ucNorm,
      Cliente:         pick(p, 'cliente', ['Cliente', 'nome_cliente', 'Favorecido', 'Consorciado', 'Nome']) || pick(cliRow, 'nome', ['Nome', 'Cliente', 'Nome Cliente', 'nome_cliente']),
      Mes:             mes,
      Concessionaria:  pick(p, 'distribuidora', ['Distribuidora', 'Concessionaria', 'Concessionária', 'Fornecedor', 'Fornecedora']) || pick(cliRow, 'regiao', ['Regiao', 'Região', 'regiao', 'Distribuidora', 'Concessionaria']),
      Licenciado:      pick(cliRow, 'licenciado', ['Licenciado', 'Licenciado Consultor', 'Consultor']),
      Compensado:      compensado,
      SaldoAcumulado:  saldoAcumulado,
      MediaConsumo:    mediaConsumo || toNum(pick(p, 'media_consumo', ['Media Consumo', 'Média Consumo', 'media_consumo', 'Consumo Total', 'Consumo'])),
      DataInjecao:     pick(p, 'data_injecao', ['Data Injecao', 'Data Injeção', 'data_injecao', 'Data de Injeção']),
      Classificacao:   pick(p, 'classificacao', ['Classificacao', 'Classificação', 'classificacao']),
      Rateio:          pick(p, 'rateio', ['Rateio', 'rateio']),
      ValidadoSucesso: pick(p, 'validado_sucesso', ['Validado Sucesso', 'ValidadoSucesso', 'validado_sucesso']),
      Total:           totalFinal,
      Disponibilidade: disp,
      Indice:          indice,
      IndicePerc:      `${(indice * 100).toFixed(1)}%`,
      Status:          pick(p, 'status', ['Status', 'status', 'Status fatura', 'Situação']),
      Qualidade:       indice >= 0.95 ? 'Excelente' : indice >= 0.80 ? 'Bom' : 'Atencao',
      FonteDados:      tipoMatch === 'coincidentes'
                         ? `GV (Media: ${totalFinal} kWh)`
                         : tipoMatch === 'ucDivergente'
                         ? `GV Divergente (${totalFinal} kWh)`
                         : 'Estimativa (Sem GV)',
      MatchGV: !!cliRow,
    }

    if (tipoMatch === 'coincidentes') coincidentes.push(rowResult)
    else if (tipoMatch === 'ucDivergente') ucDivergente.push(rowResult)
    else semMatch.push(rowResult)
  })

  return { coincidentes, ucDivergente, semMatch, semDados }
}

function QualBadge({ q }) {
  const cfg = {
    Excelente: { bg: 'rgba(34,197,94,0.15)',  color: '#22c55e' },
    Bom:       { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
    Atencao:   { bg: 'rgba(239,68,68,0.15)',  color: '#ef4444' },
  }[q] || { bg: 'rgba(255,255,255,0.07)', color: '#aaa' }
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 700
    }}>{q}</span>
  )
}

function ResultTable({ rows, abaAtiva }) {
  const [pagina, setPagina] = useState(0)
  const POR_PAG = 50
  const total = rows.length
  const paginadas = rows.slice(pagina * POR_PAG, (pagina + 1) * POR_PAG)
  const showExtras = abaAtiva === 'coincidentes'

  if (!rows.length) return (
    <div className="p-8 text-center text-tx3 text-sm">Nenhum resultado para esta aba.</div>
  )

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-bd">
              {[
                'UC', 'Cliente', 'Mes', 'Distribuidora', 'Fonte',
                'Compensado (kWh)',
                ...(showExtras ? [
                  'Saldo Acumulado (kWh)',
                  'Media Consumo (kWh)',
                  'Data Injecao',
                  'Classificacao',
                  'Rateio',
                  'Validado Sucesso',
                ] : []),
                'Total (kWh)', 'Disp. (kWh)', 'Indice', 'Qualidade'
              ].map(h => (
                <th key={h} className="p-3 font-bold text-[10px] text-tx3 uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginadas.map((r, i) => (
              <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td className="p-3 font-mono text-[10px] text-purple-400">{r.UC}</td>
                <td className="p-3 max-w-[160px] truncate text-tx2">{r.Cliente}</td>
                <td className="p-3 text-tx3 whitespace-nowrap">{r.Mes}</td>
                <td className="p-3 text-tx3 whitespace-nowrap max-w-[120px] truncate">{r.Concessionaria}</td>
                <td className="p-3 text-tx3 text-[10px] whitespace-nowrap">{r.FonteDados}</td>
                <td className="p-3 text-right text-blue-400">
                  {typeof r.Compensado === 'number' ? r.Compensado.toFixed(1) : r.Compensado}
                </td>
                {showExtras && (
                  <>
                    <td className="p-3 text-right text-emerald-400 font-mono">
                      {typeof r.SaldoAcumulado === 'number' ? r.SaldoAcumulado.toFixed(1) : '-'}
                    </td>
                    <td className="p-3 text-right text-sky-300 font-mono">
                      {typeof r.MediaConsumo === 'number' && r.MediaConsumo > 0 ? r.MediaConsumo.toFixed(1) : '-'}
                    </td>
                    <td className="p-3 text-tx3 whitespace-nowrap text-[10px]">{r.DataInjecao || '-'}</td>
                    <td className="p-3 text-tx3 whitespace-nowrap text-[10px]">{r.Classificacao || '-'}</td>
                    <td className="p-3 text-tx3 whitespace-nowrap text-[10px]">{r.Rateio || '-'}</td>
                    <td className="p-3 text-tx3 whitespace-nowrap text-[10px]">{r.ValidadoSucesso || '-'}</td>
                  </>
                )}
                <td className="p-3 text-right text-tx2">
                  {typeof r.Total === 'number' ? r.Total.toFixed(1) : r.Total}
                </td>
                <td className="p-3 text-right text-tx3">{r.Disponibilidade}</td>
                <td className="p-3 text-right font-bold" style={{
                  color: r.Indice >= 0.95 ? '#22c55e' : r.Indice >= 0.80 ? '#fbbf24' : '#ef4444'
                }}>
                  {r.IndicePerc}
                </td>
                <td className="p-3"><QualBadge q={r.Qualidade} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > POR_PAG && (
        <div className="p-3 flex items-center gap-2 border-t border-bd text-tx3 text-xs">
          <span>{pagina * POR_PAG + 1}-{Math.min((pagina + 1) * POR_PAG, total)} de {total}</span>
          <button onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={pagina === 0}
            className="px-2 py-1 rounded border border-white/10 hover:bg-white/10 disabled:opacity-50">
            &lsaquo;
          </button>
          <button onClick={() => setPagina(p => p + 1)} disabled={(pagina + 1) * POR_PAG >= total}
            className="px-2 py-1 rounded border border-white/10 hover:bg-white/10 disabled:opacity-50">
            &rsaquo;
          </button>
        </div>
      )}
    </div>
  )
}

const ABAS = [
  { key: 'coincidentes', label: 'Match Perfeito', cor: '#22c55e' },
  { key: 'ucDivergente', label: 'UC Divergente',  cor: '#a78bfa' },
  { key: 'semMatch',     label: 'Falta no GV',    cor: '#f59e0b' },
  { key: 'semDados',     label: 'Sem Compensado', cor: '#ef4444' },
]

export function QualidadeInjecao() {
  const [rawPag, setRawPag] = useState(null)
  const [rawCli, setRawCli] = useState(null)
  const [dfPag,  setDfPag]  = useState(null)
  const [dfCli,  setDfCli]  = useState(null)
  const [nomePag, setNomePag] = useState('')
  const [nomeCli, setNomeCli] = useState('')

  const [mapperOpen,    setMapperOpen]    = useState(false)
  const [mapperKey,     setMapperKey]     = useState('pag')
  const [mapperRaw,     setMapperRaw]     = useState([])
  const [mapperHeaders, setMapperHeaders] = useState([])

  const [processando, setProcessando] = useState(false)
  const [resultado,   setResultado]   = useState(null)
  const [abaAtiva,    setAbaAtiva]    = useState('coincidentes')
  const [filtroQual,  setFiltroQual]  = useState('todos')
  const [filtroAno,   setFiltroAno]   = useState('todos')
  const [filtroMes,   setFiltroMes]   = useState('todos')
  const [logs,        setLogs]        = useState([])

  const addLog = (msg, tipo = 'info') =>
    setLogs(p => [...p, { msg, tipo, hora: new Date().toLocaleTimeString('pt-BR') }])

  const handleFile = async (file, key) => {
    try {
      addLog(`Lendo ${file.name}...`)
      const rows = await lerXlsx(file)
      if (!rows || !rows.length) { addLog(`Planilha vazia: ${file.name}`, 'err'); return }
      addLog(`${file.name}: ${rows.length} linhas lidas.`, 'ok')
      if (key === 'pag') { setRawPag(rows); setNomePag(file.name) }
      else               { setRawCli(rows); setNomeCli(file.name) }
      setMapperKey(key)
      setMapperRaw(rows)
      setMapperHeaders(Object.keys(rows[0]))
      setMapperOpen(true)
    } catch (e) {
      addLog(`Erro ao ler ${file.name}: ${e.message}`, 'err')
    }
  }

  const reabrirMapper = (key) => {
    const rows = key === 'pag' ? rawPag : rawCli
    if (!rows) return
    setMapperKey(key)
    setMapperRaw(rows)
    setMapperHeaders(Object.keys(rows[0]))
    setMapperOpen(true)
  }

  const handleMapperConfirm = (remapped) => {
    setMapperOpen(false)
    if (mapperKey === 'pag') {
      setDfPag(remapped)
      addLog(`Pagadoria mapeada: ${remapped.length.toLocaleString('pt-BR')} linhas`, 'ok')
    } else {
      setDfCli(remapped)
      addLog(`Clientes GV mapeados: ${remapped.length.toLocaleString('pt-BR')} clientes`, 'ok')
    }
  }

  const processar = async () => {
    if (!dfPag) return
    setProcessando(true)
    setResultado(null)
    addLog('Iniciando calculo...')
    await new Promise(r => setTimeout(r, 50))
    try {
      const res = calcularInjecao(dfPag, dfCli || [])
      setResultado(res)
      addLog(
        `Concluido: ${res.coincidentes.length} coincidentes | ${res.ucDivergente.length} div. | ${res.semMatch.length} orfaos`,
        'ok'
      )
      setAbaAtiva('coincidentes')
    } catch (e) {
      addLog(`Erro: ${e.message}`, 'err')
    } finally {
      setProcessando(false)
    }
  }

  const stats = useMemo(() => {
    if (!resultado || abaAtiva === 'semDados') return null
    let validRows = resultado[abaAtiva] || []
    if (filtroAno !== 'todos') validRows = validRows.filter(r => r.Mes && String(r.Mes).startsWith(filtroAno))
    if (filtroMes !== 'todos') validRows = validRows.filter(r => r.Mes && String(r.Mes).substring(5, 7) === filtroMes)
    if (!validRows.length) return null

    const total      = validRows.length
    const media      = validRows.reduce((s, r) => s + r.Indice, 0) / total
    const excelentes = validRows.filter(r => r.Indice >= 0.95).length
    const bons       = validRows.filter(r => r.Indice >= 0.80 && r.Indice < 0.95).length
    const ruins      = validRows.filter(r => r.Indice < 0.80).length

    const pieData = [
      { name: 'Excelente >=95%', value: excelentes, fill: '#22c55e' },
      { name: 'Bom 80-94%',      value: bons,       fill: '#fbbf24' },
      { name: 'Atencao <80%',    value: ruins,      fill: '#ef4444' },
    ].filter(d => d.value > 0)

    const faixas = {}
    for (let i = 0; i <= 90; i += 10) {
      const label = `${i}-${i + 10}%`
      faixas[label] = validRows.filter(r => r.Indice * 100 >= i && r.Indice * 100 < i + 10).length
    }
    faixas['100%'] = validRows.filter(r => r.Indice >= 1).length
    const histData = Object.entries(faixas)
      .map(([name, count]) => ({ name, count }))
      .filter(d => d.count > 0)

    return { media, excelentes, bons, ruins, pieData, histData, total }
  }, [resultado, abaAtiva, filtroAno, filtroMes])

  const rowsFiltradas = useMemo(() => {
    if (!resultado) return []
    let rows = resultado[abaAtiva] || []
    if (abaAtiva !== 'semDados' && filtroQual !== 'todos') {
      if (filtroQual === 'excelente') rows = rows.filter(r => r.Indice >= 0.95)
      else if (filtroQual === 'bom')     rows = rows.filter(r => r.Indice >= 0.80 && r.Indice < 0.95)
      else if (filtroQual === 'atencao') rows = rows.filter(r => r.Indice < 0.80)
    }
    if (filtroAno !== 'todos') rows = rows.filter(r => r.Mes && String(r.Mes).startsWith(filtroAno))
    if (filtroMes !== 'todos') rows = rows.filter(r => r.Mes && String(r.Mes).substring(5, 7) === filtroMes)
    return rows
  }, [resultado, abaAtiva, filtroQual, filtroAno, filtroMes])

  const opcoesData = useMemo(() => {
    const anos = new Set()
    const meses = new Set()
    const rows = resultado ? (resultado[abaAtiva] || []) : []
    rows.forEach(r => {
      if (r.Mes && r.Mes.length >= 7) {
        anos.add(r.Mes.substring(0, 4))
        meses.add(r.Mes.substring(5, 7))
      }
    })
    return { anos: [...anos].sort().reverse(), meses: [...meses].sort() }
  }, [resultado, abaAtiva])

  const handleExport = () => {
    if (!rowsFiltradas || !rowsFiltradas.length) return
    const exportData = rowsFiltradas.map(r => ({
      UC: r.UC,
      Cliente: r.Cliente,
      'Mes Referencia': r.Mes,
      Concessionaria: r.Concessionaria,
      Licenciado: r.Licenciado,
      'Energia Compensada (kWh)': r.Compensado,
      'Saldo Acumulado (kWh)': r.SaldoAcumulado,
      'Consumo Total (kWh)': r.Total,
      'Disponibilidade (kWh)': r.Disponibilidade,
      'Indice de Injecao': r.IndicePerc,
      Qualidade: r.Qualidade,
      'Fonte de Dados': r.FonteDados,
      'Status Fatura': r.Status,
    }))
    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, abaAtiva.substring(0, 30))
    XLSX.writeFile(wb, `QualidadeInjecao_${abaAtiva}_${new Date().getTime()}.xlsx`)
  }

  const abasComCount = ABAS.map(a => ({
    ...a,
    count: resultado ? (resultado[a.key] || []).length : undefined,
  }))

  const FILTROS = [
    { key: 'todos',     label: 'Todos' },
    { key: 'excelente', label: 'Excelente >=95%' },
    { key: 'bom',       label: 'Bom 80-94%' },
    { key: 'atencao',   label: 'Atencao <80%' },
  ]

  return (
    <div className="p-7 space-y-5">

      <ColumnMapper
        open={mapperOpen}
        raw={mapperRaw}
        headers={mapperHeaders}
        schemaKey={mapperKey === 'pag' ? 'qualidade_pag' : 'qualidade_cli'}
        title={mapperKey === 'pag' ? 'Analise de colunas - Base Pagadoria' : 'Analise de colunas - Clientes GV'}
        fileName={mapperKey === 'pag' ? nomePag : nomeCli}
        onConfirm={handleMapperConfirm}
        onCancel={() => setMapperOpen(false)}
      />

      {/* Header */}
      <div className="pb-5 border-b border-bd">
        <h1 className="text-xl font-bold text-tx m-0">Qualidade de Injecao</h1>
        <p className="text-sm text-tx3 mt-1 m-0">
          Cruzamento Pagadoria x Clientes GV. Indice = Compensado / (Consumo Total - Disponibilidade)
        </p>
      </div>

      {/* Uploads */}
      <div className="grid gap-4 grid-cols-2">
        <div className="relative">
          <UploadBox label="Pagadoria Northen" sublabel="ENERGISA - IGREEN - GVS"
            onFile={f => handleFile(f, 'pag')} loaded={!!dfPag} fileName={nomePag} />
          {dfPag && (
            <button onClick={() => reabrirMapper('pag')} title="Editar mapeamento"
              className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg border border-acc/30 bg-acc/10 text-acc hover:bg-acc/20 transition-colors z-10">
              <Pencil size={13} />
            </button>
          )}
        </div>
        <div className="relative">
          <UploadBox label="Clientes GV (opcional)" sublabel="Media Consumo como proxy do Total"
            onFile={f => handleFile(f, 'cli')} loaded={!!dfCli} fileName={nomeCli} />
          {dfCli && (
            <button onClick={() => reabrirMapper('cli')} title="Editar mapeamento"
              className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg border border-acc/30 bg-acc/10 text-acc hover:bg-acc/20 transition-colors z-10">
              <Pencil size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Botao */}
      <div className="flex justify-end">
        <Button variant="primary" onClick={processar} disabled={!dfPag || processando}>
          <Play size={14} />
          {processando ? 'Calculando...' : 'Calcular Indice de Injecao'}
        </Button>
      </div>

      <LogPanel logs={logs} />

      {resultado && (
        <div className="space-y-5">

          {stats && (
            <>
              <div className="grid grid-cols-4 gap-3">
                <MetricCard label="Total Analisado" value={stats.total} sub="registros na selecao atual" color="#a855f7" />
                <MetricCard label="Media de Injecao"
                  value={`${(stats.media * 100).toFixed(1)}%`}
                  sub="indice medio geral"
                  color={stats.media >= 0.95 ? '#22c55e' : stats.media >= 0.80 ? '#fbbf24' : '#ef4444'} />
                <MetricCard label="Excelentes >=95%" value={stats.excelentes}
                  sub={`${((stats.excelentes / stats.total) * 100).toFixed(1)}% do total`}
                  color="#22c55e" onClick={() => setFiltroQual('excelente')} />
                <MetricCard label="Atencao <80%" value={stats.ruins}
                  sub={`${((stats.ruins / stats.total) * 100).toFixed(1)}% precisam de acao`}
                  color="#ef4444" onClick={() => setFiltroQual('atencao')} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_1.8fr] gap-4">
                <div className="bg-s1 border border-bd rounded-xl p-5">
                  <p className="m-0 mb-3 text-xs font-bold text-tx3 uppercase tracking-wider">Distribuicao de Qualidade</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={stats.pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                        label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {stats.pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Pie>
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }} />
                      <Tooltip formatter={(v) => [`${v} registros`]} contentStyle={{
                        background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11
                      }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-s1 border border-bd rounded-xl p-5">
                  <p className="m-0 mb-3 text-xs font-bold text-tx3 uppercase tracking-wider">Histograma de Distribuicao</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={stats.histData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 9 }} />
                      <YAxis tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 9 }} />
                      <Tooltip contentStyle={{
                        background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11
                      }} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {stats.histData.map((entry, i) => {
                          const pct = parseInt(entry.name)
                          const fill = pct >= 90 ? '#22c55e' : pct >= 80 ? '#fbbf24' : '#ef4444'
                          return <Cell key={i} fill={fill} />
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          {/* Tabela */}
          <div className="bg-s1 border border-bd rounded-xl overflow-hidden">
            <div className="px-5 pt-4 flex flex-wrap items-center justify-between gap-4 border-b border-bd pb-4">
              <TabBar abas={abasComCount} abaAtiva={abaAtiva} onTab={k => {
                setAbaAtiva(k); setFiltroQual('todos'); setFiltroAno('todos'); setFiltroMes('todos')
              }} />
              <div className="flex items-center gap-3">
                <select value={filtroAno} onChange={e => setFiltroAno(e.target.value)}
                  className="bg-s2 border border-bd text-tx text-xs rounded-lg px-2 py-1.5 outline-none cursor-pointer">
                  <option value="todos">Todos os Anos</option>
                  {opcoesData.anos.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)}
                  className="bg-s2 border border-bd text-tx text-xs rounded-lg px-2 py-1.5 outline-none cursor-pointer">
                  <option value="todos">Todos os Meses</option>
                  {opcoesData.meses.map(m => <option key={m} value={m}>Mes {m}</option>)}
                </select>
                <Button variant="default" onClick={handleExport} disabled={rowsFiltradas.length === 0}
                  className="!px-3 !py-1.5 !text-xs bg-white/5 hover:bg-white/10 border-white/10">
                  <Download size={13} /> Exportar XLSX
                </Button>
              </div>
            </div>

            {abaAtiva !== 'semDados' && (
              <div className="px-5 pt-4 pb-2 flex gap-1.5 border-b border-bd bg-s2/50">
                {FILTROS.map(f => (
                  <button key={f.key} onClick={() => setFiltroQual(f.key)}
                    className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-colors ${
                      filtroQual === f.key
                        ? 'border-purple-500/50 bg-purple-500/15 text-purple-400'
                        : 'border-white/10 bg-transparent text-tx3 hover:bg-white/5'
                    }`}>
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            <div className="px-5 pb-5 pt-3">
              <ResultTable rows={rowsFiltradas} abaAtiva={abaAtiva} />
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
