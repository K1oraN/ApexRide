# Ativação da busca de endereços e cálculo de itinerários

Os erros relatados em `/api/routes/directions` e `/api/routes/calculate` (`503 Service Unavailable`) ocorrem quando o backend não tem uma URL de roteamento OSRM configurada, ou quando o servidor OSRM não responde corretamente. A pesquisa de endereço é MapTiler e depende de uma chave válida e de autorização explícita.

## 1. Configurar o `.env` local (não publicar chaves)

Na raiz `D:\Projetos\ApexRide`, abra `notepad .env` e mantenha a conexão de banco ORIGINAL do projeto (porta `55432`). Adicione ou configure:

```dotenv
GEOCODING_AUTHORIZED=true
GEOCODING_MAPTILER_KEY=SUA_CHAVE_VALIDA_MAPTILER
ROUTING_OSRM_URL=https://SEU_SERVIDOR_OSRM_OU_PROVEDOR_AUTORIZADO
ROUTING_OSRM_PROFILE=driving
ROUTING_OSRM_TOKEN=
```

- A chave MapTiler precisa ter acesso à API de geocodificação e cota/termos adequados. A API consulta `https://api.maptiler.com/geocoding/...`, restringindo a busca ao Brasil. Se não houver chave, não marque a funcionalidade como disponível na interface.
- `ROUTING_OSRM_URL` deve apontar para serviço OSRM **que você hospeda ou tem autorização de uso**. Não inclua o sufixo `/route/v1/driving`: o backend já anexa esse caminho.
- Se o serviço de roteamento exigir Bearer token, configure `ROUTING_OSRM_TOKEN`; senão, mantenha vazio.
- Um servidor PostgreSQL/PostGIS não calcula instruções rodoviárias por conta própria: isso é feito por OSRM.
- **Não configure um servidor de demonstração público como backend de produção**: disponibilidade, uso e dados pessoais/geográficos precisam ser avaliados.

## 2. Teste

Pare a aplicação com `Ctrl+C` e inicie novamente, porque `.env` só é lido na partida:

```powershell
cd D:\Projetos\ApexRide
pnpm dev
```

Com sessão autenticada no navegador, em **DevTools > Network**, procure a resposta de `GET /api/routes/providers`. Ela deve mostrar:

```json
{"routing":true,"geocoding":true,"geocoder":"MapTiler","elevation":false}
```

> `true` indica **configuração presente**, não que o serviço externo esteja saudável. Teste primeiro uma pesquisa simples por “Maceió, AL” e depois 2 coordenadas próximas em ruas navegáveis. Erros `503` restantes exigem verificar credenciais, cota, conectividade e o endereço do serviço OSRM.

## 3. Diagnóstico sem revelar senhas

```powershell
cd D:\Projetos\ApexRide
node --env-file=.env -e "console.log({ geocodingAuthorized: process.env.GEOCODING_AUTHORIZED==='true', maptilerKeyPresent: !!process.env.GEOCODING_MAPTILER_KEY, routingConfigured: !!process.env.ROUTING_OSRM_URL, profile: process.env.ROUTING_OSRM_PROFILE||'driving' })"
```

O aplicativo preserva pontos selecionados em caso de erro do provedor. Não simule rotas por linhas retas nem apresente instruções inventadas ao piloto.
