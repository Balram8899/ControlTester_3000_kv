const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

function findPlaywrightCore() {
  const npxRoot = path.join(process.env.LOCALAPPDATA || "", "npm-cache", "_npx");
  if (!fs.existsSync(npxRoot)) {
    throw new Error("npm _npx cache not found");
  }
  for (const entry of fs.readdirSync(npxRoot)) {
    const candidate = path.join(npxRoot, entry, "node_modules", "playwright-core");
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("playwright-core not found in npm _npx cache");
}

async function main() {
  const { chromium } = require(findPlaywrightCore());
  const root = __dirname;
  const html = path.join(root, "asset-registry-redesign-mockups.html");
  const base = pathToFileURL(html).toString();
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 1 });

  for (const screen of ["overview", "detail", "create"]) {
    await page.goto(`${base}?screen=${screen}`, { waitUntil: "load" });
    await page.screenshot({ path: path.join(root, `${screen}.png`), fullPage: false });
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
