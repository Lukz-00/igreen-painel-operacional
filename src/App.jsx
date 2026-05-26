import { AppProvider, useApp } from './context/AppContext'
import { Sidebar } from './components/layout/Sidebar'
import { Topbar } from './components/layout/Topbar'
import { Home } from './pages/Home'
import { Faturamento } from './pages/Faturamento'
import { ConciliacaoBase } from './pages/ConciliacaoBase'

function Router() {
  const { currentPage } = useApp()
  const pages = {
    home:         <Home />,
    faturamento:  <Faturamento />,
    'base-gv':    <ConciliacaoBase fornecedora="GV" />,
    'base-sunne': <ConciliacaoBase fornecedora="SUNNE" />,
    'base-edp':   <ConciliacaoBase fornecedora="EDP" />,
  }
  return pages[currentPage] ?? <Home />
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
