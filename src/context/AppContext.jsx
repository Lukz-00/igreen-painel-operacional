import { createContext, useContext, useEffect, useState } from 'react'

const Ctx = createContext(null)

function getInitialTheme() {
  if (typeof window === 'undefined') return 'light'
  const saved = window.localStorage.getItem('igreen-theme')
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function AppProvider({ children }) {
  const [paginaAtual, setPaginaAtual] = useState('home')
  const [sidebarAberto, setSidebarAberto] = useState({ injecao: true, financeiro: true })
  const [tema, setTema] = useState(getInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = tema
    window.localStorage.setItem('igreen-theme', tema)
  }, [tema])

  const navegarPara = (pagina) => setPaginaAtual(pagina)
  const toggleGrupo = (id) => setSidebarAberto(prev => ({ ...prev, [id]: !prev[id] }))
  const alternarTema = () => setTema(prev => prev === 'dark' ? 'light' : 'dark')

  return (
    <Ctx.Provider value={{ paginaAtual, navegarPara, sidebarAberto, toggleGrupo, tema, alternarTema }}>
      {children}
    </Ctx.Provider>
  )
}

export const useApp = () => useContext(Ctx)
