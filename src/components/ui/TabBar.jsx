export function TabBar({ abas=[], abaAtiva, onTab }) {
  return (
    <div className="flex gap-1 border-b border-bd overflow-x-auto pb-0 mb-5">
      {abas.map(a=>(
        <button key={a.key} onClick={()=>onTab(a.key)}
          className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 -mb-px transition-all flex items-center gap-2
            ${abaAtiva===a.key?'text-acc border-acc':'text-tx3 border-transparent hover:text-tx'}`}>
          {a.label}
          {a.count!=null && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{background:a.cor+'22',color:a.cor}}>
              {a.count.toLocaleString('pt-BR')}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}