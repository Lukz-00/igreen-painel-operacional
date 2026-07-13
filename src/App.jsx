import { AppProvider, useApp } from './context/AppContext'
import { Sidebar } from './components/layout/Sidebar'
import { Topbar } from './components/layout/Topbar'
import { Home } from './pages/Home'
import { Faturamento } from './pages/Faturamento'
import { ConciliacaoBase } from './pages/ConciliacaoBase'
import { QualidadeInjecao } from './pages/QualidadeInjecao'
import { BoletosFaltantes } from './pages/BoletosFaltantes'
import { Inadimplentes } from './pages/Inadimplentes'
import { Atualizacoes } from './pages/Atualizacoes'
import { ErrorBoundary } from './components/ui/ErrorBoundary'

function Router() {
  const { paginaAtual } = useApp()
  const pages = {
    home: <Home />,
    faturamento: <Faturamento />,
    inadimplentes: <Inadimplentes />,
    atualizacoes: <Atualizacoes />,
    'qualidade-injecao': <QualidadeInjecao />,
    'boletos-faltantes': <BoletosFaltantes />,
    'ivolt-gv':       <ConciliacaoBase fornecedora="GV" />,
    'ivolt-sunne':    <ConciliacaoBase fornecedora="SUNNE" />,
    'ivolt-edp':      <ConciliacaoBase fornecedora="EDP" />,
    'ivolt-sunclick': <ConciliacaoBase fornecedora="Sunclick" />,
  }
  return pages[paginaAtual] ?? <Home />
}

function Layout() {
  return (
    <div className="app-surface flex min-h-screen bg-bg text-tx">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <ErrorBoundary>
            <Router />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return <AppProvider><Layout /></AppProvider>
}
