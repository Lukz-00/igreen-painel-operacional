import { useApp } from '../../context/AppContext'

const TITULOS = {
  home: { bc: 'Inicio', titulo: 'Visao Geral' },
  faturamento: { bc: 'Operacoes Financeiras', titulo: 'Cruzamento Pagadoria x Recebiveis' },
  atualizacoes: { bc: 'Operacoes Financeiras', titulo: 'Atualizacoes' },
  inadimplentes: { bc: 'Operacoes Financeiras', titulo: 'Inadimplentes' },
  'boletos-faltantes': { bc: 'Operacoes Financeiras', titulo: 'Boletos Faltantes' },
  'qualidade-injecao': { bc: 'Operacoes Financeiras', titulo: 'Qualidade de Injecao' },
  'ivolt-gv': { bc: 'Conciliacao de Base', titulo: 'GV' },
  'ivolt-sunne': { bc: 'Conciliacao de Base', titulo: 'SUNNE' },
  'ivolt-edp': { bc: 'Conciliacao de Base', titulo: 'EDP' },
}

export function Topbar() {
  const { paginaAtual } = useApp()
  const info = TITULOS[paginaAtual] || { bc: '', titulo: paginaAtual }

  return (
    <div className="bg-s1 border-b border-bd h-14 flex items-center px-7 gap-3 sticky top-0 z-40 flex-shrink-0">
      {info.bc && <span className="text-xs text-tx3">{info.bc}</span>}
      {info.bc && <span className="text-bd2">&gt;</span>}
      <span className="text-[15px] font-semibold text-tx">{info.titulo}</span>
      <div className="ml-auto text-[11px] text-tx3 font-mono">
        {new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })}
      </div>
    </div>
  )
}
