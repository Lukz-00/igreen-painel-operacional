import { useApp } from '../../context/AppContext'

const TITULOS = {
  home:          { bc:'Início',                titulo:'Visão Geral' },
  faturamento:   { bc:'Operações Financeiras', titulo:'Cruzamento Pagadoria × Recebíveis' },
  'ivolt-gv':    { bc:'Conciliação de Base',   titulo:'GV' },
  'ivolt-sunne': { bc:'Conciliação de Base',   titulo:'SUNNE' },
  'ivolt-edp':   { bc:'Conciliação de Base',   titulo:'EDP' },
}

export function Topbar() {
  const { paginaAtual } = useApp()
  const info = TITULOS[paginaAtual] || { bc:'', titulo:paginaAtual }

  return (
    <div className="bg-s1 border-b border-bd h-14 flex items-center px-7 gap-3 sticky top-0 z-40 flex-shrink-0">
      {info.bc && <span className="text-xs text-tx3">{info.bc}</span>}
      {info.bc && <span className="text-bd2">›</span>}
      <span className="text-[15px] font-semibold text-tx">{info.titulo}</span>
      <div className="ml-auto text-[11px] text-tx3 font-mono">
        {new Date().toLocaleDateString('pt-BR',{weekday:'short',day:'numeric',month:'short'})}
      </div>
    </div>
  )
}