import { resolve } from 'node:path'
import '@testing-library/jest-dom/vitest'
import { setSqlWasmLocator } from './apps/renderer/src/sql/engine'

// sql.js resolves its .wasm next to its own JS by default, which is correct in
// the bundled app and wrong under Vitest. Pointing it at node_modules here
// means every test file gets a working SQLite without repeating this.
setSqlWasmLocator((file) => resolve(process.cwd(), 'node_modules/sql.js/dist', file))
