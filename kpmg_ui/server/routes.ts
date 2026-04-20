import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { request as httpRequest } from "http";

// In Docker: VITE_API_URL=http://fastapi_api:8000 (set in docker-compose)
// In local dev: falls back to localhost:8000
const FASTAPI_BASE = (process.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");

function proxyToFastAPI(req: Request, res: Response) {
  const targetPath = req.path.replace(/^\/api/, "") || "/";
  const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const url = new URL(FASTAPI_BASE);

  // Forward headers, overriding host
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") headers[k] = v;
    else if (Array.isArray(v)) headers[k] = v[0];
  }
  headers["host"] = url.host;

  const options = {
    hostname: url.hostname,
    port: parseInt(url.port || "8000"),
    path: targetPath + query,
    method: req.method,
    headers,
    timeout: 600_000, // 10 minutes — long-running LLM operations
  };

  const proxyReq = httpRequest(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode!, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("timeout", () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.status(504).json({ error: "Analysis timeout", detail: "Operation exceeded 10 minutes." });
    }
  });

  proxyReq.on("error", (err) => {
    console.error(`[proxy] ${req.method} ${targetPath} → FastAPI error:`, err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: "Upstream unavailable", detail: err.message });
    }
  });

  const contentType = req.headers["content-type"] || "";

  if (contentType.includes("multipart/form-data")) {
    // Express does not parse multipart — pipe the raw stream directly
    req.pipe(proxyReq, { end: true });
  } else if (contentType.includes("application/x-www-form-urlencoded") && req.body) {
    // Already parsed by express.urlencoded — re-serialize
    const params = new URLSearchParams(req.body as Record<string, string>).toString();
    proxyReq.setHeader("content-type", "application/x-www-form-urlencoded");
    proxyReq.setHeader("content-length", Buffer.byteLength(params));
    proxyReq.write(params);
    proxyReq.end();
  } else if (contentType.includes("application/json") && req.body) {
    // Already parsed by express.json — re-serialize
    const bodyStr = JSON.stringify(req.body);
    const bodyBuf = Buffer.from(bodyStr);
    proxyReq.setHeader("content-type", "application/json");
    proxyReq.setHeader("content-length", bodyBuf.length);
    proxyReq.write(bodyBuf);
    proxyReq.end();
  } else {
    proxyReq.end();
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/models", async (_req, res) => {
    try {
      const response = await fetch(`${FASTAPI_BASE}/models`);
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }
      const data = await response.json();

      const transformedModels = data.models.map((model: string) => ({
        value: model,
        label: model,
      }));

      res.json(transformedModels);
    } catch (error) {
      console.error("Error fetching models:", error);
      res.status(500).json({ error: "Failed to fetch models" });
    }
  });

  // Catch-all: forward every other /api/* request to FastAPI
  app.all("/api/*", proxyToFastAPI);

  const httpServer = createServer(app);
  httpServer.timeout = 600_000;
  httpServer.keepAliveTimeout = 620_000;
  return httpServer;
}
