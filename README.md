# CODEX-JSON-RPC

Servidor de chat com Codex usando **JSON-RPC 2.0** sobre HTTP + streaming SSE, com tool loop nativo, 20 ferramentas e Chat UI integrado. Pronto para Docker + Coolify.

## Features

✅ **JSON-RPC 2.0** - Protocolo padrão com envelope estruturado
✅ **Tool Loop Engine** - Execução iterativa de ferramentas com detecção de loop infinito
✅ **20 Tools** - Web, workspace, execução de código, RAG (stub), utilidades
✅ **SSE Streaming** - Eventos em tempo real via `/stream/:id`
✅ **Chat UI** - Interface web completa (Markdown, syntax highlight, dark mode)
✅ **OpenAI-compatible** - Endpoint `/v1/chat/completions` para integração com SDKs existentes
✅ **Multi-session** - Histórico isolado por `sessionId`
✅ **Auth Ready** - Suporte a tokens Bearer + auth.json (Codex style)
✅ **Docker** - Multi-stage build (~80MB), volumes para workspace e auth

## Quick Start

### Com Docker

```bash
# Clone e entre no diretório
git clone <repo>
cd CODEX-JSON-RPC

# Copie o exemplo de env
cp .env.example .env

# Edite .env com sua API key (OPENAI_API_KEY) se for usar RAG

# Suba com Docker Compose
docker-compose up -d

# Acesse
# Chat UI: http://localhost:8080/
# JSON-RPC: POST http://localhost:8080/rpc
# OpenAI-compat: POST http://localhost:8080/v1/chat/completions
```

### Sem Docker (desenvolvimento)

```bash
npm install
npm run dev
```

## API Reference

### JSON-RPC 2.0 Endpoints

#### POST /rpc

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "chat",
  "params": {
    "model": "codex-mini",
    "messages": [
      { "role": "user", "content": "List files in workspace" }
    ],
    "tools_enabled": ["list_files", "read_file"],
    "sessionId": "session-123"
  }
}
```

**Resposta:**

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "model": "codex-mini",
    "choices": [{
      "message": {
        "role": "assistant",
        "content": "Tool loop completed. Attempts: 1."
      },
      "finish_reason": "stop"
    }],
    "tool_execution": {
      "attempts": [{
        "action": "list_files",
        "result": "ok",
        "latency_ms": 45
      }]
    },
    "sessionId": "session-123"
  }
}
```

#### Métodos disponíveis

| Método | Descrição |
|--------|-----------|
| `chat` | Envia mensagem com tool loop automático |
| `models` | Lista modelos disponíveis |
| `tools.list` | Lista todas as 20 tools com schemas JSON-Schema |
| `tools.run` | Executa uma tool diretamente (debug) |
| `history.get` | Recupera histórico de uma sessão |
| `history.clear` | Limpa histórico de uma sessão |

### OpenAI-Compatible

```bash
POST /v1/chat/completions
Content-Type: application/json

{
  "model": "codex-mini",
  "messages": [{"role": "user", "content": "What time is it?"}],
  "tools": [...]  // optional tool definitions
}
```

### SSE Streaming

```javascript
const es = new EventSource(`/stream/${sessionId}`);
es.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data);
};
```

## Tools Disponíveis

### Web & Dados Externos (3)

| Tool | Descrição | Args |
|------|-----------|------|
| `search_web` | DuckDuckGo scraper (top 5) | `query: string` |
| `fetch_url` | Busca conteúdo de URL | `url: string`, `selector?` |
| `search_news` | RSS de notícias recentes | `query: string`, `days?` |

### Workspace (5)

| Tool | Descrição | Args |
|------|-----------|------|
| `read_file` | Lê arquivo | `filepath: string` |
| `write_file` | Cria/sobrescreve | `filepath: string`, `content: string` |
| `append_file` | Adiciona ao final | `filepath: string`, `content: string` |
| `list_files` | Lista diretório | `dir?` |
| `delete_file` | Remove arquivo | `filepath: string` |

### Código & Execução (3)

| Tool | Descrição | Args |
|------|-----------|------|
| `run_js` | JS sandbox (vm) | `code: string` |
| `run_python` | Python subprocess (10s timeout) | `code: string` |
| `eval_math` | Expressões matemáticas seguras | `expression: string` |

### RAG & Memória (3)

| Tool | Descrição | Args |
|------|-----------|------|
| `search_rag` | Busca semântica (Qdrant stub) | `query: string`, `top_k?` |
| `ingest_file` | Indexa arquivo (stub) | `filepath: string`, `userId: string` |
| `rag_status` | Status da coleção | sem args |

### Sistema & Utilitários (5)

| Tool | Descrição | Args |
|------|-----------|------|
| `get_datetime` | Data/hora atual | `timezone?` |
| `uuid` | Gera UUID v4 | sem args |
| `base64_encode` | Codifica Base64 | `text: string` |
| `base64_decode` | Decodifica Base64 | `text: string` |
| `json_format` | Formata/valida JSON | `raw: string` |

## Tool Loop Engine

O tool loop executa até **8 iterações** (configurável via `MAX_TOOL_LOOPS`) ou até o modelo parar de chamar ferramentas.

**Detecção de loop infinito:** Se a mesma tool for chamada 2x com os mesmos argumentos, o loop é interrompido automaticamente.

**Contrato de envelope** (retorno de cada tool):

```typescript
{
  ok: true,              // boolean: sucesso da execução
  scope: "web",          // "web" | "workspace" | "rag" | "system"
  data: { ... },         // resultado específico da tool
  attempts?: [...],      // histórico de attempts (opcional)
  suggested_next?: ""    // hint para próximos steps (opcional)
}
```

## Configuração

Variáveis de ambiente `.env`:

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `PORT` | 8080 | Porta HTTP |
| `HOST` | 0.0.0.0 | Host bind |
| `MAX_TOOL_LOOPS` | 8 | Máximo de iterations do tool loop |
| `TOOL_TIMEOUT_MS` | 15000 | Timeout por tool (ms) |
| `WORKSPACE_DIR` | /workspace | Diretório de workspace |
| `OPENAI_API_KEY` | - | Para embeddings RAG (opcional) |
| `QDRANT_HOST` | http://localhost:6333 | Host Qdrant (opcional) |
| `QDRANT_COLLECTION` | codex-rag | Nome da coleção |
| `AUTH_FILE` | /app/auth.json | Caminho do auth.json |

## Chat UI

A interface web está em `src/web/` e é servida estaticamente. Funcionalidades:

- Markdown rendering com syntax highlight (via CDN)
- Badges inline para tools: `🔧 search_web("query") [✅]`
- Timeline expansível de attempts por mensagem
- Model selector dinâmico
- Toggle "Tools Enabled"
- Multi-session com histórico isolado
- Tema dark/light automático

## Arquitetura

```
┌─────────┐      POST /rpc       ┌─────────────────┐
│ Chat UI │ ◄───────────────────► │   Express.js    │
│ (SSE)   │      SSE /stream      │   JSON-RPC 2.0  │
└─────────┘                       └────────┬────────┘
         │                                  │
         │ tool calls                      │ rpcHandler
         │                                  ▼
         │                       ┌─────────────────────┐
         │                       │  Method Router      │
         │                       │  - chat             │
         │                       │  - tools.list       │
         │                       │  - tools.run        │
         │                       │  - history.*        │
         │                       └─────────┬───────────┘
         │                                 │
         │                                 ▼
         │                       ┌─────────────────────┐
         │                       │  Tool Loop Engine   │
         │                       │  - max loops        │
         │                       │  - infinite detect  │
         │                       │  - tool dispatch    │
         │                       └─────────┬───────────┘
         │                                 │
         │                       ┌─────────▼───────────┐
         │                       │   Tool Registry     │
         │                       │   20 implementations│
         │                       └─────────────────────┘
```

## Health Check

```bash
curl http://localhost:8080/health
# { "status": "ok", "timestamp": "..." }
```

## Exemplos de Uso

### 1. Listar arquivos do workspace

```bash
curl -X POST http://localhost:8080/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "1",
    "method": "chat",
    "params": {
      "messages": [{"role": "user", "content": "List files in workspace"}],
      "tools_enabled": ["list_files"]
    }
  }'
```

### 2. Executar数学

```bash
curl -X POST http://localhost:8080/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "2",
    "method": "tools.run",
    "params": {
      "tool": "eval_math",
      "args": {"expression": "12 * 15 + 3"}
    }
  }'
```

### 3. OpenAI SDK

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8080/v1",
    api_key="sk-dummy"
)

response = client.chat.completions.create(
    model="codex-mini",
    messages=[{"role": "user", "content": "What time is it in UTC?"}],
    tools=[{"type": "function", "function": {
        "name": "get_datetime",
        "description": "Get current time",
        "parameters": {"type": "object", "properties": {}}
    }}]
)
```

## Docker + Coolify

O projeto está otimizado para deployment no Coolify:

```yaml
# docker-compose.yml already configured for Coolify
services:
  codex-json-rpc:
    build: .
    ports:
      - "${PORT:-8080}:8080"
    volumes:
      - ./auth.json:/app/auth.json:ro
      - ./workspace:/workspace
    env_file: .env
    restart: unless-stopped
```

No Coolify:
1. Crie novo serviço → Custom Docker Image
2. Aponte para seu repositório
3. Configure variáveis de ambiente (PORT, OPENAI_API_KEY, etc)
4. Adicione volumes: `./auth.json:/app/auth.json`, `./workspace:/workspace`
5. Exponha porta 8080 (ou a que preferir)

## FAQ

### Preciso de token de acesso?

Para desenvolvimento local, não. Em produção, configure `auth.json` ou use Bearer token no header `Authorization`.

### O RAG funciona sem Qdrant?

O stub retorna erro amigável. Para ativar, configure `QDRANT_HOST` + `OPENAI_API_KEY` e implemente os handlers reais.

### Como adicionar uma tool nova?

1. Crie arquivo em `src/server/tools/<categoria>/nome.ts`
2. Exporte função `async (args) => Envelope`
3. Adicione no `src/server/tools/registry.ts`

### Posso usar com Claude Code?

Sim, via MCP bridging. O protocolo JSON-RPC é compatível com MCP servers.

## License

MIT
