export function TabBar({ abas=[], abaAtiva, onTab }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-bd pb-0">
      {abas.map(a=>(
        <button key={a.key} onClick={()=>onTab(a.key)}
          type="button"
          className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-xs font-semibold transition-all
            ${abaAtiva===a.key?'border-acc text-acc':'border-transparent text-tx3 hover:bg-s2 hover:text-tx'}`}>
          {a.label}
          {a.count!=null && (
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
              style={{background:a.cor+'22',color:a.cor}}>
              {a.count.toLocaleString('pt-BR')}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
