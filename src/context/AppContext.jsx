import { createContext, useContext, useState } from 'react'

const Ctx = createContext(null)

export function AppProvider({ children }) {
  const [paginaAtual, setPaginaAtual] = useState('home')
  const [sidebarAberto, setSidebarAberto] = useState({})

  const navegarPara = (pagina) => setPaginaAtual(pagina)
  const toggleGrupo = (id) => setSidebarAberto(prev => ({ ...prev, [id]: !prev[id] }))

  return (
    <Ctx.Provider value={{ paginaAtual, navegarPara, sidebarAberto, toggleGrupo }}>
      {children}
    </Ctx.Provider>
  )
}

export const useApp = () => useContext(Ctx)