import { createContext, useContext, useEffect, useState } from 'react'
import { INITIAL_SIDEBAR_STATE, VALID_PAGE_IDS } from '../config/navigation'

const Ctx = createContext(null)
const DEFAULT_PAGE = 'home'

function getInitialTheme() {
  if (typeof window === 'undefined') return 'light'
  const saved = window.localStorage.getItem('igreen-theme')
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function normalizePage(pagina) {
  return VALID_PAGE_IDS.has(pagina) ? pagina : DEFAULT_PAGE
}

function getPageFromHash() {
  if (typeof window === 'undefined') return DEFAULT_PAGE
  const hashPage = window.location.hash.replace(/^#\/?/, '').trim()
  return normalizePage(hashPage || DEFAULT_PAGE)
}

export function AppProvider({ children }) {
  const [paginaAtual, setPaginaAtual] = useState(getPageFromHash)
  const [sidebarAberto, setSidebarAberto] = useState(INITIAL_SIDEBAR_STATE)
  const [tema, setTema] = useState(getInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = tema
    window.localStorage.setItem('igreen-theme', tema)
  }, [tema])

  useEffect(() => {
    const handleHashChange = () => setPaginaAtual(getPageFromHash())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const navegarPara = (pagina) => {
    const nextPage = normalizePage(pagina)
    setPaginaAtual(nextPage)
    if (typeof window !== 'undefined') {
      const nextHash = `#${nextPage}`
      if (window.location.hash !== nextHash) window.location.hash = nextHash
    }
  }
  const toggleGrupo = (id) => setSidebarAberto(prev => ({ ...prev, [id]: !prev[id] }))
  const alternarTema = () => setTema(prev => prev === 'dark' ? 'light' : 'dark')

  return (
    <Ctx.Provider value={{ paginaAtual, navegarPara, sidebarAberto, toggleGrupo, tema, alternarTema }}>
      {children}
    </Ctx.Provider>
  )
}

export const useApp = () => useContext(Ctx)
