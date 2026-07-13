import { useMemo, useState } from 'react'
import { AlertTriangle, Download, Pencil, Play } from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts'
import { UploadBox } from '../../components/ui/UploadBox'
import { MetricCard } from '../../components/ui/MetricCard'
import { TabBar } from '../../components/ui/TabBar'
import { Button } from '../../components/ui/Button'
import { ColumnMapper } from '../../components/ui/ColumnMapper'
import { LogPanel } from '../../components/ui/LogPanel'
import { normalizarRows, normalizarMes, getField } from '../../utils/normalizadores'

const DASH = '-'

function normUC(x) {
  if (!x) return ''
  return String(x).replace(/\D/g, '').replace(/^0+/, '')
}

function toNum(x) {
  if (x === null || x === undefined || x === '') return 0
  if (typeof x === 'number') return x
  const s = String(x).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')
  return parseFloat(s) || 0
}

function normText(s) {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function pick(row, key, aliases) {
  const mapped = row?.[`_gmap_${key}`]
  if (mapped !== undefined && mapped !== null && mapped !== '') return mapped
  return getField(row || {}, aliases)
}

function mesParaIndice(mes) {
  const m = String(mes || '').match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  return Number(m[1]) * 12 + Number(m[2])
}

function indiceParaMes(indice) {
  const ano = Math.floor((indice - 1) / 12)
  const mes = ((indice - 1) % 12) + 1
  return `${ano}-${String(mes).padStart(2, '0')}`
}

function disponibilidadePorClassificacao(valor) {
  const txt = normText(valor)
  if (!txt) return { disponibilidade: 0, tipo: '', motivo: 'Classificacao vazia' }
  if (txt.includes('TRI')) return { disponibilidade: 100, tipo: 'Trifasico', motivo: '' }
  if (txt.includes('BI')) return { disponibilidade: 50, tipo: 'Bifasico', motivo: '' }
  if (txt.includes('MONO')) return { disponibilidade: 30, tipo: 'Monofasico', motivo: '' }
  return { disponibilidade: 0, tipo: valor || '', motivo: 'Classificacao nao reconhecida' }
}

function qualidadePorIndice(indice) {
  if (indice >= 0.95) return 'Excelente'
  if (indice >= 0.80) return 'Bom'
  return 'Atencao'
}

function uniquePush(target, value) {
  if (value && !target.includes(value)) target.push(value)
}

function lerPlanilha(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
        resolve(normalizarRows(raw))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

function indexarBaseGv(rowsGv) {
  const byKey = {}
  const byName = {}

  rowsGv.forEach(row => {
    const inst = normUC(pick(row, 'instalacao', ['Instalacao', 'Instalação', 'instalacao', 'UC', 'num_instalacao']))
    const numeroCliente = normUC(pick(row, 'numero_cliente', ['Numero Cliente', 'Número Cliente', 'numero_cliente', 'Codigo', 'Código', 'codigo', 'cod_cliente']))
    const novaInstalacao = normUC(pick(row, 'nova_instalacao', ['Nova Instalacao', 'Nova Instalação', 'nova_instalacao']))
    const nome = normText(pick(row, 'nome', ['Nome', 'Cliente', 'Nome Cliente', 'nome_cliente']))
    const payload = { row, inst, numeroCliente, novaInstalacao, nome }

    ;[inst, numeroCliente, novaInstalacao].forEach(key => {
      if (key && !byKey[key]) byKey[key] = payload
    })
    if (nome && !byName[nome]) byName[nome] = payload
  })

  return { byKey, byName }
}

function indexarRecebiveis(rowsRec) {
  const byNumClienteMes = {}
  const byInstalacaoMes = {}
  const mesesPorKey = {}

  rowsRec.forEach(row => {
    const mes = normalizarMes(pick(row, 'mes', ['Data Referencia', 'Data Referência', 'data referencia', 'mes_referencia', 'Mês', 'Mes']))
    const inst = normUC(pick(row, 'instalacao', ['Instalacao', 'Instalação', 'instalacao', 'UC', 'num_instalacao']))
    const numeroCliente = normUC(pick(row, 'numero_cliente', ['Numero Cliente', 'Número Cliente', 'numero_cliente', 'Nº Cliente', 'N Cliente']))
    if (!mes) return

    if (numeroCliente) {
      const key = `${numeroCliente}|${mes}`
      if (!byNumClienteMes[key]) byNumClienteMes[key] = row
      if (!mesesPorKey[numeroCliente]) mesesPorKey[numeroCliente] = new Set()
      mesesPorKey[numeroCliente].add(mes)
    }

    if (inst) {
      const key = `${inst}|${mes}`
      if (!byInstalacaoMes[key]) byInstalacaoMes[key] = row
      if (!mesesPorKey[inst]) mesesPorKey[inst] = new Set()
      mesesPorKey[inst].add(mes)
    }
  })

  const lacunasPorKey = {}
  Object.entries(mesesPorKey).forEach(([key, mesesSet]) => {
    const indices = [...mesesSet].map(mesParaIndice).filter(v => v !== null).sort((a, b) => a - b)
    if (indices.length < 2) {
      lacunasPorKey[key] = []
      return
    }
    const faltantes = []
    for (let i = indices[0]; i <= indices[indices.length - 1]; i += 1) {
      if (!indices.includes(i)) faltantes.push(indiceParaMes(i))
    }
    lacunasPorKey[key] = faltantes
  })

  return { byNumClienteMes, byInstalacaoMes, lacunasPorKey, mesesPorKey }
}

function buscarRecebivel({ ucNorm, mes, cli }, recIndex) {
  if (!recIndex || !mes) return { row: null, etapa: '' }

  const chavesNumero = [ucNorm, cli?.numeroCliente].filter(Boolean)
  for (const key of chavesNumero) {
    const row = recIndex.byNumClienteMes[`${key}|${mes}`]
    if (row) return { row, etapa: key === ucNorm ? 'PAG.UC x RCB.numero cliente' : 'Base GV x RCB.numero cliente' }
  }

  const chavesInstalacao = [ucNorm, cli?.inst, cli?.novaInstalacao].filter(Boolean)
  for (const key of chavesInstalacao) {
    const row = recIndex.byInstalacaoMes[`${key}|${mes}`]
    if (row) return { row, etapa: key === ucNorm ? 'PAG.UC x RCB.instalacao' : 'Base GV x RCB.instalacao' }
  }

  return { row: null, etapa: '' }
}

function gapsParaCliente(ucNorm, cli, recIndex) {
  if (!recIndex) return []
  const keys = [ucNorm, cli?.numeroCliente, cli?.inst, cli?.novaInstalacao].filter(Boolean)
  const out = []
  keys.forEach(key => (recIndex.lacunasPorKey[key] || []).forEach(mes => uniquePush(out, mes)))
  return out.sort()
}

function calcularInjecao(rowsPag, rowsGv, rowsRec = []) {
  const gvIndex = indexarBaseGv(rowsGv || [])
  const recIndex = rowsRec?.length ? indexarRecebiveis(rowsRec) : null

  const analisados = []
  const atencao = []
  const semBaseGv = []
  const boletosFaltantes = []
  const semDados = []

  rowsPag.forEach(pag => {
    const ucOriginal = pick(pag, 'instalacao', ['Número da Instalação', 'Nº da Instalação', 'Numero da Instalacao', 'Instalação', 'Instalacao', 'UC', 'uc', 'numinstalacao', 'num_instalacao'])
    const ucNorm = normUC(ucOriginal)
    const mes = normalizarMes(pick(pag, 'mes', ['Mês de Referência', 'Mes de Referencia', 'Mês de referência', 'Mês', 'Mes', 'mes', 'Data Referencia', 'mes_referencia', 'mesreferencia']))
    const compensado = toNum(pick(pag, 'compensado', ['Energia Compensada (kWh)', 'Energia Compensada', 'energia_compensada', 'Compensado', 'Compensado (kWh)']))
    const nomePag = normText(pick(pag, 'cliente', ['Cliente', 'nome_cliente', 'Favorecido', 'Consorciado', 'Nome']))

    if (!ucNorm || !mes || compensado <= 0) {
      semDados.push({
        UC: ucOriginal || DASH,
        Cliente: pick(pag, 'cliente', ['Cliente', 'nome_cliente', 'Favorecido', 'Consorciado', 'Nome']) || DASH,
        Mes: mes || DASH,
        Compensado: compensado || 0,
        Motivo: !ucNorm ? 'UC ausente' : !mes ? 'Mes ausente' : 'Sem energia compensada',
      })
      return
    }

    let cli = gvIndex.byKey[ucNorm] || null
    let tipoMatchGv = cli ? 'UC / numero cliente' : ''
    if (!cli && nomePag && gvIndex.byName[nomePag]) {
      cli = gvIndex.byName[nomePag]
      tipoMatchGv = 'Nome'
    }

    if (!cli) {
      semBaseGv.push({
        UC: ucOriginal,
        Cliente: pick(pag, 'cliente', ['Cliente', 'nome_cliente', 'Favorecido', 'Consorciado', 'Nome']) || DASH,
        Mes: mes,
        Compensado: compensado,
        Motivo: 'UC ou nome nao localizado na base_gv',
      })
      return
    }

    const gvRow = cli.row
    const mediaConsumo = toNum(pick(gvRow, 'media_consumo', ['Media Consumo', 'Média Consumo', 'media_consumo', 'Consumo', 'Consumo Total']))
    const classificacao = pick(gvRow, 'classificacao', ['Classificacao', 'Classificação', 'classificacao'])
    const { disponibilidade, tipo, motivo } = disponibilidadePorClassificacao(classificacao)

    if (mediaConsumo <= 0 || disponibilidade <= 0 || mediaConsumo <= disponibilidade) {
      semDados.push({
        UC: ucOriginal,
        Cliente: pick(pag, 'cliente', ['Cliente', 'nome_cliente', 'Favorecido', 'Consorciado', 'Nome']) || pick(gvRow, 'nome', ['Nome', 'Cliente', 'Nome Cliente', 'nome_cliente']) || DASH,
        Mes: mes,
        Compensado: compensado,
        MediaConsumo: mediaConsumo,
        Classificacao: classificacao || DASH,
        Disponibilidade: disponibilidade,
        Motivo: mediaConsumo <= 0 ? 'Media de consumo ausente ou zerada' : motivo || 'Media de consumo menor/igual a disponibilidade',
      })
      return
    }

    const recMatch = buscarRecebivel({ ucNorm, mes, cli }, recIndex)
    const lacunas = gapsParaCliente(ucNorm, cli, recIndex)
    const boletoFaltanteNaCompetencia = !recMatch.row && lacunas.includes(mes)
    const denominador = mediaConsumo - disponibilidade
    const indiceBruto = denominador <= 0 ? 1 : compensado / denominador
    const indice = Math.max(0, Math.min(1, indiceBruto))
    const alertas = []

    if (!recIndex) alertas.push('Base RCB nao carregada')
    if (recIndex && !recMatch.row) alertas.push('Sem recebivel do mesmo mes')
    if (boletoFaltanteNaCompetencia) alertas.push('Boleto faltante no meio da sequencia')
    if (lacunas.length) alertas.push(`Historico RCB com lacunas: ${lacunas.join(', ')}`)
    if (indiceBruto > 1.05) alertas.push('Compensado acima do possivel estimado')
    if (indice < 0.80) alertas.push('Indice abaixo de 80%')

    const rowResult = {
      UC: ucOriginal || ucNorm,
      Cliente: pick(pag, 'cliente', ['Cliente', 'nome_cliente', 'Favorecido', 'Consorciado', 'Nome']) || pick(gvRow, 'nome', ['Nome', 'Cliente', 'Nome Cliente', 'nome_cliente']) || DASH,
      Mes: mes,
      Concessionaria: pick(pag, 'distribuidora', ['Distribuidora', 'Concessionaria', 'Concessionária', 'Fornecedor', 'Fornecedora']) || pick(gvRow, 'regiao', ['Regiao', 'Região', 'regiao']),
      Licenciado: pick(gvRow, 'licenciado', ['Licenciado', 'Licenciado Consultor', 'Consultor']),
      Compensado: compensado,
      MediaConsumo: mediaConsumo,
      Classificacao: classificacao || DASH,
      TipoLigacao: tipo || DASH,
      Disponibilidade: disponibilidade,
      ConsumoBase: mediaConsumo,
      Denominador: denominador,
      Indice: indice,
      IndiceBruto: indiceBruto,
      IndicePerc: `${(indice * 100).toFixed(1)}%`,
      Qualidade: qualidadePorIndice(indice),
      FonteDados: `Estimado por media da base_gv (${tipoMatchGv})`,
      MatchRCB: !!recMatch.row,
      EtapaRCB: recMatch.etapa || DASH,
      StatusRCB: recMatch.row ? pick(recMatch.row, 'status', ['Status', 'status', 'Status fatura']) : DASH,
      ValorRCB: recMatch.row ? pick(recMatch.row, 'valor', ['Valor A Pagar', 'Valor a Pagar', 'valorapagar', 'Valor']) : DASH,
      BoletosFaltantes: lacunas.join(', ') || DASH,
      Alerta: alertas.join(' | ') || DASH,
    }

    analisados.push(rowResult)
    if (indice < 0.80 || alertas.length) atencao.push(rowResult)
    if (boletoFaltanteNaCompetencia || (recIndex && !recMatch.row)) boletosFaltantes.push(rowResult)
  })

  return { analisados, atencao, semBaseGv, boletosFaltantes, semDados }
}

function QualBadge({ q }) {
  const cfg = {
    Excelente: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' },
    Bom: { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
    Atencao: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
  }[q] || { bg: 'rgb(var(--color-s3) / 0.8)', color: 'rgb(var(--color-tx3))' }
  return (
    <span style={{ background: cfg.bg, color: cfg.color, borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>
      {q}
    </span>
  )
}

function ResultTable({ rows }) {
  const [pagina, setPagina] = useState(0)
  const POR_PAG = 50
  const total = rows.length
  const paginadas = rows.slice(pagina * POR_PAG, (pagina + 1) * POR_PAG)

  if (!rows.length) return <div className="p-8 text-center text-tx3 text-sm">Nenhum resultado para esta aba.</div>

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-bd">
              {[
                'UC', 'Cliente', 'Mes', 'Distribuidora', 'Compensado', 'Media consumo',
                'Classificacao', 'Disp.', 'Indice', 'Qualidade', 'RCB', 'Boletos faltantes', 'Alerta',
              ].map(h => (
                <th key={h} className="p-3 font-bold text-[10px] text-tx3 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginadas.map((r, i) => (
              <tr key={`${r.UC}-${r.Mes}-${i}`} className="border-b border-bd transition-colors hover:bg-s2/70">
                <td className="p-3 font-mono text-[10px] text-purple-400">{r.UC}</td>
                <td className="p-3 max-w-[180px] truncate text-tx2" title={r.Cliente}>{r.Cliente}</td>
                <td className="p-3 text-tx3 whitespace-nowrap">{r.Mes}</td>
                <td className="p-3 text-tx3 whitespace-nowrap max-w-[120px] truncate">{r.Concessionaria || DASH}</td>
                <td className="p-3 text-right text-blue-400">{Number(r.Compensado || 0).toFixed(1)}</td>
                <td className="p-3 text-right text-sky-300">{r.MediaConsumo ? Number(r.MediaConsumo).toFixed(1) : DASH}</td>
                <td className="p-3 text-tx3 whitespace-nowrap">{r.Classificacao || DASH}</td>
                <td className="p-3 text-right text-tx3">{r.Disponibilidade || DASH}</td>
                <td className="p-3 text-right font-bold" style={{ color: r.Indice >= 0.95 ? '#22c55e' : r.Indice >= 0.80 ? '#fbbf24' : '#ef4444' }}>
                  {r.IndicePerc || DASH}
                </td>
                <td className="p-3"><QualBadge q={r.Qualidade} /></td>
                <td className="p-3 text-[10px] text-tx3 whitespace-nowrap">{r.MatchRCB ? r.EtapaRCB : 'Nao encontrado'}</td>
                <td className="p-3 text-[10px] text-tx3 max-w-[180px] truncate" title={r.BoletosFaltantes}>{r.BoletosFaltantes || DASH}</td>
                <td className="p-3 text-[10px] text-warn max-w-[260px] truncate" title={r.Alerta}>{r.Alerta || DASH}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > POR_PAG && (
        <div className="p-3 flex items-center gap-2 border-t border-bd text-tx3 text-xs">
          <span>{pagina * POR_PAG + 1}-{Math.min((pagina + 1) * POR_PAG, total)} de {total}</span>
          <button onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={pagina === 0} className="rounded-lg border border-bd px-2 py-1 hover:bg-s3 disabled:opacity-50">
            &lsaquo;
          </button>
          <button onClick={() => setPagina(p => p + 1)} disabled={(pagina + 1) * POR_PAG >= total} className="rounded-lg border border-bd px-2 py-1 hover:bg-s3 disabled:opacity-50">
            &rsaquo;
          </button>
        </div>
      )}
    </div>
  )
}

const ABAS = [
  { key: 'analisados', label: 'Analisados', cor: '#22c55e' },
  { key: 'atencao', label: 'Atencao', cor: '#ef4444' },
  { key: 'boletosFaltantes', label: 'Boleto faltante', cor: '#f59e0b' },
  { key: 'semBaseGv', label: 'Sem Base GV', cor: '#a78bfa' },
  { key: 'semDados', label: 'Sem dados', cor: '#94a3b8' },
]

export function QualidadeInjecao() {
  const [rawPag, setRawPag] = useState(null)
  const [rawGv, setRawGv] = useState(null)
  const [rawRec, setRawRec] = useState(null)
  const [dfPag, setDfPag] = useState(null)
  const [dfGv, setDfGv] = useState(null)
  const [dfRec, setDfRec] = useState(null)
  const [nomes, setNomes] = useState({ pag: '', gv: '', rec: '' })

  const [mapperOpen, setMapperOpen] = useState(false)
  const [mapperKey, setMapperKey] = useState('pag')
  const [mapperRaw, setMapperRaw] = useState([])
  const [mapperHeaders, setMapperHeaders] = useState([])

  const [processando, setProcessando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [abaAtiva, setAbaAtiva] = useState('analisados')
  const [filtroQual, setFiltroQual] = useState('todos')
  const [filtroAno, setFiltroAno] = useState('todos')
  const [filtroMes, setFiltroMes] = useState('todos')
  const [logs, setLogs] = useState([])

  const addLog = (msg, tipo = 'info') =>
    setLogs(p => [...p, { msg, tipo, hora: new Date().toLocaleTimeString('pt-BR') }])

  const handleFile = async (file, key) => {
    try {
      addLog(`Lendo ${file.name}...`)
      const rows = await lerPlanilha(file)
      if (!rows || !rows.length) {
        addLog(`Planilha vazia: ${file.name}`, 'err')
        return
      }
      if (key === 'pag') setRawPag(rows)
      if (key === 'gv') setRawGv(rows)
      if (key === 'rec') setRawRec(rows)
      setNomes(prev => ({ ...prev, [key]: file.name }))
      setMapperKey(key)
      setMapperRaw(rows)
      setMapperHeaders(Object.keys(rows[0]))
      setMapperOpen(true)
      addLog(`${file.name}: ${rows.length.toLocaleString('pt-BR')} linhas lidas.`, 'ok')
    } catch (e) {
      addLog(`Erro ao ler ${file.name}: ${e.message}`, 'err')
    }
  }

  const reabrirMapper = (key) => {
    const rows = key === 'pag' ? rawPag : key === 'gv' ? rawGv : rawRec
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
    } else if (mapperKey === 'gv') {
      setDfGv(remapped)
      addLog(`Base GV mapeada: ${remapped.length.toLocaleString('pt-BR')} clientes`, 'ok')
    } else {
      setDfRec(remapped)
      addLog(`Base RCB mapeada: ${remapped.length.toLocaleString('pt-BR')} recebiveis`, 'ok')
    }
  }

  const processar = async () => {
    if (!dfPag || !dfGv) return
    setProcessando(true)
    setResultado(null)
    addLog('Iniciando calculo estimado de qualidade de injecao...')
    await new Promise(r => setTimeout(r, 50))
    try {
      const res = calcularInjecao(dfPag, dfGv, dfRec || [])
      setResultado(res)
      setAbaAtiva('analisados')
      addLog(`Concluido: ${res.analisados.length} analisados | ${res.atencao.length} em atencao | ${res.boletosFaltantes.length} com alerta de boleto`, 'ok')
    } catch (e) {
      addLog(`Erro: ${e.message}`, 'err')
    } finally {
      setProcessando(false)
    }
  }

  const rowsFiltradas = useMemo(() => {
    if (!resultado) return []
    let rows = resultado[abaAtiva] || []
    if (filtroQual !== 'todos' && rows.some(r => r.Indice !== undefined)) {
      if (filtroQual === 'excelente') rows = rows.filter(r => r.Indice >= 0.95)
      if (filtroQual === 'bom') rows = rows.filter(r => r.Indice >= 0.80 && r.Indice < 0.95)
      if (filtroQual === 'atencao') rows = rows.filter(r => r.Indice < 0.80)
    }
    if (filtroAno !== 'todos') rows = rows.filter(r => r.Mes && String(r.Mes).startsWith(filtroAno))
    if (filtroMes !== 'todos') rows = rows.filter(r => r.Mes && String(r.Mes).substring(5, 7) === filtroMes)
    return rows
  }, [resultado, abaAtiva, filtroQual, filtroAno, filtroMes])

  const stats = useMemo(() => {
    if (!resultado) return null
    const rows = resultado.analisados || []
    if (!rows.length) return null
    const media = rows.reduce((s, r) => s + r.Indice, 0) / rows.length
    const excelentes = rows.filter(r => r.Indice >= 0.95).length
    const bons = rows.filter(r => r.Indice >= 0.80 && r.Indice < 0.95).length
    const ruins = rows.filter(r => r.Indice < 0.80).length
    const pieData = [
      { name: 'Excelente >=95%', value: excelentes, fill: '#22c55e' },
      { name: 'Bom 80-94%', value: bons, fill: '#fbbf24' },
      { name: 'Atencao <80%', value: ruins, fill: '#ef4444' },
    ].filter(d => d.value > 0)
    const faixas = {}
    for (let i = 0; i <= 90; i += 10) {
      const label = `${i}-${i + 10}%`
      faixas[label] = rows.filter(r => r.Indice * 100 >= i && r.Indice * 100 < i + 10).length
    }
    faixas['100%'] = rows.filter(r => r.Indice >= 1).length
    const histData = Object.entries(faixas).map(([name, count]) => ({ name, count })).filter(d => d.count > 0)
    return { total: rows.length, media, excelentes, bons, ruins, pieData, histData }
  }, [resultado])

  const opcoesData = useMemo(() => {
    const anos = new Set()
    const meses = new Set()
    const rows = resultado ? Object.values(resultado).flat() : []
    rows.forEach(r => {
      if (r.Mes && String(r.Mes).length >= 7) {
        anos.add(String(r.Mes).substring(0, 4))
        meses.add(String(r.Mes).substring(5, 7))
      }
    })
    return { anos: [...anos].sort().reverse(), meses: [...meses].sort() }
  }, [resultado])

  const abasComCount = ABAS.map(a => ({ ...a, count: resultado ? (resultado[a.key] || []).length : undefined }))

  const handleExport = () => {
    if (!rowsFiltradas.length) return
    const exportData = rowsFiltradas.map(r => ({
      UC: r.UC,
      Cliente: r.Cliente,
      'Mes Referencia': r.Mes,
      Distribuidora: r.Concessionaria,
      Licenciado: r.Licenciado,
      'Energia Compensada (kWh)': r.Compensado,
      'Media Consumo Base GV (kWh)': r.MediaConsumo,
      Classificacao: r.Classificacao,
      'Disponibilidade (kWh)': r.Disponibilidade,
      'Base do Calculo (Media - Disponibilidade)': r.Denominador,
      'Indice Estimado': r.IndicePerc,
      Qualidade: r.Qualidade,
      'Match RCB': r.MatchRCB ? 'SIM' : 'NAO',
      'Etapa RCB': r.EtapaRCB,
      'Boletos Faltantes': r.BoletosFaltantes,
      Alerta: r.Alerta || r.Motivo,
      Observacao: 'Calculo estimado: falta consumo total real da fatura do mes.',
    }))
    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, abaAtiva.substring(0, 30))
    XLSX.writeFile(wb, `QualidadeInjecao_${abaAtiva}_${new Date().getTime()}.xlsx`)
  }

  return (
    <div className="p-7 space-y-5">
      <ColumnMapper
        open={mapperOpen}
        raw={mapperRaw}
        headers={mapperHeaders}
        schemaKey={mapperKey === 'pag' ? 'qualidade_pag' : mapperKey === 'gv' ? 'qualidade_cli' : 'qualidade_rec'}
        title={mapperKey === 'pag' ? 'Analise de colunas - Pagadoria Northen' : mapperKey === 'gv' ? 'Analise de colunas - Base GV' : 'Analise de colunas - Base RCB GV'}
        fileName={nomes[mapperKey]}
        onConfirm={handleMapperConfirm}
        onCancel={() => setMapperOpen(false)}
      />

      <div className="pb-5 border-b border-bd">
        <h1 className="text-xl font-bold text-tx m-0">Qualidade de Injecao Estimada</h1>
        <p className="text-sm text-tx3 mt-1 m-0">
          Cruzamento Pagadoria x Base GV x RCB. Indice estimado = Energia compensada / (media de consumo - disponibilidade por classificacao).
        </p>
      </div>

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-3">
        <UploadCard
          label="Pagadoria Northen"
          sublabel="Energia compensada por UC e mes"
          loaded={!!dfPag}
          fileName={nomes.pag}
          onFile={f => handleFile(f, 'pag')}
          onReabrir={() => reabrirMapper('pag')}
        />
        <UploadCard
          label="Base GV"
          sublabel="Media consumo, classificacao, cliente"
          loaded={!!dfGv}
          fileName={nomes.gv}
          onFile={f => handleFile(f, 'gv')}
          onReabrir={() => reabrirMapper('gv')}
        />
        <UploadCard
          label="Base RCB GV"
          sublabel="Recebiveis para validar faturas faltantes"
          loaded={!!dfRec}
          fileName={nomes.rec}
          onFile={f => handleFile(f, 'rec')}
          onReabrir={() => reabrirMapper('rec')}
        />
      </div>

      <div className="flex justify-end">
        <Button variant="primary" onClick={processar} disabled={!dfPag || !dfGv || processando}>
          <Play size={14} />
          {processando ? 'Calculando...' : 'Calcular qualidade estimada'}
        </Button>
      </div>

      <LogPanel logs={logs} />

      {resultado && (
        <div className="space-y-5">
          {stats && (
            <>
              <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
                <MetricCard label="Total Analisado" value={stats.total} sub="com Pagadoria + Base GV" color="#a855f7" />
                <MetricCard label="Media Estimada" value={`${(stats.media * 100).toFixed(1)}%`} sub="indice medio" color={stats.media >= 0.95 ? '#22c55e' : stats.media >= 0.80 ? '#fbbf24' : '#ef4444'} />
                <MetricCard label="Excelentes" value={stats.excelentes} sub=">= 95%" color="#22c55e" onClick={() => setFiltroQual('excelente')} />
                <MetricCard label="Atencao" value={stats.ruins} sub="< 80%" color="#ef4444" onClick={() => setFiltroQual('atencao')} />
                <MetricCard label="Boletos Faltantes" value={resultado.boletosFaltantes.length} sub="alerta pela base RCB" color="#f59e0b" onClick={() => setAbaAtiva('boletosFaltantes')} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_1.8fr] gap-4">
                <div className="bg-s1 border border-bd rounded-xl p-5">
                  <p className="m-0 mb-3 text-xs font-bold text-tx3 uppercase tracking-wider">Distribuicao de Qualidade</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={stats.pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {stats.pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Pie>
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: 'rgb(var(--color-tx3))' }} />
                      <Tooltip formatter={(v) => [`${v} registros`]} contentStyle={{ background: 'rgb(var(--color-s1))', border: '1px solid rgb(var(--color-bd))', borderRadius: 8, color: 'rgb(var(--color-tx))', fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-s1 border border-bd rounded-xl p-5">
                  <p className="m-0 mb-3 text-xs font-bold text-tx3 uppercase tracking-wider">Histograma de Distribuicao</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={stats.histData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-bd) / 0.65)" />
                      <XAxis dataKey="name" tick={{ fill: 'rgb(var(--color-tx3))', fontSize: 9 }} />
                      <YAxis tick={{ fill: 'rgb(var(--color-tx3))', fontSize: 9 }} />
                      <Tooltip contentStyle={{ background: 'rgb(var(--color-s1))', border: '1px solid rgb(var(--color-bd))', borderRadius: 8, color: 'rgb(var(--color-tx))', fontSize: 11 }} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {stats.histData.map((entry, i) => {
                          const pct = parseInt(entry.name)
                          return <Cell key={i} fill={pct >= 90 ? '#22c55e' : pct >= 80 ? '#fbbf24' : '#ef4444'} />
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          <div className="bg-s1 border border-bd rounded-xl overflow-hidden">
            <div className="px-5 pt-4 flex flex-wrap items-center justify-between gap-4 border-b border-bd pb-4">
              <TabBar abas={abasComCount} abaAtiva={abaAtiva} onTab={k => {
                setAbaAtiva(k)
                setFiltroQual('todos')
                setFiltroAno('todos')
                setFiltroMes('todos')
              }} />
              <div className="flex items-center gap-3">
                <select value={filtroAno} onChange={e => setFiltroAno(e.target.value)} className="bg-s2 border border-bd text-tx text-xs rounded-lg px-2 py-1.5 outline-none cursor-pointer">
                  <option value="todos">Todos os Anos</option>
                  {opcoesData.anos.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)} className="bg-s2 border border-bd text-tx text-xs rounded-lg px-2 py-1.5 outline-none cursor-pointer">
                  <option value="todos">Todos os Meses</option>
                  {opcoesData.meses.map(m => <option key={m} value={m}>Mes {m}</option>)}
                </select>
                <Button variant="default" onClick={handleExport} disabled={rowsFiltradas.length === 0} className="!px-3 !py-1.5 !text-xs">
                  <Download size={13} /> Exportar XLSX
                </Button>
              </div>
            </div>

            <div className="px-5 pt-4 pb-2 flex gap-1.5 border-b border-bd bg-s2/50">
              {[
                { key: 'todos', label: 'Todos' },
                { key: 'excelente', label: 'Excelente >=95%' },
                { key: 'bom', label: 'Bom 80-94%' },
                { key: 'atencao', label: 'Atencao <80%' },
              ].map(f => (
                <button key={f.key} onClick={() => setFiltroQual(f.key)} className={`rounded-full border px-3 py-1 text-[10px] font-bold transition-colors ${filtroQual === f.key ? 'border-purple-500/50 bg-purple-500/15 text-purple-400' : 'border-bd bg-transparent text-tx3 hover:bg-s2'}`}>
                  {f.label}
                </button>
              ))}
            </div>

            <div className="px-5 pb-5 pt-3">
              <ResultTable rows={rowsFiltradas} />
            </div>
          </div>

          <div className="bg-warn/10 border border-warn/25 rounded-xl p-4 flex items-start gap-3 text-sm text-tx2">
            <AlertTriangle size={18} className="text-warn flex-shrink-0 mt-0.5" />
            <div>
              <p className="m-0 font-semibold text-warn">Aviso sobre a precisao do calculo</p>
              <p className="m-0 mt-1 text-tx3">
                Esta aba calcula uma qualidade de injecao estimada com os dados disponiveis agora: energia compensada da Pagadoria, media de consumo e classificacao da Base GV, e historico de recebiveis da Base RCB. Ainda falta o consumo total real da fatura do mes, tarifa da fatura, datas reais de leitura e detalhamento de itens cobrados. Por isso o indice pode nao ser 100% preciso e deve ser usado como triagem operacional ate que esses campos existam na base.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function UploadCard({ label, sublabel, loaded, fileName, onFile, onReabrir }) {
  return (
    <div className="relative">
      <UploadBox label={label} sublabel={sublabel} onFile={onFile} loaded={loaded} fileName={fileName} />
      {loaded && (
        <button onClick={onReabrir} title="Editar mapeamento" className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg border border-acc/30 bg-acc/10 text-acc hover:bg-acc/20 transition-colors z-10">
          <Pencil size={13} />
        </button>
      )}
    </div>
  )
}
