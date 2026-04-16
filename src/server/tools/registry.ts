import type { ToolSchema } from "./types";
import * as webTools from "./web";
import * as workspaceTools from "./workspace";
import * as systemTools from "./system";
import * as ragTools from "./rag";
import { runJs } from "./run_js";
import { runPython } from "./run_python";
import { evalMath } from "./eval_math";

export const toolRegistry: ToolSchema[] = [
  {
    name: "search_web",
    description: "DuckDuckGo scraper, retorna top 5 snippets",
    scope: "web",
    schema: {
      type: "object",
      properties: { query: { type: "string", description: "Search query" } },
      required: ["query"],
      additionalProperties: false,
    },
    handler: webTools.searchWeb,
  },
  {
    name: "fetch_url",
    description: "Busca conteúdo HTML/texto de uma URL específica",
    scope: "web",
    schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to fetch" },
        selector: { type: "string", description: "CSS selector (optional)" },
      },
      required: ["url"],
      additionalProperties: false,
    },
    handler: webTools.fetchUrl,
  },
  {
    name: "search_news",
    description: "Notícias recentes (RSS + scraping)",
    scope: "web",
    schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        days: { type: "number", description: "Days back to search" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    handler: webTools.searchNews,
  },
  {
    name: "read_file",
    description: "Lê arquivo do diretório de workspace",
    scope: "workspace",
    schema: {
      type: "object",
      properties: {
        filepath: { type: "string", description: "Relative path within workspace" },
      },
      required: ["filepath"],
      additionalProperties: false,
    },
    handler: workspaceTools.readFile,
  },
  {
    name: "write_file",
    description: "Cria ou sobrescreve arquivo",
    scope: "workspace",
    schema: {
      type: "object",
      properties: {
        filepath: { type: "string", description: "Relative path within workspace" },
        content: { type: "string", description: "File content" },
      },
      required: ["filepath", "content"],
      additionalProperties: false,
    },
    handler: workspaceTools.writeFile,
  },
  {
    name: "append_file",
    description: "Adiciona conteúdo ao final do arquivo",
    scope: "workspace",
    schema: {
      type: "object",
      properties: {
        filepath: { type: "string", description: "Relative path within workspace" },
        content: { type: "string", description: "Content to append" },
      },
      required: ["filepath", "content"],
      additionalProperties: false,
    },
    handler: workspaceTools.appendFile,
  },
  {
    name: "list_files",
    description: "Lista arquivos e pastas do workspace",
    scope: "workspace",
    schema: {
      type: "object",
      properties: {
        dir: { type: "string", description: "Directory to list (optional)" },
      },
      required: [],
      additionalProperties: false,
    },
    handler: workspaceTools.listFiles,
  },
  {
    name: "delete_file",
    description: "Remove arquivo (com confirmação no chat)",
    scope: "workspace",
    schema: {
      type: "object",
      properties: {
        filepath: { type: "string", description: "Relative path within workspace" },
      },
      required: ["filepath"],
      additionalProperties: false,
    },
    handler: workspaceTools.deleteFile,
  },
  {
    name: "run_js",
    description: "Executa JavaScript via vm.runInNewContext (sandbox)",
    scope: "system",
    schema: {
      type: "object",
      properties: {
        code: { type: "string", description: "JavaScript code to execute" },
      },
      required: ["code"],
      additionalProperties: false,
    },
    handler: runJs,
  },
  {
    name: "run_python",
    description: "Executa Python via child_process.spawn (timeout 10s)",
    scope: "system",
    schema: {
      type: "object",
      properties: {
        code: { type: "string", description: "Python code to execute" },
      },
      required: ["code"],
      additionalProperties: false,
    },
    handler: runPython,
  },
  {
    name: "eval_math",
    description: "Avalia expressões matemáticas com segurança",
    scope: "system",
    schema: {
      type: "object",
      properties: {
        expression: { type: "string", description: "Math expression" },
      },
      required: ["expression"],
      additionalProperties: false,
    },
    handler: evalMath,
  },
  {
    name: "search_rag",
    description: "Busca semântica no Qdrant (stub pronto, plugável)",
    scope: "rag",
    schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        top_k: { type: "number", description: "Number of results" },
        filters: {
          type: "object",
          description: "Optional exact-match filters",
          additionalProperties: true,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    handler: ragTools.searchRag,
  },
  {
    name: "ingest_file",
    description: "Indexa arquivo no Qdrant com embeddings",
    scope: "rag",
    schema: {
      type: "object",
      properties: {
        filepath: { type: "string", description: "File to ingest" },
        userId: { type: "string", description: "User ID for namespacing" },
      },
      required: ["filepath", "userId"],
      additionalProperties: false,
    },
    handler: ragTools.ingestFile,
  },
  {
    name: "rag_status",
    description: "Retorna status da coleção Qdrant (points, status)",
    scope: "rag",
    schema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    handler: ragTools.ragStatus,
  },
  {
    name: "get_datetime",
    description: "Retorna data/hora atual formatada",
    scope: "system",
    schema: {
      type: "object",
      properties: {
        timezone: { type: "string", description: "Timezone (e.g., 'America/Sao_Paulo')" },
      },
      required: [],
      additionalProperties: false,
    },
    handler: systemTools.getDatetime,
  },
  {
    name: "uuid",
    description: "Gera UUID v4",
    scope: "system",
    schema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    handler: systemTools.uuid,
  },
  {
    name: "base64_encode",
    description: "Encode Base64",
    scope: "system",
    schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to encode" },
      },
      required: ["text"],
      additionalProperties: false,
    },
    handler: systemTools.base64Encode,
  },
  {
    name: "base64_decode",
    description: "Decode Base64",
    scope: "system",
    schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Base64 text to decode" },
      },
      required: ["text"],
      additionalProperties: false,
    },
    handler: systemTools.base64Decode,
  },
  {
    name: "json_format",
    description: "Formata/valida JSON com pretty print",
    scope: "system",
    schema: {
      type: "object",
      properties: {
        raw: { type: "string", description: "Raw JSON string" },
      },
      required: ["raw"],
      additionalProperties: false,
    },
    handler: systemTools.jsonFormat,
  },
];

export function getToolByName(name: string): ToolSchema | undefined {
  return toolRegistry.find((t) => t.name === name);
}

export function listTools() {
  return toolRegistry.map((t) => ({
    name: t.name,
    description: t.description,
    scope: t.scope,
    schema: t.schema,
  }));
}
