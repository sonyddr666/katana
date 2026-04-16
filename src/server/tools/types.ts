export interface ToolSchema {
  name: string;
  description: string;
  scope: "web" | "workspace" | "rag" | "system";
  schema: {
    type: "object";
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
  handler: (args: any) => Promise<any>;
}

export type Envelope<T = any> = {
  ok: boolean;
  scope: ToolSchema["scope"];
  data: T;
  attempts?: Array<{
    action: string;
    result: "ok" | "error";
    latency_ms: number;
    error?: string;
  }>;
  suggested_next?: string;
};
