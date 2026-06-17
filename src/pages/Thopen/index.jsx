import { useState } from 'react'
import * as XLSX from 'xlsx'
import { Play, Download } from 'lucide-react'
import { UploadBox } from '../../components/ui/UploadBox'
import { MetricCard } from '../../components/ui/MetricCard'
import { DataTable } from '../../components/ui/DataTable'
import { TabBar } from '../../components/ui/TabBar'
import { Button } from '../../components/ui/Button'
import { normalizarRows } from '../../utils/normalizadores'

function parseDias(v) {
  if (!v || String(v).trim()==='' || String(v).trim()==='N/D') return null
  if (v instanceof Date && !isNaN(v)) return Math.floor((Date.now()-v.getTime())/86400000)
  const s = String(v).trim()
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (m) { const d=new Date(+m[3],+m[2]-1,+m[1]); if(!isNaN(d.getTime())) return Math.floor((Date.now()-d.getTime())/86400000) }
  m = s.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})/)
  if (m) { const d=new Date(+m[1],+m[2]-1,+m[3]); if(!isNaN(d.getTime())) return Math.floor((Date.now()-d.getTime())/86400000) }
  const n=parseFloat(s); if(!isNaN(n)&&n>30000) { const d=new Date((n-25569)*86400*1000); return Math.floor((Date.now()-d.getTime())/86400000) }
  return null
}

function lerXlsx(file) {
  return new Promise((resolve,reject)=>{
    const r=new FileReader()
    r.onload=e=>{try{const wb=XLSX.read(e.target.result,{type:'array',cellDates:true});resolve(normalizarRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''})))}catch(err){reject(err)}}
    r.onerror=reject; r.readAsArrayBuffer(file)
  })
}

function classificar(cmr, ti) {
  const PRAZO=90
  const n=s=>String(s||'').trim().toUpperCase()
  const hCmr=Object.keys(cmr[0]||{})
  const hTi=Object.keys(ti[0]||{})
  const keyCmr=hCmr.find(k=>/INSTALAC|INSTAL/i.test(k))||hCmr.find(k=>/CODIGO|COD\b/i.test(k))||hCmr[0]||''
  const keyTi=hTi.find(k=>/INSTALAC|INSTAL/i.test(k))||hTi.find(k=>/CODIGO|COD\b/i.test(k))||hTi[0]||''
  const colQtd=hTi.find(k=>/BOLETO/i.test(k)&&/QTD|QUANT|TOTAL/i.test(k))||hTi.find(k=>/BOLETO/i.test(k))||''
  const colData=hTi.find(k=>/ATIVO/i.test(k)&&/DATA|DT/i.test(k))||hTi.find(k=>/DATA/i.test(k))||''
  const mapQtd={},mapData={}
  ti.forEach(r=>{const k=n(r[keyTi]||'');if(!k)return;mapQtd[k]=colQtd?parseInt(String(r[colQtd]||'0').replace(/[^0-9]/g,''))||0:0;if(colData)mapData[k]=r[colData]||''})
  const emAtraso=[],dentroPrazo=[],semData=[],semBoletos=[]
  cmr.forEach(row=>{
    const k=n(row[keyCmr]||'')
    const qtd=mapQtd.hasOwnProperty(k)?mapQtd[k]:null
    if(qtd!==null&&qtd>0) return
    const dataRaw=mapData[k]||''
    const dias=parseDias(dataRaw)
    const rec={...row,'Qtd. Boletos':qtd===null?'Não encontrado':qtd,'Data Ativo':dataRaw}
    if(dias===null){rec['Classificacao']='SEM DATA ATIVO';semData.push(rec);semBoletos.push({...rec});return}
    const atraso=dias-PRAZO
    rec['Dias desde Data Ativo']=dias;rec['Dias em Atraso']=atraso
    if(atraso>=1){rec['Classificacao']='EM ATRASO';emAtraso.push(rec)}
    else{rec['Classificacao']='DENTRO DO PRAZO';dentroPrazo.push(rec)}
    semBoletos.push({...rec})
  })
  return{emAtraso,dentroPrazo,semBoletos,semData,total:cmr.length}
}

const ABAS=[
  {key:'emAtraso',    label:'Em Atraso',       cor:'#ef4444'},
  {key:'dentroPrazo', label:'Dentro do Prazo', cor:'#22c55e'},
  {key:'semBoletos',  label:'Sem Boletos',      cor:'#f59e0b'},
  {key:'semData',     label:'Sem Data Ativo',   cor:'#64748b'},
]

export function Thopen() {
  const [cmr,setCmr]=useState(null);const [ti,setTi]=useState(null)
  const [nCmr,setNCmr]=useState('');const [nTi,setNTi]=useState('')
  const [res,setRes]=useState(null);const [aba,setAba]=useState('emAtraso')
  const [proc,setProc]=useState(false)

  const load=(setter,setName)=>async file=>{try{setter(await lerXlsx(file));setName(file.name)}catch(e){alert('Erro: '+e.message)}}
  const processar=async()=>{
    if(!cmr||!ti)return;setProc(true)
    await new Promise(r=>setTimeout(r,50))
    try{const r=classificar(cmr,ti);setRes(r);setAba(ABAS.find(a=>(r[a.key]||[]).length>0)?.key||'emAtraso')}
    catch(e){alert('Erro: '+e.message)}finally{setProc(false)}
  }

  return (
    <div className="p-7 space-y-5">
      <div className="pb-5 border-b border-bd">
        <h1 className="text-xl font-bold text-tx mb-1">Thopen — Atraso de Injeção</h1>
        <p className="text-sm text-tx3">Prazo contratual: 90 dias após Data Ativo. Clientes sem boleto acima do prazo = Em Atraso.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <UploadBox label="CMR Thopen" sublabel="Base de clientes do CMR" onFile={load(setCmr,setNCmr)} loaded={!!cmr} fileName={nCmr} />
        <UploadBox label="Base TI (Qtd. Boletos)" sublabel="Solicitada ao TI via ClickUp" onFile={load(setTi,setNTi)} loaded={!!ti} fileName={nTi} />
      </div>
      <div className="flex justify-end">
        <Button variant="primary" onClick={processar} disabled={!cmr||!ti||proc}><Play size={14}/>{proc?'Processando…':'Processar Análise'}</Button>
      </div>
      {res && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            {ABAS.map(a=><MetricCard key={a.key} label={a.label} value={(res[a.key]||[]).length} sub={`${res.total>0?Math.round((res[a.key]||[]).length/res.total*100):0}% do total`} color={a.cor} onClick={()=>setAba(a.key)}/>)}
          </div>
          <div className="bg-s1 border border-bd rounded-xl overflow-hidden">
            <div className="px-5 pt-5"><TabBar abas={ABAS.map(a=>({...a,count:(res[a.key]||[]).length}))} abaAtiva={aba} onTab={setAba}/></div>
            <div className="px-5 pb-5"><DataTable rows={res[aba]||[]}/></div>
          </div>
        </div>
      )}
    </div>
  )
}