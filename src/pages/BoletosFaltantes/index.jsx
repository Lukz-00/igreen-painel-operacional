import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Download, FileSearch, Pencil, Play, Search } from 'lucide-react'
import * as XLSX from 'xlsx'
import { UploadBox } from '../../components/ui/UploadBox'
import { MetricCard } from '../../components/ui/MetricCard'
import { TabBar } from '../../components/ui/TabBar'
import { Button } from '../../components/ui/Button'
import { ColumnMapper } from '../../components/ui/ColumnMapper'
import { LogPanel } from '../../components/ui/LogPanel'
import { getField, normalizarMes, normalizarRows, normUC } from '../../utils/normalizadores'

const DASH = '-'

const ABAS = [
  { key: 'todos', label: 'Todos', cor: '#3b82f6' },
  { key: 'faltamRecebiveis', label: 'Falta nos Recebiveis', cor: '#f59e0b' },
  { key: 'faltamPagadoria', label: 'Falta na Pagadoria', cor: '#a855f7' },
  { key: 'faltamAmbos', label: 'Falta nos dois lados', cor: '#ef4444' },
]

const COLUNAS = [
  'Cliente',
  'Codigo cliente',
  'CPF/CNPJ',
  'Instalacao',
  'Numero cliente',
  'Nova instalacao',
  'Fornecedora',
  'Falta nos Recebiveis',
  'Falta na Pagadoria',
  'Falta nos dois lados',
  'Meses Pagadoria',
  'Meses Recebiveis',
  'Qtd. Pagadoria',
  'Qtd. Recebiveis',
  'Primeira competencia',
  'Ultima competencia',
  'Origem do match',
  'Motivo',
]

function normText(value) {
  return String(value || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normBaseIdentifier(value) {
  if (normText(value).includes('CANCELAD')) return ''
  return normUC(value)
}

function display(value) {
  if (value === null || value === undefined || value === '') return DASH
  return String(value)
}

function pick(row, key, aliases) {
  const mapped = row?.[`_gmap_${key}`]
  if (mapped !== undefined && mapped !== null && mapped !== '') return mapped
  return getField(row || {}, aliases)
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort()
}

function mesParaIndice(mes) {
  const match = String(mes || '').match(/^(\d{4})-(\d{2})$/)
  if (!match) return null
  return Number(match[1]) * 12 + Number(match[2])
}

function indiceParaMes(indice) {
  const ano = Math.floor((indice - 1) / 12)
  const mes = ((indice - 1) % 12) + 1
  return `${ano}-${String(mes).padStart(2, '0')}`
}

function formatMes(mes) {
  const match = String(mes || '').match(/^(\d{4})-(\d{2})$/)
  if (!match) return mes || DASH
  return `${match[2]}/${match[1]}`
}

function formatListaMeses(meses) {
  return meses.length ? meses.map(formatMes).join(', ') : DASH
}

function token(tipo, valor, origem) {
  if (!valor) return null
  return { key: `${tipo}:${valor}`, origem }
}

function pushToken(tokens, tipo, valor, origem) {
  const item = token(tipo, valor, origem)
  if (item && !tokens.some(t => t.key === item.key)) tokens.push(item)
}

function lerPlanilha(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const buffer = e.target.result
        const lower = file.name.toLowerCase()
        let wb

        if (lower.endsWith('.csv')) {
          const utf8 = new TextDecoder('utf-8').decode(buffer)
          const text = utf8.includes('\uFFFD')
            ? new TextDecoder('windows-1252').decode(buffer)
            : utf8
          wb = XLSX.read(text, { type: 'string', cellDates: true })
        } else {
          wb = XLSX.read(buffer, { type: 'array', cellDates: true })
        }

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

function extrairBaseGv(row, index) {
  const codigoRaw = pick(row, 'codigo', ['codigo', 'Codigo', 'Codigo Cliente', 'codigo cliente', 'cod_cliente'])
  const instRaw = pick(row, 'instalacao', ['instalacao', 'Instalacao', 'Instalacao / UC', 'UC', 'num_instalacao'])
  const novaRaw = pick(row, 'nova_instalacao', ['Nova instalacao', 'Nova Instalacao', 'nova_instalacao'])
  const numeroRaw = pick(row, 'numero_cliente', ['numero cliente', 'Numero Cliente', 'NumeroCliente', 'N Cliente', 'UC'])
  const cpfRaw = pick(row, 'cpf', ['cpf', 'CPF', 'CPF/CNPJ', 'cnpj', 'CNPJ'])
  const nomeRaw = pick(row, 'nome', ['nome', 'Nome', 'Cliente', 'cliente', 'Nome Cliente'])

  return {
    id: `gv:${normUC(codigoRaw) || normUC(instRaw) || normUC(numeroRaw) || index}`,
    codigoRaw,
    codigo: normUC(codigoRaw),
    instRaw,
    inst: normBaseIdentifier(instRaw),
    novaRaw,
    nova: normBaseIdentifier(novaRaw),
    numeroRaw,
    numero: normBaseIdentifier(numeroRaw),
    cpfRaw,
    cpf: normUC(cpfRaw),
    nomeRaw,
    nomeNorm: normText(nomeRaw),
    fornecedora: pick(row, 'fornecedora', ['fornecedora', 'Fornecedora', 'regiao', 'Regiao', 'regiao/fornecedora']),
    status: pick(row, 'status', ['Status', 'status', 'Jornada Status', 'Status Financeiro']),
    row,
  }
}

function extrairPagadoria(row) {
  const ucRaw = pick(row, 'instalacao', [
    'Instalacao',
    'Instalacao / UC',
    'Numero de instalacao',
    'Numero instalacao',
    'numinstalacao',
    'num_instalacao',
    'UC',
  ])
  const mesRaw = pick(row, 'mes', [
    'Mes referencia',
    'Mes de referencia',
    'Mes',
    'Data Referencia',
    'mes_referencia',
    'mesreferencia',
    'DATA DO DOCUMENTO',
  ])
  const cpfRaw = pick(row, 'cpf', ['CPF/CNPJ', 'CPF', 'cpf', 'CNPJ', 'documento'])
  const clienteRaw = pick(row, 'cliente', ['Favorecido', 'Consorciado', 'Nome', 'Cliente', 'nome_cliente', 'Nome do Cliente'])

  return {
    side: 'pag',
    row,
    ucRaw,
    uc: normUC(ucRaw),
    mes: normalizarMes(mesRaw),
    mesRaw,
    cpfRaw,
    cpf: normUC(cpfRaw),
    clienteRaw,
    nomeNorm: normText(clienteRaw),
    status: pick(row, 'status', ['Status fatura', 'StatusFatura', 'Status', 'status', 'Situacao do recebimento']),
    valor: pick(row, 'valor', ['Valor fatura', 'Valor da Fatura', 'Valor total (R$)', 'Valor', 'valorapagar']),
    vencimento: pick(row, 'vencimento', ['Vencimento fatura', 'Data Vencimento', 'Data de vencimento', 'dtvencimento']),
    distribuidora: pick(row, 'distribuidora', ['Distribuidora', 'Concessionaria', 'Fornecedora']),
  }
}

function extrairRecebivel(row) {
  const instRaw = pick(row, 'instalacao', ['instalacao', 'Instalacao', 'Instalacao / UC', 'UC', 'num_instalacao'])
  const numeroRaw = pick(row, 'numero_cliente', ['numero cliente', 'Numero Cliente', 'NumeroCliente', 'N Cliente'])
  const codigoRaw = pick(row, 'codigo_cliente', ['codigo cliente', 'Codigo Cliente', 'cod_cliente', 'Codigo'])
  const mesRaw = pick(row, 'mes', ['data referencia', 'Data Referencia', 'mes_referencia', 'Mes', 'Mes referencia'])
  const cpfRaw = pick(row, 'cpf', ['cpf', 'CPF', 'CPF/CNPJ', 'cnpj', 'CNPJ'])
  const clienteRaw = pick(row, 'cliente', ['cliente', 'Cliente', 'nome_cliente', 'Nome'])

  return {
    side: 'rec',
    row,
    instRaw,
    inst: normUC(instRaw),
    numeroRaw,
    numero: normUC(numeroRaw),
    codigoRaw,
    codigo: normUC(codigoRaw),
    mes: normalizarMes(mesRaw),
    mesRaw,
    cpfRaw,
    cpf: normUC(cpfRaw),
    clienteRaw,
    nomeNorm: normText(clienteRaw),
    status: pick(row, 'status', ['status', 'Status', 'Status fatura', 'Status Financeiro Cliente']),
    valor: pick(row, 'valor', ['valor a pagar', 'Valor A Pagar', 'valorapagar', 'Valor']),
    vencimento: pick(row, 'vencimento', ['data vencimento', 'Data Vencimento', 'dtvencimento', 'Vencimento fatura']),
    fornecedora: pick(row, 'fornecedora', ['fornecedora', 'Fornecedora', 'cfornecedora']),
    concessionaria: pick(row, 'concessionaria', ['Concessionaria', 'concessionaria', 'Distribuidora']),
  }
}

function tokensBase(cli) {
  const tokens = []
  pushToken(tokens, 'codigo', cli.codigo, 'Base GV: codigo')
  pushToken(tokens, 'uc', cli.inst, 'Base GV: instalacao')
  pushToken(tokens, 'uc', cli.nova, 'Base GV: nova instalacao')
  pushToken(tokens, 'nc', cli.numero, 'Base GV: numero cliente')
  return tokens
}

function tokensPag(pag) {
  const tokens = []
  pushToken(tokens, 'uc', pag.uc, 'Pagadoria: UC')
  pushToken(tokens, 'nc', pag.uc, 'Pagadoria: UC como numero cliente')
  return tokens
}

function tokensRec(rec) {
  const tokens = []
  pushToken(tokens, 'codigo', rec.codigo, 'Recebiveis: codigo cliente')
  pushToken(tokens, 'uc', rec.inst, 'Recebiveis: instalacao')
  pushToken(tokens, 'nc', rec.numero, 'Recebiveis: numero cliente')
  return tokens
}

function createGroup(id, cli = null, origem = 'Detectado') {
  return {
    id,
    origem,
    cliente: cli,
    pag: [],
    rec: [],
    pagMeses: new Set(),
    recMeses: new Set(),
    matchOrigens: new Set(cli ? ['Base GV'] : []),
  }
}

function mergeClient(group, data) {
  if (!group.cliente) {
    group.cliente = {
      id: group.id,
      codigoRaw: data.codigoRaw || '',
      codigo: data.codigo || '',
      instRaw: data.instRaw || data.ucRaw || '',
      inst: data.inst || data.uc || '',
      novaRaw: '',
      nova: '',
      numeroRaw: data.numeroRaw || '',
      numero: data.numero || '',
      cpfRaw: data.cpfRaw || '',
      cpf: data.cpf || '',
      nomeRaw: data.clienteRaw || '',
      nomeNorm: data.nomeNorm || '',
      fornecedora: data.fornecedora || data.distribuidora || data.concessionaria || '',
      status: data.status || '',
    }
    return
  }

  const cli = group.cliente
  if (!cli.nomeRaw && data.clienteRaw) cli.nomeRaw = data.clienteRaw
  if (!cli.instRaw && (data.instRaw || data.ucRaw)) cli.instRaw = data.instRaw || data.ucRaw
  if (!cli.inst && (data.inst || data.uc)) cli.inst = data.inst || data.uc
  if (!cli.numeroRaw && data.numeroRaw) cli.numeroRaw = data.numeroRaw
  if (!cli.numero && data.numero) cli.numero = data.numero
  if (!cli.codigoRaw && data.codigoRaw) cli.codigoRaw = data.codigoRaw
  if (!cli.codigo && data.codigo) cli.codigo = data.codigo
  if (!cli.cpfRaw && data.cpfRaw) cli.cpfRaw = data.cpfRaw
  if (!cli.cpf && data.cpf) cli.cpf = data.cpf
  if (!cli.fornecedora && (data.fornecedora || data.distribuidora || data.concessionaria)) {
    cli.fornecedora = data.fornecedora || data.distribuidora || data.concessionaria
  }
}

function buildContext(rowsGv) {
  const groups = new Map()
  const baseLookup = new Map()
  const ambiguousKeys = new Set()

  rowsGv.forEach((row, index) => {
    const cli = extrairBaseGv(row, index)
    const group = createGroup(cli.id, cli, 'Base GV')
    groups.set(cli.id, group)
    tokensBase(cli).forEach(t => {
      const atual = baseLookup.get(t.key)
      if (atual && atual.id !== cli.id) {
        ambiguousKeys.add(t.key)
        baseLookup.delete(t.key)
        return
      }
      if (!ambiguousKeys.has(t.key)) baseLookup.set(t.key, { id: cli.id, origem: t.origem })
    })
  })

  return { groups, baseLookup, ambiguousKeys }
}

function resolveGroup(ctx, tokens, data) {
  for (const t of tokens) {
    const found = ctx.baseLookup.get(t.key)
    if (found) {
      const group = ctx.groups.get(found.id)
      group.matchOrigens.add(found.origem)
      mergeClient(group, data)
      return group
    }
  }

  return null
}

function gapsInternos(meses) {
  const indices = uniqueSorted(meses).map(mesParaIndice).filter(v => v !== null)
  if (indices.length < 2) return []
  const presentes = new Set(indices)
  const faltantes = []
  for (let i = indices[0]; i <= indices[indices.length - 1]; i += 1) {
    if (!presentes.has(i)) faltantes.push(indiceParaMes(i))
  }
  return faltantes
}

function buildRow(group, missingRec, missingPag, missingAmbos, motivo) {
  const cli = group.cliente || {}
  const pagMeses = uniqueSorted([...group.pagMeses])
  const recMeses = uniqueSorted([...group.recMeses])
  const todosMeses = uniqueSorted([...pagMeses, ...recMeses])

  return {
    Cliente: display(cli.nomeRaw),
    'Codigo cliente': display(cli.codigoRaw || cli.codigo),
    'CPF/CNPJ': display(cli.cpfRaw || cli.cpf),
    Instalacao: display(cli.instRaw || cli.inst),
    'Numero cliente': display(cli.numeroRaw || cli.numero),
    'Nova instalacao': display(cli.novaRaw || cli.nova),
    Fornecedora: display(cli.fornecedora),
    'Falta nos Recebiveis': formatListaMeses(missingRec),
    'Falta na Pagadoria': formatListaMeses(missingPag),
    'Falta nos dois lados': formatListaMeses(missingAmbos),
    'Meses Pagadoria': formatListaMeses(pagMeses),
    'Meses Recebiveis': formatListaMeses(recMeses),
    'Qtd. Pagadoria': pagMeses.length,
    'Qtd. Recebiveis': recMeses.length,
    'Primeira competencia': todosMeses.length ? formatMes(todosMeses[0]) : DASH,
    'Ultima competencia': todosMeses.length ? formatMes(todosMeses[todosMeses.length - 1]) : DASH,
    'Origem do match': [...group.matchOrigens].join(', ') || group.origem,
    Motivo: motivo || DASH,
    _sortKey: `${cli.nomeRaw || ''}${cli.instRaw || ''}${cli.numeroRaw || ''}`,
  }
}

function calcularBoletos(rowsPag, rowsRec, rowsGv, onLog) {
  const log = (msg, tipo = 'info') => onLog && onLog(msg, tipo)
  const ctx = buildContext(rowsGv || [])
  let pagSemChave = 0
  let pagSemMes = 0
  let pagSemBaseGv = 0
  let pagValidas = 0
  let recSemChave = 0
  let recSemMes = 0
  let recSemBaseGv = 0
  let recValidas = 0

  ;(rowsPag || []).forEach(row => {
    const pag = extrairPagadoria(row)
    const tokens = tokensPag(pag)
    if (!tokens.length) pagSemChave += 1
    if (!pag.mes) pagSemMes += 1
    if (!tokens.length || !pag.mes) return
    const group = resolveGroup(ctx, tokens, pag)
    if (!group) {
      pagSemBaseGv += 1
      return
    }
    pagValidas += 1
    group.pag.push(pag)
    group.pagMeses.add(pag.mes)
  })

  ;(rowsRec || []).forEach(row => {
    const rec = extrairRecebivel(row)
    const tokens = tokensRec(rec)
    if (!tokens.length) recSemChave += 1
    if (!rec.mes) recSemMes += 1
    if (!tokens.length || !rec.mes) return
    const group = resolveGroup(ctx, tokens, rec)
    if (!group) {
      recSemBaseGv += 1
      return
    }
    recValidas += 1
    group.rec.push(rec)
    group.recMeses.add(rec.mes)
  })

  const todos = []
  const faltamRecebiveis = []
  const faltamPagadoria = []
  const faltamAmbos = []
  let mesesFaltamRecebiveis = 0
  let mesesFaltamPagadoria = 0
  let mesesFaltamAmbos = 0
  let clientesComparados = 0
  let clientesSoPagadoria = 0
  let clientesSoRecebiveis = 0

  for (const group of ctx.groups.values()) {
    const pagMeses = uniqueSorted([...group.pagMeses])
    const recMeses = uniqueSorted([...group.recMeses])
    if (!pagMeses.length && !recMeses.length) continue
    if (!pagMeses.length) {
      clientesSoRecebiveis += 1
      continue
    }
    if (!recMeses.length) {
      clientesSoPagadoria += 1
      continue
    }
    clientesComparados += 1

    const pagSet = new Set(pagMeses)
    const recSet = new Set(recMeses)
    const missingRec = pagMeses.filter(mes => !recSet.has(mes))
    const missingPag = recMeses.filter(mes => !pagSet.has(mes))
    const missingAmbos = gapsInternos([...pagMeses, ...recMeses])

    mesesFaltamRecebiveis += missingRec.length
    mesesFaltamPagadoria += missingPag.length
    mesesFaltamAmbos += missingAmbos.length

    if (!missingRec.length && !missingPag.length && !missingAmbos.length) continue

    const motivos = []
    if (missingRec.length) motivos.push('Existe na Pagadoria e nao existe nos Recebiveis')
    if (missingPag.length) motivos.push('Existe nos Recebiveis e nao existe na Pagadoria')
    if (missingAmbos.length) motivos.push('Lacuna na sequencia entre primeira e ultima competencia emitida')

    const row = buildRow(group, missingRec, missingPag, missingAmbos, motivos.join(' | '))
    todos.push(row)
    if (missingRec.length) faltamRecebiveis.push(buildRow(group, missingRec, [], [], motivos[0]))
    if (missingPag.length) faltamPagadoria.push(buildRow(group, [], missingPag, [], missingPag.length ? 'Existe nos Recebiveis e nao existe na Pagadoria' : ''))
    if (missingAmbos.length) faltamAmbos.push(buildRow(group, [], [], missingAmbos, 'Lacuna na sequencia entre primeira e ultima competencia emitida'))
  }

  const sortRows = rows => rows.sort((a, b) => String(a._sortKey).localeCompare(String(b._sortKey), 'pt-BR', { numeric: true }))
  sortRows(todos)
  sortRows(faltamRecebiveis)
  sortRows(faltamPagadoria)
  sortRows(faltamAmbos)

  log(`Base GV indexada: ${rowsGv.length.toLocaleString('pt-BR')} clientes`, 'ok')
  log(`Clientes comparados nos dois lados: ${clientesComparados.toLocaleString('pt-BR')}`, 'ok')
  log(`Pagadoria ligada a Base GV: ${pagValidas.toLocaleString('pt-BR')} linhas`, 'ok')
  log(`Recebiveis ligados a Base GV: ${recValidas.toLocaleString('pt-BR')} linhas`, 'ok')
  if (ctx.ambiguousKeys.size) log(`Chaves ambiguas na Base GV ignoradas: ${ctx.ambiguousKeys.size.toLocaleString('pt-BR')}`, 'warn')
  if (clientesSoPagadoria || clientesSoRecebiveis) log(`Ignorados na comparacao: ${clientesSoPagadoria.toLocaleString('pt-BR')} clientes so na Pagadoria | ${clientesSoRecebiveis.toLocaleString('pt-BR')} clientes so nos Recebiveis`, 'warn')
  if (pagSemBaseGv || recSemBaseGv) log(`Sem vinculo com Base GV: ${pagSemBaseGv.toLocaleString('pt-BR')} linhas Pagadoria | ${recSemBaseGv.toLocaleString('pt-BR')} linhas Recebiveis`, 'warn')
  if (pagSemChave || pagSemMes) log(`Pagadoria ignorada: ${pagSemChave} sem chave | ${pagSemMes} sem competencia`, 'warn')
  if (recSemChave || recSemMes) log(`Recebiveis ignorados: ${recSemChave} sem chave | ${recSemMes} sem competencia`, 'warn')

  return {
    todos,
    faltamRecebiveis,
    faltamPagadoria,
    faltamAmbos,
    counts: {
      clientesAnalisados: clientesComparados,
      clientesEmAmbos: clientesComparados,
      clientesComPendencia: todos.length,
      clientesSoPagadoria,
      clientesSoRecebiveis,
      mesesFaltamRecebiveis,
      mesesFaltamPagadoria,
      mesesFaltamAmbos,
      pagSemChave,
      pagSemMes,
      pagSemBaseGv,
      recSemChave,
      recSemMes,
      recSemBaseGv,
      chavesAmbiguasBaseGv: ctx.ambiguousKeys.size,
    },
  }
}

function exportarResultado(resultado) {
  if (!resultado) return
  const wb = XLSX.utils.book_new()
  const clean = row => {
    const out = {}
    Object.entries(row).forEach(([key, value]) => {
      if (!key.startsWith('_')) out[key] = value
    })
    return out
  }
  const resumo = [
    ['Boletos Faltantes', ''],
    ['Data', new Date().toLocaleString('pt-BR')],
    ['', ''],
    ['Indicador', 'Quantidade'],
    ['Clientes analisados nos dois lados', resultado.counts.clientesAnalisados],
    ['Clientes com pendencia', resultado.counts.clientesComPendencia],
    ['Clientes so na Pagadoria ignorados', resultado.counts.clientesSoPagadoria],
    ['Clientes so nos Recebiveis ignorados', resultado.counts.clientesSoRecebiveis],
    ['Chaves ambiguas da Base GV ignoradas', resultado.counts.chavesAmbiguasBaseGv],
    ['Meses faltando nos Recebiveis', resultado.counts.mesesFaltamRecebiveis],
    ['Meses faltando na Pagadoria', resultado.counts.mesesFaltamPagadoria],
    ['Meses faltando nos dois lados', resultado.counts.mesesFaltamAmbos],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), 'RESUMO')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resultado.todos.map(clean)), 'TODOS')
  if (resultado.faltamRecebiveis.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resultado.faltamRecebiveis.map(clean)), 'FALTA RECEBIVEIS')
  }
  if (resultado.faltamPagadoria.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resultado.faltamPagadoria.map(clean)), 'FALTA PAGADORIA')
  }
  if (resultado.faltamAmbos.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resultado.faltamAmbos.map(clean)), 'FALTA DOIS LADOS')
  }
  XLSX.writeFile(wb, `BoletosFaltantes_${new Date().getTime()}.xlsx`)
}

function ResultadoTable({ rows }) {
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
              {COLUNAS.map(col => (
                <th key={col} className="sticky top-0 bg-s2 border-b border-bd px-3 py-2.5 text-left text-[10px] font-semibold uppercase text-tx3 whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((row, index) => (
              <tr key={`${row._sortKey}-${index}`} className="border-b border-bd hover:bg-s2/50 transition-colors">
                {COLUNAS.map(col => {
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
  const [raw, setRaw] = useState({ pag: null, gv: null, rec: null })
  const [dados, setDados] = useState({ pag: null, gv: null, rec: null })
  const [nomes, setNomes] = useState({ pag: '', gv: '', rec: '' })
  const [mappings, setMappings] = useState({})
  const [mapper, setMapper] = useState({ open: false, key: '', raw: [], headers: [] })
  const [logs, setLogs] = useState([])
  const [resultado, setResultado] = useState(null)
  const [abaAtiva, setAbaAtiva] = useState('todos')
  const [processando, setProcessando] = useState(false)
  const [busca, setBusca] = useState('')

  const addLog = (msg, tipo = 'info') => {
    const hora = new Date().toLocaleTimeString('pt-BR')
    setLogs(prev => [...prev, { msg, tipo, hora }])
  }

  const handleFile = async (file, key) => {
    try {
      addLog(`Lendo ${file.name}...`)
      const rows = await lerPlanilha(file)
      if (!rows.length) {
        addLog(`Planilha vazia: ${file.name}`, 'err')
        return
      }
      setRaw(prev => ({ ...prev, [key]: rows }))
      setNomes(prev => ({ ...prev, [key]: file.name }))
      setMapper({ open: true, key, raw: rows, headers: Object.keys(rows[0] || {}) })
      addLog(`${rows.length.toLocaleString('pt-BR')} linhas detectadas em ${file.name}`, 'ok')
    } catch (err) {
      addLog(`Erro ao ler ${file.name}: ${err.message}`, 'err')
    }
  }

  const reabrirMapper = key => {
    const rows = raw[key]
    if (!rows?.length) return
    setMapper({ open: true, key, raw: rows, headers: Object.keys(rows[0] || {}) })
  }

  const handleMapperConfirm = (remapped, mapping) => {
    const key = mapper.key
    setDados(prev => ({ ...prev, [key]: remapped }))
    setMappings(prev => ({ ...prev, [key]: mapping }))
    setMapper(prev => ({ ...prev, open: false }))
    const label = key === 'pag' ? 'Pagadoria' : key === 'gv' ? 'Base GV' : 'Recebiveis'
    addLog(`${label}: mapeamento confirmado`, 'ok')
  }

  const processar = () => {
    if (!dados.pag || !dados.gv || !dados.rec) return
    setProcessando(true)
    setLogs([])
    try {
      const res = calcularBoletos(dados.pag, dados.rec, dados.gv, addLog)
      setResultado(res)
      const primeiraAba = ABAS.find(a => {
        if (a.key === 'todos') return res.todos.length > 0
        if (a.key === 'faltamRecebiveis') return res.faltamRecebiveis.length > 0
        if (a.key === 'faltamPagadoria') return res.faltamPagadoria.length > 0
        return res.faltamAmbos.length > 0
      })?.key || 'todos'
      setAbaAtiva(primeiraAba)
      addLog(`Analise concluida: ${res.todos.length.toLocaleString('pt-BR')} clientes com pendencia`, 'ok')
    } catch (err) {
      addLog(`Erro ao processar: ${err.message}`, 'err')
    } finally {
      setProcessando(false)
    }
  }

  const abasComCount = ABAS.map(aba => {
    if (!resultado) return { ...aba }
    const count = aba.key === 'todos'
      ? resultado.todos.length
      : aba.key === 'faltamRecebiveis'
        ? resultado.counts.mesesFaltamRecebiveis
        : aba.key === 'faltamPagadoria'
          ? resultado.counts.mesesFaltamPagadoria
          : resultado.counts.mesesFaltamAmbos
    return { ...aba, count }
  })

  const rowsAtivas = useMemo(() => {
    if (!resultado) return []
    const rows = resultado[abaAtiva] || []
    const q = normText(busca)
    if (!q) return rows
    return rows.filter(row => normText(Object.values(row).join(' ')).includes(q))
  }, [resultado, abaAtiva, busca])

  return (
    <div className="p-7 space-y-5">
      <ColumnMapper
        open={mapper.open}
        raw={mapper.raw}
        headers={mapper.headers}
        schemaKey={mapper.key === 'pag' ? 'boletos_pag' : mapper.key === 'gv' ? 'boletos_gv' : 'boletos_rec'}
        title={mapper.key === 'pag' ? 'Mapear colunas - Pagadoria' : mapper.key === 'gv' ? 'Mapear colunas - Base GV' : 'Mapear colunas - Recebiveis'}
        fileName={nomes[mapper.key]}
        savedMapping={mappings[mapper.key]}
        onConfirm={handleMapperConfirm}
        onCancel={() => setMapper(prev => ({ ...prev, open: false }))}
      />

      <div className="pb-5 border-b border-bd">
        <h1 className="text-xl font-bold text-tx mb-1">Boletos Faltantes</h1>
        <p className="text-sm text-tx3">Cruza Pagadoria, Recebiveis e Base GV por cliente e competencia para encontrar lacunas de boletos.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <UploadSlot
          label="Base Pagadoria"
          sublabel="Planilha de faturas da fornecedora"
          loaded={!!dados.pag}
          fileName={nomes.pag}
          onFile={file => handleFile(file, 'pag')}
          onReabrir={() => reabrirMapper('pag')}
        />
        <UploadSlot
          label="Base GV"
          sublabel="Clientes cadastrados no sistema"
          loaded={!!dados.gv}
          fileName={nomes.gv}
          onFile={file => handleFile(file, 'gv')}
          onReabrir={() => reabrirMapper('gv')}
        />
        <UploadSlot
          label="Base Recebiveis GV"
          sublabel="Boletos emitidos no sistema"
          loaded={!!dados.rec}
          fileName={nomes.rec}
          onFile={file => handleFile(file, 'rec')}
          onReabrir={() => reabrirMapper('rec')}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-tx3">
          <FileSearch size={14} className="text-acc" />
          <span>Obrigatorio carregar as 3 bases para manter a mesma ponte usada no cruzamento da Pagadoria.</span>
        </div>
        <Button variant="primary" onClick={processar} disabled={!dados.pag || !dados.gv || !dados.rec || processando}>
          <Play size={14} />
          {processando ? 'Processando...' : 'Processar boletos'}
        </Button>
      </div>

      <LogPanel logs={logs} />

      {resultado && (
        <div className="space-y-5">
          <div className="grid grid-cols-5 gap-3">
            <MetricCard label="Clientes analisados" value={resultado.counts.clientesAnalisados} sub="com boletos nos dois lados" color="#3b82f6" />
            <MetricCard label="Clientes com pendencia" value={resultado.counts.clientesComPendencia} sub="qualquer lacuna" color="#ef4444" onClick={() => setAbaAtiva('todos')} />
            <MetricCard label="Falta nos Recebiveis" value={resultado.counts.mesesFaltamRecebiveis} sub="meses da Pagadoria sem RCB" color="#f59e0b" onClick={() => setAbaAtiva('faltamRecebiveis')} />
            <MetricCard label="Falta na Pagadoria" value={resultado.counts.mesesFaltamPagadoria} sub="meses do RCB sem Pagadoria" color="#a855f7" onClick={() => setAbaAtiva('faltamPagadoria')} />
            <MetricCard label="Falta nos dois lados" value={resultado.counts.mesesFaltamAmbos} sub="lacunas internas" color="#ef4444" onClick={() => setAbaAtiva('faltamAmbos')} />
          </div>

          {(resultado.counts.clientesSoPagadoria > 0 || resultado.counts.clientesSoRecebiveis > 0) && (
            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="So na Pagadoria" value={resultado.counts.clientesSoPagadoria} sub="nao entra como boleto faltante" color="#64748b" />
              <MetricCard label="So nos Recebiveis" value={resultado.counts.clientesSoRecebiveis} sub="nao entra como boleto faltante" color="#64748b" />
            </div>
          )}

          <div className="rounded-xl border border-bd bg-s1 overflow-hidden">
            <div className="p-4 border-b border-bd flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tx3" />
                <input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar cliente, UC, CPF ou competencia"
                  className="w-full bg-bg border border-bd rounded-lg pl-9 pr-3 py-2 text-sm text-tx outline-none focus:border-acc"
                />
              </div>
              <div className="ml-auto text-xs text-tx3">
                {rowsAtivas.length.toLocaleString('pt-BR')} registros exibidos
              </div>
              <Button variant="default" onClick={() => exportarResultado(resultado)}>
                <Download size={14} />
                Exportar
              </Button>
            </div>
            <div className="px-4 pt-4">
              <TabBar abas={abasComCount} abaAtiva={abaAtiva} onTab={setAbaAtiva} />
            </div>
            <ResultadoTable rows={rowsAtivas} />
          </div>

          <div className="flex gap-3 rounded-xl border border-warn/30 bg-warn/10 p-4 text-sm text-tx2">
            <AlertTriangle size={18} className="text-warn flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-tx mb-1">Observacao sobre a leitura</div>
              <div>
                A aba compara somente clientes que possuem boletos nos dois lados, usando a Base GV como ponte por codigo, instalacao, nova instalacao ou numero cliente. Identificadores marcados como cancelados ou repetidos para mais de um cliente na Base GV sao ignorados para evitar falso positivo. Clientes encontrados em apenas uma planilha ficam fora da lista de faltantes.
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
