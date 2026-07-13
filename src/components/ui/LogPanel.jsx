export function LogPanel({ logs=[] }) {
  if (!logs.length) return null
  const colors = { ok:'text-acc', warn:'text-warn', err:'text-danger', info:'text-tx2' }
  const markers = { ok:'OK', warn:'ATENCAO', err:'ERRO', info:'INFO' }

  return (
    <div className="max-h-52 overflow-y-auto rounded-xl border border-bd bg-s1 p-4 shadow-sm">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-tx3">Log de Execucao</div>
      <div className="space-y-1">
        {logs.map((l,i)=>(
          <div key={i} className={`rounded-lg bg-s2/60 px-2.5 py-1.5 text-xs font-mono ${colors[l.tipo]||colors.info}`}>
            <span className="text-tx3">[{l.hora}]</span>{' '}
            <span className="font-sans text-[10px] font-bold tracking-wide">{markers[l.tipo] || markers.info}</span>{' '}
            {l.msg}
          </div>
        ))}
      </div>
    </div>
  )
}
