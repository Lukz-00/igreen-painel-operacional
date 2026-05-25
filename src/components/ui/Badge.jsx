export function Badge({ children, color='gray' }) {
  const colors = {
    green:  'bg-acc/10 text-acc border border-acc/20',
    red:    'bg-danger/10 text-danger border border-danger/20',
    yellow: 'bg-warn/10 text-warn border border-warn/20',
    blue:   'bg-info/10 text-info border border-info/20',
    purple: 'bg-purple/10 text-purple border border-purple/20',
    orange: 'bg-orange/10 text-orange border border-orange/20',
    gray:   'bg-s3 text-tx2 border border-bd2',
  }
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-current ${colors[color]||colors.gray}`}>
      {children}
    </span>
  )
}