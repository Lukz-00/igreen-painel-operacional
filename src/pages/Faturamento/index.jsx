import { useState, useMemo } from 'react'
import { Download, Play, Pencil, BarChart2, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { UploadBox } from '../../components/ui/UploadBox'
import { MetricCard } from '../../components/ui/MetricCard'
import { DataTable } from '../../components/ui/DataTable'
import { DivergentesTable } from '../../components/ui/DivergentesTable'
import { LogPanel } from '../../components/ui/LogPanel'
import { TabBar } from '../../components/ui/TabBar'
import { Button } from '../../components/ui/Button'
import { ColumnMapper } from '../../components/ui/ColumnMapper'
import { normalizarRows } from '../../utils/normalizadores'
import { addDebugLog, addErrorLog, downloadLogs } from '../../utils/logErros'
import { saveHistoryLog } from '../../utils/history'
import { categoryUrl, downloadUrl, processFaturamento, uploadSpreadsheet, workbookUrl } from '../../utils/pythonApi'

// ── Apara o !ref de sheets com formatação em colunas fantasma ─────────────
// Algumas planilhas (ex: BC Memória de Cálculo) registram formatação vazia
// em milhares de colunas (até XEY+). Isso faz o sheet_to_json criar objetos
// gigantescos e causar OOM. Esta função relimita o !ref ao máximo real.
function colLetterToNum(col) {
  let n = 0
  for (let i = 0; i < col.length; i++) {
    n = n * 26 + (col.charCodeAt(i) - 64)
  }
  return n
}
function colNumToLetter(n) {
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}
function trimSheetRef(ws) {
  if (!ws || !ws['!ref']) return ws
  try {
    const range = XLSX.utils.decode_range(ws['!ref'])
    let maxCol = 0
    let maxRow = range.e.r

    // Varre as chaves da sheet para achar o maior col com conteúdo real
    for (const key of Object.keys(ws)) {
      if (key.startsWith('!')) continue
      const match = key.match(/^([A-Z]+)(\d+)$/)
      if (!match) continue
      const cellVal = ws[key]
      // Só conta como "real" se tiver valor não-vazio
      if (cellVal && cellVal.v !== undefined && cellVal.v !== null && cellVal.v !== '') {
        const colNum = colLetterToNum(match[1])
        if (colNum > maxCol) maxCol = colNum
        const rowNum = parseInt(match[2], 10) - 1
        if (rowNum > maxRow) maxRow = rowNum
      }
    }

    if (maxCol === 0) return ws

    // Adiciona uma margem de segurança de 5 colunas além da última com conteúdo
    const safeMax = maxCol + 5
    const newEnd = colNumToLetter(safeMax)
    const startRef = XLSX.utils.encode_cell({ r: range.s.r, c: range.s.c })
    const endRef   = newEnd + (maxRow + 1)
    ws['!ref'] = `${startRef}:${endRef}`
  } catch (_) {
    // Se falhar, retorna ws original sem alterar
  }
  return ws
}

function lerXlsx(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    const isCSV = file.name.toLowerCase().endsWith('.csv')

    reader.onload = e => {
      try {
        addDebugLog('Iniciando leitura de arquivo', { nome: file.name, tamanho: file.size, tipo: isCSV ? 'CSV' : 'XLSX' })

        let raw = []

        if (isCSV) {
          // ── Caminho CSV: sem ArrayBuffer, sem OOM ──────────────────
          // readAsText lê o arquivo como string UTF-8, muito mais eficiente
          // para arquivos grandes (445k linhas, 161MB XLSX → ~30MB CSV).
          const originalWarn = console.warn
          console.warn = () => {}
          const wb = XLSX.read(e.target.result, { type: 'string', cellDates: true })
          console.warn = originalWarn
          const ws = wb.Sheets[wb.SheetNames[0]]
          raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
          addDebugLog('CSV lido com sucesso', { linhas: raw.length })
        } else {
          // ── Caminho XLSX: ArrayBuffer ──────────────────────────────
          // Suprime warnings do XLSX durante a leitura
          const originalWarn = console.warn
          console.warn = () => {}

          const wb = XLSX.read(e.target.result, {
            type: 'array',
            cellDates: true
          })

          console.warn = originalWarn

          addDebugLog('Workbook lido com sucesso', {
            sheets: wb.SheetNames,
            sheetAtiva: wb.SheetNames[0]
          })

          let ws = wb.Sheets[wb.SheetNames[0]]

          // ── Proteção contra planilhas com formatação em milhares de colunas ──
          // (ex: BC Memória de Cálculo registra células vazias até col XEY)
          // Aparar o !ref para as colunas que realmente têm conteúdo evita OOM.
          ws = trimSheetRef(ws)

          raw = XLSX.utils.sheet_to_json(ws, { defval: '' })

          addDebugLog('sheet_to_json executado', {
            linhasRetornadas: raw.length,
            ehArray: Array.isArray(raw),
            primeiroElementoTipo: raw.length > 0 ? typeof raw[0] : 'vazio'
          })

          // Se vazio, tenta releitura em modo dense (resolve !ref ausente em arquivos grandes ou gerados por sistemas externos)
          if (raw.length === 0) {
            addDebugLog('sheet_to_json retornou vazio, tentando leitura em modo dense')
            const originalWarn2 = console.warn
            console.warn = () => {}
            const wbDense = XLSX.read(e.target.result, { type: 'array', cellDates: true, dense: true })
            console.warn = originalWarn2
            const wsDense = wbDense.Sheets[wbDense.SheetNames[0]]
            raw = XLSX.utils.sheet_to_json(wsDense, { defval: '', raw: false })
            ws = wsDense
            addDebugLog('Leitura dense concluída', {
              linhasRetornadas: raw.length,
              temRef: !!wsDense['!ref']
            })
          }

          if (raw.length === 0) {
            addDebugLog('Leitura dense também retornou vazio, tentando leitura manual por !ref')
            const range = ws['!ref']
            if (!range) {
              addErrorLog('AVISO_SEM_RANGE', 'Worksheet sem range mesmo após dense mode, retornando vazio', {})
              resolve([])
              return
            }

            const decoded = XLSX.utils.decode_range(range)
            const headers = []
            const rows = []

            for (let C = decoded.s.c; C <= decoded.e.c; ++C) {
              const cell = ws[XLSX.utils.encode_cell({ r: decoded.s.r, c: C })]
              headers.push((cell && cell.v) ? String(cell.v).trim() : '')
            }

            addDebugLog('Headers lidos manualmente', {
              quantidade: headers.length,
              primeirosHeaders: headers.slice(0, 5)
            })

            for (let R = decoded.s.r + 1; R <= decoded.e.r; ++R) {
              const row = {}
              let hasData = false
              for (let C = decoded.s.c; C <= decoded.e.c; ++C) {
                const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })]
                const value = (cell && cell.v) !== undefined ? cell.v : ''
                row[headers[C - decoded.s.c]] = value instanceof Date ? value : (value || '')
                if (value && String(value).trim()) hasData = true
              }
              if (hasData) rows.push(row)
            }

            addDebugLog('Leitura manual completada', { linhas: rows.length })
            resolve(normalizarRows(rows))
            return
          }
        }

        if (raw.length > 0) {
          addDebugLog('Leitura bem-sucedida', { linhas: raw.length })
          let normalized
          try {
            normalized = normalizarRows(raw)
            addDebugLog('Normalização concluída', {
              linhasAntes: raw.length,
              linhasDepois: normalized.length,
              primeiraLinhaChaves: Object.keys(normalized[0] || {}).length
            })
          } catch (normErr) {
            addErrorLog('ERRO_NORMALIZACAO', 'Falha ao normalizar linhas', {
              erro: normErr.message,
              stack: normErr.stack
            })
            reject(normErr)
            return
          }

          if (!normalized || !Array.isArray(normalized)) {
            addErrorLog('ERRO_TIPO_NORMALIZACAO', 'normalizarRows não retornou array', {
              tipo: typeof normalized,
              valor: String(normalized).substring(0, 100)
            })
            resolve([])
            return
          }

          addDebugLog('Resolução com dados normalizados', { linhas: normalized.length })
          resolve(normalized)
          return
        }

        resolve([])

      } catch(err) {
        addErrorLog('ERRO_LEITURA_ARQUIVO', err.message, {
          stack: err.stack,
          nome: err.name
        })
        reject(err)
      }
    }
    reader.onerror = e => {
      addErrorLog('ERRO_FILEREADER', 'Erro ao ler arquivo do disco', {
        erro: reader.error
      })
      reject(e)
    }

    // CSV → texto puro (sem ArrayBuffer = sem OOM para arquivos grandes)
    // XLSX → ArrayBuffer (necessário para o parser binário do SheetJS)
    if (isCSV) {
      reader.readAsText(file, 'UTF-8')
    } else {
      reader.readAsArrayBuffer(file)
    }
  })
}

// ── Modal de Relatório: Falta na Pagadoria ──────────────────────
function FaltaPagModal({ rows, onClose }) {
  const totalValor = rows.reduce((s, r) => {
    const v = parseFloat(String(r.Valor || '0').replace(/[^0-9.,]/g, '').replace(',', '.'))
    return s + (isNaN(v) ? 0 : v)
  }, 0)

  // Agrupar por fornecedora
  const porFornecedora = useMemo(() => {
    const m = {}
    rows.forEach(r => {
      const k = r.Fornecedora || 'N/A'
      if (!m[k]) m[k] = 0
      m[k]++
    })
    return Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }))
  }, [rows])

  // Agrupar por status
  const porStatus = useMemo(() => {
    const m = {}
    rows.forEach(r => {
      const k = r['Status Recebíveis'] || 'N/A'
      if (!m[k]) m[k] = 0
      m[k]++
    })
    return Object.entries(m).map(([name, value]) => ({ name, value }))
  }, [rows])

  const CORES = ['#a855f7', '#3b82f6', '#ef4444', '#f59e0b', '#22c55e', '#fb923c']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-s1 rounded-2xl border border-bd shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-bd">
          <div>
            <h2 className="text-lg font-bold text-tx">Relatório — Falta na Pagadoria</h2>
            <p className="text-xs text-tx3 mt-1">{rows.length} boletos dos Recebíveis sem correspondência na Pagadoria</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-tx3 hover:text-tx transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Cards de resumo */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-bg2 border border-bd text-center">
              <div className="text-xs text-tx3 uppercase tracking-wider mb-1">Total de Boletos</div>
              <div className="text-2xl font-bold text-purple-400">{rows.length}</div>
            </div>
            <div className="p-4 rounded-xl bg-bg2 border border-bd text-center">
              <div className="text-xs text-tx3 uppercase tracking-wider mb-1">Valor Total</div>
              <div className="text-2xl font-bold text-tx">{totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
            </div>
            <div className="p-4 rounded-xl bg-bg2 border border-bd text-center">
              <div className="text-xs text-tx3 uppercase tracking-wider mb-1">Fornecedoras</div>
              <div className="text-2xl font-bold text-tx">{porFornecedora.length}</div>
            </div>
          </div>

          {/* Gráfico por fornecedora */}
          {porFornecedora.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-tx mb-3">Boletos por Fornecedora</h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={porFornecedora} layout="vertical" margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis type="number" stroke="#64748b" fontSize={11} />
                    <YAxis dataKey="name" type="category" width={110} stroke="#64748b" fontSize={11} />
                    <Tooltip
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                      contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {porFornecedora.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Breakdown por status */}
          <div>
            <h3 className="text-sm font-semibold text-tx mb-3">Por Status dos Recebíveis</h3>
            <div className="flex flex-wrap gap-3">
              {porStatus.map((s, i) => (
                <div key={s.name} className="px-3 py-2 rounded-lg border border-bd bg-bg2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: CORES[i % CORES.length] }} />
                  <span className="text-xs text-tx">{s.name}</span>
                  <span className="text-xs font-bold text-tx3">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const ABAS = [
  { key:'divergenciasCod',       label:'Divergência Cód.',          cor:'#f97316' },
  { key:'semPagtoValor',         label:'Sem Pagto / Valor',         cor:'#dc2626' },
  { key:'divergentes',           label:'Status Divergentes',        cor:'#ef4444' },
  { key:'faltaRec',              label:'Falta nos Recebíveis',      cor:'#f59e0b' },
  { key:'faltaRecSoBKO',         label:'Só no BKO (sem boleto)',    cor:'#fb923c' },
  { key:'faltaRecUCDiv',         label:'UC Divergente (outros)',    cor:'#a78bfa' },
  { key:'faltaPag',              label:'Falta na Pagadoria',        cor:'#a855f7' },
  { key:'clientesSoNaPag',       label:'Clientes só na PAG',        cor:'#64748b' },
  { key:'clientesSoNoRec',       label:'Clientes só no REC',        cor:'#475569' },
  { key:'coincidentes',          label:'Coincidentes',              cor:'#22c55e' },
  { key:'duplicidadesPag',       label:'Duplicidades',              cor:'#94a3b8' },
  { key:'northenNaoExiste',      label:'Northen — Não em Rec.',     cor:'#ef4444' },
  { key:'northenExisteNoBKO',    label:'Northen — Só no BKO',       cor:'#f59e0b' },
  { key:'northenUCDivergente',   label:'Northen — UC Divergente',   cor:'#a78bfa' },
  { key:'northenExisteEmAmbas',  label:'Northen — Existe em Ambas', cor:'#22c55e' },
  { key:'northenIncluirBaixa',   label:'Northen — Incluir/Baixa',   cor:'#f97316' },
]

// ── Helper: extrai o ano de uma string de mês/data ─────────────────────────
function extrairAnoDoRow(row) {
  // Lê o valor do primeiro campo com conteúdo útil
  const valor =
    row['Mês Referência (Rec.)'] ||
    row['Mês Normalizado']       ||
    row['Mês Referência']        ||
    row['Mês Ref.']              ||
    row['Data Referência']       ||
    row['Data Referencia']       ||
    row['Mês referência']        ||
    row['Mes Referencia']        ||
    row['mesRef']                ||
    ''
  if (!valor || valor === '—') return null
  const s = String(valor)
  // Formatos: "2025-03", "MAI/2025", "2025-05-01", "01/05/2025"
  const m =
    s.match(/^(\d{4})-/)              ||  // 2025-03  ou  2025-05-01
    s.match(/\/(\d{4})/)              ||  // MAI/2025
    s.match(/^\d{2}\/\d{2}\/(\d{4})/) ||  // 01/05/2025
    s.match(/^(\d{4})$/)                   // 2025
  return m ? m[1] : null
}

// ── Chip de Ano ─────────────────────────────────────────────────────────────
function AnoChip({ ano, ativo, onToggle }) {
  return (
    <button
      onClick={() => onToggle(ano)}
      style={{
        padding: '2px 10px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.15s',
        border: ativo ? '1.5px solid #a855f7' : '1.5px solid rgba(255,255,255,0.12)',
        background: ativo ? 'rgba(168,85,247,0.18)' : 'rgba(255,255,255,0.04)',
        color: ativo ? '#c084fc' : 'rgba(255,255,255,0.45)',
      }}
    >
      {ano}
    </button>
  )
}

// ── Área de Tabs + Filtro de Ano + Tabela ───────────────────────────────────
function YearFilteredTabArea({
  resultado, abaAtiva, setAbaAtiva, abasComCount,
  jobId, contagens,
  anosSelPag, setAnosSelPag,
  anosSelRec, setAnosSelRec,
  modalFaltaPag, setModalFaltaPag,
}) {
  // Determina se a aba atual usa os filtros de PAG ou REC
  const isPagTab = ['faltaPag', 'clientesSoNaPag', 'northenNaoExiste', 'northenExisteNoBKO', 'northenUCDivergente', 'northenExisteEmAmbas', 'northenIncluirBaixa'].includes(abaAtiva)
  const abaComFiltro = true // Habilita filtro de ano em todas as abas
  const anosAtivos   = isPagTab ? anosSelPag : anosSelRec
  const setAnosAtivos = isPagTab ? setAnosSelPag : setAnosSelRec

  // Extrai anos disponíveis nas rows da aba atual
  const anosDisponiveis = useMemo(() => {
    if (!abaComFiltro || !resultado) return []
    const rows = Array.isArray(resultado[abaAtiva]) ? resultado[abaAtiva] : []
    const anos = new Set()
    rows.forEach(r => {
      const ano = extrairAnoDoRow(r)
      if (ano) anos.add(ano)
    })
    return [...anos].sort()
  }, [resultado, abaAtiva, abaComFiltro])

  // Alterna seleção de um ano
  const toggleAno = (ano) => {
    setAnosAtivos(prev => {
      const next = new Set(prev)
      if (next.has(ano)) next.delete(ano)
      else next.add(ano)
      return next
    })
  }

  // Rows filtradas por ano (se nenhum selecionado → mostra todos)
  const rowsFiltradas = useMemo(() => {
    if (!resultado) return []
    const rows = Array.isArray(resultado[abaAtiva]) ? resultado[abaAtiva] : []
    if (!abaComFiltro || anosAtivos.size === 0) return rows
    return rows.filter(r => {
      const ano = extrairAnoDoRow(r)
      return ano && anosAtivos.has(ano)
    })
  }, [resultado, abaAtiva, abaComFiltro, anosAtivos])

  const label = ABAS.find(a => a.key === abaAtiva)?.label
    ?.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || abaAtiva

  return (
    <div className="bg-s1 border border-bd rounded-xl overflow-hidden">
      {/* Linha do TabBar */}
      <div className="px-5 pt-5 flex items-center justify-between">
        <TabBar abas={abasComCount} abaAtiva={abaAtiva} onTab={(k) => {
          setAbaAtiva(k)
        }} />
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          {abaAtiva === 'faltaPag' && resultado?.faltaPag?.length > 0 && (
            <button
              onClick={() => setModalFaltaPag(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors text-xs font-medium"
            >
              <BarChart2 size={13} />
              Ver Relatório
            </button>
          )}
          {(contagens?.[abaAtiva] || 0) > 0 && (
            <>
              {anosDisponiveis.length >= 1 && (
                <button
                  onClick={() => downloadUrl(categoryUrl(jobId, abaAtiva, [...anosAtivos]))}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors text-xs font-medium"
                >
                  <Download size={13} />
                  Exportar Filtrado
                </button>
              )}
              <button
                onClick={() => downloadUrl(categoryUrl(jobId, abaAtiva))}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors text-xs font-medium"
              >
                <Download size={13} />
                Exportar Toda a Aba
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filtro de Ano */}
      {abaComFiltro && anosDisponiveis.length >= 1 && (
        <div className="px-5 pt-3 pb-1 flex items-center gap-2 flex-wrap">
          <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Filtrar por ano:
          </span>
          {anosDisponiveis.map(ano => (
            <AnoChip
              key={ano}
              ano={ano}
              ativo={anosAtivos.has(ano)}
              onToggle={toggleAno}
            />
          ))}
          {anosAtivos.size > 0 && (
            <button
              onClick={() => setAnosAtivos(new Set())}
              style={{
                fontSize: 10, color: 'rgba(255,255,255,0.3)', background: 'none',
                border: 'none', cursor: 'pointer', marginLeft: 4,
                textDecoration: 'underline',
              }}
            >
              Limpar filtro
            </button>
          )}
          {anosAtivos.size > 0 && (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginLeft: 'auto' }}>
              {rowsFiltradas.length} exibidos de {contagens?.[abaAtiva] || 0} registros
            </span>
          )}
        </div>
      )}

      {/* Tabela */}
      <div className="px-5 pb-5">
        {(contagens?.[abaAtiva] || 0) > (Array.isArray(resultado?.[abaAtiva]) ? resultado[abaAtiva].length : 0) && (
          <p className="text-xs text-tx3 py-2">
            Prévia das primeiras {(Array.isArray(resultado?.[abaAtiva]) ? resultado[abaAtiva].length : 0).toLocaleString('pt-BR')} linhas; a exportação contém todos os registros.
          </p>
        )}
        {abaAtiva === 'divergentes'
          ? <DivergentesTable rows={resultado.divergentes || []} />
          : <DataTable
              rows={abaComFiltro ? rowsFiltradas : (Array.isArray(resultado?.[abaAtiva]) ? resultado[abaAtiva] : [])}
              label={label}
            />
        }
      </div>
    </div>
  )
}

export function Faturamento() {
  // Dados carregados
  const [rawPag, setRawPag] = useState(null)
  const [rawRec, setRawRec] = useState(null)
  const [rawCli, setRawCli] = useState(null)
  const [dfPag, setDfPag]   = useState(null)
  const [dfRec, setDfRec]   = useState(null)
  const [dfCli, setDfCli]   = useState(null)
  const [nomePag, setNomePag] = useState('')
  const [nomeRec, setNomeRec] = useState('')
  const [nomeCli, setNomeCli] = useState('')
  const [uploads, setUploads] = useState({ pag: null, rec: null, cli: null })
  const [mappings, setMappings] = useState({ pag: null, rec: null, cli: null })
  const [ucModes, setUcModes] = useState({ pag: 'uc' })
  const [jobId, setJobId] = useState(null)
  const [contagens, setContagens] = useState({})

  // Mapper
  const [mapperOpen, setMapperOpen]       = useState(false)
  const [mapperKey, setMapperKey]         = useState('pag')   // 'pag' ou 'rec'
  const [mapperRaw, setMapperRaw]         = useState([])
  const [mapperHeaders, setMapperHeaders] = useState([])

  // Resultado
  const [resultado, setResultado] = useState(null)
  const [abaAtiva, setAbaAtiva]   = useState('divergentes')
  const [logs, setLogs]           = useState([])
  const [processando, setProcessando] = useState(false)
  const [modalFaltaPag, setModalFaltaPag] = useState(false)
  // Filtro de ano: set de anos selecionados por aba, independentes
  const [anosSelPag, setAnosSelPag] = useState(new Set())
  const [anosSelRec, setAnosSelRec] = useState(new Set())

  const addLog = (msg, tipo = 'info') => {
    const hora = new Date().toLocaleTimeString('pt-BR')
    setLogs(prev => [...prev, { msg, tipo, hora }])
  }

  // Ao soltar arquivo na caixa → lé e abre o mapper
  const handleFile = async (file, key) => {
    try {
      addLog(`Enviando ${file.name} para o motor Polars…`)
      const uploaded = await uploadSpreadsheet(file)
      const rows = uploaded.rows || []
      if (!rows || !rows.length) {
        console.log('[DEBUG] Rows vazio ou nulo, abortando')
        addLog(`Planilha vazia: ${file.name}`, 'err')
        return
      }
      setUploads(prev => ({ ...prev, [key]: uploaded }))
      if (key === 'pag')      { setRawPag(rows); setNomePag(file.name) }
      else if (key === 'rec') { setRawRec(rows); setNomeRec(file.name) }
      else                   { setRawCli(rows); setNomeCli(file.name) }
      setMapperKey(key)
      setMapperRaw(rows)
      setMapperHeaders(uploaded.headers || Object.keys(rows[0]))
      setMapperOpen(true)
      addLog(`${uploaded.row_count.toLocaleString('pt-BR')} linhas detectadas sem carregá-las no navegador`, 'ok')
    } catch(e) {
      console.error('[DEBUG] Exceção em handleFile:', e)
      addLog(`Erro ao ler ${file.name}: ${e.message}`, 'err')
    }
  }

  // Reabrir mapper sem resubir arquivo
  const reabrirMapper = (key) => {
    const rows = key === 'pag' ? rawPag : key === 'rec' ? rawRec : rawCli
    if (!rows) return
    setMapperKey(key)
    setMapperRaw(rows)
    setMapperHeaders(Object.keys(rows[0]))
    setMapperOpen(true)
  }

  // Ao confirmar o mapper
  const handleMapperConfirm = (remapped, mapping, options = {}) => {
    setMapperOpen(false)
    const total = uploads[mapperKey]?.row_count ?? remapped.length
    const source = { uploadId: uploads[mapperKey]?.upload_id, count: total }
    setMappings(prev => ({ ...prev, [mapperKey]: mapping }))
    setUcModes(prev => ({ ...prev, [mapperKey]: options.ucMode || 'uc' }))
    if (mapperKey === 'pag') {
      setDfPag(source)
      addLog(`Pagadoria: ${total.toLocaleString('pt-BR')} linhas`, 'ok')
      addLog(`  UC → ${mapping.instalacao || '—'} | Status → ${mapping.status || '—'} | Mês → ${mapping.mes || '—'}`)
    } else if (mapperKey === 'rec') {
      setDfRec(source)
      addLog(`Recebíveis: ${total.toLocaleString('pt-BR')} linhas`, 'ok')
      addLog(`  UC → ${mapping.instalacao || '—'} | Status → ${mapping.status || '—'} | Mês → ${mapping.mes || '—'}`)
    } else {
      setDfCli(source)
      addLog(`Clientes GV: ${total.toLocaleString('pt-BR')} clientes carregados`, 'ok')
    }
  }

  const processar = async () => {
    if (!dfPag || !dfRec) return
    setProcessando(true)
    setLogs([])
    setResultado(null)
    try {
      const response = await processFaturamento({
        pag: { upload_id: uploads.pag.upload_id, mapping: mappings.pag || {}, uc_mode: ucModes.pag || 'uc' },
        rec: { upload_id: uploads.rec.upload_id, mapping: mappings.rec || {}, uc_mode: 'uc' },
        cli: dfCli ? { upload_id: uploads.cli.upload_id, mapping: mappings.cli || {}, uc_mode: 'uc' } : null,
      })
      const res = {
        ...response.rows,
        emAmbos: response.counts?.emAmbos || 0,
        totalPag: response.counts?.totalPag || 0,
        totalRec: response.counts?.totalRec || 0,
        counts: response.counts || {},
      }
      response.logs.forEach(item => addLog(item.msg, item.tipo))
      setResultado(res)
      setContagens(response.counts || {})
      setJobId(response.job_id)
      // Salvar histórico
      const summary = {}
      ABAS.forEach(a => { summary[a.key] = response.counts?.[a.key] || 0 })
      summary.emAmbos = res.emAmbos || 0
      
      saveHistoryLog('Faturamento', {
        pag: nomePag || 'N/A',
        rec: nomeRec || 'N/A',
        cli: nomeCli || 'N/A'
      }, summary)

      setAbaAtiva(ABAS.find(a => (response.counts?.[a.key] || 0) > 0)?.key || 'divergentes')
    } catch(e) {
      addLog(`Erro: ${e.message}`, 'err')
    } finally {
      setProcessando(false)
    }
  }

  const abasComCount = ABAS.map(a => ({
    ...a, count: resultado ? (contagens[a.key] || 0) : undefined
  }))

  return (
    <div className="p-7 space-y-5">

      {/* Mapper de colunas */}
      <ColumnMapper
        open={mapperOpen}
        raw={mapperRaw}
        headers={mapperHeaders}
        schemaKey={
          mapperKey === 'pag' ? 'fat_pag' :
          mapperKey === 'cli' ? 'fat_cli' :
          'fat_rec'
        }
        title={
          mapperKey === 'pag' ? 'Análise de colunas — Base Pagadoria' :
          mapperKey === 'cli' ? 'Análise de colunas — Clientes GV BackOffice' :
          'Análise de colunas — Recebíveis Clientes'
        }
        fileName={
          mapperKey === 'pag' ? nomePag :
          mapperKey === 'cli' ? nomeCli :
          nomeRec
        }
        onConfirm={handleMapperConfirm}
        onCancel={() => setMapperOpen(false)}
      />

      {/* Modal Falta na Pagadoria */}
      {modalFaltaPag && resultado?.faltaPag?.length > 0 && (
        <FaltaPagModal rows={resultado.faltaPag} onClose={() => setModalFaltaPag(false)} />
      )}

      {/* Header */}
      <div className="pb-5 border-b border-bd">
        <h1 className="text-xl font-bold text-tx mb-1">Cruzamento Pagadoria × Recebíveis</h1>
        <p className="text-sm text-tx3">Cascading join por UC + Mês de Referência. 3 etapas de fallback.</p>
      </div>

      {/* Uploads — 3 colunas quando CLI presente */}
      <div className={`grid gap-4 ${dfCli !== null || rawCli ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {/* Pagadoria */}
        <div className="relative">
          <UploadBox
            label="Base Pagadoria iGreen"
            sublabel="Solatio · Northen · Comerc · Bom Futuro · Sunclick · EDP"
            onFile={f => handleFile(f, 'pag')}
            loaded={!!dfPag}
            fileName={nomePag}
          />
          {dfPag && (
            <button
              onClick={() => reabrirMapper('pag')}
              title="Editar mapeamento de colunas"
              className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg border border-acc/30 bg-acc/10 text-acc hover:bg-acc/20 transition-colors z-10"
            >
              <Pencil size={13} />
            </button>
          )}
        </div>

        {/* Recebíveis */}
        <div className="relative">
          <UploadBox
            label="Recebíveis Clientes"
            sublabel="CMU BackOffice iGreen"
            onFile={f => handleFile(f, 'rec')}
            loaded={!!dfRec}
            fileName={nomeRec}
          />
          {dfRec && (
            <button
              onClick={() => reabrirMapper('rec')}
              title="Editar mapeamento de colunas"
              className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg border border-acc/30 bg-acc/10 text-acc hover:bg-acc/20 transition-colors z-10"
            >
              <Pencil size={13} />
            </button>
          )}
        </div>

        {/* Clientes GV — opcional, enriquece join */}
        <div className="relative">
          <UploadBox
            label="Clientes BackOffice (opcional)"
            sublabel="Ponte para instalação atualizada"
            onFile={f => handleFile(f, 'cli')}
            loaded={!!dfCli}
            fileName={nomeCli}
          />
          {dfCli && (
            <button
              onClick={() => reabrirMapper('cli')}
              title="Editar mapeamento de colunas"
              className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg border border-acc/30 bg-acc/10 text-acc hover:bg-acc/20 transition-colors z-10"
            >
              <Pencil size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Botões */}
      <div className="flex justify-between gap-3">
        <Button variant="default" onClick={downloadLogs}>
          <Download size={14} />
          Baixar Logs de Erros
        </Button>
        <Button variant="primary" onClick={processar} disabled={!dfPag || !dfRec || processando}>
          <Play size={14} />
          {processando ? 'Processando…' : 'Processar Cruzamento'}
        </Button>
      </div>

      {/* Log */}
      <LogPanel logs={logs} />

      {/* Resultado */}
      {resultado && (
        <div className="space-y-5">
          <div className="grid grid-cols-4 gap-3">
            <MetricCard label="UCs em Ambas"          value={resultado.emAmbos}                                    sub="matches"                color="#22c55e" />
            <MetricCard label="Taxa Divergência"      value={resultado.emAmbos > 0 ? (((contagens.divergentes || 0) / resultado.emAmbos) * 100).toFixed(1) + '%' : '0%'} sub="em relação aos matches" color="#f59e0b" />
            <MetricCard label="Divergência Cód."      value={contagens.divergenciasCod || 0}                       sub="cód. barras"             color="#f97316" onClick={() => setAbaAtiva('divergenciasCod')} />
            <MetricCard label="Sem Pagto/Valor"       value={contagens.semPagtoValor || 0}                         sub="pendências"              color="#dc2626" onClick={() => setAbaAtiva('semPagtoValor')} />
            <MetricCard label="Status Divergentes"    value={contagens.divergentes || 0}                           sub="conflito"                color="#ef4444" onClick={() => setAbaAtiva('divergentes')} />
            <MetricCard label="Falta nos Recebíveis"  value={contagens.faltaRec || 0}                              sub="cliente em ambos, mês faltando" color="#f59e0b" onClick={() => setAbaAtiva('faltaRec')} />
            <MetricCard label="Só no BKO (sem boleto)" value={contagens.faltaRecSoBKO || 0}                       sub="cliente em ambos, BKO cadastrado" color="#fb923c" onClick={() => setAbaAtiva('faltaRecSoBKO')} />
            <MetricCard label="UC Divergente"         value={contagens.faltaRecUCDiv || 0}                         sub="cliente em ambos, UC errada" color="#a78bfa" onClick={() => setAbaAtiva('faltaRecUCDiv')} />
            <MetricCard label="Falta na Pagadoria"    value={contagens.faltaPag || 0}                              sub="cliente em ambos, mês faltando" color="#a855f7" onClick={() => setAbaAtiva('faltaPag')} />
            <MetricCard label="Coincidentes"          value={contagens.coincidentes || 0}                          sub="status ok"               color="#22c55e" onClick={() => setAbaAtiva('coincidentes')} />
            <MetricCard label="Duplicidades"          value={contagens.duplicidadesPag || 0}                       sub="linhas idênticas"        color="#94a3b8" onClick={() => setAbaAtiva('duplicidadesPag')} />
          </div>

          {/* Fase 1 — Clientes sem correspondência no lado oposto */}
          {((contagens.clientesSoNaPag || 0) > 0 || (contagens.clientesSoNoRec || 0) > 0) && (
            <div className="p-4 rounded-xl border border-bd bg-bg2">
              <p className="text-xs font-semibold text-tx3 uppercase tracking-widest mb-3">Fase 1 — Clientes sem correspondência no lado oposto</p>
              <p className="text-xs text-tx3 mb-3">Estes clientes <strong className="text-tx">não foram considerados</strong> na análise de boletos faltantes pois não existem em ambos os lados.</p>
              <div className="grid grid-cols-2 gap-3">
                <MetricCard label="Clientes só na PAG" value={contagens.clientesSoNaPag || 0} sub="sem nenhuma UC/NC/CPF no REC" color="#64748b" onClick={() => setAbaAtiva('clientesSoNaPag')} />
                <MetricCard label="Clientes só no REC" value={contagens.clientesSoNoRec || 0} sub="sem nenhuma UC/NC/CPF na PAG" color="#475569" onClick={() => setAbaAtiva('clientesSoNoRec')} />
              </div>
            </div>
          )}

          {['northenNaoExiste','northenExisteNoBKO','northenUCDivergente','northenExisteEmAmbas','northenIncluirBaixa'].some(k => (contagens[k] || 0) > 0) && (
            <div>
              <p className="text-xs font-semibold text-tx3 uppercase tracking-widest mb-2">Northen</p>
              <div className="grid grid-cols-5 gap-3">
                <MetricCard label="Não existe em Rec. + BKO" value={contagens.northenNaoExiste || 0}     sub="sem match em nenhum"      color="#ef4444" onClick={() => setAbaAtiva('northenNaoExiste')} />
                <MetricCard label="Só no BKO (sem boleto)"   value={contagens.northenExisteNoBKO || 0}  sub="cadastrado, sem boleto"   color="#f59e0b" onClick={() => setAbaAtiva('northenExisteNoBKO')} />
                <MetricCard label="UC Divergente"             value={contagens.northenUCDivergente || 0} sub="UC errada pelo fornecedor" color="#a78bfa" onClick={() => setAbaAtiva('northenUCDivergente')} />
                <MetricCard label="Existe em Ambas"           value={contagens.northenExisteEmAmbas || 0} sub="com match"               color="#22c55e" onClick={() => setAbaAtiva('northenExisteEmAmbas')} />
                <MetricCard label="Incluir / Dar Baixa"       value={contagens.northenIncluirBaixa || 0}  sub="pago s/ baixa"            color="#f97316" onClick={() => setAbaAtiva('northenIncluirBaixa')} />
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="default" onClick={() => downloadUrl(workbookUrl(jobId))}>
              <Download size={14} /> Exportar tudo (todas as abas)
            </Button>
          </div>

          <YearFilteredTabArea
            resultado={resultado}
            abaAtiva={abaAtiva}
            setAbaAtiva={setAbaAtiva}
            abasComCount={abasComCount}
            jobId={jobId}
            contagens={contagens}
            anosSelPag={anosSelPag}
            setAnosSelPag={setAnosSelPag}
            anosSelRec={anosSelRec}
            setAnosSelRec={setAnosSelRec}
            modalFaltaPag={modalFaltaPag}
            setModalFaltaPag={setModalFaltaPag}
          />
        </div>
      )}
    </div>
  )
}
