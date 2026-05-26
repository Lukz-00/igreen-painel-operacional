import { useApp } from '../context/AppContext'

const MODULES = [
  {
    id:          'faturamento',
    title:       'Pagadoria × Recebíveis',
    description: 'Cruzamento entre Pagadoria e Recebíveis por UC e mês de referência.',
    color:       '#22c55e',
  },
  {
    id:          'base-gv',
    title:       'Conciliação de Base',
    description: 'Classificação de clientes GV, SUNNE e EDP conforme as marcações do POP 03.',
    color:       '#a855f7',
  },
]

export function Home() {
  const { navigate } = useApp()
  return (
    <div className="p-7">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-tx mb-1">Painel Operacional</h1>
        <p className="text-sm text-tx3">Selecione um módulo para continuar.</p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {MODULES.map(m => (
          <button key={m.id} onClick={() => navigate(m.id)}
            className="bg-s1 border border-bd rounded-xl p-5 text-left hover:border-bd2 transition-all group relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ background: m.color }} />
            <div className="text-sm font-semibold text-tx mb-1 mt-3 group-hover:text-acc transition-colors">{m.title}</div>
            <div className="text-xs text-tx3 leading-relaxed">{m.description}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
