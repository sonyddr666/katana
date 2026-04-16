# CODEX-JSON-RPC

Servidor de chat com **JSON-RPC 2.0**, **tool loop textual**, **streaming SSE** e um **Hub UI** com modos Tester / Interactive / Histórico / Auth Pool, usando o backend web do Codex em `chatgpt.com/backend-api/codex/responses`, autenticado por **`auth.json`**.

## O que está incluído

- endpoint principal `POST /rpc`
- compatibilidade REST em `POST /v1/chat/completions`, `POST /v1/responses` e `GET /v1/models`
- streaming via `GET /stream/:sessionId`
- histórico por sessão persistido em `.data/history`
- histórico de chats nomeados em `.data/chats`
- auth pool com slots `auth1..auth5`
- controle global de retomada nativa (o bridge envia `store: false` ao Codex e, quando habilitado, tenta encadear via `previous_response_id`)
- upload simples de arquivos em `.data/uploads`
- tool loop com:
  - limite configurável por `MAX_TOOL_LOOPS`
  - timeout por tool via `TOOL_TIMEOUT_MS`
  - bloqueio de tools por request (`disabled_tools`)
  - detecção de loop infinito para tool + args repetidos
- registry com tools de:
  - web (`search_web`, `fetch_url`, `search_news`)
  - workspace (`read_file`, `write_file`, `append_file`, `list_files`, `delete_file`)
  - execução (`run_js`, `run_python`, `eval_math`)
  - RAG stub persistente (`search_rag`, `ingest_file`, `rag_status`)
  - sistema (`get_datetime`, `uuid`, `base64_encode`, `base64_decode`, `json_format`)
- UI com markdown, highlight, copy button em blocos de código, badges de tools e timeline de tentativas

## Arquitetura

```text
Hub UI (src/web)
  -> POST /v1/chat/completions
  -> POST /v1/responses
  -> GET /v1/chats / auth-pool / store / models

Express server (src/server/index.ts)
  -> rpcHandler()
  -> history store
  -> chat store
  -> auth pool
  -> file store
  -> tool loop engine
  -> tool registry

Codex bridge
  -> auth.json + refresh em chatgpt.com/api/auth/session
  -> requests para chatgpt.com/backend-api/codex/responses
  -> tool loop próprio via blocos ```tool_call```
```

## Como rodar

### Desenvolvimento

```bash
cd CODEX-JSON-RPC
copy .env.example .env
npm install
npm run dev
```

> Para o chat real funcionar, coloque um `auth.json` válido na raiz do projeto ou forneça `AUTH_JSON` via env.

Abrir:

- Chat UI: `http://localhost:8080/`
- JSON-RPC: `http://localhost:8080/rpc`
- OpenAI compat: `http://localhost:8080/v1/chat/completions`

### Docker

```bash
cd CODEX-JSON-RPC
copy .env.example .env
docker-compose up -d --build
```

## Variáveis de ambiente

| Variável | Padrão | Uso |
|---|---|---|
| `HOST` | `0.0.0.0` | bind HTTP |
| `PORT` | `8080` | porta HTTP |
| `NODE_ENV` | `development` | modo da aplicação |
| `MAX_TOOL_LOOPS` | `8` | máximo de iterações do tool loop |
| `TOOL_TIMEOUT_MS` | `15000` | timeout por tool/model request |
| `WORKSPACE_DIR` | `./workspace` | diretório manipulado pelas workspace tools |
| `DATA_DIR` | `./.data` | persistência local de histórico e RAG stub |
| `CHATS_DIR` | `./.data/chats` | diretório de chats persistidos |
| `UPLOADS_DIR` | `./.data/uploads` | diretório de uploads servidos em `/v1/files/:id` |
| `AUTH_POOL_DIR` | `./.data/auth-pool` | diretório dos slots `auth1..auth5` |
| `STORE_STATE_FILE` | `./.data/store-state.json` | estado global da retomada nativa via `previous_response_id` |
| `ADMIN_PIN` | vazio | PIN opcional para proteger rotas do auth pool fora de localhost |
| `CODEX_RESPONSES_URL` | `https://chatgpt.com/backend-api/codex/responses` | endpoint real do backend web do Codex |
| `CODEX_REFRESH_URL` | `https://chatgpt.com/api/auth/session` | endpoint de refresh do token da sessão ChatGPT |
| `DEFAULT_CODEX_MODEL` | `gpt-5.4-mini` | modelo default do Codex |
| `AVAILABLE_MODELS` | lista `gpt-5.*` codex | modelos expostos em `/v1/models` |
| `QDRANT_HOST` | vazio | metadata opcional para RAG |
| `QDRANT_COLLECTION` | `codex-rag` | nome lógico da coleção |
| `AUTH_FILE` | `./auth.json` | arquivo de auth estilo Codex |
| `AUTH_JSON` | vazio | alternativa para injetar o auth via env |

## Métodos JSON-RPC

### `chat`

```json
{
  "jsonrpc": "2.0",
  "id": "chat-1",
  "method": "chat",
  "params": {
    "model": "gpt-5.4-mini",
    "sessionId": "demo-session",
    "messages": [
      { "role": "user", "content": "/tool list_files {\"dir\":\".\"}" }
    ],
    "tools_enabled": ["*"],
    "disabled_tools": []
  }
}
```

### `models`

Lista os modelos disponíveis para UI/REST compat.

### `tools.list`

Retorna o registry com descrição, scope e schema JSON Schema-like de cada tool.

### `tools.run`

Executa uma tool diretamente para debug:

```json
{
  "jsonrpc": "2.0",
  "id": "tool-1",
  "method": "tools.run",
  "params": {
    "tool": "eval_math",
    "args": { "expression": "12 * 15 + 3" }
  }
}
```

### `history.get` / `history.clear`

Gerenciam o histórico isolado por `sessionId`.

## Streaming SSE

Abra um `EventSource` em `/stream/<sessionId>` para receber:

- `connected`
- `session_status`
- `tool_update`
- `assistant_delta`
- `assistant_message`

Exemplo:

```js
const es = new EventSource("/stream/demo-session");
es.addEventListener("tool_update", (event) => {
  console.log(JSON.parse(event.data));
});
```

## Compat REST estilo OpenAI

### `POST /v1/chat/completions`

Aceita payload estilo OpenAI e converte para o método `chat` interno, mas a execução real vai para o backend web do Codex via `auth.json`.

### `GET /v1/models`

Retorna `{ object: "list", data: [...] }`.

## Hub REST adicional

Rotas novas usadas pela Hub UI:

- `GET /v1/store`
- `POST /v1/store/enable`
- `POST /v1/store/disable`
- `GET /v1/chats`
- `GET /v1/chats/search?q=...`
- `GET /v1/chats/:chatId`
- `POST /v1/chats/:chatId/resume`
- `DELETE /v1/chats/:chatId`
- `DELETE /v1/threads/:sessionId`
- `GET /v1/auth-pool`
- `GET /v1/auth-pool/:slotId`
- `PUT /v1/auth-pool/:slotId`
- `DELETE /v1/auth-pool/:slotId`
- `POST /v1/auth-pool/:slotId/test`
- `POST /v1/auth-pool/activate`
- `POST /v1/files`
- `GET /v1/files/:fileId`

## RAG local stub

O projeto não depende de um Qdrant real para funcionar. Quando você chama `ingest_file`, o conteúdo é indexado localmente em `.data/rag-store.json`, permitindo:

- `ingest_file` para indexação
- `search_rag` para busca semântica simples por tokens
- `rag_status` para inspecionar o estado do store

Isso deixa o scaffold funcional já no commit inicial, enquanto mantém espaço para integrar embeddings/Qdrant reais depois.

## UI

A UI em `src/web` agora inclui:

- modo **Tester**
- modo **Interactive** com `support_tools`
- painel de **Histórico** com retomar / exportar / apagar
- painel de **Auth Pool**
- visor de **logs/stream**
- seletor de modelo, reasoning, system prompt e modo de retomada nativa
- render markdown + syntax highlight + copy button

## Deploy com Coolify

O `Dockerfile` e `docker-compose.yml` já foram organizados para deploy simples. Em Coolify, basta:

1. apontar para o repositório
2. configurar `.env`
3. montar os volumes de `auth.json` e `workspace`
4. expor a porta do `PORT`

## Estrutura principal

```text
src/server/
  index.ts
  rpc.ts
  sse.ts
  history/
  middlewares/
  tools/
  tools-loop/

src/web/
  index.html
  sse-client.js
  assets/main.js
  assets/main.css
```

## Observação importante sobre tools

O endpoint do Codex usado aqui **não expõe function calling OpenAI nativo**. Por isso o projeto usa um **tool loop textual**, com um system prompt instruindo o modelo a emitir blocos:

```text
```tool_call
{"jsonrpc":"2.0","id":"...","method":"tool_name","params":{...}}
```
```

O backend detecta esses blocos, executa a tool local e injeta um `tool_result` na próxima rodada.

## Observação importante sobre `store`

No fluxo HTTP atual deste projeto, o payload enviado ao backend web do Codex usa **`store: false` sempre**. O controle exposto em `/v1/store` e na Hub UI não ativa o `store=true` remoto; ele apenas decide se o servidor deve tentar uma retomada mais eficiente via `previous_response_id` quando já existe um `response_id` salvo para o chat.

## Smoke test

- `npm run smoke` valida boot, UI, `/v1/models`, `/v1/store`, `/v1/chats`, `/v1/auth-pool` e tools locais.
- Se houver `auth.json` ou `AUTH_JSON`, ele também valida uma chamada real de chat contra o backend do Codex.

## Licença

MIT
