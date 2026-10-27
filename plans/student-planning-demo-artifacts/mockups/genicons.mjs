import fs from 'node:fs';
const dir = '/Users/edward.barnes@glean.co/Code/Genio/playground/malleable-plc-poc/node_modules/.pnpm/lucide-react@1.61.0_@types+react@19.3.0_react@19.3.1/node_modules/lucide-react/dist/esm/icons/';
const names = 'coffee arrow-right audio-lines book-open-text book-open calendar-clock calendar-days calendar check chevron-left chevron-right circle-help clock file-text flag graduation-cap grip-vertical layers layout-grid list-checks list-todo maximize-2 menu mic moon play plus refresh-cw repeat scissors search settings sparkles split star sun target trending-up undo-2 upload x zap'.split(' ');
const out = {};
for (const n of names) {
  const mod = await import(dir + n + '.mjs');
  if (!mod.__iconData) { console.log("missing", n, Object.keys(mod)); continue; }
  const node = mod.__iconData.node;
  out[n] = node.map(([t, a]) => '<' + t + ' ' + Object.entries(a).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${v}"`).join(' ') + '/>').join('');
}
fs.writeFileSync('icons.js', 'const ICONS=' + JSON.stringify(out) + ';\nfunction paintIcons(){document.querySelectorAll("i[data-i]").forEach(el=>{const s=el.dataset.s||16;el.outerHTML=`<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${el.dataset.w||2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[el.dataset.i]||""}</svg>`});}\n');
