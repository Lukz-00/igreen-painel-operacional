import { ChevronRight, Search, BarChart2, Zap, Briefcase, TrendingUp, Users, FileText, Home } from 'lucide-react'
import { useApp } from '../../context/AppContext'

const MENU = [
  { id:'home', label:'Visão Geral', icon:Home, tipo:'item' },
  { tipo:'divider' },
  { id:'injecao', label:'Conciliação de Base', icon:BarChart2, tipo:'grupo', filhos:[
    { id:'ivolt-gv',    label:'GV' },
    { id:'ivolt-sunne', label:'SUNNE' },
    { id:'ivolt-edp',   label:'EDP' },
  ]},
  { id:'energizada', label:'Gestão Energizada', icon:Zap, tipo:'grupo', filhos:[
    { id:'thopen', label:'Thopen — Atraso' },
  ]},
  { id:'financeiro', label:'Operações Financeiras', icon:TrendingUp, tipo:'grupo', filhos:[
    { id:'faturamento', label:'Pagadoria' },
  ]},
  { id:'jornada', label:'Jornada do Cliente', icon:Users, tipo:'grupo', filhos:[
    { id:'classificador', label:'Classificador de Status' },
  ]},
  { tipo:'divider' },
  { id:'boletos', label:'Central de Boletos', icon:FileText, tipo:'item' },
]

export function Sidebar() {
  const { paginaAtual, navegarPara, sidebarAberto, toggleGrupo } = useApp()

  return (
    <aside className="w-[220px] flex-shrink-0 bg-s1 border-r border-bd flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-bd flex items-center gap-3">
        <div className="w-8 h-8 bg-acc rounded-lg flex items-center justify-center text-xs font-bold text-black">iG</div>
        <div>
          <div className="text-sm font-bold text-tx">iGreen</div>
          <div className="text-[10px] text-tx3">Painel Operacional</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        {MENU.map((item, i) => {
          if (item.tipo==='divider') return <div key={i} className="h-px bg-bd mx-4 my-2" />

          if (item.tipo==='item') {
            const Icon = item.icon
            const ativo = paginaAtual === item.id
            return (
              <button key={item.id} onClick={()=>navegarPara(item.id)}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium transition-all border-l-[3px]
                  ${ativo?'bg-acc/10 text-acc border-acc':'text-tx2 border-transparent hover:bg-white/5 hover:text-tx'}`}>
                <Icon size={15} className="flex-shrink-0 opacity-80" />
                {item.label}
              </button>
            )
          }

          if (item.tipo==='grupo') {
            const Icon = item.icon
            const aberto = sidebarAberto[item.id]
            const algumAtivo = item.filhos?.some(f=>f.id===paginaAtual)
            return (
              <div key={item.id}>
                <button onClick={()=>toggleGrupo(item.id)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium transition-all border-l-[3px]
                    ${algumAtivo?'text-tx border-acc/50':'text-tx2 border-transparent hover:text-tx hover:bg-white/5'}`}>
                  <Icon size={15} className="flex-shrink-0 opacity-70" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronRight size={14} className={`transition-transform ${aberto?'rotate-90':''}`} />
                </button>
                {aberto && (
                  <div className="pl-9 pr-3 pb-1">
                    {item.filhos?.map(f=>{
                      const ativo = paginaAtual===f.id
                      return (
                        <button key={f.id} onClick={()=>navegarPara(f.id)}
                          className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-all mb-0.5
                            ${ativo?'bg-acc/15 text-acc font-semibold':'text-tx3 hover:text-tx hover:bg-white/5'}`}>
                          {f.label}
                          {f.sub && <div className="text-[10px] opacity-60 font-normal mt-0.5">{f.sub}</div>}
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

      {/* Footer */}
      <div className="px-4 py-4 border-t border-bd">
        <div className="text-xs text-tx3">👒 Lucas Coutinho</div>
        <div className="text-[10px] text-tx3/70 mt-0.5">iGreen Energy · Emile Angelim</div>
      </div>
    </aside>
  )
}