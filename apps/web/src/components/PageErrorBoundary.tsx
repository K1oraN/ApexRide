import { Component, type ReactNode } from 'react';

// Keep the providers mounted: a failed page must not stop an ongoing Ride.
export class PageErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <section className="panel page-error" role="alert">
          <h1>Não foi possível abrir esta página.</h1>
          <p>
            Tente abrir outra aba do aplicativo. Se o problema continuar,
            recarregue quando for seguro interromper a tela atual.
          </p>
          <button
            type="button"
            className="button ui-button button-secondary button-md"
            onClick={() => window.location.reload()}
          >
            Recarregar página
          </button>
        </section>
      );
    return this.props.children;
  }
}
