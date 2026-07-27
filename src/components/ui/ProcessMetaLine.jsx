export function ProcessMetaLine({ meta }) {
  if (!meta) return null

  const items = [
    meta.processing_seconds != null ? `Tempo: ${meta.processing_seconds}s` : null,
    meta.input_total_size_label ? `Arquivos: ${meta.input_total_size_label}` : null,
    meta.engine ? `Motor: ${meta.engine}` : null,
  ].filter(Boolean)

  if (!items.length) return null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-bd bg-s1 px-3 py-2 text-[11px] text-tx3">
      {items.map((item, index) => (
        <span key={item} className="flex items-center gap-3">
          {index > 0 && <span className="hidden h-1 w-1 rounded-full bg-bd sm:inline-block" />}
          {item}
        </span>
      ))}
    </div>
  )
}
