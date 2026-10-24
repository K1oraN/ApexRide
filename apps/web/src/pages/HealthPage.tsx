import { useApiHealth } from '../hooks/useApiHealth';

const messages = {
  checking: 'Verificando conexão com a API…',
  connected: 'API conectada.',
  unavailable: 'API indisponível. Verifique o backend e recarregue a página.',
};

export function HealthPage() {
  const status = useApiHealth();
  return (
    <section className="technical-page">
      <h1>Apex Ride</h1>
      <p>Página técnica — Parte 01. Não representa o design final.</p>
      <p role="status">{messages[status]}</p>
    </section>
  );
}
