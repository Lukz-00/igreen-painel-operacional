import { useState } from 'react'
import { Download, Play, Pencil } from 'lucide-react'
import * as XLSX from 'xlsx'
import { UploadBox } from '../../components/ui/UploadBox'
import { MetricCard } from '../../components/ui/MetricCard'
import { DataTable } from '../../components/ui/DataTable'
import { DivergentesTable } from '../../components/ui/DivergentesTable'
import { LogPanel } from '../../components/ui/LogPanel'
import { TabBar } from '../../components/ui/TabBar'
import { Button } from '../../components/ui/Button'
import { ColumnMapper } from '../../components/ui/ColumnMapper'
import { fatCruzar } from '../../utils/fatCruzar'
import { normalizarRows } from '../../utils/normalizadores'
import { exportarFaturamento } from '../../utils/exportar'
import { addDebugLog, addErrorLog, downloadLogs } from '../../utils/logErros'

function lerXlsx(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        addDebugLog('Iniciando leitura de arquivo', { nome: file.name, tamanho: file.size })

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
        let raw = XLSX.utils.sheet_to_json(ws, { defval: '' })

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
    reader.readAsArrayBuffer(file)
  })
}

const ABAS = [
  { key:'divergenciasCod',       label:'Divergência Cód.',        cor:'#f97316' },
  { key:'semPagtoValor',         label:'Sem Pagto / Valor',       cor:'#dc2626' },
  { key:'divergentes',           label:'Status Divergentes',      cor:'#ef4444' },
  { key:'faltaRec',              label:'Falta nos Recebíveis',    cor:'#f59e0b' },
  { key:'faltaPag',              label:'Falta na Pagadoria',      cor:'#a855f7' },
  { key:'coincidentes',          label:'Coincidentes',            cor:'#22c55e' },
  { key:'duplicidadesPag',       label:'Duplicidades',            cor:'#94a3b8' },
  { key:'northenNaoExiste',      label:'Northen — Não em Rec.',   cor:'#ef4444' },
  { key:'northenExisteEmAmbas',  label:'Northen — Existe em Ambas', cor:'#22c55e' },
  { key:'northenIncluirBaixa',   label:'Northen — Incluir/Baixa', cor:'#f97316' },
]

export function Faturamento() {
  // Dados carregados
  const [rawPag, setRawPag] = useState(null)
  const [rawRec, setRawRec] = useState(null)
  const [dfPag, setDfPag]   = useState(null)
  const [dfRec, setDfRec]   = useState(null)
  const [nomePag, setNomePag] = useState('')
  const [nomeRec, setNomeRec] = useState('')

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

  const addLog = (msg, tipo = 'info') => {
    const hora = new Date().toLocaleTimeString('pt-BR')
    setLogs(prev => [...prev, { msg, tipo, hora }])
  }

  // Ao soltar arquivo na caixa → lé e abre o mapper
  const handleFile = async (file, key) => {
    try {
      console.log('[DEBUG] handleFile iniciado para:', file.name)
      const rows = await lerXlsx(file)
      console.log('[DEBUG] handleFile recebeu rows:', Array.isArray(rows), 'length:', rows?.length)
      if (!rows || !rows.length) {
        console.log('[DEBUG] Rows vazio ou nulo, abortando')
        addLog(`Planilha vazia: ${file.name}`, 'err')
        return
      }
      console.log('[DEBUG] Rows válido, abrindo mapper com', rows.length, 'linhas')
      if (key === 'pag') { setRawPag(rows); setNomePag(file.name) }
      else               { setRawRec(rows); setNomeRec(file.name) }
      setMapperKey(key)
      setMapperRaw(rows)
      setMapperHeaders(Object.keys(rows[0]))
      setMapperOpen(true)
    } catch(e) {
      console.error('[DEBUG] Exceção em handleFile:', e)
      addLog(`Erro ao ler ${file.name}: ${e.message}`, 'err')
    }
  }

  // Reabrir mapper sem resubir arquivo
  const reabrirMapper = (key) => {
    const rows = key === 'pag' ? rawPag : rawRec
    if (!rows) return
    setMapperKey(key)
    setMapperRaw(rows)
    setMapperHeaders(Object.keys(rows[0]))
    setMapperOpen(true)
  }

  // Ao confirmar o mapper
  const handleMapperConfirm = (remapped, mapping) => {
    setMapperOpen(false)
    const label = mapperKey === 'pag' ? 'Pagadoria' : 'Recebíveis'
    if (mapperKey === 'pag') setDfPag(remapped)
    else                     setDfRec(remapped)
    addLog(`✓ ${label}: ${remapped.length.toLocaleString('pt-BR')} linhas`, 'ok')
    addLog(`  UC → ${mapping.instalacao || '—'} | Status → ${mapping.status || '—'} | Mês → ${mapping.mes || '—'}`)
  }

  const processar = async () => {
    if (!dfPag || !dfRec) return
    setProcessando(true)
    setLogs([])
    setResultado(null)
    try {
      await new Promise(r => setTimeout(r, 50))
      const res = fatCruzar(dfPag, dfRec, addLog)
      setResultado(res)
      setAbaAtiva(ABAS.find(a => (res[a.key] || []).length > 0)?.key || 'divergentes')
    } catch(e) {
      addLog(`Erro: ${e.message}`, 'err')
    } finally {
      setProcessando(false)
    }
  }

  const abasComCount = ABAS.map(a => ({
    ...a, count: resultado ? (resultado[a.key] || []).length : undefined
  }))

  return (
    <div className="p-7 space-y-5">

      {/* Mapper de colunas */}
      <ColumnMapper
        open={mapperOpen}
        raw={mapperRaw}
        headers={mapperHeaders}
        schemaKey={mapperKey === 'pag' ? 'fat_pag' : 'fat_rec'}
        title={`Análise de colunas — ${mapperKey === 'pag' ? 'Base Pagadoria' : 'Recebíveis Clientes'}`}
        fileName={mapperKey === 'pag' ? nomePag : nomeRec}
        onConfirm={handleMapperConfirm}
        onCancel={() => setMapperOpen(false)}
      />

      {/* Header */}
      <div className="pb-5 border-b border-bd">
        <h1 className="text-xl font-bold text-tx mb-1">Cruzamento Pagadoria × Recebíveis</h1>
        <p className="text-sm text-tx3">Cascading join por UC + Mês de Referência. 3 etapas de fallback.</p>
      </div>

      {/* Uploads */}
      <div className="grid grid-cols-2 gap-4">
        {/* Pagadoria */}
        <div className="relative">
          <UploadBox
            label="Base Pagadoria iGreen"
            sublabel="Solatio · Northen · Energisa · EDP"
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
            <MetricCard label="UCs em Ambas"        value={resultado.emAmbos}                                    sub="matches"         color="#22c55e" />
            <MetricCard label="Divergência Cód."    value={(resultado.divergenciasCod||[]).length}               sub="cód. barras"     color="#f97316" onClick={() => setAbaAtiva('divergenciasCod')} />
            <MetricCard label="Sem Pagto/Valor"     value={(resultado.semPagtoValor||[]).length}                 sub="pendências"      color="#dc2626" onClick={() => setAbaAtiva('semPagtoValor')} />
            <MetricCard label="Status Divergentes"  value={resultado.divergentes.length}                         sub="conflito"        color="#ef4444" onClick={() => setAbaAtiva('divergentes')} />
            <MetricCard label="Falta nos Recebíveis"value={resultado.faltaRec.length}                            sub="só na Pagadoria" color="#f59e0b" onClick={() => setAbaAtiva('faltaRec')} />
            <MetricCard label="Falta na Pagadoria"  value={resultado.faltaPag.length}                            sub="só nos Receb."   color="#a855f7" onClick={() => setAbaAtiva('faltaPag')} />
            <MetricCard label="Coincidentes"        value={resultado.coincidentes.length}                        sub="status ok"       color="#22c55e" onClick={() => setAbaAtiva('coincidentes')} />
            <MetricCard label="Duplicidades"        value={(resultado.duplicidadesPag||[]).length}               sub="linhas idênticas"color="#94a3b8" onClick={() => setAbaAtiva('duplicidadesPag')} />
          </div>

          {((resultado.northenNaoExiste||[]).length > 0 || (resultado.northenExisteEmAmbas||[]).length > 0 || (resultado.northenIncluirBaixa||[]).length > 0) && (
            <div>
              <p className="text-xs font-semibold text-tx3 uppercase tracking-widest mb-2">Northen</p>
              <div className="grid grid-cols-3 gap-3">
                <MetricCard label="Não existe em Recebíveis" value={(resultado.northenNaoExiste||[]).length}     sub="sem match"       color="#ef4444" onClick={() => setAbaAtiva('northenNaoExiste')} />
                <MetricCard label="Existe em Ambas"          value={(resultado.northenExisteEmAmbas||[]).length} sub="com match"       color="#22c55e" onClick={() => setAbaAtiva('northenExisteEmAmbas')} />
                <MetricCard label="Incluir / Dar Baixa"      value={(resultado.northenIncluirBaixa||[]).length}  sub="pago s/ baixa"   color="#f97316" onClick={() => setAbaAtiva('northenIncluirBaixa')} />
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="default" onClick={() => exportarFaturamento(resultado)}>
              <Download size={14} /> Exportar tudo (todas as abas)
            </Button>
          </div>

          <div className="bg-s1 border border-bd rounded-xl overflow-hidden">
            <div className="px-5 pt-5">
              <TabBar abas={abasComCount} abaAtiva={abaAtiva} onTab={setAbaAtiva} />
            </div>
            <div className="px-5 pb-5">
              {abaAtiva === 'divergentes'
                ? <DivergentesTable rows={resultado.divergentes || []} />
                : <DataTable rows={resultado[abaAtiva] || []} />
              }
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
