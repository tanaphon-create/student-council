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
  const DECOS = {
    jasmine: 'พวงมาลัยมะลิ',
    orchid: 'กล้วยไม้',
    sparkle: 'ประกายทอง',
    coin: 'เหรียญ',
    leaves: 'ใบไม้เพิ่ม',
  };
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
    ].join('');
    const cluster = [[60, 50, 7], [50, 54, 5.5], [70, 54, 5.5], [55, 46, 4.5], [66, 46, 4.5]]
      .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${flower}"/><circle cx="${x - r * 0.3}" cy="${y - r * 0.3}" r="${r * 0.45}" fill="${shade(flower, 1.15)}" opacity=".8"/>`).join('');
    const sparkle = deco.has('sparkle') ? [[30, 40], [92, 44], [80, 30], [40, 28]].map(([x, y]) => `<path d="M${x} ${y - 4} L${x + 1} ${y - 1} L${x + 4} ${y} L${x + 1} ${y + 1} L${x} ${y + 4} L${x - 1} ${y + 1} L${x - 4} ${y} L${x - 1} ${y - 1}Z" fill="#ffe082" class="lk-sparkle"/>`).join('') : '';
    const number = String(d.number || '').trim();
    const flag = number ? `<line x1="88" y1="58" x2="88" y2="22" stroke="#6d4c41" stroke-width="1.5"/>
      <path d="M88 22 h${Math.max(18, number.length * 6.2 + 8)} l-4 6 l4 6 h-${Math.max(18, number.length * 6.2 + 8)}Z" fill="#ffd54f" stroke="#ff8f00" stroke-width=".8"/>
      <text x="${88 + Math.max(18, number.length * 6.2 + 8) / 2 - 1}" y="31.5" font-size="8.5" font-weight="700" text-anchor="middle" fill="#5d2e00" font-family="Prompt, sans-serif">${esc(number)}</text>` : '';
    return `<svg viewBox="0 0 ${number ? 140 : 120} 100" class="lk-svg" aria-hidden="true">
      <defs><radialGradient id="${uid}g"><stop offset="0" stop-color="#ffcc66" stop-opacity=".9"/><stop offset="1" stop-color="#ff9800" stop-opacity="0"/></radialGradient></defs>
      <ellipse cx="60" cy="82" rx="46" ry="7" fill="#000" opacity=".25"/>
      ${body}${extras}${cluster}
      <line x1="52" y1="46" x2="49" y2="22" stroke="#8d6e63" stroke-width="1.2"/><line x1="56" y1="46" x2="55" y2="20" stroke="#8d6e63" stroke-width="1.2"/><line x1="68" y1="46" x2="71" y2="22" stroke="#8d6e63" stroke-width="1.2"/>
      <circle cx="49" cy="22" r="1.4" fill="#ff7043" class="lk-ember"/><circle cx="55" cy="20" r="1.4" fill="#ff7043" class="lk-ember"/><circle cx="71" cy="22" r="1.4" fill="#ff7043" class="lk-ember"/>
      <rect x="60" y="30" width="5" height="17" rx="1.5" fill="#fffde7" stroke="#e0d9b5" stroke-width=".5"/>
      <circle cx="62.5" cy="24" r="13" fill="url(#${uid}g)" class="lk-glow"/>
      <path d="M62.5 18 Q66 24 62.5 29 Q59 24 62.5 18Z" fill="#ffb300" class="lk-flame"/><path d="M62.5 21 Q64.3 25 62.5 28 Q60.7 25 62.5 21Z" fill="#fff8e1" class="lk-flame"/>
      ${sparkle}${flag}${opt.label ? `<text x="60" y="97" font-size="8" text-anchor="middle" fill="#ffe082" font-family="Prompt, sans-serif">${esc(opt.label)}</text>` : ''}
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
        aria-label="กระทง${k.number ? ' เลขประจำตัว ' + esc(k.number) : ''}${k.name ? ' ของ ' + esc(k.name) : ''}">
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
    b.innerHTML = `${k.number ? `<span class="lk-num">เลขประจำตัว ${esc(k.number)}</span>` : ''}
      <p>${k.wish ? '“' + esc(k.wish) + '”' : '<i>เจ้าของกระทงเก็บคำอธิษฐานไว้เป็นความลับ</i>'}</p>
      <small>${k.name ? esc(k.name) : 'ไม่ระบุชื่อ'}${ks.mine.has(k.id) ? ' · กระทงของคุณ' : ''}</small>
      ${can('news') ? '<button class="lk-hide">ซ่อนกระทงนี้</button>' : ''}`;
    scene.append(b);
    const x = Math.min(Math.max(rect.left - sr.left + rect.width / 2, 130), sr.width - 130);
    b.style.left = x + 'px';
    b.style.top = Math.max(rect.top - sr.top - 8, 70) + 'px';
    const hide = $('.lk-hide', b);
    if (hide) hide.onclick = async () => {
      if (!confirm('ซ่อนกระทงนี้จากแม่น้ำ? (ใช้กับข้อความไม่เหมาะสม)')) return;
      try { await SC.authed({ action: 'hideKrathong', id: k.id }); ks.items = ks.items.filter(x2 => x2.id !== k.id); ks.total--; closeBubble(); renderRiver(); toast('ซ่อนกระทงแล้ว'); } catch (err) { toast(err.message, true); }
    };
  }
  const closeBubble = () => { const b = $('.lk-bubble'); if (b) b.remove(); };

  function renderWishes() {
    const list = ks.items.filter(k => k.wish).slice(-12).reverse();
    $('#lkWishes').innerHTML = list.length ? list.map(k => `<li><span class="lk-wk">${krathongSvg(k)}</span><div><p>“${esc(k.wish)}”</p><small>${k.name ? esc(k.name) : 'ไม่ระบุชื่อ'}${k.number ? ' · เลขประจำตัว ' + esc(k.number) : ''}</small></div></li>`).join('')
      : '<li class="lk-empty">ยังไม่มีคำอธิษฐานที่เปิดให้เห็น มาเป็นคนแรกกันเถอะ</li>';
  }

  /* ================= ตกแต่งกระทง ================= */
  function renderBuilder() {
    const d = ks.design;
    $('#lkBases').innerHTML = Object.entries(BASES).map(([k, v]) => `<button type="button" class="lk-opt ${d.base === k ? 'on' : ''}" data-base="${k}" aria-pressed="${d.base === k}"><span>${v.icon}</span>${v.label}</button>`).join('');
    $('#lkPetals').innerHTML = PETALS.map(c => `<button type="button" class="lk-sw ${d.petal === c ? 'on' : ''}" data-petal="${c}" style="--c:${c}" aria-label="สีกลีบ ${c}" aria-pressed="${d.petal === c}"></button>`).join('');
    $('#lkFlowers').innerHTML = FLOWERS.map(c => `<button type="button" class="lk-sw ${d.flower === c ? 'on' : ''}" data-flower="${c}" style="--c:${c}" aria-label="สีดอกไม้ ${c}" aria-pressed="${d.flower === c}"></button>`).join('');
    $('#lkDecos').innerHTML = Object.entries(DECOS).map(([k, v]) => `<button type="button" class="lk-chip ${d.deco.includes(k) ? 'on' : ''}" data-deco="${k}" aria-pressed="${d.deco.includes(k)}">${v}</button>`).join('');
    preview();
    $$('[data-base]').forEach(b => (b.onclick = () => { d.base = b.dataset.base; renderBuilder(); }));
    $$('[data-petal]').forEach(b => (b.onclick = () => { d.petal = b.dataset.petal; renderBuilder(); }));
    $$('[data-flower]').forEach(b => (b.onclick = () => { d.flower = b.dataset.flower; renderBuilder(); }));
    $$('[data-deco]').forEach(b => (b.onclick = () => { const i = d.deco.indexOf(b.dataset.deco); if (i < 0) d.deco.push(b.dataset.deco); else d.deco.splice(i, 1); renderBuilder(); }));
  }
  const preview = () => { $('#lkPreview').innerHTML = krathongSvg({ ...ks.design, number: $('#lkForm').number.value }); };

  async function launch(e) {
    e.preventDefault();
    const f = $('#lkForm'), btn = $('button[type=submit]', f), err = $('.err', f);
    err.textContent = '';
    const wish = f.wish.value.trim(), sid = f.number.value.trim();
    if (!/^\d{3,8}$/.test(sid)) { err.textContent = 'กรุณากรอกเลขประจำตัวนักเรียน (ตัวเลข 3–8 หลัก)'; f.number.focus(); return; }
    if (!wish) { err.textContent = 'อย่าลืมเขียนคำอธิษฐานนะ'; f.wish.focus(); return; }
    btn.disabled = true;
    const d = ks.design;
    const payload = { action: 'floatKrathong', base: d.base, petal: d.petal, flower: d.flower, deco: d.deco.join(','), number: f.number.value.trim(),
      wish, name: f.name.value.trim(), showWish: f.showWish.checked, deviceId: deviceId(), website: f.website.value };
    try {
      const r = await SC.apiPost(payload);
      ks.mine.add(r.id);
      store.set('sc_my_krathongs', JSON.stringify([...ks.mine].slice(-30)));
      const item = { id: r.id, base: payload.base, petal: payload.petal, flower: payload.flower, deco: payload.deco, number: payload.number,
        name: payload.name, wish: payload.showWish ? wish : '', showWish: payload.showWish, createdAt: new Date().toISOString() };
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
  }
  document.addEventListener('sc:krathong', async () => {
    buildScene();
    renderBuilder();
    if (!ks.items) await SC.prime(async (get) => { const data = get('krathongs'); ks.items = data.items; ks.total = data.total; });
    if (ks.items) renderRiver();
    try { await load(); renderRiver(); } catch (err) { if (!ks.items) { ks.items = []; renderRiver(); } toast('โหลดกระทงไม่สำเร็จ: ' + err.message, true); }
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
  $('#lkForm').number.addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 8); preview(); });
  $('#lkScene').addEventListener('click', closeBubble);
  $('#lkCta').addEventListener('click', (e) => { e.stopPropagation(); $('#lkMake').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' }); });

  /* ================= โหมดทดลอง ================= */
  const ext = SC.demoExt;
  const demoList = (db) => {
    if (!db.krathongs) {
      const wishes = ['ขอให้สอบผ่านทุกวิชา', 'ขอให้ครอบครัวมีสุขภาพแข็งแรง', 'ขอให้สภานักเรียนทำงานราบรื่น', 'ขอให้ติดมหาวิทยาลัยที่ใฝ่ฝัน', '', 'ขอให้เพื่อน ๆ มีความสุข', 'ขอให้ปีหน้าเกรดดีขึ้น', ''];
      db.krathongs = wishes.map((w, i) => ({ id: 'demo' + i, base: Object.keys(BASES)[i % 4], petal: PETALS[i % PETALS.length], flower: FLOWERS[i % FLOWERS.length],
        deco: Object.keys(DECOS).filter((_, j) => (i + j) % 3 === 0).join(','), number: String(30101 + i * 37), wish: w || 'ความลับ', name: i % 2 ? 'ม.5/' + (i % 7 + 1) : '',
        showWish: !!w, status: 'active', createdAt: new Date(Date.now() - (8 - i) * 6e5).toISOString() }));
    }
    return db.krathongs;
  };
  ext.krathongs = (db) => {
    const rows = demoList(db).filter(k => k.status !== 'hidden');
    return JSON.parse(JSON.stringify({ total: rows.length, items: rows.map(k => ({ ...k, wish: k.showWish ? k.wish : '' })) }));
  };
  ext.floatKrathong = (db, b) => {
    if (!/^\d{3,8}$/.test(String(b.number || ''))) throw new Error('กรุณากรอกเลขประจำตัวนักเรียน (ตัวเลข 3–8 หลัก)');
    if (!String(b.wish || '').trim()) throw new Error('อย่าลืมเขียนคำอธิษฐานนะ');
    const id = SC.uid();
    demoList(db).push({ id, base: BASES[b.base] ? b.base : 'leaf', petal: b.petal, flower: b.flower, deco: b.deco, number: String(b.number || '').slice(0, 12),
      wish: String(b.wish).slice(0, 300), name: String(b.name || '').slice(0, 40), showWish: b.showWish === true, status: 'active', createdAt: new Date().toISOString() });
    return { id };
  };
  ext.hideKrathong = (db, b, sess) => { sess('news'); const k = demoList(db).find(x => x.id === b.id); if (k) k.status = 'hidden'; return true; };
})();
