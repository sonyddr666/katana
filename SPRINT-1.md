# Sprint 1 — Foundation

Base de qualidade mínima para as próximas sprints.

## Mudanças

- **Logger estruturado (Pino)** em [src/server/logger.ts](src/server/logger.ts)
  - Redação automática de tokens (`access_token`, `refresh_token`, headers de auth)
  - `pino-pretty` em dev, JSON em produção
  - Request ID por requisição via `pino-http` (header `x-request-id`)
- **Env validado com Zod** em [src/server/config/env.ts](src/server/config/env.ts)
  - Falha fast em valores inválidos (porta, URLs, número de loops, etc.)
  - Tipagem derivada automaticamente
- **Segurança HTTP**
  - `helmet` (headers padrão seguros, CSP desabilitado para UI funcionar)
  - `express-rate-limit` (120 req / 60s, configurável via `RATE_LIMIT_*`)
  - `/health` e `/stream` isentos
- **Testes Vitest** em [tests/](tests/)
  - `registry.test.ts` — unicidade, listagem, lookup
  - `env.test.ts` — defaults, paths absolutos, modelo default na lista
  - `logger.test.ts` — export + childLogger
- **Scripts npm**: `test`, `test:watch`, `test:coverage`
- **console.log** substituído por logger em `rpc.ts`, `middlewares/auth.ts`, `index.ts`

## Como rodar

```bash
npm install
npm run typecheck
npm test
npm run dev
```

## Próximas sprints

- Sprint 2: OpenTelemetry + sandbox `isolated-vm` + secrets
- Sprint 3: SQLite + Drizzle (migrar history/chats)
- Sprint 4: RAG real (Qdrant/LanceDB) + function calling estruturado
