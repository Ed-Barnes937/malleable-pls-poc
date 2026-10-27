import pw from '/Users/edward.barnes@glean.co/Code/Genio/playground/malleable-plc-poc/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.js'; const { chromium } = pw;
const here = new URL('.', import.meta.url).pathname;
const jobs = JSON.parse(process.argv[2]);
const browser = await chromium.launch();
for (const [file, out, w, h, full] of jobs) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.goto('file://' + here + file, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: here + 'png/' + out, fullPage: !!full });
  console.log('ok', out, await page.evaluate(() => document.fonts.check('14px "DM Sans"')));
  await page.close();
}
await browser.close();
