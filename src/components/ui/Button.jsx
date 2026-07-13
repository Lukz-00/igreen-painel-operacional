export function Button({ children, onClick, variant='default', size='md', disabled, className='' }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg border font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
  const sizes = { sm:'text-xs px-3 py-1.5', md:'text-sm px-4 py-2', lg:'text-sm px-6 py-2.5' }
  const variants = {
    default: 'bg-s1 border-bd text-tx2 shadow-sm hover:border-bd2 hover:bg-s2 hover:text-tx',
    primary: 'bg-acc border-transparent text-onacc shadow-lift hover:bg-acc/90',
    danger:  'bg-danger/10 border-danger/25 text-danger hover:bg-danger/20',
    ghost:   'bg-transparent border-transparent text-tx2 hover:bg-s2 hover:text-tx',
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </button>
  )
}
