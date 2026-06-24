import { useState } from 'react'
import { Play, Download, RotateCcw, Pencil, Loader2 } from 'lucide-react'
import { UploadBox } from '../../components/ui/UploadBox'
import { MetricCard } from '../../components/ui/MetricCard'
import { DataTable } from '../../components/ui/DataTable'
import { TabBar } from '../../components/ui/TabBar'
import { Button } from '../../components/ui/Button'
import { ColumnMapper } from '../../components/ui/ColumnMapper'
import { normalizarRows } from '../../utils/normalizadores'
import { uploadSpreadsheet, processConciliacao, workbookConciliacaoUrl, downloadUrl } from '../../utils/pythonApi'

// ── Helpers foram movidos para o backend (Polars) ─────────────────────────

// ── export ─────────────────────────────────────────────────────────────────

function exportarConciliacao(res, fornecedora) {
  const clean = row => Object.fromEntries(
    Object.entries(row).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, v == null ? '' : v])
  )
  const wb = XLSX.utils.book_new()

  const resumo = [
    [`Conciliação de Base${fornecedora ? ' — ' + fornecedora : ''}`, ''],
    ['Data', new Date().toLocaleDateString('pt-BR')],
    ['', ''],
    ['Marcação', 'Quantidade'],
    ['Total na Base', res.total],
    ...MARCACOES.map(m => [m.label, (res[m.key] || []).length]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), 'RESUMO')

  for (const m of MARCACOES) {
    const rows = res[m.key] || []
    if (rows.length) {
      const nome = `${m.num || '0'} - ${m.label.replace(/.*— /, '').substring(0, 25)}`
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.map(clean)), nome)
    }
  }

  const buf  = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], { type: 'application/octet-stream' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `conciliacao_base_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── marcações config ────────────────────────────────────────────────────────

const MARCACOES = [
  { key:'m1',  num:1,  label:'1 — Clientes OK',                     cor:'#22c55e' },
  { key:'m2',  num:2,  label:'2 — Boletando > Sem data ativo',      cor:'#3b82f6' },
  { key:'m3',  num:3,  label:'3 — Cancelado GV > Cancelar BKO',     cor:'#ef4444' },
  { key:'m5',  num:5,  label:'5 — Equipe de Devolutivas',            cor:'#f97316' },
  { key:'m6',  num:6,  label:'6 — Cancelado em ambas partes',        cor:'#64748b' },
  { key:'m7',  num:7,  label:'7 — Clientes em atraso',               cor:'#dc2626' },
  { key:'m8',  num:8,  label:'8 — Represado',                        cor:'#7c3aed' },
  { key:'m10', num:10, label:'10 — Aguardando retorno Fornecedora',  cor:'#0ea5e9' },
  { key:'m11', num:11, label:'11 — Cancelado BKO > Ativo Forn.',     cor:'#f59e0b' },
  { key:'m13', num:13, label:'13 — Clientes em atraso > Sem boleto', cor:'#06b6d4' },
  { key:'m15', num:15, label:'15 — Não encontrado na GV',            cor:'#ec4899' },
  { key:'m22', num:22, label:'22 — Clientes em Atraso',              cor:'#dc2626' },
  { key:'m0',  num:0,  label:'0 — Verificação Manual',               cor:'#334155' },
]

// ── mapper config ───────────────────────────────────────────────────────────

const MAPPER_CFG = {
  base:   { schemaKey: 'conc_base',   title: 'Mapeamento — Base Completa BackOffice' },
  fin:    { schemaKey: 'conc_fin',    title: 'Mapeamento — Base de Finalizados' },
  rec:    { schemaKey: 'conc_rec',    title: 'Mapeamento — Base de Recebíveis' },
  status: { schemaKey: 'status_forn', title: 'Mapeamento — Retorno de Status Fornecedora' },
}

// ── component ──────────────────────────────────────────────────────────────

export function ConciliacaoBase({ fornecedora = '' }) {
  const [baseId, setBaseId] = useState(null); const [rawBase, setRawBase] = useState(null); const [nBase, setNBase] = useState('')
  const [finId, setFinId]   = useState(null); const [rawFin,  setRawFin]  = useState(null); const [nFin,  setNFin]  = useState('')
  const [recId, setRecId]   = useState(null); const [rawRec,  setRawRec]  = useState(null); const [nRec,  setNRec]  = useState('')
  const [statusId, setStatusId] = useState(null); const [rawStatus, setRawStatus] = useState(null); const [nStatus, setNStatus] = useState('')

  const [mapperOpen,    setMapperOpen]    = useState(false)
  const [mapperFor,     setMapperFor]     = useState(null)
  const [mapperRaw,     setMapperRaw]     = useState([])
  const [savedMappings, setSavedMappings] = useState({})

  const [res,    setRes]    = useState(null)
  const [jobId,  setJobId]  = useState(null)
  const [aba,    setAba]    = useState('m1')
  const [proc,   setProc]   = useState(false)

  const limpar = () => {
    setBaseId(null);   setRawBase(null);   setNBase('')
    setFinId(null);    setRawFin(null);    setNFin('')
    setRecId(null);    setRawRec(null);    setNRec('')
    setStatusId(null); setRawStatus(null); setNStatus('')
    setSavedMappings({})
    setRes(null); setJobId(null); setAba('m1')
  }

  const abrirMapper = (key, raw) => { setMapperFor(key); setMapperRaw(raw); setMapperOpen(true) }

  const handleFile = (idSetter, rawSetter, nameSetter, mapperKey) => async file => {
    try {
      const resp = await uploadSpreadsheet(file)
      idSetter(resp.upload_id)
      const rows = normalizarRows(resp.rows || [])
      rawSetter(rows); nameSetter(file.name); setRes(null); setJobId(null)
      // Limpa o mapeamento salvo deste slot — novo arquivo pode ter colunas diferentes
      setSavedMappings(prev => ({ ...prev, [mapperKey]: null }))
      abrirMapper(mapperKey, rows)
    } catch (e) { alert('Erro ao fazer upload do arquivo: ' + e.message) }
  }

  const handleMapperConfirm = (remapped, mapping) => {
    setMapperOpen(false)
    // Persiste o mapeamento confirmado
    setSavedMappings(prev => ({ ...prev, [mapperFor]: mapping }))
  }

  const processar = async () => {
    if (!baseId || !finId || !recId || !statusId) return
    if (!savedMappings.base || !savedMappings.fin || !savedMappings.rec || !savedMappings.status) {
      alert("Por favor, confirme todos os mapeamentos de colunas antes de processar.")
      return
    }
    setProc(true)
    try {
      const payload = {
        base: { upload_id: baseId, mapping: savedMappings.base },
        fin: { upload_id: finId, mapping: savedMappings.fin },
        rec: { upload_id: recId, mapping: savedMappings.rec },
        status: { upload_id: statusId, mapping: savedMappings.status },
      }
      const r = await processConciliacao(payload)
      setRes(r.counts)
      setJobId(r.job_id)
      setAba(MARCACOES.find(m => (r.counts[m.key] || 0) > 0)?.key || 'm1')
    } catch (e) { alert('Erro ao processar: ' + e.message) }
    finally { setProc(false) }
  }

  const pronto = !!baseId && !!finId && !!recId && !!statusId
  const cfg    = mapperFor ? MAPPER_CFG[mapperFor] : {}

  const Upload = ({ label, sublabel, mapKey, raw, isLoaded, name, onFile }) => (
    <div className="relative">
      <UploadBox label={label} sublabel={sublabel} onFile={onFile} loaded={isLoaded} fileName={name} />
      {isLoaded && (
        <button onClick={() => abrirMapper(mapKey, raw)} title="Editar mapeamento de colunas"
          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg border border-acc/30 bg-acc/10 text-acc hover:bg-acc/20 transition-colors z-10">
          <Pencil size={13} />
        </button>
      )}
    </div>
  )

  // Só exibe marcações com dados no resultado (agora res tem os counts numéricos)
  const marcacoesComDados = res
    ? MARCACOES.filter(m => (res[m.key] || 0) > 0)
    : []

  return (
    <div className="p-7 space-y-5">

      <ColumnMapper
        open={mapperOpen}
        raw={mapperRaw}
        headers={mapperRaw.length ? Object.keys(mapperRaw[0]) : []}
        schemaKey={cfg.schemaKey || ''}
        title={cfg.title || ''}
        fileName={mapperFor === 'base' ? nBase : mapperFor === 'fin' ? nFin : mapperFor === 'rec' ? nRec : nStatus}
        savedMapping={savedMappings[mapperFor] || null}
        onConfirm={handleMapperConfirm}
        onCancel={() => setMapperOpen(false)}
      />

      <div className="pb-5 border-b border-bd">
        <h1 className="text-xl font-bold text-tx mb-1">
          Conciliação de Base{fornecedora ? ` — ${fornecedora}` : ''}
        </h1>
        <p className="text-sm text-tx3">
          Cruzamento BKO × GV × Recebíveis. Classificação em 21 marcações operacionais conforme POP 03.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Upload label="Base Completa BackOffice"        sublabel="Filtro: Fornecedora + Em qualquer lugar"
          mapKey="base"   raw={rawBase}   isLoaded={!!baseId}   name={nBase}   onFile={handleFile(setBaseId, setRawBase,   setNBase,   'base')}   />
        <Upload label="Base de Finalizados"             sublabel="Clientes enviados à fornecedora"
          mapKey="fin"    raw={rawFin}    isLoaded={!!finId}    name={nFin}    onFile={handleFile(setFinId, setRawFin,    setNFin,    'fin')}    />
        <Upload label="Base de Recebíveis"              sublabel="Filtro: Fornecedora + Em qualquer lugar"
          mapKey="rec"    raw={rawRec}    isLoaded={!!recId}    name={nRec}    onFile={handleFile(setRecId, setRawRec,    setNRec,    'rec')}    />
        <Upload label="Retorno de Status — Fornecedora" sublabel="Observação GV + Status Rateio GV"
          mapKey="status" raw={rawStatus} isLoaded={!!statusId} name={nStatus} onFile={handleFile(setStatusId, setRawStatus, setNStatus, 'status')} />
      </div>

      <div className="flex justify-between items-center bg-bg2 border border-bd rounded-xl p-4">
        <div className="flex gap-4 items-center">
          <Button variant="primary" disabled={!pronto || proc} onClick={processar} className="w-40 flex justify-center">
            {proc ? <Loader2 size={16} className="animate-spin" /> : <><Play size={14} className="fill-current" /> Processar</>}
          </Button>
          <Button variant="ghost" onClick={limpar} disabled={proc}>
            <RotateCcw size={14} /> Limpar
          </Button>
        </div>
        {res && (
          <div className="flex gap-4 items-center text-sm">
            <span className="text-tx2">
              <strong className="text-tx">{res.total?.toLocaleString('pt-BR')}</strong> registros analisados
            </span>
            <div className="w-px h-5 bg-bd" />
            <Button variant="default" onClick={() => downloadUrl(workbookConciliacaoUrl(jobId))}>
              <Download size={14} /> Baixar Relatório (Excel)
            </Button>
          </div>
        )}
      </div>

      {res && (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2">
          <div className="grid grid-cols-4 gap-3">
            {marcacoesComDados.map(m => (
              <MetricCard
                key={m.key}
                label={m.label}
                value={(res[m.key] || 0).toLocaleString('pt-BR')}
                sub={`${Math.round(((res[m.key] || 0) / (res.total || 1)) * 100)}% do total`}
                color={m.cor}
                active={aba === m.key}
                onClick={() => setAba(m.key)}
              />
            ))}
          </div>

          <div className="bg-bg2 border border-bd rounded-xl p-6 text-center text-tx2 space-y-2">
            <h3 className="text-lg font-medium text-tx">Visualização Oculta</h3>
            <p>
              A renderização da tabela na interface gráfica foi desabilitada para garantir performance máxima, pois a visualização de dezenas de milhares de registros no navegador causa lentidão extrema.
            </p>
            <p>
              Para conferir os dados classificados para cada marcação, clique no botão <strong className="text-tx">"Baixar Relatório (Excel)"</strong> acima. O arquivo gerado contém todas as planilhas divididas por status.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
