import { createServer } from 'node:net'

/**
 * Finds a usable loopback port, preferring `preferred`.
 *
 * A fixed port is the wrong choice here: the learner may well have something
 * else on it, and "the app will not start" with no explanation is precisely
 * the first-run failure this project cannot afford. Asking the OS for a free
 * one costs nothing and removes the whole class of problem.
 */
export function findFreePort(preferred: number): Promise<number> {
  return tryPort(preferred).then((ok) => (ok ? preferred : anyPort()))
}

function tryPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)))
  })
}

function anyPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => (port ? resolve(port) : reject(new Error('no free port'))))
    })
  })
}
