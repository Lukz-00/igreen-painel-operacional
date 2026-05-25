export function LogPanel({ logs=[] }) {
  if (!logs.length) return null
  const colors = { ok:'text-acc', warn:'text-warn', err:'text-danger', info:'text-tx2' }
  return (
    <div className="bg-s1 border border-bd rounded-xl p-4 max-h-48 overflow-y-auto">
      <div className="text-[10px] font-bold uppercase tracking-wider text-tx3 mb-2">Log de Execução</div>
      {logs.map((l,i)=>(
        <div key={i} className={`text-xs font-mono mb-0.5 ${colors[l.tipo]||colors.info}`}>
          <span className="text-tx3">[{l.hora}]</span> {l.tipo==='ok'?'✓':l.tipo==='warn'?'⚠':l.tipo==='err'?'❌':''} {l.msg}
        </div>
      ))}
    </div>
  )
}