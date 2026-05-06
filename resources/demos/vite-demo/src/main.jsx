import React from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

function App() {
  return (
    <main className="demo-shell">
      <h1>AionUi Vite Demo</h1>
      <p>Use this project to demonstrate package indexing, entry-file Q&A, and start_service output capture.</p>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
