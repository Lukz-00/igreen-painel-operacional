export function MetricCard({ label, value, sub, color='#22c55e', onClick, active=false }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`group relative overflow-hidden rounded-xl border bg-s1 p-4 transition-all ${
        onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:border-bd2 hover:shadow-lift' : ''
      } ${active ? 'border-acc/50 ring-2 ring-acc/20' : 'border-bd'}`}
    >
      <div className="absolute inset-y-3 left-0 w-1 rounded-r-full" style={{ background: color }} />
      <div className="mb-2.5 pl-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-tx3">{label}</div>
      <div className="pl-2 text-[28px] font-bold leading-none tracking-tight" style={{ color }}>
        {value?.toLocaleString('pt-BR') ?? '-'}
      </div>
      {sub && <div className="mt-2 pl-2 text-[11px] leading-snug text-tx3">{sub}</div>}
    </div>
  )
}
