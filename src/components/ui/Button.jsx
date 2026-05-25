export function Button({ children, onClick, variant='default', size='md', disabled, className='' }) {
  const base = 'inline-flex items-center gap-2 font-medium rounded-[10px] transition-all cursor-pointer border disabled:opacity-50 disabled:cursor-not-allowed'
  const sizes = { sm:'text-xs px-3 py-1.5', md:'text-sm px-4 py-2', lg:'text-sm px-6 py-2.5' }
  const variants = {
    default: 'bg-transparent border-bd2 text-tx2 hover:bg-s2 hover:text-tx',
    primary: 'bg-acc border-transparent text-black font-bold hover:bg-green-400',
    danger:  'bg-transparent border-danger/30 text-danger hover:bg-danger/10',
    ghost:   'bg-transparent border-transparent text-tx2 hover:text-tx',
  }
  return (
    <button onClick={onClick} disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </button>
  )
}