// ลอยกระทงออนไลน์ — ตกแต่งกระทง ใส่เลขและคำอธิษฐาน แล้วลอยไปพร้อมกระทงของทุกคนบนแม่น้ำยามค่ำคืน
// ทุกคนลอยได้โดยไม่ต้องเข้าสู่ระบบ (จำกัด 5 ใบต่อเครื่องต่อชั่วโมง) ผู้มีสิทธิ์ประกาศข่าวซ่อนกระทงที่ไม่เหมาะสมได้
(() => {
  'use strict';
  const SC = window.SC;
  const { $, $$, esc, can, toast } = SC;

  const BASES = {
    leaf: { label: 'ใบตอง', icon: '🍃' },
    bread: { label: 'ขนมปัง', icon: '🍞' },
    lotus: { label: 'ดอกบัว', icon: '🪷' },
    coconut: { label: 'กะลามะพร้าว', icon: '🥥' },
  };
  const PETALS = ['#f06292', '#ba68c8', '#ffffff', '#ffb74d', '#e53935', '#4fc3f7', '#81c784', '#fff176'];
  const FLOWERS = ['#ffd54f', '#ff8a65', '#ffffff', '#f48fb1', '#ce93d8', '#e57373'];
  // ของตกแต่ง แบ่งหมวดในหน้าเลือก — เลือกได้สูงสุด MAX_DECO อย่าง
  const DECOS = {
    jasmine: '🤍 มาลัยมะลิ', orchid: '💜 กล้วยไม้', leaves: '🌿 ใบไม้เพิ่ม', lotusbud: '🪷 บัวตูม',
    bunny: '🐰 กระต่ายน้อย', duck: '🐥 เป็ดน้อย', fish: '🐟 ปลาน้อย', butterfly: '🦋 ผีเสื้อ', hearts: '💗 หัวใจ', bow: '🎀 โบว์',
    sparkle: '✨ ประกายทอง', fireflies: '🌟 หิ่งห้อย', candles: '🕯️ เทียนเพิ่ม', star: '⭐ คทาดาว', rainbow: '🌈 สายรุ้ง', beads: '🔮 ลูกปัดสี', coin: '🪙 เหรียญ',
  };
  const DECO_GROUPS = [
    ['ดอกไม้และใบไม้', ['jasmine', 'orchid', 'leaves', 'lotusbud']],
    ['น่ารักกุ๊กกิ๊ก', ['bunny', 'duck', 'fish', 'butterfly', 'hearts', 'bow']],
    ['แสงและประกาย', ['sparkle', 'fireflies', 'candles', 'star', 'rainbow', 'beads', 'coin']],
  ];
  const MAX_DECO = 6;
  const ks = { items: null, total: 0, mine: new Set(), built: false, timer: null,
    design: { base: 'leaf', petal: PETALS[0], flower: FLOWERS[0], deco: ['jasmine'] } };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* ไม่มี storage */ } },
  };
  let tempDevice = '';
  function deviceId() {
    let id = store.get('sc_device_id');
    if (!id) { id = tempDevice || SC.uid(); store.set('sc_device_id', id); tempDevice = id; }
    return id;
  }
  try { JSON.parse(store.get('sc_my_krathongs') || '[]').forEach(id => ks.mine.add(id)); } catch (_) { /* ข้อมูลเสีย */ }
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  // สุ่มแบบคงที่ตาม id เพื่อให้กระทงแต่ละใบอยู่ตำแหน่งเดิมทุกครั้งที่เปิด
  const seeded = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296; };

  /* ================= วาดกระทง (SVG) ================= */
  // กลีบแหลมเรียงเป็นวง (cx, cy) รัศมี r จำนวน n กลีบ
  function petalRing(cx, cy, rx, ry, n, len, fill, stroke, off = 0) {
    let out = '';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + off;
      const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
      const tx = cx + Math.cos(a) * (rx + len), ty = cy + Math.sin(a) * (ry + len * 0.55) - len * 0.55;
      const w = 7;
      const nx = -Math.sin(a) * w, ny = Math.cos(a) * w * 0.6;
      out += `<path d="M${(x - nx).toFixed(1)},${(y - ny).toFixed(1)} Q${(tx - nx * 0.4).toFixed(1)},${(ty - ny).toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)} Q${(tx + nx * 0.4).toFixed(1)},${(ty + ny).toFixed(1)} ${(x + nx).toFixed(1)},${(y + ny).toFixed(1)}Z" fill="${fill}" stroke="${stroke}" stroke-width=".8"/>`;
    }
    return out;
  }
  // ชื่อสั้นสำหรับธง: ตัดคำนำหน้า ใช้คำแรก ไม่เกิน 12 ตัวอักษร
  const shortName = (n) => String(n || '').trim().replace(/^(นางสาว|นาย|นาง|เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.)\s*/, '').split(/\s+/)[0].slice(0, 12);
  const whoOf = (k) => [k.name, k.classroom].filter(Boolean).map(esc).join(' · ') || 'ไม่ระบุชื่อ';
  const isAdmin = () => !!(SC.state.session && SC.state.session.role === 'admin');
  const BEAD_COLORS =['#ef5350', '#ffca28', '#66bb6a', '#42a5f5', '#ab47bc', '#ff8a65'];
  function starPath(cx, cy, r, fill, stroke) {
    const pts = Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; return `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`; });
    return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width=".7" class="lk-sparkle"/>`;
  }
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => Math.max(0, Math.min(255, Math.round(c * k)));
    return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  function krathongSvg(d, opt = {}) {
    const base = BASES[d.base] ? d.base : 'leaf';
    const petal = d.petal || PETALS[0], flower = d.flower || FLOWERS[0];
    const deco = new Set(String(Array.isArray(d.deco) ? d.deco.join(',') : d.deco || '').split(',').filter(Boolean));
    const uid = 'k' + Math.random().toString(36).slice(2, 8);
    let body = '';
    if (base === 'leaf') {
      body = `<ellipse cx="60" cy="74" rx="40" ry="12" fill="#1b5e20"/>
        <path d="M20 70 Q60 92 100 70 L96 62 Q60 78 24 62Z" fill="#2e7d32"/>
        ${petalRing(60, 62, 30, 9, 12, 14, '#43a047', '#1b5e20')}
        ${petalRing(60, 60, 24, 7, 10, 10, '#66bb6a', '#2e7d32', 0.3)}`;
    } else if (base === 'bread') {
      body = `<ellipse cx="60" cy="74" rx="40" ry="12" fill="#8d5524"/>
        <path d="M20 70 Q60 94 100 70 L98 62 Q60 80 22 62Z" fill="#c68642"/>
        ${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<circle cx="${28 + i * 9}" cy="${71 + (i % 2) * 3}" r="1.3" fill="#8d5524" opacity=".6"/>`).join('')}
        ${petalRing(60, 62, 30, 9, 12, 13, petal, shade(petal, 0.75))}`;
    } else if (base === 'lotus') {
      body = `<ellipse cx="60" cy="74" rx="38" ry="11" fill="${shade(petal, 0.55)}"/>
        ${petalRing(60, 66, 30, 9, 9, 18, shade(petal, 0.85), shade(petal, 0.6))}
        ${petalRing(60, 62, 22, 7, 8, 16, petal, shade(petal, 0.7), 0.35)}`;
    } else {
      body = `<path d="M20 64 Q60 98 100 64Z" fill="#5d4037"/>
        <path d="M22 65 Q60 92 98 65" fill="none" stroke="#8d6e63" stroke-width="3"/>
        ${[0, 1, 2, 3, 4].map(i => `<path d="M${32 + i * 13} 70 q3 6 6 0" stroke="#3e2723" stroke-width="1" fill="none" opacity=".6"/>`).join('')}
        ${petalRing(60, 62, 28, 8, 11, 12, petal, shade(petal, 0.75))}`;
    }
    if (base === 'leaf') body += petalRing(60, 58, 18, 6, 9, 10, petal, shade(petal, 0.75), 0.15);
    const extras = [
      deco.has('leaves') ? `${petalRing(60, 66, 36, 10, 8, 9, '#2e7d32', '#1b5e20', 0.2)}` : '',
      deco.has('jasmine') ? Array.from({ length: 16 }, (_, i) => { const a = i / 16 * Math.PI * 2; return `<circle cx="${(60 + Math.cos(a) * 31).toFixed(1)}" cy="${(68 + Math.sin(a) * 8).toFixed(1)}" r="2.4" fill="#fffde7" stroke="#e0e0c8" stroke-width=".5"/>`; }).join('') : '',
      deco.has('orchid') ? [[34, 56], [86, 56], [60, 66]].map(([x, y]) => `<g transform="translate(${x} ${y})"><circle r="4" fill="#ab47bc"/><circle r="4" cx="5" fill="#ce93d8"/><circle r="4" cx="-5" fill="#ce93d8"/><circle r="2" fill="#fff59d"/></g>`).join('') : '',
      deco.has('coin') ? `<circle cx="78" cy="64" r="4.5" fill="#ffca28" stroke="#ff8f00" stroke-width="1"/><circle cx="42" cy="65" r="4" fill="#ffd54f" stroke="#ff8f00" stroke-width="1"/>` : '',
      deco.has('beads') ? Array.from({ length: 14 }, (_, i) => { const a = i / 14 * Math.PI * 2 + 0.2; return `<circle cx="${(60 + Math.cos(a) * 34).toFixed(1)}" cy="${(71 + Math.sin(a) * 9).toFixed(1)}" r="2.1" fill="${BEAD_COLORS[i % BEAD_COLORS.length]}" stroke="#fff" stroke-width=".5"/>`; }).join('') : '',
      deco.has('candles') ? [42, 80].map(x => `<rect x="${x - 1.8}" y="40" width="3.6" height="11" rx="1" fill="#fff3e0" stroke="#e0d0b0" stroke-width=".4"/><path d="M${x} 35 Q${x + 2.4} 39 ${x} 41.5 Q${x - 2.4} 39 ${x} 35Z" fill="#ffb300" class="lk-flame"/>`).join('') : '',
      deco.has('lotusbud') ? `<path d="M76 58 Q78 44 80 34" stroke="#558b2f" stroke-width="1.4" fill="none"/><path d="M80 24 Q86 31 80 37 Q74 31 80 24Z" fill="#f48fb1" stroke="#ec407a" stroke-width=".6"/><path d="M80 27 Q83 32 80 37 Q77 32 80 27Z" fill="#f8bbd0"/>` : '',
      deco.has('star') ? `<path d="M42 58 L38 32" stroke="#bf8f00" stroke-width="1.4"/>${starPath(38, 27, 6, '#ffd54f', '#ff8f00')}` : '',
    ].join('');
    // ของน่ารักที่วางหน้ากระทงและบนน้ำ (วาดทับเทียนและดอกไม้)
    const front = [
      deco.has('bow') ? `<g transform="translate(60 80)"><path d="M0 0 L-12 -6 Q-15 0 -12 6Z" fill="#ec407a"/><path d="M0 0 L12 -6 Q15 0 12 6Z" fill="#ec407a"/><path d="M-1.5 1.5 L-6 10 L-2.5 9Z M1.5 1.5 L6 10 L2.5 9Z" fill="#d81b60"/><circle r="3" fill="#f06292"/></g>` : '',
      deco.has('bunny') ? `<g transform="translate(30 56)"><ellipse cx="-3" cy="-9" rx="2.3" ry="6" fill="#fff" stroke="#e0e0e0" stroke-width=".5"/><ellipse cx="3" cy="-9" rx="2.3" ry="6" fill="#fff" stroke="#e0e0e0" stroke-width=".5"/><ellipse cx="-3" cy="-9" rx="1" ry="4" fill="#f8bbd0"/><ellipse cx="3" cy="-9" rx="1" ry="4" fill="#f8bbd0"/><circle r="6" fill="#fff" stroke="#e0e0e0" stroke-width=".5"/><circle cx="-2.2" cy="-.6" r=".9" fill="#333"/><circle cx="2.2" cy="-.6" r=".9" fill="#333"/><ellipse cy="1.5" rx=".9" ry=".6" fill="#f48fb1"/><circle cx="-3.9" cy="1.8" r="1.2" fill="#f8bbd0"/><circle cx="3.9" cy="1.8" r="1.2" fill="#f8bbd0"/></g>` : '',
      deco.has('duck') ? `<g transform="translate(108 80)" class="lk-paddle"><ellipse rx="8" ry="5" fill="#ffd54f"/><path d="M-8 -1 l-3 -4 l1 5Z" fill="#ffca28"/><circle cx="5" cy="-6" r="4.2" fill="#ffd54f"/><path d="M8.8 -6.6 l4.2 1 l-4.2 1.6Z" fill="#ff8f00"/><circle cx="6.2" cy="-7.2" r=".85" fill="#333"/><circle cx="4" cy="-4.6" r="1" fill="#ffab91"/></g>` : '',
      deco.has('fish') ? `<g transform="translate(10 88)" class="lk-paddle"><path d="M-5 0 l-6 -4.5 v9Z" fill="#ff7043"/><ellipse rx="7" ry="4" fill="#ff8a65"/><circle cx="3.5" cy="-1" r=".9" fill="#333"/><path d="M-1 -3.6 q2 -3 4 0" fill="#ffab91"/></g>` : '',
      deco.has('butterfly') ? `<g transform="translate(20 24)"><g class="lk-flutter"><ellipse cx="-4.5" cy="-2" rx="5" ry="4" fill="#4fc3f7"/><ellipse cx="4.5" cy="-2" rx="5" ry="4" fill="#4fc3f7"/><ellipse cx="-3.5" cy="3" rx="3.5" ry="3" fill="#b3e5fc"/><ellipse cx="3.5" cy="3" rx="3.5" ry="3" fill="#b3e5fc"/></g><rect x="-.8" y="-5" width="1.6" height="10" rx=".8" fill="#37474f"/></g>` : '',
      deco.has('hearts') ? [[14, 44, 0.9], [100, 44, 0.7], [108, 58, 0.55]].map(([x, y, s], i) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-5 -2 C-5 -6 0 -7 0 -3 C0 -7 5 -6 5 -2 C5 2 0 5 0 7 C0 5 -5 2 -5 -2Z" fill="${['#ff6fa5', '#ff8fb8', '#f06292'][i]}" class="lk-floaty"/></g>`).join('') : '',
      deco.has('fireflies') ? [[8, 30], [26, 8], [96, 10], [114, 28], [4, 60], [116, 46]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="1.7" fill="#fff59d" class="lk-ff" style="animation-delay:-${i * 0.7}s"/>`).join('') : '',
    ].join('');
    const behind = deco.has('rainbow') ? ['#ef5350', '#ffca28', '#66bb6a', '#42a5f5'].map((c, i) => `<path d="M${16 + i * 4} 66 A${44 - i * 4} ${40 - i * 4} 0 0 1 ${104 - i * 4} 66" fill="none" stroke="${c}" stroke-width="3" opacity=".75"/>`).join('') : '';
    const cluster = [[60, 50, 7], [50, 54, 5.5], [70, 54, 5.5], [55, 46, 4.5], [66, 46, 4.5]]
      .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${flower}"/><circle cx="${x - r * 0.3}" cy="${y - r * 0.3}" r="${r * 0.45}" fill="${shade(flower, 1.15)}" opacity=".8"/>`).join('');
    const sparkle = deco.has('sparkle') ? [[30, 40], [92, 44], [80, 30], [40, 28]].map(([x, y]) => `<path d="M${x} ${y - 4} L${x + 1} ${y - 1} L${x + 4} ${y} L${x + 1} ${y + 1} L${x} ${y + 4} L${x - 1} ${y + 1} L${x - 4} ${y} L${x - 1} ${y - 1}Z" fill="#ffe082" class="lk-sparkle"/>`).join('') : '';
    // ธงบนกระทงแสดงชื่อ (ไม่แสดงเลขประจำตัว)
    const number = shortName(d.name);
    const flag = number ?`<line x1="88" y1="58" x2="88" y2="22" stroke="#6d4c41" stroke-width="1.5"/>
      <path d="M88 22 h${Math.max(18, number.length * 6.2 + 8)} l-4 6 l4 6 h-${Math.max(18, number.length * 6.2 + 8)}Z" fill="#ffd54f" stroke="#ff8f00" stroke-width=".8"/>
      <text x="${88 + Math.max(18, number.length * 6.2 + 8) / 2 - 1}" y="31.5" font-size="8.5" font-weight="700" text-anchor="middle" fill="#5d2e00" font-family="Prompt, sans-serif">${esc(number)}</text>` : '';
    return `<svg viewBox="0 0 ${number ? 140 : 120} 100" class="lk-svg" aria-hidden="true">
      <defs><radialGradient id="${uid}g"><stop offset="0" stop-color="#ffcc66" stop-opacity=".9"/><stop offset="1" stop-color="#ff9800" stop-opacity="0"/></radialGradient></defs>
      <ellipse cx="60" cy="82" rx="46" ry="7" fill="#000" opacity=".25"/>
      ${behind}${body}${extras}${cluster}
      <line x1="52" y1="46" x2="49" y2="22" stroke="#8d6e63" stroke-width="1.2"/><line x1="56" y1="46" x2="55" y2="20" stroke="#8d6e63" stroke-width="1.2"/><line x1="68" y1="46" x2="71" y2="22" stroke="#8d6e63" stroke-width="1.2"/>
      <circle cx="49" cy="22" r="1.4" fill="#ff7043" class="lk-ember"/><circle cx="55" cy="20" r="1.4" fill="#ff7043" class="lk-ember"/><circle cx="71" cy="22" r="1.4" fill="#ff7043" class="lk-ember"/>
      <rect x="60" y="30" width="5" height="17" rx="1.5" fill="#fffde7" stroke="#e0d9b5" stroke-width=".5"/>
      <circle cx="62.5" cy="24" r="13" fill="url(#${uid}g)" class="lk-glow"/>
      <path d="M62.5 18 Q66 24 62.5 29 Q59 24 62.5 18Z" fill="#ffb300" class="lk-flame"/><path d="M62.5 21 Q64.3 25 62.5 28 Q60.7 25 62.5 21Z" fill="#fff8e1" class="lk-flame"/>
      ${sparkle}${front}${flag}${opt.label ? `<text x="60" y="97" font-size="8" text-anchor="middle" fill="#ffe082" font-family="Prompt, sans-serif">${esc(opt.label)}</text>` : ''}
    </svg>`;
  }

  /* ================= ฉากแม่น้ำ ================= */
  function buildScene() {
    if (ks.built) return;
    ks.built = true;
    const sky = $('#lkStars');
    sky.innerHTML = Array.from({ length: 90 }, (_, i) => {
      const r = seeded('s' + i);
      return `<i style="left:${(r() * 100).toFixed(2)}%;top:${(r() * 52).toFixed(2)}%;--s:${(0.6 + r() * 1.8).toFixed(1)}px;animation-delay:-${(r() * 6).toFixed(1)}s;animation-duration:${(2.5 + r() * 4).toFixed(1)}s"></i>`;
    }).join('');
    $('#lkLanterns').innerHTML = Array.from({ length: 9 }, (_, i) => {
      const r = seeded('l' + i);
      return `<i style="left:${(5 + r() * 90).toFixed(1)}%;--d:${(24 + r() * 26).toFixed(0)}s;animation-delay:-${(r() * 40).toFixed(1)}s;--x:${(r() * 60 - 30).toFixed(0)}px;--z:${(0.5 + r() * 0.7).toFixed(2)}"></i>`;
    }).join('');
  }

  // แสดงกระทงทุกใบตามจำนวนที่ลอยจริง — ยิ่งมากยิ่งย่อขนาดลงและกระจายหลายแถว ให้แม่น้ำไม่แน่นเกินไป
  function renderRiver(fresh) {
    const box = $('#lkRiver');
    const n = ks.items.length;
    const lanes = n > 120 ? 9 : n > 40 ? 7 : 5;
    const size = n > 300 ? 0.55 : n > 120 ? 0.7 : n > 40 ? 0.85 : 1;
    // กระทงจำนวนมาก: ปิดการโยกตัวเพื่อให้มือถือไม่หน่วง (ยังลอยไปตามน้ำเหมือนเดิม)
    box.classList.toggle('is-crowded', n > 150);
    $('#lkEmpty').hidden = n > 0;
    box.innerHTML = ks.items.map((k) => {
      const r = seeded(k.id);
      const lane = Math.floor(r() * lanes);
      const depth = lane / (lanes - 1); // 0 = ไกล, 1 = ใกล้
      const dur = (reduced() ? 160 : 70) + r() * 50 - depth * 20;
      const mine = ks.mine.has(k.id);
      const delay = k.id === fresh ? 0 : -(r() * dur);
      return `<button class="lk-k ${mine ? 'is-mine' : ''} ${k.id === fresh ? 'is-new' : ''}" data-id="${esc(k.id)}"
        style="top:${(8 + depth * 62).toFixed(1)}%;--w:${((64 + depth * 76) * size).toFixed(0)}px;--dur:${dur.toFixed(0)}s;animation-delay:${delay.toFixed(1)}s;z-index:${10 + lane};--bob:${(2.5 + r() * 2).toFixed(1)}s"
        aria-label="กระทง${k.name ? 'ของ ' + esc(k.name) : ''}${k.classroom ? ' ' + esc(k.classroom) : ''}">
        <span class="lk-bob">${krathongSvg(k, { label: mine ? 'กระทงของฉัน' : '' })}</span><span class="lk-refl"></span></button>`;
    }).join('');
    $$('.lk-k', box).forEach(b => (b.onclick = (e) => { e.stopPropagation(); bubble(b, ks.items.find(k => k.id === b.dataset.id)); }));
    $('#lkCount').textContent = ks.total.toLocaleString('th-TH');
    renderWishes();
  }

  function bubble(btn, k) {
    closeBubble();
    if (!k) return;
    const scene = $('#lkScene'), rect = btn.getBoundingClientRect(), sr = scene.getBoundingClientRect();
    const b = document.createElement('div');
    b.className = 'lk-bubble';
    const adm = ks.admin && ks.admin.find(x => x.id === k.id);
    b.innerHTML = `<span class="lk-num">${whoOf(k)}</span>
      <p>${k.wish ? '“' + esc(k.wish) + '”' : '<i>เจ้าของกระทงเก็บคำอธิษฐานไว้เป็นความลับ</i>'}</p>
      <small>${ks.mine.has(k.id) ? 'กระทงของคุณ' : ''}${adm ? `${ks.mine.has(k.id) ? ' · ' : ''}เลขประจำตัว ${esc(adm.number)} (เห็นเฉพาะผู้ดูแล)` : ''}</small>
      ${isAdmin() ? '<button class="lk-hide" data-del>ลบกระทงนี้</button>' : can('news') ? '<button class="lk-hide">ซ่อนกระทงนี้</button>' : ''}`;
    scene.append(b);
    const x = Math.min(Math.max(rect.left - sr.left + rect.width / 2, 130), sr.width - 130);
    b.style.left = x + 'px';
    b.style.top = Math.max(rect.top - sr.top - 8, 70) + 'px';
    const hide = $('.lk-hide', b);
    if (hide && hide.hasAttribute('data-del')) hide.onclick = () => removeKrathong(k.id);
    else if (hide) hide.onclick = async () => {
      if (!confirm('ซ่อนกระทงนี้จากแม่น้ำ? (ใช้กับข้อความไม่เหมาะสม)')) return;
      try { await SC.authed({ action: 'hideKrathong', id: k.id }); ks.items = ks.items.filter(x2 => x2.id !== k.id); ks.total--; closeBubble(); renderRiver(); toast('ซ่อนกระทงแล้ว'); } catch (err) { toast(err.message, true); }
    };
  }

  // ผู้ดูแลระบบลบกระทงออกถาวร (ทั้งจากบนแม่น้ำและในตาราง)
  async function removeKrathong(id) {
    const k = (ks.admin || []).find(x => x.id === id) || ks.items.find(x => x.id === id) || {};
    if (!confirm(`ลบกระทงของ ${k.name || 'ไม่ระบุชื่อ'}${k.classroom ? ' ' + k.classroom : ''} ออกถาวร?\nลบแล้วกู้คืนไม่ได้`)) return;
    try {
      await SC.authed({ action: 'deleteKrathong', id });
      if (ks.items.some(x => x.id === id)) { ks.items = ks.items.filter(x => x.id !== id); ks.total--; }
      if (ks.admin) ks.admin = ks.admin.filter(x => x.id !== id);
      closeBubble();
      renderRiver();
      renderAdmin();
      toast('ลบกระทงแล้ว');
    } catch (err) { toast(err.message, true); }
  }

  /* ================= ตารางผู้ดูแลระบบ ================= */
  async function loadAdmin() {
    if (!isAdmin()) { ks.admin = null; renderAdmin(); return; }
    try { ks.admin = await SC.authed({ action: 'adminKrathongs' }); } catch (err) { ks.admin = null; toast(err.message, true); }
    renderAdmin();
  }
  function renderAdmin() {
    const box = $('#lkAdmin');
    box.hidden = !isAdmin() || !ks.admin;
    if (box.hidden) return;
    const q = ($('#lkAdminQ') && $('#lkAdminQ').value || '').trim().toLowerCase();
    const list = [...ks.admin].reverse().filter(k => !q || [k.name, k.classroom, k.number, k.wish].join(' ').toLowerCase().includes(q));
    $('#lkAdminBody').innerHTML = list.length ? list.map(k => `<tr${k.hidden ? ' class="is-hidden"' : ''}>
        <td>${esc(k.name || '-')}</td><td>${esc(k.classroom || '-')}</td><td>${esc(k.number || '-')}</td>
        <td class="lk-awish">${esc(k.wish)}${k.showWish ? '' : ' <span class="badge">ความลับ</span>'}${k.hidden ? ' <span class="badge">ถูกซ่อน</span>' : ''}</td>
        <td>${new Date(k.createdAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</td>
        <td><button class="btn-link danger" data-kdel="${esc(k.id)}">ลบ</button></td></tr>`).join('')
      : '<tr><td colspan="6" class="empty">ไม่พบกระทง</td></tr>';
    $('#lkAdminCount').textContent = `ทั้งหมด ${ks.admin.length.toLocaleString('th-TH')} ใบ`;
    $$('[data-kdel]').forEach(b => (b.onclick = () => removeKrathong(b.dataset.kdel)));
  }
  const closeBubble = () => { const b = $('.lk-bubble'); if (b) b.remove(); };

  function renderWishes() {
    const list = ks.items.filter(k => k.wish).slice(-12).reverse();
    $('#lkWishes').innerHTML = list.length ? list.map(k => `<li><span class="lk-wk">${krathongSvg(k)}</span><div><p>“${esc(k.wish)}”</p><small>${whoOf(k)}</small></div></li>`).join('')
      : '<li class="lk-empty">ยังไม่มีคำอธิษฐานที่เปิดให้เห็น มาเป็นคนแรกกันเถอะ</li>';
  }

  /* ================= ตกแต่งกระทง ================= */
  function renderBuilder() {
    const d = ks.design;
    $('#lkBases').innerHTML = Object.entries(BASES).map(([k, v]) => `<button type="button" class="lk-opt ${d.base === k ? 'on' : ''}" data-base="${k}" aria-pressed="${d.base === k}"><span>${v.icon}</span>${v.label}</button>`).join('');
    $('#lkPetals').innerHTML = PETALS.map(c => `<button type="button" class="lk-sw ${d.petal === c ? 'on' : ''}" data-petal="${c}" style="--c:${c}" aria-label="สีกลีบ ${c}" aria-pressed="${d.petal === c}"></button>`).join('');
    $('#lkFlowers').innerHTML = FLOWERS.map(c => `<button type="button" class="lk-sw ${d.flower === c ? 'on' : ''}" data-flower="${c}" style="--c:${c}" aria-label="สีดอกไม้ ${c}" aria-pressed="${d.flower === c}"></button>`).join('');
    $('#lkDecos').innerHTML = DECO_GROUPS.map(([title, keys]) => `<div class="lk-dgroup"><small>${title}</small><div class="lk-chips">${keys.map(k =>
      `<button type="button" class="lk-chip ${d.deco.includes(k) ? 'on' : ''}" data-deco="${k}" aria-pressed="${d.deco.includes(k)}">${DECOS[k]}</button>`).join('')}</div></div>`).join('')
      + `<p class="hint lk-dcount">เลือกแล้ว ${d.deco.length}/${MAX_DECO} อย่าง</p>`;
    preview();
    $$('[data-base]').forEach(b => (b.onclick = () => { d.base = b.dataset.base; renderBuilder(); }));
    $$('[data-petal]').forEach(b => (b.onclick = () => { d.petal = b.dataset.petal; renderBuilder(); }));
    $$('[data-flower]').forEach(b => (b.onclick = () => { d.flower = b.dataset.flower; renderBuilder(); }));
    $$('[data-deco]').forEach(b => (b.onclick = () => {
      const i = d.deco.indexOf(b.dataset.deco);
      if (i >= 0) d.deco.splice(i, 1);
      else if (d.deco.length >= MAX_DECO) return toast(`เลือกของตกแต่งได้สูงสุด ${MAX_DECO} อย่าง เอาอันเดิมออกก่อนนะ`, true);
      else d.deco.push(b.dataset.deco);
      renderBuilder();
    }));
  }
  // สุ่มแบบ สี และของตกแต่ง 3–4 อย่าง
  function randomDesign() {
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const keys = Object.keys(DECOS).sort(() => Math.random() - 0.5);
    ks.design = { base: pick(Object.keys(BASES)), petal: pick(PETALS), flower: pick(FLOWERS), deco: keys.slice(0, 3 + Math.floor(Math.random() * 2)) };
    renderBuilder();
  }

  /* ================= กรองคำไม่สุภาพ ================= */
  // ตัดช่องว่าง/สัญลักษณ์ที่ใช้เลี่ยงคำ และตัวอักษรซ้ำ แล้วเทียบกับรายการคำ (บางคำยกเว้นคำปกติที่หน้าตาคล้ายกัน)
  const RUDE_TONED = [/ควย/, /เหี้ย/, /เหี่ย(?!ว)/, /เชี่ย/, /สัส/, /สัด(?!ส)/, /เย็ด/, /เยด/, /(?<!เ)หี(?![บดย่])/, /มึง/, /แม่ง/, /ห่า(?!น)/, /ระยำ/, /[ชฉ]ิบหาย/,
    /จัญไร/, /ดอกทอง/, /ส้นตีน/, /เสือก/, /กะหรี่/, /เงี่ยน/, /จิ๋ม/, /ตอแหล/, /สถุน/, /ร่าน/, /(ไอ้|อี)(สัตว์|ควาย|เวร)/, /อีดอก/, /ชาติหมา/,
    /ปัญญาอ่อน/, /เชร็?ด/, /เหีย(?![วน])/];
  const RUDE_LATIN = [/fu+c?k/, /fck/, /sh[i1]t/, /b[i1]tch/, /btch/, /dick(?!ens)/, /pussy/, /asshole/, /bastard/, /cunt/, /motherf/, /wtf/, /stfu/, /slut/, /whore/, /nigg/, /porn/];
  function rudeWord(text) {
    const raw = String(text || '').toLowerCase();
    const thai = raw.replace(/[^฀-๿]/g, '').replace(/(.)\1+/g, '$1');
    const latin = raw.replace(/[0@4]/g, (c) => ({ 0: 'o', '@': 'a', 4: 'a' })[c]).replace(/[1!]/g, 'i').replace(/3/g, 'e').replace(/[5$]/g, 's').replace(/7/g, 't')
      .replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
    const spaced = raw.replace(/[^฀-๿a-z\s]/g, ' ');
    return RUDE_TONED.some(re => re.test(thai)) || RUDE_LATIN.some(re => re.test(latin)) || /(^|\s)กู(\s|$|จะ|ขอ|อยาก|ว่า)/.test(spaced);
  }
  function checkRude() {
    const f = $('#lkForm');
    const bad = rudeWord(f.wish.value) ? 'คำอธิษฐาน' : rudeWord(f.name.value) ? 'ชื่อ' : '';
    $('#lkRude').hidden = !bad;
    $('#lkRude').textContent = bad ? `${bad}มีคำไม่สุภาพ กรุณาแก้ไขก่อนลอยกระทงนะ 🙏` : '';
    $('button[type=submit]', f).disabled = !!bad;
    return bad;
  }
  const preview = () => { $('#lkPreview').innerHTML = krathongSvg({ ...ks.design, name: $('#lkForm').name.value }); };
  const classroomOf = (f) => f.level.value && f.room.value ? `ม.${f.level.value}/${f.room.value}` : '';

  async function launch(e) {
    e.preventDefault();
    const f = $('#lkForm'), btn = $('button[type=submit]', f), err = $('.err', f);
    err.textContent = '';
    const wish = f.wish.value.trim(), sid = f.number.value.trim(), name = f.name.value.trim(), classroom = classroomOf(f);
    if (!name) { err.textContent = 'กรุณากรอกชื่อ'; f.name.focus(); return; }
    if (!classroom) { err.textContent = 'กรุณาเลือกชั้นและห้อง เช่น ม.1/1'; (f.level.value ? f.room : f.level).focus(); return; }
    if (!/^\d{5}$/.test(sid)) { err.textContent = 'กรุณากรอกเลขประจำตัวนักเรียน 5 หลัก'; f.number.focus(); return; }
    if (!wish) { err.textContent = 'อย่าลืมเขียนคำอธิษฐานนะ'; f.wish.focus(); return; }
    if (checkRude()) return;
    btn.disabled = true;
    const d = ks.design;
    const payload = { action: 'floatKrathong', base: d.base, petal: d.petal, flower: d.flower, deco: d.deco.join(','), number: sid,
      wish, name, classroom, showWish: f.showWish.checked, deviceId: deviceId(), website: f.website.value };
    try {
      const r = await SC.apiPost(payload);
      ks.mine.add(r.id);
      store.set('sc_my_krathongs', JSON.stringify([...ks.mine].slice(-30)));
      const item = { id: r.id, base: payload.base, petal: payload.petal, flower: payload.flower, deco: payload.deco,
        name: payload.name, classroom: payload.classroom, wish: payload.showWish ? wish : '', showWish: payload.showWish, createdAt: new Date().toISOString() };
      ks.items.push(item);
      ks.total++;
      // ส่วนตัว: จำคำอธิษฐานของตัวเองไว้ในเครื่อง แม้จะไม่เปิดให้คนอื่นเห็น
      if (!payload.showWish) item.wish = wish;
      $('#lkPreview').classList.add('is-launch');
      $('#lkScene').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
      setTimeout(() => {
        $('#lkPreview').classList.remove('is-launch');
        renderRiver(r.id);
        const mine = $(`.lk-k[data-id="${CSS.escape(r.id)}"]`);
        if (mine) mine.focus({ preventScroll: true });
        f.wish.value = '';
        f.number.value = '';
        preview();
        if (isAdmin()) loadAdmin();
      }, reduced() ? 50 : 900);
      toast('ลอยกระทงแล้ว ขอให้สมหวังทุกประการ 🪷');
    } catch (x) { err.textContent = x.message; }
    btn.disabled = false;
  }

  /* ================= เส้นทาง ================= */
  async function load() {
    const data = await SC.apiGet('krathongs');
    ks.items = data.items;
    ks.total = data.total;
    setOpen(data.open !== false);
  }

  /* ================= เปิด/ปิดระบบ ================= */
  // ปิดระบบ: ลอยไม่ได้ ซ่อนเมนู การ์ด และป้ายชวนในหน้าแรก (ผู้ดูแลยังเข้าหน้านี้ได้)
  function setOpen(open) {
    ks.open = open;
    const show = open || isAdmin();
    $$('a[href="#krathong"]').forEach(a => (a.hidden = !show));
    $('#lkClosed').hidden = open;
    $('.lk-builder').classList.toggle('is-closed', !open);
    $$('input, select, textarea, button', $('#lkForm')).forEach(el => (el.disabled = !open));
    $('#lkCta').hidden = !open;
    const t = $('#lkOpenToggle');
    if (t) { t.checked = open; $('#lkOpenLabel').textContent = open ? 'เปิดรับลอยกระทงอยู่' : 'ปิดรับลอยกระทงแล้ว'; }
    if (!open) { const b = $('#lkPromo'); if (b) b.remove(); }
    homeBanner();
  }
  async function toggleOpen(e) {
    const want = e.target.checked;
    if (!confirm(want ? 'เปิดรับลอยกระทงให้นักเรียนลอยได้?' : 'ปิดรับลอยกระทง? นักเรียนจะลอยไม่ได้ และเมนูลอยกระทงจะถูกซ่อน')) { e.target.checked = !want; return; }
    e.target.disabled = true;
    try { await SC.authed({ action: 'setKrathongOpen', open: want }); setOpen(want); toast(want ? 'เปิดรับลอยกระทงแล้ว' : 'ปิดรับลอยกระทงแล้ว'); } catch (err) { e.target.checked = !want; toast(err.message, true); }
    e.target.disabled = false;
  }

  /* ================= หน้าแรก: ป้ายชวนและหน้าต่างเด้ง ================= */
  function homeBanner() {
    const box = $('#homeKrathong');
    box.hidden = !ks.open;
    if (!ks.open) return;
    box.innerHTML = `<a class="lk-banner" href="#krathong">
      <span class="lk-banner-k">${krathongSvg({ base: 'lotus', petal: '#f06292', flower: '#ffd54f', deco: 'jasmine,sparkle,fireflies' })}</span>
      <span class="lk-banner-t"><small>📣 ประกาศจากสภานักเรียน</small><b>ร่วมลอยกระทงออนไลน์</b><span>ตกแต่งกระทงของตัวเอง เขียนคำอธิษฐาน แล้วลอยไปพร้อมเพื่อน ๆ${ks.total ? ` · ลอยแล้ว ${ks.total.toLocaleString('th-TH')} กระทง` : ''}</span></span>
      <span class="lk-banner-go">ลอยกระทง →</span></a>`;
  }
  function promo() {
    // รอให้ INTRO จบก่อน แสดงครั้งเดียวต่อการเปิดเว็บ
    if (document.getElementById('intro')) { document.addEventListener('sc:intro-done', promo, { once: true }); return; }
    if (!ks.open || $('#lkPromo') || !['', '#', '#home'].includes(location.hash)) return;
    try { if (sessionStorage.getItem('sc_lk_promo')) return; } catch (_) { /* ไม่มี storage */ }
    // หน้าต่างแจ้งงานวันนี้ (ปฏิทิน) เด้งอยู่: รอให้ปิดก่อน ไม่ให้ซ้อนกัน
    if (SC.dialog.open) { setTimeout(promo, 600); return; }
    try { sessionStorage.setItem('sc_lk_promo', '1'); } catch (_) { /* ไม่มี storage */ }
    const el = document.createElement('div');
    el.id = 'lkPromo';
    el.className = 'lk-promo';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'ชวนลอยกระทงออนไลน์');
    el.innerHTML = `<button class="lk-promo-x" aria-label="ปิด">×</button>
      <div class="lk-promo-k">${krathongSvg({ base: 'leaf', petal: '#f06292', flower: '#ffd54f', deco: 'bunny,hearts,fireflies' })}</div>
      <div class="lk-promo-t"><b>🪷 มาลอยกระทงกันเถอะ!</b><span>ตกแต่งกระทงน่ารัก ๆ เขียนคำอธิษฐาน แล้วลอยไปพร้อมเพื่อนทั้งโรงเรียน</span>
        <a class="btn btn-gold" href="#krathong">ไปลอยกระทง</a></div>`;
    document.body.append(el);
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
    $('.lk-promo-x', el).onclick = close;
    $('a', el).onclick = close;
    window.addEventListener('hashchange', close, { once: true });
  }
  async function status() {
    try { const s = await SC.apiGet('krathongStatus'); ks.total = Math.max(ks.total, s.total); setOpen(s.open); } catch (_) { /* ไว้ลองใหม่รอบหน้า */ }
  }
  document.addEventListener('sc:home', async () => {
    await SC.prime(async (get) => { const s = get('krathongStatus'); ks.total = s.total; setOpen(s.open); });
    await status();
    // เผื่อเวลาให้หน้าต่างแจ้งงานวันนี้เด้งก่อน แล้วค่อยต่อคิว
    setTimeout(promo, 1200);
  });
  document.addEventListener('sc:krathong', async () => {
    buildScene();
    renderBuilder();
    if (!ks.items) await SC.prime(async (get) => { const data = get('krathongs'); ks.items = data.items; ks.total = data.total; });
    if (ks.items) renderRiver();
    try { await load(); renderRiver(); } catch (err) { if (!ks.items) { ks.items = []; renderRiver(); } toast('โหลดกระทงไม่สำเร็จ: ' + err.message, true); }
    loadAdmin();
    clearInterval(ks.timer);
    // กระทงใหม่ของเพื่อน ๆ ไหลมาเรื่อย ๆ ระหว่างเปิดหน้านี้
    ks.timer = setInterval(async () => {
      if ($('#page-krathong').hidden) { clearInterval(ks.timer); return; }
      if (document.hidden) return;
      const before = ks.total;
      try { await load(); if (ks.total !== before) renderRiver(); } catch (_) { /* ลองใหม่รอบหน้า */ }
    }, 60000);
  });
  $('#lkForm').addEventListener('submit', launch);
  $('#lkForm').number.addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 5); });
  $('#lkForm').name.addEventListener('input', preview);
  $('#lkAdminQ').addEventListener('input', renderAdmin);
  $('#lkOpenToggle').addEventListener('change', toggleOpen);
  document.addEventListener('sc:auth', () => { if (ks.open !== undefined) setOpen(ks.open); });
  // ตั้งค่าเมนูตามสถานะล่าสุดที่จำไว้ในเครื่องทันทีที่เปิดเว็บ แล้วค่อยเช็คของจริง
  SC.prime(async (get) => { const s = get('krathongStatus'); ks.total = s.total; setOpen(s.open); });
  document.addEventListener('sc:auth', () => { if (!$('#page-krathong').hidden) { loadAdmin(); renderRiver(); } });
  $('#lkScene').addEventListener('click', closeBubble);
  $('#lkCta').addEventListener('click', (e) => { e.stopPropagation(); $('#lkMake').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' }); });
  $('#lkRandom').addEventListener('click', randomDesign);
  $('#lkForm').wish.addEventListener('input', checkRude);
  $('#lkForm').name.addEventListener('input', checkRude);

  /* ================= โหมดทดลอง ================= */
  const ext = SC.demoExt;
  const demoList = (db) => {
    if (!db.krathongs) {
      const wishes = ['ขอให้สอบผ่านทุกวิชา', 'ขอให้ครอบครัวมีสุขภาพแข็งแรง', 'ขอให้สภานักเรียนทำงานราบรื่น', 'ขอให้ติดมหาวิทยาลัยที่ใฝ่ฝัน', '', 'ขอให้เพื่อน ๆ มีความสุข', 'ขอให้ปีหน้าเกรดดีขึ้น', ''];
      db.krathongs = wishes.map((w, i) => ({ id: 'demo' + i, base: Object.keys(BASES)[i % 4], petal: PETALS[i % PETALS.length], flower: FLOWERS[i % FLOWERS.length],
        deco: Object.keys(DECOS).filter((_, j) => (i + j) % 3 === 0).join(','), number: String(30101 + i * 37), wish: w || 'ความลับ', name: ['มะลิ', 'ภูมิ', 'ฟ้าใส', 'ต้นกล้า', 'ใบเตย', 'ข้าวหอม', 'ดาว', 'ปลื้ม'][i], classroom: `ม.${(i % 6) + 1}/${(i % 4) + 1}`,
        showWish: !!w, status: 'active', createdAt: new Date(Date.now() - (8 - i) * 6e5).toISOString() }));
    }
    return db.krathongs;
  };
  ext.krathongs = (db) => {
    const rows = demoList(db).filter(k => k.status !== 'hidden');
    return JSON.parse(JSON.stringify({ open: db.krathongOpen !== false, total: rows.length, items: rows.map(({ number, ...k }) => ({ ...k, wish: k.showWish ? k.wish : '' })) }));
  };
  ext.adminKrathongs = (db, b, sess) => { sess(true); return JSON.parse(JSON.stringify(demoList(db).map(k => ({ ...k, hidden: k.status === 'hidden' })))); };
  ext.deleteKrathong = (db, b, sess) => { sess(true); db.krathongs = demoList(db).filter(k => k.id !== b.id); return true; };
  ext.krathongStatus = (db) => ({ open: db.krathongOpen !== false, total: demoList(db).length });
  ext.setKrathongOpen = (db, b, sess) => { sess(true); db.krathongOpen = b.open === true; return { open: db.krathongOpen }; };
  ext.floatKrathong = (db, b) => {
    if (db.krathongOpen === false) throw new Error('ขณะนี้ปิดรับลอยกระทงแล้ว ขอบคุณที่ร่วมกิจกรรมนะ 🪷');
    if (!/^\d{5}$/.test(String(b.number || ''))) throw new Error('กรุณากรอกเลขประจำตัวนักเรียน 5 หลัก');
    if (!String(b.name || '').trim()) throw new Error('กรุณากรอกชื่อ');
    if (!/^ม\.[1-6]\/([1-9]|1[0-9]|20)$/.test(String(b.classroom || ''))) throw new Error('กรุณาเลือกชั้น เช่น ม.1/1');
    if (!String(b.wish || '').trim()) throw new Error('อย่าลืมเขียนคำอธิษฐานนะ');
    if (rudeWord(b.wish) || rudeWord(b.name)) throw new Error('ข้อความมีคำไม่สุภาพ กรุณาแก้ไขก่อนลอยกระทงนะ');
    const id = SC.uid();
    demoList(db).push({ id, base: BASES[b.base] ? b.base : 'leaf', petal: b.petal, flower: b.flower, deco: b.deco, number: String(b.number),
      wish: String(b.wish).slice(0, 300), name: String(b.name).trim().slice(0, 40), classroom: b.classroom, showWish: b.showWish === true, status: 'active', createdAt: new Date().toISOString() });
    return { id };
  };
  ext.hideKrathong = (db, b, sess) => { sess('news'); const k = demoList(db).find(x => x.id === b.id); if (k) k.status = 'hidden'; return true; };
})();
