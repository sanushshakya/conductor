import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { App } from './App'
import { setSqlWasmLocator } from './sql/engine'
import './styles.css'

// sql.js looks for its .wasm next to its own JS, which is not where a bundler
// puts it. Vite hashes the asset and gives us the real URL here.
setSqlWasmLocator(() => wasmUrl)

const container = document.getElementById('root')
if (!container) throw new Error('missing #root')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
