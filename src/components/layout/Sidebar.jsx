import { ChevronRight, BarChart2, TrendingUp, Home } from 'lucide-react'
import { useApp } from '../../context/AppContext'

const MENU = [
  { id: 'home', label: 'Visão Geral', icon: Home, type: 'item' },
  { type: 'divider' },
  { id: 'conciliacao', label: 'Conciliação de Base', icon: BarChart2, type: 'group', children: [
    { id: 'base-gv',    label: 'GV' },
    { id: 'base-sunne', label: 'SUNNE' },
    { id: 'base-edp',   label: 'EDP' },
  ]},
  { id: 'financeiro', label: 'Operações Financeiras', icon: TrendingUp, type: 'group', children: [
    { id: 'faturamento', label: 'Pagadoria' },
  ]},
]

export function Sidebar() {
  const { currentPage, navigate, openGroups, toggleGroup } = useApp()

  return (
    <aside className="w-[220px] flex-shrink-0 bg-s1 border-r border-bd flex flex-col h-screen sticky top-0">

      <div className="px-5 py-5 border-b border-bd flex items-center gap-3">
        <div className="w-8 h-8 bg-acc rounded-lg flex items-center justify-center text-xs font-bold text-black">iG</div>
        <div>
          <div className="text-sm font-bold text-tx">iGreen</div>
          <div className="text-[10px] text-tx3">Painel Operacional</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {MENU.map((item, i) => {
          if (item.type === 'divider') return <div key={i} className="h-px bg-bd mx-4 my-2" />

          if (item.type === 'item') {
            const Icon = item.icon
            const isActive = currentPage === item.id
            return (
              <button key={item.id} onClick={() => navigate(item.id)}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium transition-all border-l-[3px]
                  ${isActive ? 'bg-acc/10 text-acc border-acc' : 'text-tx2 border-transparent hover:bg-white/5 hover:text-tx'}`}>
                <Icon size={15} className="flex-shrink-0 opacity-80" />
                {item.label}
              </button>
            )
          }

          if (item.type === 'group') {
            const Icon = item.icon
            const isOpen = openGroups[item.id]
            const hasActiveChild = item.children?.some(c => c.id === currentPage)
            return (
              <div key={item.id}>
                <button onClick={() => toggleGroup(item.id)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium transition-all border-l-[3px]
                    ${hasActiveChild ? 'text-tx border-acc/50' : 'text-tx2 border-transparent hover:text-tx hover:bg-white/5'}`}>
                  <Icon size={15} className="flex-shrink-0 opacity-70" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronRight size={14} className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                </button>
                {isOpen && (
                  <div className="pl-9 pr-3 pb-1">
                    {item.children?.map(child => {
                      const isActive = currentPage === child.id
                      return (
                        <button key={child.id} onClick={() => navigate(child.id)}
                          className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-all mb-0.5
                            ${isActive ? 'bg-acc/15 text-acc font-semibold' : 'text-tx3 hover:text-tx hover:bg-white/5'}`}>
                          {child.label}
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

      <div className="px-4 py-4 border-t border-bd">
        <div className="text-xs text-tx3">Lucas Coutinho</div>
        <div className="text-[10px] text-tx3/70 mt-0.5">iGreen Energy</div>
      </div>
    </aside>
  )
}
