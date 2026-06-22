// Throwaway prototype screenshotter. Captures each given story id in light + dark
// (the workbench preview uses colorScheme="auto", so emulateMedia drives the scheme).
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:6007';
const OUT = '/tmp/proto';
const ids = process.argv.slice(2);
const width = Number(process.env.SHOT_W || 1040);

(async () => {
  const fs = require('node:fs');
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  for (const id of ids) {
    const url = `${BASE}/iframe.html?id=${id}&viewMode=story`;
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(350);
      const out = `${OUT}/${id}-${scheme}.png`;
      await page.screenshot({ path: out, fullPage: true });
      console.log(out);
    }
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
