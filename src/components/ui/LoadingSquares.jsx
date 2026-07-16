export function LoadingSquares({ active, label = 'Processando' }) {
  if (!active) return null

  return (
    <div role="status" aria-live="polite" className="rounded-xl border border-acc/25 bg-acc/10 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-4 items-center gap-1" aria-hidden="true">
          {Array.from({ length: 22 }).map((_, index) => (
            <span
              key={index}
              className="h-2.5 w-2.5 rounded-[2px] bg-acc animate-pulse"
              style={{ animationDelay: `${index * 70}ms` }}
            />
          ))}
        </div>
        <span className="text-xs font-semibold text-tx2">{label}</span>
      </div>
    </div>
  )
}
