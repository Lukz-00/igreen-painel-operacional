import { BarChart2, ChevronRight, Home, Leaf, TrendingUp } from 'lucide-react'
import { useApp } from '../../context/AppContext'

const MENU = [
  { id: 'home', label: 'Visao Geral', icon: Home, tipo: 'item' },
  { tipo: 'divider' },
  {
    id: 'injecao',
    label: 'Conciliacao de Base',
    icon: BarChart2,
    tipo: 'grupo',
    filhos: [
      { id: 'ivolt-gv', label: 'GV' },
      { id: 'ivolt-sunne', label: 'SUNNE' },
      { id: 'ivolt-edp', label: 'EDP' },
      { id: 'ivolt-sunclick', label: 'Sunclick' },
    ],
  },
  {
    id: 'financeiro',
    label: 'Operacoes Financeiras',
    icon: TrendingUp,
    tipo: 'grupo',
    filhos: [
      { id: 'faturamento', label: 'Pagadoria' },
      { id: 'atualizacoes', label: 'Atualizacoes', sub: 'Boletos atualizados' },
      { id: 'inadimplentes', label: 'Inadimplentes', sub: 'Vencidos x atraso faturamento' },
      { id: 'boletos-faltantes', label: 'Boletos Faltantes', sub: 'Lacunas por UC e mes' },
      { id: 'qualidade-injecao', label: 'Qualidade de Injecao', sub: 'Indice por UC e mes' },
    ],
  },
]

export function Sidebar() {
  const { paginaAtual, navegarPara, sidebarAberto, toggleGrupo } = useApp()

  return (
    <aside className="sticky top-0 flex h-screen w-[252px] flex-shrink-0 flex-col border-r border-bd bg-s1/95">
      <div className="flex items-center gap-3 border-b border-bd px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-acc text-onacc shadow-lift">
          <Leaf size={18} />
        </div>
        <div>
          <div className="text-sm font-bold text-tx">iGreen</div>
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-tx3">Operacional</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {MENU.map((item, i) => {
          if (item.tipo === 'divider') return <div key={i} className="subtle-divider mx-5 my-3 h-px" />

          if (item.tipo === 'item') {
            const Icon = item.icon
            const ativo = paginaAtual === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navegarPara(item.id)}
                aria-current={ativo ? 'page' : undefined}
                className={`mx-3 mb-1 flex w-[calc(100%-1.5rem)] items-center gap-2.5 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-all ${
                  ativo
                    ? 'border-acc/25 bg-acc/10 text-acc shadow-sm'
                    : 'border-transparent text-tx2 hover:border-bd hover:bg-s2 hover:text-tx'
                }`}
              >
                <Icon size={15} className="flex-shrink-0 opacity-80" />
                {item.label}
              </button>
            )
          }

          if (item.tipo === 'grupo') {
            const Icon = item.icon
            const aberto = sidebarAberto[item.id]
            const algumAtivo = item.filhos?.some(f => f.id === paginaAtual)
            return (
              <div key={item.id} className="px-3">
                <button
                  type="button"
                  onClick={() => toggleGrupo(item.id)}
                  className={`mb-1 flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-all ${
                    algumAtivo
                      ? 'border-acc/20 bg-acc/10 text-tx'
                      : 'border-transparent text-tx2 hover:border-bd hover:bg-s2 hover:text-tx'
                  }`}
                >
                  <Icon size={15} className="flex-shrink-0 opacity-70" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronRight size={14} className={`transition-transform ${aberto ? 'rotate-90' : ''}`} />
                </button>

                {aberto && (
                  <div className="mb-2 ml-4 border-l border-bd pl-3">
                    {item.filhos?.map(f => {
                      const ativo = paginaAtual === f.id
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => navegarPara(f.id)}
                          aria-current={ativo ? 'page' : undefined}
                          className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-xs transition-all ${
                            ativo
                              ? 'bg-acc/10 font-semibold text-acc'
                              : 'text-tx3 hover:bg-s2 hover:text-tx'
                          }`}
                        >
                          {f.label}
                          {f.sub && <div className="mt-0.5 text-[10px] font-normal opacity-60">{f.sub}</div>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

          return null
        })}
      </nav>

      <div className="border-t border-bd px-4 py-4">
        <div className="rounded-xl border border-bd bg-s2 px-3 py-3">
          <div className="text-xs font-semibold text-tx">Lucas Coutinho</div>
          <div className="mt-0.5 text-[10px] text-tx3">iGreen Energy - Emile Angelim</div>
        </div>
      </div>
    </aside>
  )
}
