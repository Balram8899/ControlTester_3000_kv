const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const logs = [];
  page.on('console', msg => logs.push(`${msg.type()}: ${msg.text()}`));
  page.on('pageerror', err => logs.push(`PAGEERROR: ${err.message}`));
  
  console.log('Navigating to http://localhost:5000/controls-diagnostics/control-quality-analysis');
  await page.goto('http://localhost:5000/controls-diagnostics/control-quality-analysis', { waitUntil: 'networkidle', timeout: 30000 });
  
  // Wait a bit for any fetch to complete
  await page.waitForTimeout(10000);
  
  // Take screenshot
  await page.screenshot({ path: 'tmp/5w1h_screenshot.png', fullPage: true });
  console.log('Screenshot saved to tmp/5w1h_screenshot.png');
  
  // Get page text content
  const text = await page.textContent('body');
  console.log('\n--- Page text (first 500 chars) ---');
  console.log(text.substring(0, 500));
  
  console.log('\n--- Console logs ---');
  logs.forEach(l => console.log(l));
  
  await browser.close();
})();
