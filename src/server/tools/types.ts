export type ToolScope = "web" | "workspace" | "rag" | "system";

export interface ToolSchemaProperty {
  type?: string | string[];
  description?: string;
  items?: Record<string, unknown>;
  properties?: Record<string, ToolSchemaProperty>;
  additionalProperties?: boolean | ToolSchemaProperty;
}

export interface ToolSchema {
  name: string;
  description: string;
  scope: ToolScope;
  schema: {
    type: "object";
    properties: Record<string, ToolSchemaProperty>;
    required?: string[];
    additionalProperties?: boolean;
  };
  handler: (args: any) => Promise<Envelope>;
}

export type Envelope<T = any> = {
  ok: boolean;
  scope: ToolScope;
  data: T;
  attempts?: Array<{
    action: string;
    result: "ok" | "error";
    latency_ms: number;
    error?: string;
  }>;
  suggested_next?: string;
};
