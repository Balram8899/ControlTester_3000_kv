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

const upstreamRequests: Array<{ method: string | undefined; url: string | undefined; body: string }> = [];

const upstreamServer = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  req.on("end", () => {
    upstreamRequests.push({
      method: req.method,
      url: req.url,
      body: Buffer.concat(chunks).toString("utf8"),
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
});

let appServer: ClosableServer | null = null;

try {
  const upstreamPort = await listen(upstreamServer, "127.0.0.1");
  process.env.VITE_API_URL = `http://127.0.0.1:${upstreamPort}`;

  const { registerRoutes } = await import("../../server/routes.ts");
  const app = express();
  app.use(express.json({
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }));
  app.use(express.urlencoded({ extended: false }));

  appServer = (await registerRoutes(app)) as ClosableServer;
  const appPort = await listen(appServer, "127.0.0.1");

  const payload = {
    controls: [
      {
        control_id: "c1",
        name: "Access Review",
        description: "System owner performs a quarterly review of user access within the trading platform.",
      },
    ],
  };

  const response = await fetch(`http://127.0.0.1:${appPort}/api/controls-library/quality-analysis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  assert.equal(response.status, 200, "Proxy should forward JSON POST requests without throwing header errors");
  assert.equal(upstreamRequests.length, 1, "Proxy should send exactly one upstream request");
  assert.equal(upstreamRequests[0]?.method, "POST");
  assert.equal(upstreamRequests[0]?.url, "/controls-library/quality-analysis");
  assert.deepEqual(JSON.parse(upstreamRequests[0]?.body ?? "{}"), payload);
} finally {
  if (appServer) {
    await close(appServer);
  }
  await close(upstreamServer);
}
