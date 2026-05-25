import { useState, useRef } from 'react'
import { Upload, Pencil } from 'lucide-react'

export function UploadBox({ label, sublabel, onFile, loaded, fileName, onReabrir }) {
  const [drag, setDrag] = useState(false)
  const ref = useRef()

  const handle = file => { if(file) onFile(file) }

  return (
    <div className="relative">
      <div
        onClick={() => ref.current?.click()}
        onDragOver={e=>{e.preventDefault();setDrag(true)}}
        onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);handle(e.dataTransfer.files[0])}}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all
          ${drag?'border-acc bg-acc/10':'border-bd2 bg-s1 hover:border-acc hover:bg-acc/5'}
          ${loaded?'border-solid border-acc bg-acc/10':''}`}>
        <input ref={ref} type="file" accept=".xlsx,.xls,.csv" className="hidden"
          onChange={e=>handle(e.target.files[0])} />
        <div className="w-12 h-12 bg-s3 rounded-xl flex items-center justify-center mx-auto mb-3">
          <Upload size={22} className={loaded?'text-acc':'text-tx3'} />
        </div>
        <div className={`text-sm font-semibold mb-1 ${loaded?'text-acc':'text-tx'}`}>
          {loaded ? fileName : label}
        </div>
        <div className="text-xs text-tx3">{loaded?'Clique para substituir':sublabel}</div>
      </div>
      {loaded && onReabrir && (
        <button onClick={e=>{e.stopPropagation();onReabrir()}}
          title="Editar mapeamento de colunas"
          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg border border-acc/30 bg-acc/10 text-acc hover:bg-acc/20 transition-colors">
          <Pencil size={13} />
        </button>
      )}
    </div>
  )
}