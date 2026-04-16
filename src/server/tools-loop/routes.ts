import { Router } from "express";
import { getToolByName, listTools } from "../tools/registry";
import type { Request, Response } from "express";

export function setupToolLoopRoutes(): Router {
  const router = Router();

  // GET /tools/list - list all available tools with schemas
  router.get("/list", (req: Request, res: Response) => {
    res.json({
      jsonrpc: "2.0",
      id: "tools-list",
      result: {
        tools: listTools(),
        config: {
          max_loops: 8,
          timeout_ms: 15000,
        },
      },
    });
  });

  // POST /tools/run - execute a single tool directly
  router.post("/run", async (req: Request, res: Response) => {
    const { tool, args } = req.body;

    if (!tool || typeof args !== "object") {
      return res.status(400).json({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32602, message: "Invalid params: tool and args required" },
      });
    }

    const toolDef = getToolByName(tool);

    if (!toolDef) {
      return res.status(404).json({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32601, message: `Tool not found: ${tool}` },
      });
    }

    try {
      const result = await toolDef.handler(args);
      res.json({
        jsonrpc: "2.0",
        id: `tool-${Date.now()}`,
        result,
      });
    } catch (error: any) {
      res.status(500).json({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32603,
          message: "Tool execution failed",
          data: error.message,
        },
      });
    }
  });

  return router;
}
