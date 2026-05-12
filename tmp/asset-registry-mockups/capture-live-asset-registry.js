const fs = require("node:fs");
const path = require("node:path");

function findPlaywrightCore() {
  const npxRoot = path.join(process.env.LOCALAPPDATA || "", "npm-cache", "_npx");
  for (const entry of fs.readdirSync(npxRoot)) {
    const candidate = path.join(npxRoot, entry, "node_modules", "playwright-core");
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("playwright-core not found in npm _npx cache");
}

async function main() {
  const { chromium } = require(findPlaywrightCore());
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    localStorage.setItem("ct3_current_user", JSON.stringify({ email: "admin@bank.com", name: "Admin", role: "admin" }));
    localStorage.setItem("ct3_users", JSON.stringify([{ email: "admin@bank.com", name: "Admin", password: "zUlqVAZ5wt", role: "admin" }]));
  });
  await page.goto("http://localhost:5000/asset-registry", { waitUntil: "networkidle" });
  await page.screenshot({ path: "output/playwright/asset-registry-live-redesign.png", fullPage: false });
  await page.goto("http://localhost:5000/", { waitUntil: "networkidle" });
  await page.screenshot({ path: "output/playwright/dashboard-ribbon-standardized.png", fullPage: false });
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
