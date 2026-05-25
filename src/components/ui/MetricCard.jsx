export function MetricCard({ label, value, sub, color='#22c55e', onClick }) {
  return (
    <div onClick={onClick}
      className="bg-s1 border border-bd rounded-xl p-4 relative overflow-hidden cursor-pointer hover:border-bd2 transition-colors">
      <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ background: color }} />
      <div className="text-[10px] font-semibold uppercase tracking-widest text-tx3 mb-2.5">{label}</div>
      <div className="text-[28px] font-bold leading-none tracking-tight" style={{ color }}>{value?.toLocaleString('pt-BR')??'—'}</div>
      {sub && <div className="text-[11px] text-tx3 mt-1.5">{sub}</div>}
    </div>
  )
}