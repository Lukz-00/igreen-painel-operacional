import { Moon, Sun } from 'lucide-react'
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
  const { paginaAtual, tema, alternarTema } = useApp()
  const info = TITULOS[paginaAtual] || { bc: '', titulo: paginaAtual }
  const ThemeIcon = tema === 'dark' ? Sun : Moon

  return (
    <div className="sticky top-0 z-40 flex h-16 flex-shrink-0 items-center gap-4 border-b border-bd bg-s1/90 px-7 backdrop-blur">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-tx3">
          {info.bc && <span>{info.bc}</span>}
          {info.bc && <span className="text-bd2">/</span>}
          <span>Operacional</span>
        </div>
        <div className="mt-0.5 truncate text-[15px] font-semibold text-tx">{info.titulo}</div>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="hidden rounded-lg border border-bd bg-s2 px-3 py-1.5 text-[11px] font-medium text-tx3 sm:block">
          {new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })}
        </div>
        <button
          type="button"
          onClick={alternarTema}
          title={tema === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-bd bg-s2 text-tx2 transition-colors hover:border-bd2 hover:bg-s3 hover:text-tx"
        >
          <ThemeIcon size={16} />
        </button>
      </div>
    </div>
  )
}
