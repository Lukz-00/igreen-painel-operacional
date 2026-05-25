import { useState } from 'react'
import * as XLSX from 'xlsx'
import { Play, Download, RotateCcw, Pencil } from 'lucide-react'
import { UploadBox } from '../../components/ui/UploadBox'
import { MetricCard } from '../../components/ui/MetricCard'
import { DataTable } from '../../components/ui/DataTable'
import { TabBar } from '../../components/ui/TabBar'
import { Button } from '../../components/ui/Button'
import { ColumnMapper } from '../../components/ui/ColumnMapper'
import { normalizarRows } from '../../utils/normalizadores'

// ── helpers ────────────────────────────────────────────────────────────────

function lerXlsx(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true })
        resolve(normalizarRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })))
      } catch (err) { reject(err) }
    }
    r.onerror = reject
    r.readAsArrayBuffer(file)
  })
}

function parseDias(v) {
  if (!v || String(v).trim() === '' || String(v).trim() === 'N/D' || String(v).trim() === '—') return null
  if (v instanceof Date && !isNaN(v)) return Math.floor((Date.now() - v.getTime()) / 86400000)
  const s = String(v).trim()
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (m) { const d = new Date(+m[3], +m[2] - 1, +m[1]); if (!isNaN(d.getTime())) return Math.floor((Date.now() - d.getTime()) / 86400000) }
  m = s.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})/)
  if (m) { const d = new Date(+m[1], +m[2] - 1, +m[3]); if (!isNaN(d.getTime())) return Math.floor((Date.now() - d.getTime()) / 86400000) }
  const n = parseFloat(s)
  if (!isNaN(n) && n > 30000) { const d = new Date((n - 25569) * 86400 * 1000); return Math.floor((Date.now() - d.getTime()) / 86400000) }
  return null
}

function normCod(v) { return String(v || '').replace(/\s+/g, '').toUpperCase() }

function temTermo(texto, termos) {
  const t = String(texto || '').toUpperCase()
  return termos.some(term => t.includes(term.toUpperCase()))
}

// ── termos de classificação ─────────────────────────────────────────────────

const CANCEL_GV  = ['CANCELADO', 'REMOVIDO', 'REPROVADO', 'INSATISF', 'MUDANÇA DE ENDEREÇO', 'MUDANCA DE ENDERECO']
const CANCEL_BKO = ['CANCELADO', 'DESIST', 'EXCLUIDO', 'EXCLUÍDO']
const REJEICAO   = ['CONTRATO NÃO ENCONTRADO', 'CONTRATO NAO ENCONTRADO', 'FALTA LINK', 'FATURA ILEGÍVEL', 'FATURA ILEGIVEL', 'SEM HISTÓRICO DE CONSUMO', 'SEM HISTORICO DE CONSUMO', 'CONTRATO SEM ASSINATURA']

// ── lógica de classificação ─────────────────────────────────────────────────

function classificar(dfBase, dfFin, dfRec, dfStatus) {
  const setFin = new Set(dfFin.map(r => normCod(r['_gmap_codigo'] || '')).filter(Boolean))
  const setRec = new Set(dfRec.map(r => normCod(r['_gmap_codigo'] || '')).filter(Boolean))

  const mapGV = {}
  dfStatus.forEach(r => {
    const cod = normCod(r['_gmap_codigo'] || '')
    if (!cod) return
    mapGV[cod] = {
      obs:    String(r['_gmap_obs']          || '').trim(),
      rateio: String(r['_gmap_status_rateio']|| '').trim(),
    }
  })

  const buckets = {
    m_cancelados:[],
    m1:[], m2:[], m3:[], m5:[], m6:[], m7:[], m8:[],
    m10:[], m11:[], m12:[], m14:[], m15:[], m16:[],
    m17:[], m18:[], m19:[], m21:[], m0:[],
  }

  dfBase.forEach(row => {
    const cod             = normCod(row['_gmap_codigo']            || '')
    const dataAtivo       = String(row['_gmap_data_ativo']         || '').trim()
    const dataCanc        = String(row['_gmap_data_cancelamento']  || '').trim()
    const devBKO          = String(row['_gmap_devolutiva']         || '').trim()
    const statusBKO       = String(row['_gmap_status']             || '').trim().toUpperCase()
    const validadoSucesso = String(row['_gmap_validado_sucesso']   || '').trim().toUpperCase()

    const finalizado  = setFin.has(cod)
    const boletando   = setRec.has(cod)
    const hasGVStatus = !!mapGV[cod]
    const gv          = mapGV[cod] || { obs: '', rateio: '' }
    const obsGV       = gv.obs.toUpperCase()
    const rateioGV    = gv.rateio.toUpperCase()

    const dias         = parseDias(dataAtivo)
    const meses        = dias !== null ? +(dias / 30).toFixed(1) : null
    const temDataAtivo = dias !== null && dias >= 0
    const canceladoGV  = temTermo(obsGV, CANCEL_GV) || temTermo(rateioGV, CANCEL_GV)
    const canceladoBKO = !!dataCanc || temTermo(devBKO, CANCEL_BKO)

    const rec = {
      ...row,
      'Finalizado GV':    finalizado ? 'SIM' : 'NÃO',
      'Boletando':        boletando  ? 'SIM' : 'NÃO',
      'Observação GV':    gv.obs,
      'Status Rateio GV': gv.rateio,
      'Dias em Atraso':   dias  !== null ? dias  : '—',
      'Meses em Atraso':  meses !== null ? meses : '—',
    }

    const marcar = (key, label) => { rec['Marcação'] = label; buckets[key].push(rec) }
    const cancelarBKO = () => marcar('m_cancelados', 'C — Cancelados BackOffice')

    // ── Prioridades globais ─────────────────────────────────────────────────
    if (obsGV.includes('AUMENTAR CONSUMO') || rateioGV.includes('AUMENTAR CONSUMO'))
      return marcar('m21', '21 — Aumentar Consumo')

    if (!boletando && temTermo(obsGV, REJEICAO)) {
      if (!temDataAtivo && devBKO) return cancelarBKO()
      return marcar('m5', '5 — Equipe de Devolutivas')
    }

    // ── Grupo A: NÃO está na GV E NÃO está boletando ───────────────────────
    if (!finalizado && !boletando) {
      if (temDataAtivo) {
        if (statusBKO.includes('EM VALIDAÇ') || statusBKO.includes('EM VALIDAC'))
          return marcar('m16', '16 — Andressa Verificar')
        if (!canceladoBKO && dias > 300)
          return devBKO ? cancelarBKO() : marcar('m8', '8 — Represado > 10 meses')
        if (!canceladoBKO && dias > 90)
          return devBKO ? cancelarBKO() : marcar('m14', '14 — Realocação')
        if (!canceladoBKO)
          return devBKO ? cancelarBKO() : marcar('m12', '12 — OK > Não enviado')
      } else {
        if (!devBKO) {
          if (statusBKO.includes('VALIDADO') || statusBKO.includes('REPROVADO'))
            return marcar('m17', '17 — #N/D Sem devolutiva Sem data ativo')
          if (!validadoSucesso && !rateioGV)
            return marcar('m18', '18 — Cadastro sem assinatura > Não enviado')
        } else {
          return cancelarBKO()
        }
      }
    }

    // ── Grupo B: NÃO está na GV, MAS está boletando ────────────────────────
    if (!finalizado && boletando) {
      if (!hasGVStatus)
        return marcar('m15', '15 — Não encontrado na GV')
    }

    // ── Grupo C: ESTÁ na base de Finalizados da GV ──────────────────────────
    if (finalizado) {
      if (canceladoGV) {
        if (!temDataAtivo)
          return marcar('m6', '6 — Cancelado em ambas partes')
        if (!canceladoBKO && !dataCanc)
          return marcar('m3', '3 — Cancelado GV > Cancelar BKO')
      } else {
        // Ativo na GV
        if (canceladoBKO) {
          if (boletando && !temDataAtivo && !!dataCanc)
            return devBKO ? cancelarBKO() : marcar('m2', '2 — Boletando > Sem data ativo')
          if (statusBKO.includes('VALIDADO') && !boletando)
            return marcar('m19', '19 — Enviado GV > Cancelar BKO')
          if (temTermo(devBKO, CANCEL_BKO))
            return marcar('m11', '11 — Cancelado BKO > Ativo Fornecedora')
        } else {
          if (boletando)
            return devBKO ? cancelarBKO() : marcar('m10', '10 — Aguardando retorno Fornecedora')
          if (temDataAtivo && !devBKO)
            return marcar('m7', '7 — Clientes em atraso')
          return cancelarBKO()
        }
      }
    }

    marcar('m0', '0 — Não classificado')
  })

  return { ...buckets, total: dfBase.length }
}

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
  { key:'m1',           num:1,   label:'1 — Clientes OK',                     cor:'#22c55e' },
  { key:'m2',           num:2,   label:'2 — Boletando > Sem data ativo',      cor:'#3b82f6' },
  { key:'m3',           num:3,   label:'3 — Cancelado GV > Cancelar BKO',     cor:'#ef4444' },
  { key:'m5',           num:5,   label:'5 — Equipe de Devolutivas',            cor:'#f97316' },
  { key:'m6',           num:6,   label:'6 — Cancelado em ambas partes',        cor:'#64748b' },
  { key:'m7',           num:7,   label:'7 — Clientes em atraso',               cor:'#dc2626' },
  { key:'m8',           num:8,   label:'8 — Represado > 10 meses',             cor:'#7c3aed' },
  { key:'m10',          num:10,  label:'10 — Aguardando retorno Fornecedora',  cor:'#0ea5e9' },
  { key:'m11',          num:11,  label:'11 — Cancelado BKO > Ativo Forn.',     cor:'#f59e0b' },
  { key:'m12',          num:12,  label:'12 — OK > Não enviado',                cor:'#10b981' },
  { key:'m14',          num:14,  label:'14 — Realocação',                      cor:'#8b5cf6' },
  { key:'m15',          num:15,  label:'15 — Não encontrado na GV',            cor:'#ec4899' },
  { key:'m16',          num:16,  label:'16 — Andressa Verificar',              cor:'#06b6d4' },
  { key:'m17',          num:17,  label:'17 — #N/D Sem dev. Sem data ativo',    cor:'#94a3b8' },
  { key:'m18',          num:18,  label:'18 — Cadastro sem assinatura',         cor:'#a1a1aa' },
  { key:'m19',          num:19,  label:'19 — Enviado GV > Cancelar BKO',       cor:'#f43f5e' },
  { key:'m21',          num:21,  label:'21 — Aumentar Consumo',                cor:'#84cc16' },
  { key:'m_cancelados', num:'C', label:'C — Cancelados BackOffice',            cor:'#1e293b' },
  { key:'m0',           num:0,   label:'0 — Não classificado',                 cor:'#334155' },
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
  const [rawBase,   setRawBase]   = useState(null); const [dfBase,   setDfBase]   = useState(null); const [nBase,   setNBase]   = useState('')
  const [rawFin,    setRawFin]    = useState(null); const [dfFin,    setDfFin]    = useState(null); const [nFin,    setNFin]    = useState('')
  const [rawRec,    setRawRec]    = useState(null); const [dfRec,    setDfRec]    = useState(null); const [nRec,    setNRec]    = useState('')
  const [rawStatus, setRawStatus] = useState(null); const [dfStatus, setDfStatus] = useState(null); const [nStatus, setNStatus] = useState('')

  const [mapperOpen, setMapperOpen] = useState(false)
  const [mapperFor,  setMapperFor]  = useState(null)
  const [mapperRaw,  setMapperRaw]  = useState([])

  const [res,  setRes]  = useState(null)
  const [aba,  setAba]  = useState('m1')
  const [proc, setProc] = useState(false)

  const limpar = () => {
    setRawBase(null);   setDfBase(null);   setNBase('')
    setRawFin(null);    setDfFin(null);    setNFin('')
    setRawRec(null);    setDfRec(null);    setNRec('')
    setRawStatus(null); setDfStatus(null); setNStatus('')
    setRes(null); setAba('m1')
  }

  const abrirMapper = (key, raw) => { setMapperFor(key); setMapperRaw(raw); setMapperOpen(true) }

  const handleFile = (rawSetter, nameSetter, mapperKey) => async file => {
    try {
      const rows = await lerXlsx(file)
      rawSetter(rows); nameSetter(file.name); setRes(null)
      abrirMapper(mapperKey, rows)
    } catch (e) { alert('Erro ao ler arquivo: ' + e.message) }
  }

  const handleMapperConfirm = remapped => {
    setMapperOpen(false)
    if (mapperFor === 'base')   setDfBase(remapped)
    if (mapperFor === 'fin')    setDfFin(remapped)
    if (mapperFor === 'rec')    setDfRec(remapped)
    if (mapperFor === 'status') setDfStatus(remapped)
  }

  const processar = async () => {
    if (!dfBase || !dfFin || !dfRec || !dfStatus) return
    setProc(true)
    await new Promise(r => setTimeout(r, 50))
    try {
      const r = classificar(dfBase, dfFin, dfRec, dfStatus)
      setRes(r)
      setAba(MARCACOES.find(m => (r[m.key] || []).length > 0)?.key || 'm1')
    } catch (e) { alert('Erro ao processar: ' + e.message) }
    finally { setProc(false) }
  }

  const pronto = !!dfBase && !!dfFin && !!dfRec && !!dfStatus
  const cfg    = mapperFor ? MAPPER_CFG[mapperFor] : {}

  const Upload = ({ label, sublabel, mapKey, raw, df, name, onFile }) => (
    <div className="relative">
      <UploadBox label={label} sublabel={sublabel} onFile={onFile} loaded={!!df} fileName={name} />
      {df && (
        <button onClick={() => abrirMapper(mapKey, raw)} title="Editar mapeamento de colunas"
          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg border border-acc/30 bg-acc/10 text-acc hover:bg-acc/20 transition-colors z-10">
          <Pencil size={13} />
        </button>
      )}
    </div>
  )

  // Só exibe marcações com dados no resultado
  const marcacoesComDados = res
    ? MARCACOES.filter(m => (res[m.key] || []).length > 0)
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
          mapKey="base"   raw={rawBase}   df={dfBase}   name={nBase}   onFile={handleFile(setRawBase,   setNBase,   'base')}   />
        <Upload label="Base de Finalizados"             sublabel="Clientes enviados à fornecedora"
          mapKey="fin"    raw={rawFin}    df={dfFin}    name={nFin}    onFile={handleFile(setRawFin,    setNFin,    'fin')}    />
        <Upload label="Base de Recebíveis"              sublabel="Filtro: Fornecedora + Em qualquer lugar"
          mapKey="rec"    raw={rawRec}    df={dfRec}    name={nRec}    onFile={handleFile(setRawRec,    setNRec,    'rec')}    />
        <Upload label="Retorno de Status — Fornecedora" sublabel="Observação GV + Status Rateio GV"
          mapKey="status" raw={rawStatus} df={dfStatus} name={nStatus} onFile={handleFile(setRawStatus, setNStatus, 'status')} />
      </div>

      <div className="flex justify-end gap-3">
        {res && (
          <>
            <Button variant="ghost" onClick={limpar}><RotateCcw size={14} /> Nova Conciliação</Button>
            <Button variant="ghost" onClick={() => exportarConciliacao(res, fornecedora)}><Download size={14} /> Exportar Excel</Button>
          </>
        )}
        {!res && (
          <Button variant="primary" onClick={processar} disabled={!pronto || proc}>
            <Play size={14} />{proc ? 'Processando…' : 'Processar Conciliação'}
          </Button>
        )}
      </div>

      {res && (
        <div className="space-y-4">

          {/* Cards de resultado */}
          <div className="grid grid-cols-4 gap-3">
            {marcacoesComDados.map(m => (
              <MetricCard
                key={m.key}
                label={m.label}
                value={(res[m.key] || []).length}
                sub={`${Math.round((res[m.key] || []).length / res.total * 100)}% do total`}
                color={m.cor}
                onClick={() => setAba(m.key)}
              />
            ))}
          </div>

          {/* Tabela */}
          <div className="bg-s1 border border-bd rounded-xl overflow-hidden">
            <div className="px-5 pt-5">
              <TabBar
                abas={marcacoesComDados.map(m => ({ ...m, count: (res[m.key] || []).length }))}
                abaAtiva={aba}
                onTab={setAba}
              />
            </div>
            <div className="px-5 pb-5">
              <DataTable rows={res[aba] || []} />
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
