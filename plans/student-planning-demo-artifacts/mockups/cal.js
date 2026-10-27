function fmt(h) {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}
const WEEK = [
  { n: 'Mon', d: 26, past: true },
  { n: 'Tue', d: 27, today: true },
  { n: 'Wed', d: 28 },
  { n: 'Thu', d: 29 },
  { n: 'Fri', d: 30 },
  { n: 'Sat', d: 31 },
  { n: 'Sun', d: 1 },
];
// Priya's fixed week
const FIXED = [
  { day: 0, s: 10, e: 12, type: 'class', c: 'bio', title: 'Biology lecture', icon: 'repeat' },
  { day: 1, s: 14, e: 16, type: 'class', c: 'chem', title: 'Chemistry lecture', icon: 'repeat' },
  { day: 1, s: 17, e: 22, type: 'shift', title: 'Cafe shift', icon: 'coffee' },
  { day: 2, s: 10, e: 12, type: 'class', c: 'bio', title: 'Biology lecture', icon: 'repeat' },
  { day: 3, s: 17, e: 22, type: 'shift', title: 'Cafe shift', icon: 'coffee' },
];
const DUE = { 3: [{ t: 'Biology quiz 10:00', c: 'bio' }], 4: [{ t: 'Lab report 17:00', c: 'chem' }] };

function blockHTML(b, H, start) {
  const top = (b.s - start) * H + 1, h = (b.e - b.s) * H - 3;
  const cls = ['blk', b.type, b.c || '', b.dim ? 'dim' : '', b.glow ? 'glow' : '', b.sel ? 'sel' : ''].join(' ');
  const icon = b.icon ? `<i data-i="${b.icon}" data-s="12"></i>` : '';
  const showMeta = h > 30;
  const src = b.src && h > 46 ? `<div class="bs"><i data-i="audio-lines" data-s="12"></i>${b.src}</div>` : '';
  const pre = b.type === 'shift' ? icon : '';
  const post = b.type !== 'shift' ? icon : '';
  return `<div class="${cls}" style="top:${top}px;height:${h}px">
    <div class="bt">${pre}<span>${b.title}</span>${post}</div>
    ${showMeta ? `<div class="bm">${b.meta || fmt(b.s) + '-' + fmt(b.e)}</div>` : ''}${src}</div>`;
}

function renderWeek(el, o) {
  const H = o.H, start = o.start ?? 8, end = o.end ?? 22, days = o.days || WEEK;
  const g = o.gutter ?? 52;
  const cols = `${g}px repeat(${days.length}, 1fr)`;
  let head = `<div class="wk-head" style="grid-template-columns:${cols}"><div></div>` +
    days.map(d => `<div class="dh ${d.today ? 'today' : ''}">${d.n} <b>${d.d}</b></div>`).join('') + '</div>';
  let due = '';
  if (o.due !== false) {
    const D = o.dueMap || DUE;
    due = `<div class="wk-due" style="grid-template-columns:${cols}"><div class="lbl">Due</div>` +
      days.map((d, i) => `<div style="border-left:1px solid var(--line)">${(D[o.dayIdx ? o.dayIdx[i] : i] || []).map(x => `<span class="duechip ${x.c}"><span class="dot ${x.c}"></span>${x.t}</span>`).join('')}</div>`).join('') + '</div>';
  }
  let gut = '<div class="gut">';
  for (let h = start; h < end; h++) if (h > start) gut += `<span style="top:${(h - start) * H}px">${fmt(h)}</span>`;
  gut += '</div>';
  const colsHTML = days.map((d, i) => {
    const di = o.dayIdx ? o.dayIdx[i] : i;
    let s = `<div class="col ${d.past ? 'past' : ''}">`;
    for (let h = start + 1; h < end; h++) s += `<div class="hl" style="top:${(h - start) * H}px"></div>`;
    (o.free || []).filter(f => f.day === di).forEach(f => {
      s += `<div class="free" style="top:${(f.s - start) * H + 2}px;height:${(f.e - f.s) * H - 5}px">${f.label || ''}</div>`;
    });
    (o.blocks || []).filter(b => b.day === di).forEach(b => s += blockHTML(b, H, start));
    if (o.now && o.now.day === di) s += `<div class="now" style="top:${(o.now.t - start) * H}px"></div>`;
    return s + '</div>';
  }).join('');
  const bodyH = o.bodyH || (end - start) * H;
  el.innerHTML = head + due +
    `<div class="wk-scroll" style="height:${bodyH}px;overflow:hidden;position:relative"><div style="transform:translateY(${-(o.scroll || 0)}px)"><div class="wk-body" style="grid-template-columns:${cols};height:${(end - start) * H}px">${gut}${colsHTML}</div></div></div>`;
  el.classList.add('wk');
}

function topbar(o) {
  const tabs = o.tabs || [
    ['moon', 'Evening Review'], ['graduation-cap', 'Exam Prep'], ['book-open', 'In Lecture'], ['calendar-days', 'My week'],
  ];
  return `<div class="topbar">
    <button class="iconbtn"><i data-i="menu" data-s="20"></i></button>
    <div class="tabs">${tabs.map(([ic, n]) => `<div class="tab ${n === o.active ? 'on' : ''}"><i data-i="${ic}" data-s="16"></i>${n}</div>`).join('')}
      <div class="tab add"><i data-i="plus" data-s="16"></i></div></div>
    ${o.showing === null ? '' : `<span class="showing">Showing: <b>${o.showing || 'All courses'}</b></span>`}
    ${o.today ? `<span class="today-line">${o.today}</span>` : ''}
    <span class="spacer"></span>
    <button class="iconbtn"><i data-i="zap" data-s="18"></i></button>
    <button class="iconbtn"><i data-i="moon" data-s="18"></i></button>
    <button class="iconbtn"><i data-i="settings" data-s="18"></i></button>
    <button class="iconbtn"><i data-i="layout-grid" data-s="18"></i></button>
  </div>`;
}
const TODAY_LINE = 'Tuesday <span class="sep">·</span> Chemistry 14:00 <span class="sep">·</span> shift 17:00-22:00 <span class="sep">·</span> <b>2h free</b>';

function wh(icon, title, extra) {
  return `<div class="wh"><span class="wicon"><i data-i="${icon}" data-s="16"></i></span><h2>${title}</h2>${extra || ''}
    <span class="acts"><button class="iconbtn sm"><i data-i="zap" data-s="15"></i></button><button class="iconbtn sm"><i data-i="maximize-2" data-s="15"></i></button><button class="iconbtn sm"><i data-i="x" data-s="15"></i></button></span></div>`;
}
