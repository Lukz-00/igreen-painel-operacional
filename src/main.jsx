import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { startConsoleNotice } from './utils/consoleNotice'
import './index.css'

startConsoleNotice()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
