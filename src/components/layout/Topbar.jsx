import { useApp } from '../../context/AppContext'

const PAGE_TITLES = {
  home:         { section: 'Início',                title: 'Visão Geral' },
  faturamento:  { section: 'Operações Financeiras', title: 'Pagadoria × Recebíveis' },
  'base-gv':    { section: 'Conciliação de Base',   title: 'GV' },
  'base-sunne': { section: 'Conciliação de Base',   title: 'SUNNE' },
  'base-edp':   { section: 'Conciliação de Base',   title: 'EDP' },
}

export function Topbar() {
  const { currentPage } = useApp()
  const info = PAGE_TITLES[currentPage] || { section: '', title: currentPage }

  return (
    <div className="bg-s1 border-b border-bd h-14 flex items-center px-7 gap-3 sticky top-0 z-40 flex-shrink-0">
      {info.section && <span className="text-xs text-tx3">{info.section}</span>}
      {info.section && <span className="text-bd2">›</span>}
      <span className="text-[15px] font-semibold text-tx">{info.title}</span>
      <div className="ml-auto text-[11px] text-tx3 font-mono">
        {new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })}
      </div>
    </div>
  )
}
