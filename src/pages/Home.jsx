import { AlertTriangle, BarChart3, FileSearch, RefreshCcw, ReceiptText, TrendingUp } from 'lucide-react'
import { useApp } from '../context/AppContext'

const CARDS = [
  {
    id: 'faturamento',
    icon: ReceiptText,
    titulo: 'Cruzamento Pagadoria',
    desc: 'Concilie Pagadoria e Recebiveis com fallback por UC, cliente e competencia.',
    cor: '#22c55e',
  },
  {
    id: 'inadimplentes',
    icon: AlertTriangle,
    titulo: 'Inadimplentes',
    desc: 'Separe inadimplencia, atraso de faturamento, erro interno e backoffice tardio.',
    cor: '#ef4444',
  },
  {
    id: 'atualizacoes',
    icon: RefreshCcw,
    titulo: 'Atualizacoes',
    desc: 'Monte a planilha de boletos atualizados com campos criticos preenchidos.',
    cor: '#3b82f6',
  },
  {
    id: 'boletos-faltantes',
    icon: FileSearch,
    titulo: 'Boletos Faltantes',
    desc: 'Encontre lacunas de boletos por cliente, UC e mes de referencia.',
    cor: '#f59e0b',
  },
  {
    id: 'qualidade-injecao',
    icon: BarChart3,
    titulo: 'Qualidade de Injecao',
    desc: 'Analise indice estimado por UC e valide inconsistencias de energia compensada.',
    cor: '#a855f7',
  },
  {
    id: 'ivolt-gv',
    icon: TrendingUp,
    titulo: 'Conciliacao de Base',
    desc: 'Classifique bases GV, SUNNE, EDP e Sunclick conforme regras operacionais.',
    cor: '#06b6d4',
  },
]

export function Home() {
  const { navegarPara } = useApp()

  return (
    <div className="p-7">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-bd pb-6">
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-acc">Painel iGreen</p>
          <h1 className="m-0 text-3xl font-bold tracking-tight text-tx">Operacoes em um so lugar</h1>
          <p className="mt-2 max-w-2xl text-sm text-tx3">
            Acesse os cruzamentos financeiros, conciliacoes e auditorias sem sair do fluxo principal.
          </p>
        </div>
        <div className="rounded-xl border border-bd bg-s1 px-4 py-3 text-right shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-tx3">Workspace</div>
          <div className="mt-0.5 text-sm font-semibold text-tx">Operacoes Financeiras</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {CARDS.map(c => {
          const Icon = c.icon
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => navegarPara(c.id)}
              className="group rounded-xl border border-bd bg-s1 p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-bd2 hover:bg-s2 hover:shadow-lift"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-bd bg-s3" style={{ color: c.cor }}>
                  <Icon size={19} />
                </div>
                <span className="h-2 w-2 rounded-full" style={{ background: c.cor }} />
              </div>
              <div className="mb-1 text-sm font-semibold text-tx transition-colors group-hover:text-acc">{c.titulo}</div>
              <div className="text-xs leading-relaxed text-tx3">{c.desc}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
