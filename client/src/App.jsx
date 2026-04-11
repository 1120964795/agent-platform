import { useState } from 'react'
import Layout from './components/layout/Layout.jsx'

export default function App() {
  const [selectedAssistant, setSelectedAssistant] = useState('general')

  return (
    <Layout
      selectedAssistant={selectedAssistant}
      onSelectAssistant={setSelectedAssistant}
    />
  )
}
