// iGreen — Normalizadores compartilhados

export function normUC(v) {
  const d = String(v || '').replace(/[^0-9]/g, '')
  return d ? (d.replace(/^0+/, '') || '0') : ''
}

export function normalizarMes(v) {
  if (!v || !String(v).trim() || String(v).trim() === '—') return ''
  const s = String(v).trim()
  const PT = {JAN:'01',FEV:'02',MAR:'03',ABR:'04',MAI:'05',JUN:'06',
               JUL:'07',AGO:'08',SET:'09',OUT:'10',NOV:'11',DEZ:'12'}
  const mPt = s.match(/^([A-Za-z]{3})[/\-.](\d{4})$/)
  if (mPt) { const m=PT[mPt[1].toUpperCase()]; if(m) return mPt[2]+'-'+m }
  const mIso = s.match(/^(\d{4})-(\d{2})(?:-\d{2})?/)
  if (mIso) return mIso[1]+'-'+mIso[2]
  const mBr1 = s.match(/^\d{2}\/(\d{2})\/(\d{4})/)
  if (mBr1) return mBr1[2]+'-'+mBr1[1]
  const mBr2 = s.match(/^(\d{2})\/(\d{4})$/)
  if (mBr2) return mBr2[2]+'-'+mBr2[1]
  return ''
}

export function fmtData(v) {
  if (!v || String(v).trim()==='—') return '—'
  if (v instanceof Date) {
    return `${String(v.getDate()).padStart(2,'0')}/${String(v.getMonth()+1).padStart(2,'0')}/${v.getFullYear()}`
  }
  const s = String(v).trim()
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  return s.substring(0,10)
}

export function fmtValor(v) {
  if (!v && v!==0) return '—'
  const n = parseFloat(String(v).replace(/[^0-9,.\-]/g,'').replace(',','.'))
  if (isNaN(n)) return String(v)
  return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})
}

const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim()

export function getField(row, aliases) {
  const keys = Object.keys(row)
  for (const n of aliases) {
    let k = keys.find(k => norm(k)===norm(n))
    if (!k) k = keys.find(k => norm(k).includes(norm(n)))
    if (k !== undefined) { const v=row[k]; if(v==null||v==='') return ''; return String(v).trim() }
  }
  return ''
}

export function normalizarRows(raw) {
  return raw.map(row => {
    const o = {}
    for (const [k,v] of Object.entries(row)) {
      if (v instanceof Date) {
        o[k] = `${String(v.getDate()).padStart(2,'0')}/${String(v.getMonth()+1).padStart(2,'0')}/${v.getFullYear()}`
      } else if (typeof v==='string') {
        const iso=v.match(/^(\d{4})-(\d{2})-(\d{2})/)
        if(iso){o[k]=`${iso[3]}/${iso[2]}/${iso[1]}`;continue}
        o[k]=v
      } else if(typeof v==='number'){o[k]=String(v)}
      else{o[k]=v==null?'':v}
    }
    return o
  })
}