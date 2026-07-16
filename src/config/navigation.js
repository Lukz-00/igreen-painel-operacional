import { BarChart2, Home, TrendingUp } from 'lucide-react'

export const MENU = [
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

export const INITIAL_SIDEBAR_STATE = MENU.reduce((acc, item) => {
  if (item.tipo === 'grupo') acc[item.id] = true
  return acc
}, {})

export const VALID_PAGE_IDS = new Set(
  MENU.flatMap((item) => {
    if (item.tipo === 'item') return [item.id]
    if (item.tipo === 'grupo') return item.filhos?.map((child) => child.id) || []
    return []
  }),
)
