import pw from '/Users/edward.barnes@glean.co/Code/Genio/playground/malleable-plc-poc/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.js';
const b = await pw.chromium.launch(); const p = await b.newPage();
p.on('pageerror', e => console.log('ERR', e.message)); p.on('console', m => console.log('LOG', m.text()));
await p.goto('file://' + process.cwd() + '/' + process.argv[2]); await p.waitForTimeout(500); await b.close();
