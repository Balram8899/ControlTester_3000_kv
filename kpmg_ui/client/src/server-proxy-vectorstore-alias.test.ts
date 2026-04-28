import assert from "node:assert/strict";
import express from "express";
import http from "node:http";

type ClosableServer = http.Server & {
  close(callback?: (err?: Error) => void): void;
};

function listen(server: ClosableServer, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Expected a TCP address"));
        return;
      }
      resolve(address.port);
    });
  });
}

function close(server: ClosableServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

const upstreamRequests: Array<{ method: string | undefined; url: string | undefined }> = [];

const upstreamServer = http.createServer((req, res) => {
  upstreamRequests.push({ method: req.method, url: req.url });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
});

let appServer: ClosableServer | null = null;

try {
  const upstreamPort = await listen(upstreamServer, "127.0.0.1");
  process.env.VITE_API_URL = `http://127.0.0.1:${upstreamPort}`;

  const { registerRoutes } = await import("../../server/routes.ts");
  const app = express();
  app.use(express.urlencoded({ extended: false }));

  appServer = (await registerRoutes(app)) as ClosableServer;
  const appPort = await listen(appServer, "127.0.0.1");

  const response = await fetch(`http://127.0.0.1:${appPort}/api/load-vectorstore`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ dir_path: "saved_global_vectorstore", kb_type: "global" }),
  });

  assert.equal(response.status, 200, "Proxy should preserve the legacy vectorstore load endpoint for the UI");
  assert.equal(upstreamRequests.length, 1, "Proxy should send exactly one upstream request");
  assert.equal(upstreamRequests[0]?.method, "POST");
  assert.equal(upstreamRequests[0]?.url, "/load-graph");
} finally {
  if (appServer) {
    await close(appServer);
  }
  await close(upstreamServer);
}
