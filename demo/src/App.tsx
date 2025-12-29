import './App.css'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { DesignerPage } from './pages/DesignerPage'
import { EvaluatorPage } from './pages/EvaluatorPage'

function App() {
  return (
    <div style={{ display: 'grid', gap: 16, padding: 16 }}>
      <header style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 18 }}>Credit Title HTML2PDF Demo</h1>
        <nav style={{ display: 'flex', gap: 10 }}>
          <Link to="/designer">Designer</Link>
          <Link to="/evaluator">Evaluator</Link>
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/designer" replace />} />
          <Route path="/designer" element={<DesignerPage />} />
          <Route path="/evaluator" element={<EvaluatorPage />} />
          <Route path="*" element={<Navigate to="/designer" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
