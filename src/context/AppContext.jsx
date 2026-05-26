import { createContext, useContext, useState } from 'react'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [currentPage, setCurrentPage] = useState('home')
  const [openGroups, setOpenGroups]   = useState({})

  const navigate     = (page) => setCurrentPage(page)
  const toggleGroup  = (id)   => setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }))

  return (
    <AppContext.Provider value={{ currentPage, navigate, openGroups, toggleGroup }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
