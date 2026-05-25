import { useState } from 'react'
import { Download, Play, Pencil } from 'lucide-react'
import * as XLSX from 'xlsx'
import { UploadBox }    from '../../components/ui/UploadBox'
import { MetricCard }   from '../../components/ui/MetricCard'
import { DataTable }    from '../../components/ui/DataTable'
import { LogPanel }     from '../../components/ui/LogPanel'
import { TabBar }       from '../../components/ui/TabBar'
import { Button }       from '../../components/ui/Button'
import { ColumnMapper } from '../../components/ui/ColumnMapper'
import { gvCruzar, MARCACOES } from '../../utils/gvCruzar'
import { normalizarRows } from '../../utils/normalizadores'

function lerXlsx(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const originalWarn = console.warn
        console.warn = () => {}
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true })
        console.warn = originalWarn

        const ws = wb.Sheets[wb.SheetNames[0]]
        let raw = XLSX.utils.sheet_to_json(ws, { defval: '' })

        if (raw.length === 0) {
          const originalWarn2 = console.warn
          console.warn = () => {}
          const wbD = XLSX.read(e.target.result, { type: 'array', cellDates: true, dense: true })
          console.warn = originalWarn2
          const wsD = wbD.Sheets[wbD.SheetNames[0]]
          raw = XLSX.utils.sheet_to_json(wsD, { defval: '', raw: false })
        }

        resolve(normalizarRows(raw))
      } catch (err) { reject(err) }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

const ABAS_OUTPUT = [
  { key: 'anaLuiza',  label: 'Ana Luiza',        cor: '#a855f7' },
  { key: 'finalizados', label: 'Finalizados',     cor: '#3b82f6' },
  { key: 'realocacao',  label: 'Realocação',      cor: '#f59e0b' },
  { key: 'andressa',    label: 'Andressa',        cor: '#f97316' },
]

function exportarGV(resultado) {
  const wb = XLSX.utils.book_new()
  const clean = row => {
    const o = {}
    for (const [k, v] of Object.entries(row)) {
      if (k.startsWith('_')) continue
      o[k] = v === null || v === undefined ? '' : v
    }
    return o
  }

  const resumo = [
    ['Análise de Injeção — GV', ''],
    ['Data', new Date().toLocaleDateString('pt-BR')],
    ['', ''],
    ['Grupo', 'Quantidade'],
    ['Total Clientes',   resultado.total],
    ['OK (Marcações 1, 6, 18)', resultado.totalOK],
    ['Ana Luiza (Mar. 5)',      resultado.enviarAnaLuiza.length],
    ['Finalizados (Mar. 12)',   resultado.planilhaFin.length],
    ['Realocação (Mar. 11+20)', resultado.planilhaRealoc.length],
    ['Andressa (Mar. 16)',      resultado.verificarAndressa.length],
    ['', ''],
    ['Marcação', 'Quantidade', 'Classificação'],
    ...Object.keys(MARCACOES).map(k => [
      k,
      (resultado.grupos[k] || []).length,
      MARCACOES[k].label,
    ])
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), 'RESUMO')

  if (resultado.enviarAnaLuiza.length)    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resultado.enviarAnaLuiza.map(clean)),    'ANA LUIZA')
  if (resultado.planilhaFin.length)       XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resultado.planilhaFin.map(clean)),       'FINALIZADOS')
  if (resultado.planilhaRealoc.length)    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resultado.planilhaRealoc.map(clean)),    'REALOCACAO')
  if (resultado.verificarAndressa.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resultado.verificarAndressa.map(clean)), 'ANDRESSA')

  Object.keys(MARCACOES).forEach(k => {
    const rows = resultado.grupos[k] || []
    if (!rows.length) return
    const nome = `MAR ${k} - ${MARCACOES[k].label}`.substring(0, 31)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map(clean)), nome)
  })

  if (resultado.rows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resultado.rows.map(clean)), 'TODOS')

  XLSX.writeFile(wb, `gv_injecao_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`)
}

export function GV() {
  const [rawBKO,     setRawBKO]     = useState(null)
  const [rawRec,     setRawRec]     = useState(null)
  const [rawFin,     setRawFin]     = useState(null)
  const [rawRetorno, setRawRetorno] = useState(null)

  const [dfBKO,     setDfBKO]     = useState(null)
  const [dfRec,     setDfRec]     = useState(null)
  const [dfFin,     setDfFin]     = useState(null)
  const [dfRetorno, setDfRetorno] = useState(null)

  const [nomeBKO,     setNomeBKO]     = useState('')
  const [nomeRec,     setNomeRec]     = useState('')
  const [nomeFin,     setNomeFin]     = useState('')
  const [nomeRetorno, setNomeRetorno] = useState('')

  const [mapperOpen,    setMapperOpen]    = useState(false)
  const [mapperKey,     setMapperKey]     = useState('bko')
  const [mapperRaw,     setMapperRaw]     = useState([])
  const [mapperHeaders, setMapperHeaders] = useState([])

  const [resultado,   setResultado]   = useState(null)
  const [abaAtiva,    setAbaAtiva]    = useState('anaLuiza')
  const [logs,        setLogs]        = useState([])
  const [processando, setProcessando] = useState(false)

  const addLog = (msg, tipo = 'info') => {
    const hora = new Date().toLocaleTimeString('pt-BR')
    setLogs(prev => [...prev, { msg, tipo, hora }])
  }

  const schemaMap = { bko: 'gv_bko', rec: 'gv_rec', fin: 'gv_fin', retorno: 'gv_retorno' }
  const labelMap  = { bko: 'Base BKO', rec: 'Recebíveis', fin: 'Finalizados', retorno: 'Retorno GV' }

  const handleFile = async (file, key) => {
    try {
      const rows = await lerXlsx(file)
      if (!rows?.length) { addLog(`Planilha vazia: ${file.name}`, 'err'); return }
      if (key === 'bko')     { setRawBKO(rows);     setNomeBKO(file.name) }
      if (key === 'rec')     { setRawRec(rows);     setNomeRec(file.name) }
      if (key === 'fin')     { setRawFin(rows);     setNomeFin(file.name) }
      if (key === 'retorno') { setRawRetorno(rows); setNomeRetorno(file.name) }
      setMapperKey(key)
      setMapperRaw(rows)
      setMapperHeaders(Object.keys(rows[0]))
      setMapperOpen(true)
    } catch (e) { addLog(`Erro ao ler ${file.name}: ${e.message}`, 'err') }
  }

  const reabrirMapper = key => {
    const rows = key === 'bko' ? rawBKO : key === 'rec' ? rawRec : key === 'fin' ? rawFin : rawRetorno
    if (!rows) return
    setMapperKey(key)
    setMapperRaw(rows)
    setMapperHeaders(Object.keys(rows[0]))
    setMapperOpen(true)
  }

  const handleMapperConfirm = (remapped, mapping) => {
    setMapperOpen(false)
    const label = labelMap[mapperKey]
    if (mapperKey === 'bko')     setDfBKO(remapped)
    if (mapperKey === 'rec')     setDfRec(remapped)
    if (mapperKey === 'fin')     setDfFin(remapped)
    if (mapperKey === 'retorno') setDfRetorno(remapped)
    addLog(`✓ ${label}: ${remapped.length.toLocaleString('pt-BR')} linhas carregadas`, 'ok')
  }

  const processar = async () => {
    if (!dfBKO) return
    setProcessando(true)
    setLogs([])
    setResultado(null)
    try {
      await new Promise(r => setTimeout(r, 50))
      const res = gvCruzar(
        dfBKO,
        dfRec     || [],
        dfFin     || [],
        dfRetorno || [],
        addLog
      )
      setResultado(res)
      // Ativar primeira aba com dados
      const primeira = ABAS_OUTPUT.find(a => (res[a.key === 'anaLuiza' ? 'enviarAnaLuiza' : a.key === 'finalizados' ? 'planilhaFin' : a.key === 'realocacao' ? 'planilhaRealoc' : 'verificarAndressa'] || []).length > 0)
      if (primeira) setAbaAtiva(primeira.key)
    } catch (e) {
      addLog(`Erro: ${e.message}`, 'err')
    } finally {
      setProcessando(false)
    }
  }

  // Mapeia key da aba para os dados do resultado
  const dadosAba = key => {
    if (!resultado) return []
    if (key === 'anaLuiza')   return resultado.enviarAnaLuiza    || []
    if (key === 'finalizados') return resultado.planilhaFin      || []
    if (key === 'realocacao') return resultado.planilhaRealoc    || []
    if (key === 'andressa')   return resultado.verificarAndressa || []
    // Marcações individuais
    return resultado.grupos[key] || []
  }

  // Construir abas dinâmicas: output fixos + marcações com dados
  const abasMarcacao = resultado
    ? Object.keys(MARCACOES)
        .filter(k => (resultado.grupos[k] || []).length > 0)
        .map(k => ({ key: k, label: `Mar. ${k} — ${MARCACOES[k].label}`, cor: MARCACOES[k].cor }))
    : []

  const todasAbas = [...ABAS_OUTPUT.map(a => ({
    ...a,
    count: resultado ? dadosAba(a.key).length : undefined
  })), ...abasMarcacao.map(a => ({ ...a, count: dadosAba(a.key).length }))]

  const podeBKO = !!dfBKO

  return (
    <div className="p-7 space-y-5">

      <ColumnMapper
        open={mapperOpen}
        raw={mapperRaw}
        headers={mapperHeaders}
        schemaKey={schemaMap[mapperKey]}
        title={`Análise de colunas — ${labelMap[mapperKey]}`}
        fileName={mapperKey === 'bko' ? nomeBKO : mapperKey === 'rec' ? nomeRec : mapperKey === 'fin' ? nomeFin : nomeRetorno}
        onConfirm={handleMapperConfirm}
        onCancel={() => setMapperOpen(false)}
      />

      {/* Header */}
      <div className="pb-5 border-b border-bd">
        <h1 className="text-xl font-bold text-tx mb-1">Análise de Injeção — GV / Northen</h1>
        <p className="text-sm text-tx3">Classifica clientes por Marcação (1–21) cruzando BKO, Recebíveis, Finalizados e Retorno GV.</p>
      </div>

      {/* Uploads — grid 2×2 */}
      <div className="grid grid-cols-2 gap-4">

        {/* Base BKO */}
        <div className="relative">
          <UploadBox label="Base Completa BKO" sublabel="Base principal dos clientes (obrigatória)"
            onFile={f => handleFile(f, 'bko')} loaded={!!dfBKO} fileName={nomeBKO} />
          {dfBKO && (
            <button onClick={() => reabrirMapper('bko')} title="Editar mapeamento"
              className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg border border-acc/30 bg-acc/10 text-acc hover:bg-acc/20 transition-colors z-10">
              <Pencil size={13} />
            </button>
          )}
        </div>

        {/* Recebíveis */}
        <div className="relative">
          <UploadBox label="Recebíveis" sublabel="Para identificar clientes Boletando e em atraso"
            onFile={f => handleFile(f, 'rec')} loaded={!!dfRec} fileName={nomeRec} />
          {dfRec && (
            <button onClick={() => reabrirMapper('rec')} title="Editar mapeamento"
              className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg border border-acc/30 bg-acc/10 text-acc hover:bg-acc/20 transition-colors z-10">
              <Pencil size={13} />
            </button>
          )}
        </div>

        {/* Finalizados */}
        <div className="relative">
          <UploadBox label="Base Finalizados" sublabel="Enviada toda terça e quinta"
            onFile={f => handleFile(f, 'fin')} loaded={!!dfFin} fileName={nomeFin} />
          {dfFin && (
            <button onClick={() => reabrirMapper('fin')} title="Editar mapeamento"
              className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg border border-acc/30 bg-acc/10 text-acc hover:bg-acc/20 transition-colors z-10">
              <Pencil size={13} />
            </button>
          )}
        </div>

        {/* Retorno GV */}
        <div className="relative">
          <UploadBox label="Retorno GV (Base Andressa)" sublabel="Status GV, Observação e Rateio"
            onFile={f => handleFile(f, 'retorno')} loaded={!!dfRetorno} fileName={nomeRetorno} />
          {dfRetorno && (
            <button onClick={() => reabrirMapper('retorno')} title="Editar mapeamento"
              className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg border border-acc/30 bg-acc/10 text-acc hover:bg-acc/20 transition-colors z-10">
              <Pencil size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Botão processar */}
      <div className="flex justify-end">
        <Button variant="primary" onClick={processar} disabled={!podeBKO || processando}>
          <Play size={14} />
          {processando ? 'Classificando…' : 'Processar Análise'}
        </Button>
      </div>

      <LogPanel logs={logs} />

      {/* Resultado */}
      {resultado && (
        <div className="space-y-5">

          {/* Métricas dos grupos de output */}
          <div>
            <p className="text-xs font-semibold text-tx3 uppercase tracking-widest mb-2">Grupos de Output</p>
            <div className="grid grid-cols-4 gap-3">
              <MetricCard label="Total Clientes"  value={resultado.total}                    sub="base BKO"        color="#94a3b8" />
              <MetricCard label="Clientes OK"     value={resultado.totalOK}                  sub="sem ação"        color="#22c55e" />
              <MetricCard label="Ana Luiza"       value={resultado.enviarAnaLuiza.length}    sub="devolutivas"     color="#a855f7" onClick={() => setAbaAtiva('anaLuiza')} />
              <MetricCard label="Finalizados"     value={resultado.planilhaFin.length}       sub="enviar planilha" color="#3b82f6" onClick={() => setAbaAtiva('finalizados')} />
              <MetricCard label="Realocação"      value={resultado.planilhaRealoc.length}    sub="mar. 11 + 20"    color="#f59e0b" onClick={() => setAbaAtiva('realocacao')} />
              <MetricCard label="Andressa"        value={resultado.verificarAndressa.length} sub="contratos"       color="#f97316" onClick={() => setAbaAtiva('andressa')} />
            </div>
          </div>

          {/* Exportar */}
          <div className="flex justify-end">
            <Button variant="default" onClick={() => exportarGV(resultado)}>
              <Download size={14} /> Exportar Excel
            </Button>
          </div>

          {/* Tabela com abas */}
          <div className="bg-s1 border border-bd rounded-xl overflow-hidden">
            <div className="px-5 pt-5">
              <TabBar abas={todasAbas} abaAtiva={abaAtiva} onTab={setAbaAtiva} />
            </div>
            <div className="px-5 pb-5">
              <DataTable rows={dadosAba(abaAtiva)} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
