import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Erro não tratado na interface', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="m-7 rounded-xl border border-danger/30 bg-danger/5 p-6">
        <h2 className="text-lg font-bold text-danger">Não foi possível exibir esta tela</h2>
        <p className="mt-2 text-sm text-tx3">
          O processamento não foi apagado. Recarregue a interface e tente abrir o resultado novamente.
        </p>
        <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-bg2 p-3 text-xs text-tx3">
          {this.state.error.message}
        </pre>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-acc px-4 py-2 text-sm font-semibold text-onacc"
        >
          Recarregar página
        </button>
      </div>
    )
  }
}
