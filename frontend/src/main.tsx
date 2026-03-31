import { StrictMode, useState, useEffect, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DarkModeContext } from './utils/darkMode'

function DarkModeProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('dark-mode')
    return stored === 'true'
  })

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('dark-mode', String(dark))
  }, [dark])

  const toggle = useCallback(() => setDark(prev => !prev), [])

  return (
    <DarkModeContext.Provider value={{ dark, toggle }}>
      {children}
    </DarkModeContext.Provider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DarkModeProvider>
      <App />
    </DarkModeProvider>
  </StrictMode>,
)
