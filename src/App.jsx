import { Suspense, lazy } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import { Sidebar } from './components/layout/Sidebar'
import { Topbar } from './components/layout/Topbar'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { LoadingSquares } from './components/ui/LoadingSquares'

const Home = lazy(() => import('./pages/Home').then(module => ({ default: module.Home })))
const Faturamento = lazy(() => import('./pages/Faturamento').then(module => ({ default: module.Faturamento })))
const ConciliacaoBase = lazy(() => import('./pages/ConciliacaoBase').then(module => ({ default: module.ConciliacaoBase })))
const QualidadeInjecao = lazy(() => import('./pages/QualidadeInjecao').then(module => ({ default: module.QualidadeInjecao })))
const BoletosFaltantes = lazy(() => import('./pages/BoletosFaltantes').then(module => ({ default: module.BoletosFaltantes })))
const Inadimplentes = lazy(() => import('./pages/Inadimplentes').then(module => ({ default: module.Inadimplentes })))
const Atualizacoes = lazy(() => import('./pages/Atualizacoes').then(module => ({ default: module.Atualizacoes })))

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
            <Suspense fallback={<div className="p-7"><LoadingSquares active label="Carregando modulo" /></div>}>
              <Router />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return <AppProvider><Layout /></AppProvider>
}
