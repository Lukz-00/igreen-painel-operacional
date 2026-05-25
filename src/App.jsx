import { AppProvider, useApp } from './context/AppContext'
import { Sidebar } from './components/layout/Sidebar'
import { Topbar } from './components/layout/Topbar'
import { Home } from './pages/Home'
import { Faturamento } from './pages/Faturamento'
import { Thopen } from './pages/Thopen'
import { Jornada } from './pages/Jornada'
import { Boletos } from './pages/Boletos'
import { ConciliacaoBase } from './pages/ConciliacaoBase'

function Router() {
  const { paginaAtual } = useApp()
  const pages = {
    home: <Home />,
    faturamento: <Faturamento />,
    thopen: <Thopen />,
    'ivolt-gv':    <ConciliacaoBase fornecedora="GV" />,
    'ivolt-sunne': <ConciliacaoBase fornecedora="SUNNE" />,
    'ivolt-edp':   <ConciliacaoBase fornecedora="EDP" />,
    classificador: <Jornada />,
    boletos: <Boletos />,
  }
  return pages[paginaAtual] ?? <Home />
}

function Layout() {
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <Router />
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return <AppProvider><Layout /></AppProvider>
}