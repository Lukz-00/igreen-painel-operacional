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
        className={`min-h-[152px] rounded-xl border border-dashed p-5 text-center cursor-pointer transition-all
          ${drag?'border-acc bg-acc/10 shadow-lift':'border-bd bg-s1 hover:border-acc/60 hover:bg-s2'}
          ${loaded?'border-solid border-acc/40 bg-acc/10':''}`}>
        <input ref={ref} type="file" accept=".xlsx,.xls,.csv" className="hidden"
          onChange={e=>handle(e.target.files[0])} />
        <div className="w-12 h-12 bg-s3 rounded-xl flex items-center justify-center mx-auto mb-3 ring-1 ring-bd">
          <Upload size={22} className={loaded?'text-acc':'text-tx3'} />
        </div>
        <div className={`mx-auto mb-1 max-w-full break-words text-sm font-semibold leading-snug ${loaded?'text-acc':'text-tx'}`}>
          {loaded ? fileName : label}
        </div>
        <div className="mx-auto max-w-[220px] text-xs leading-relaxed text-tx3">{loaded?'Clique para substituir':sublabel}</div>
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
