import { useApp } from '../context/AppContext'

const CARDS = [
  { id:'faturamento',  emoji:'💰', titulo:'Cruzamento Pagadoria', desc:'Cruze Pagadoria × Recebíveis com cascading join por UC + Mês', cor:'#22c55e' },
  { id:'ivolt-gv',     emoji:'⚡', titulo:'Análise de Injeção',   desc:'Classifique clientes GV, SUNNE e EDP por status de injeção',  cor:'#a855f7' },
  { id:'thopen',       emoji:'🏭', titulo:'Thopen — Atraso',      desc:'Identifique clientes Thopen sem boleto além de 90 dias',       cor:'#3b82f6' },
  { id:'classificador',emoji:'🗺', titulo:'Jornada do Cliente',   desc:'Classifique planilhas nos 8 status da Jornada iGreen',         cor:'#f59e0b' },
  { id:'boletos',      emoji:'📄', titulo:'Central de Boletos',   desc:'Repositório central de boletos de todas as fornecedoras',      cor:'#f97316' },
]

export function Home() {
  const { navegarPara } = useApp()
  return (
    <div className="p-7">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-tx mb-1">Painel Operacional</h1>
        <p className="text-sm text-tx3">Selecione um módulo para começar</p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {CARDS.map(c=>(
          <button key={c.id} onClick={()=>navegarPara(c.id)}
            className="bg-s1 border border-bd rounded-xl p-5 text-left hover:border-bd2 transition-all group">
            <div className="text-3xl mb-3">{c.emoji}</div>
            <div className="text-sm font-semibold text-tx mb-1 group-hover:text-acc transition-colors">{c.titulo}</div>
            <div className="text-xs text-tx3 leading-relaxed">{c.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}