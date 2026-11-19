import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Shown instead of the default message, e.g. "this lesson". */
  what?: string
  onReset?(): void
}

interface State {
  error: Error | null
}

/**
 * Stops one broken component taking the whole app down.
 *
 * Without a boundary, any render-time throw unmounts the entire React tree and
 * the learner gets a white window with no way back — not even the Reset
 * button that would have fixed it. For an app whose lessons actively
 * encourage breaking things, that is the worst possible failure.
 *
 * The message is deliberately plain. A learner who has just been told errors
 * are the computer being helpful should not then meet a stack trace from the
 * app itself.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Goes to the developer console, never to the learner.
    console.error('Conductor caught a render error', error, info.componentStack)
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <div className="m-6 rounded-xl border border-ink-600 bg-ink-850 px-5 py-4">
        <p className="mb-1 text-parchment-100">
          Something in {this.props.what ?? 'this part of the app'} stopped working.
        </p>
        <p className="mb-3 text-sm text-parchment-400">
          Your progress is saved. This is a bug in Conductor, not in anything you did.
        </p>
        <button
          type="button"
          onClick={() => {
            this.setState({ error: null })
            this.props.onReset?.()
          }}
          className="focus-ring rounded-md border border-ink-600 px-3 py-1.5 text-sm text-parchment-200 transition-colors hover:border-parchment-400"
        >
          Try again
        </button>
      </div>
    )
  }
}
