// คลังภาพกิจกรรม — รูปเก็บใน Google Drive (คลังภาพสภานักเรียน / ปี พ.ศ. / วันที่ ชื่อกิจกรรม)
// ทุกคนดูได้ ผู้มีสิทธิ์ "คลังภาพ" สร้างอัลบั้ม อัปโหลด และลบรูปได้
(() => {
  'use strict';
  const SC = window.SC;
  const { $, $$, esc, can, toast, openDialog, dlgHead } = SC;

  const gs = { albums: null, album: null, view: '', year: '', month: '', q: '', sort: 'new', lb: -1 };
  const full = {}; // รูปขนาดเต็มที่โหลดแล้ว (เฉพาะรอบนี้)
  const staff = () => can('gallery');
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const beYear = (s) => String(Number(s.slice(0, 4)) + 543);
  const monthLabel = (ym) => parse(ym + '-01').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  const longDate = (s) => parse(s).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const folderUrl = (id) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;

  /* ================= เส้นทาง ================= */
  document.addEventListener('sc:gallery', async (e) => {
    gs.view = e.detail || '';
    gs.lb = -1;
    if (gs.view) return openAlbum(gs.view);
    if (!gs.albums) await SC.prime(async (get) => { gs.albums = get('albums'); });
    if (gs.albums) renderList(); else $('#galleryView').innerHTML = '<p class="empty">กำลังโหลดคลังภาพ…</p>';
    try { gs.albums = await SC.apiGet('albums'); if (!gs.view) renderList(); } catch (err) {
      if (!gs.albums) $('#galleryView').innerHTML = `<p class="empty">โหลดคลังภาพไม่สำเร็จ: ${esc(err.message)}</p>`; else toast(err.message, true);
    }
  });
  document.addEventListener('sc:auth', () => {
    if ($('#page-gallery').hidden) return;
    if (gs.view && gs.album) renderAlbum(); else if (gs.albums) renderList();
  });

  async function openAlbum(id) {
    if (!gs.album || gs.album.id !== id) {
      gs.album = null;
      await SC.prime(async (get) => { gs.album = get('album', { id }); });
    }
    if (gs.album) renderAlbum(); else $('#galleryView').innerHTML = '<p class="empty">กำลังโหลดอัลบั้ม…</p>';
    try {
      const a = await SC.apiGet('album', { id });
      if (gs.view !== id) return;
      gs.album = a; renderAlbum();
      if (staff()) fillThumbs();
    } catch (err) {
      if (!gs.album) $('#galleryView').innerHTML = `<a href="#gallery" class="back-link">← คลังภาพทั้งหมด</a><p class="empty">โหลดอัลบั้มไม่สำเร็จ: ${esc(err.message)}</p>`;
      else toast(err.message, true);
    }
  }

  /* ================= รายการอัลบั้ม ================= */
  function filtered() {
    const q = gs.q.trim().toLowerCase();
    const list = gs.albums.filter(a => (!gs.year || beYear(a.date) === gs.year) && (!gs.month || a.date.slice(5, 7) === gs.month)
      && (!q || (a.title + ' ' + a.detail).toLowerCase().includes(q)));
    const by = { new: (a, b) => b.date.localeCompare(a.date), old: (a, b) => a.date.localeCompare(b.date), name: (a, b) => a.title.localeCompare(b.title, 'th') || b.date.localeCompare(a.date) };
    return list.sort(by[gs.sort]);
  }

  function renderList() {
    const years = [...new Set(gs.albums.map(a => beYear(a.date)))].sort().reverse();
    if (gs.year && !years.includes(gs.year)) gs.year = '';
    const months = [...new Set(gs.albums.filter(a => !gs.year || beYear(a.date) === gs.year).map(a => a.date.slice(5, 7)))].sort();
    const list = filtered();
    const total = gs.albums.reduce((n, a) => n + a.count, 0);
    // จัดกลุ่มตามเดือน (ยกเว้นเรียงตามชื่อกิจกรรม)
    let body = '';
    if (gs.sort === 'name') body = `<div class="gal-grid">${list.map(albumCard).join('')}</div>`;
    else {
      const groups = [];
      list.forEach(a => { const ym = a.date.slice(0, 7); if (!groups.length || groups[groups.length - 1].ym !== ym) groups.push({ ym, items: [] }); groups[groups.length - 1].items.push(a); });
      body = groups.map(g => `<h3 class="gal-month">${monthLabel(g.ym)}</h3><div class="gal-grid">${g.items.map(albumCard).join('')}</div>`).join('');
    }
    $('#galleryView').innerHTML = `
      <div class="stats">
        <div class="stat"><span>อัลบั้มกิจกรรม</span><strong>${gs.albums.length}</strong></div>
        <div class="stat"><span>รูปทั้งหมด</span><strong>${total.toLocaleString('th-TH')}</strong></div>
        <div class="stat"><span>จำนวนปีที่มีรูป</span><strong>${years.length}</strong></div>
      </div>
      <div class="card gal-tools">
        <input type="search" id="galQ" placeholder="ค้นหาชื่อกิจกรรม" value="${esc(gs.q)}" aria-label="ค้นหาชื่อกิจกรรม">
        <select id="galMonth" aria-label="เดือน"><option value="">ทุกเดือน</option>${months.map(m => `<option value="${m}" ${m === gs.month ? 'selected' : ''}>${parse('2000-' + m + '-01').toLocaleDateString('th-TH', { month: 'long' })}</option>`).join('')}</select>
        <select id="galSort" aria-label="เรียงตาม">
          <option value="new" ${gs.sort === 'new' ? 'selected' : ''}>วันที่ล่าสุดก่อน</option>
          <option value="old" ${gs.sort === 'old' ? 'selected' : ''}>วันที่เก่าสุดก่อน</option>
          <option value="name" ${gs.sort === 'name' ? 'selected' : ''}>ชื่อกิจกรรม ก–ฮ</option>
        </select>
        ${staff() ? '<button class="btn btn-gold" id="galNew">+ สร้างอัลบั้ม</button>' : ''}
        ${years.length ? `<div class="gal-years" role="group" aria-label="ปี พ.ศ.">
          <button class="${gs.year ? '' : 'on'}" data-year="">ทุกปี</button>${years.map(y => `<button class="${y === gs.year ? 'on' : ''}" data-year="${y}">พ.ศ. ${y}</button>`).join('')}</div>` : ''}
      </div>
      ${list.length ? body : `<div class="card empty-state"><p class="empty">${gs.albums.length ? 'ไม่พบอัลบั้มที่ตรงกับตัวกรอง' : 'ยังไม่มีอัลบั้มภาพกิจกรรม'}</p>
        ${staff() && !gs.albums.length ? '<p class="hint" style="text-align:center">กด “+ สร้างอัลบั้ม” เพื่อเริ่มเก็บภาพกิจกรรม</p>' : ''}</div>`}`;
    $('#galQ').oninput = (e) => { gs.q = e.target.value; const pos = e.target.selectionStart; renderList(); const q = $('#galQ'); q.focus(); q.setSelectionRange(pos, pos); };
    $('#galMonth').onchange = (e) => { gs.month = e.target.value; renderList(); };
    $('#galSort').onchange = (e) => { gs.sort = e.target.value; renderList(); };
    $$('.gal-years [data-year]').forEach(b => (b.onclick = () => { gs.year = b.dataset.year; gs.month = ''; renderList(); }));
    const nb = $('#galNew');
    if (nb) nb.onclick = () => albumForm(null);
  }

  function albumCard(a) {
    return `<a class="gal-card" href="#gallery/${esc(a.id)}">
      <div class="gal-cover">${a.cover ? `<img src="${esc(a.cover)}" alt="" loading="lazy">` : '<span aria-hidden="true">🖼️</span>'}<span class="gal-count">${a.count} รูป</span></div>
      <div class="gal-cap"><b>${esc(a.title)}</b><small>${SC.thDate(a.date)}</small></div></a>`;
  }

  /* ================= อัลบั้ม ================= */
  function renderAlbum() {
    const a = gs.album;
    $('#galleryView').innerHTML = `
      <a href="#gallery" class="back-link">← คลังภาพทั้งหมด</a>
      <div class="card gal-head">
        <div class="di-head">
          <div><p class="eyebrow-sm">${longDate(a.date)}</p><h2>${esc(a.title)}</h2></div>
          ${staff() ? `<div class="head-actions">
            <label class="btn btn-gold btn-sm" for="galFiles">+ อัปโหลดรูป</label>
            <button class="btn btn-ghost btn-sm" id="galSync" title="ดึงรูปที่ใส่ในโฟลเดอร์ Google Drive โดยตรง">ดึงรูปจาก Drive</button>
            <a class="btn btn-ghost btn-sm" href="${folderUrl(a.folderId)}" target="_blank" rel="noopener">เปิดโฟลเดอร์ Drive</a>
            <button class="btn btn-ghost btn-sm" id="galEdit">แก้ไข</button>
            <button class="btn btn-ghost btn-sm danger" id="galDel">ลบอัลบั้ม</button>
          </div>` : ''}
        </div>
        ${a.detail ? `<p class="di-detail">${esc(a.detail)}</p>` : ''}
        <p class="hint">${a.photos.length} รูป${staff() ? ' · รูปจะถูกย่อให้ยาวไม่เกิน 1920 px ก่อนอัปโหลด' : ''}</p>
        <input type="file" id="galFiles" accept="image/*" multiple hidden>
        <div id="galProgress" class="gal-progress" hidden></div>
      </div>
      ${a.photos.length ? `<div class="gal-photos">${a.photos.map((p, i) => `<button class="gal-ph" data-i="${i}" aria-label="ดูรูปที่ ${i + 1}">
        ${p.thumb ? `<img src="${esc(p.thumb)}" alt="" loading="lazy">` : '<span class="gal-wait">กำลังเตรียมรูปย่อ…</span>'}</button>`).join('')}</div>`
        : `<div class="card empty-state"><p class="empty">อัลบั้มนี้ยังไม่มีรูป</p>${staff() ? '<p class="hint" style="text-align:center">กด “+ อัปโหลดรูป” เลือกได้หลายรูปพร้อมกัน</p>' : ''}</div>`}`;
    $$('.gal-ph').forEach(b => (b.onclick = () => lightbox(Number(b.dataset.i))));
    if (!staff()) return;
    $('#galFiles').onchange = (e) => upload([...e.target.files]);
    $('#galEdit').onclick = () => albumForm(a);
    $('#galDel').onclick = async () => {
      if (!confirm(`ลบอัลบั้ม “${a.title}” และรูปทั้งหมด ${a.photos.length} รูป?\nโฟลเดอร์จะถูกย้ายไปถังขยะของ Google Drive (กู้คืนได้ภายใน 30 วัน)`)) return;
      try { await SC.authed({ action: 'deleteAlbum', id: a.id }); gs.albums = null; toast('ลบอัลบั้มแล้ว'); location.hash = '#gallery'; } catch (err) { toast(err.message, true); }
    };
    $('#galSync').onclick = async (e) => {
      e.target.disabled = true;
      try {
        const r = await SC.authed({ action: 'syncAlbum', id: a.id });
        toast(r.added ? `พบรูปใหม่ใน Drive ${r.added} รูป` : 'ไม่มีรูปใหม่ในโฟลเดอร์ Drive');
        if (r.added) { gs.album = await SC.apiGet('album', { id: a.id }); renderAlbum(); fillThumbs(); }
      } catch (err) { toast(err.message, true); }
      e.target.disabled = false;
    };
  }

  /* ================= ย่อรูปในเบราว์เซอร์ ================= */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('เปิดไฟล์รูปนี้ไม่ได้ (รองรับ JPG, PNG, WEBP)'));
      img.src = src;
    });
  }
  function draw(img, max, q) {
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  }
  // รูปย่อสำหรับตาราง ไม่เกิน ~44 KB
  function thumbOf(img) {
    for (const [max, q] of [[480, 0.72], [400, 0.65], [320, 0.6], [240, 0.55]]) {
      const d = draw(img, max, q);
      if (d.length <= 44000) return d;
    }
    throw new Error('สร้างรูปย่อไม่ได้');
  }

  async function upload(files) {
    const a = gs.album, box = $('#galProgress');
    files = files.filter(f => /^image\//.test(f.type));
    if (!files.length) return;
    box.hidden = false;
    let ok = 0;
    const fails = [];
    for (let i = 0; i < files.length; i++) {
      box.innerHTML = `<span>กำลังอัปโหลด ${i + 1}/${files.length} — ${esc(files[i].name)}</span><div class="progress"><span style="width:${Math.round(i * 100 / files.length)}%"></span></div>`;
      const url = URL.createObjectURL(files[i]);
      try {
        const img = await loadImage(url);
        const data = draw(img, 1920, 0.85).split(',')[1];
        const p = await SC.authed({ action: 'uploadGalleryPhoto', albumId: a.id, name: files[i].name, data, thumb: thumbOf(img) });
        if (gs.album === a) a.photos.push(p);
        ok++;
      } catch (err) { fails.push(`${files[i].name}: ${err.message}`); }
      URL.revokeObjectURL(url);
    }
    gs.albums = null;
    if (gs.album === a && gs.view === a.id) renderAlbum();
    toast(fails.length ? `อัปโหลดสำเร็จ ${ok} รูป ไม่สำเร็จ ${fails.length} รูป` : `อัปโหลดสำเร็จ ${ok} รูป`, !!fails.length);
    if (fails.length) console.warn(fails.join('\n'));
  }

  // รูปที่ดึงมาจาก Drive ยังไม่มีรูปย่อ — โหลดรูปเต็มแล้วสร้างรูปย่อให้ทีละรูป
  let filling = false;
  async function fillThumbs() {
    if (filling) return;
    filling = true;
    const a = gs.album;
    for (const p of a.photos.filter(x => !x.thumb)) {
      if (gs.album !== a) break;
      try {
        const img = await loadImage(await fullSrc(p));
        p.thumb = thumbOf(img);
        await SC.authed({ action: 'setGalleryThumb', id: p.id, thumb: p.thumb });
        const i = a.photos.indexOf(p), btn = $(`.gal-ph[data-i="${i}"]`);
        if (btn) btn.innerHTML = `<img src="${p.thumb}" alt="">`;
      } catch (_) { /* ข้ามรูปที่เปิดไม่ได้ */ }
    }
    filling = false;
  }

  /* ================= ดูรูปเต็ม ================= */
  // ไฟล์ที่เปิดลิงก์สาธารณะได้ โหลดตรงจาก Google — ถ้าไม่ได้ ดึงผ่าน Apps Script
  async function fullSrc(p) {
    if (full[p.id]) return full[p.id];
    if (p.public && !SC.isDemo) return (full[p.id] = `https://lh3.googleusercontent.com/d/${encodeURIComponent(p.fileId)}=w1920`);
    return (full[p.id] = await SC.apiGet('gphoto', { id: p.id }, { cache: false }));
  }

  function lightbox(i) {
    const a = gs.album;
    gs.lb = i;
    let box = $('#galLb');
    if (!box) {
      box = document.createElement('div');
      box.id = 'galLb';
      box.className = 'gal-lb';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      document.body.append(box);
    }
    const p = a.photos[i];
    box.innerHTML = `
      <div class="lb-top"><span>${i + 1} / ${a.photos.length}</span><span class="spacer"></span>
        <a class="lb-btn" id="lbDl" download="${esc(a.title)}-${i + 1}.jpg" aria-label="ดาวน์โหลด" hidden>⬇︎ ดาวน์โหลด</a>
        ${staff() ? '<button class="lb-btn" id="lbDel">ลบรูป</button>' : ''}
        <button class="lb-btn" id="lbX" aria-label="ปิด">✕</button></div>
      <button class="lb-nav prev" aria-label="รูปก่อนหน้า" ${i ? '' : 'hidden'}>‹</button>
      <figure class="lb-fig">${p.thumb ? `<img class="lb-low" src="${esc(p.thumb)}" alt="">` : ''}<span class="lb-load">กำลังโหลดรูป…</span></figure>
      <button class="lb-nav next" aria-label="รูปถัดไป" ${i < a.photos.length - 1 ? '' : 'hidden'}>›</button>`;
    document.documentElement.classList.add('lb-on');
    const go = (d) => { const j = gs.lb + d; if (j >= 0 && j < a.photos.length) lightbox(j); };
    $('.lb-nav.prev', box).onclick = () => go(-1);
    $('.lb-nav.next', box).onclick = () => go(1);
    $('#lbX').onclick = closeLb;
    box.onclick = (e) => { if (e.target === box || e.target.classList.contains('lb-fig')) closeLb(); };
    document.onkeydown = (e) => { if (e.key === 'Escape') closeLb(); if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); };
    let x0 = null;
    box.ontouchstart = (e) => { x0 = e.touches[0].clientX; };
    box.ontouchend = (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); x0 = null; };
    const del = $('#lbDel');
    if (del) del.onclick = async () => {
      if (!confirm('ลบรูปนี้? ไฟล์จะถูกย้ายไปถังขยะของ Google Drive')) return;
      try {
        await SC.authed({ action: 'deleteGalleryPhoto', id: p.id });
        a.photos.splice(a.photos.indexOf(p), 1);
        gs.albums = null;
        toast('ลบรูปแล้ว');
        renderAlbum();
        if (a.photos.length) lightbox(Math.min(i, a.photos.length - 1)); else closeLb();
      } catch (err) { toast(err.message, true); }
    };
    fullSrc(p).then(src => {
      if (gs.lb !== i || !$('#galLb')) return;
      const img = new Image();
      img.className = 'lb-img';
      img.alt = '';
      img.onload = () => {
        if (gs.lb !== i) return;
        $('.lb-fig', box).replaceChildren(img);
        const dl = $('#lbDl');
        dl.href = src; dl.hidden = false;
      };
      img.onerror = () => { if (gs.lb === i) $('.lb-load', box).textContent = 'โหลดรูปเต็มไม่สำเร็จ'; };
      img.src = src;
    }).catch(err => { if (gs.lb === i) $('.lb-load', box).textContent = err.message; });
    // โหลดรูปถัดไปรอไว้
    const nx = a.photos[i + 1];
    if (nx) fullSrc(nx).then(s => { new Image().src = s; }).catch(() => {});
  }
  function closeLb() {
    gs.lb = -1;
    const box = $('#galLb');
    if (box) box.remove();
    document.documentElement.classList.remove('lb-on');
    document.onkeydown = null;
  }
  window.addEventListener('hashchange', closeLb);

  /* ================= ฟอร์มอัลบั้ม ================= */
  async function albumForm(a) {
    const v = a || { title: '', date: SC.iso(new Date()), detail: '' };
    let events = [];
    try { events = await SC.apiGet('events'); } catch (_) { /* ไม่มีปฏิทินก็สร้างเองได้ */ }
    events = events.filter(e => e.date <= SC.iso(new Date())).sort((x, y) => y.date.localeCompare(x.date)).slice(0, 30);
    openDialog(`${dlgHead(a ? 'แก้ไขอัลบั้ม' : 'สร้างอัลบั้มกิจกรรม')}
      <form class="dlg-body" id="galForm">
        ${!a && events.length ? `<div class="field"><label for="gf0">เลือกจากปฏิทินงาน <small>(ไม่บังคับ)</small></label>
          <select id="gf0"><option value="">— พิมพ์ชื่อกิจกรรมเอง —</option>${events.map((e, i) => `<option value="${i}">${SC.thDate(e.date)} · ${esc(e.title)}</option>`).join('')}</select></div>` : ''}
        <div class="field"><label for="gf1">ชื่อกิจกรรม</label><input id="gf1" name="title" maxlength="120" required value="${esc(v.title)}" placeholder="เช่น กิจกรรมวันไหว้ครู"></div>
        <div class="field"><label for="gf2">วันที่จัดกิจกรรม</label><input id="gf2" name="date" type="date" required value="${esc(v.date)}"></div>
        <div class="field"><label for="gf3">รายละเอียด <small>(ไม่บังคับ)</small></label><textarea id="gf3" name="detail" rows="3" maxlength="1000">${esc(v.detail)}</textarea></div>
        <p class="hint">ระบบจะสร้างโฟลเดอร์ใน Google Drive ให้อัตโนมัติ: คลังภาพสภานักเรียน / ปี พ.ศ. / วันที่ ชื่อกิจกรรม</p>
        <p class="err"></p>
        <div class="dlg-actions"><span class="spacer"></span><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button type="submit" class="btn btn-gold">${a ? 'บันทึก' : 'สร้างอัลบั้ม'}</button></div>
      </form>`);
    const f = $('#galForm');
    const pick = $('#gf0');
    if (pick) pick.onchange = () => { const e = events[pick.value]; if (e) { f.title.value = e.title; f.date.value = e.date; if (!f.detail.value) f.detail.value = e.detail || ''; } };
    f.onsubmit = (e) => {
      e.preventDefault();
      SC.submitting(f, async () => {
        const r = await SC.authed({ action: 'saveAlbum', id: a ? a.id : '', title: f.title.value, date: f.date.value, detail: f.detail.value });
        SC.dialog.close();
        gs.albums = null;
        toast(a ? 'บันทึกอัลบั้มแล้ว' : 'สร้างอัลบั้มแล้ว — อัปโหลดรูปได้เลย');
        if (a) { gs.album = null; openAlbum(a.id); } else location.hash = '#gallery/' + r.id;
      });
    };
  }

  /* ================= โหมดทดลอง ================= */
  const ext = SC.demoExt;
  const demoDb = (db) => (db.gallery = db.gallery || { albums: [], photos: [] });
  const out = (x) => JSON.parse(JSON.stringify(x));
  const findAlbum = (db, id) => { const a = demoDb(db).albums.find(x => x.id === id && x.status !== 'deleted'); if (!a) throw new Error('ไม่พบอัลบั้ม'); return a; };
  ext.albums = (db) => {
    const g = demoDb(db);
    return out(g.albums.filter(a => a.status !== 'deleted').map(a => {
      const ph = g.photos.filter(p => p.albumId === a.id);
      return { ...a, count: ph.length, cover: (ph.find(p => p.thumb) || {}).thumb || '' };
    }));
  };
  ext.album = (db, b) => out({ ...findAlbum(db, b.id), photos: demoDb(db).photos.filter(p => p.albumId === b.id).map(({ data, ...p }) => p) });
  // โหมดทดลองเก็บรูปย่อแทนรูปเต็ม (พื้นที่ในเบราว์เซอร์มีจำกัด)
  ext.gphoto = (db, b) => { const p = demoDb(db).photos.find(x => x.id === b.id); if (!p) throw new Error('ไม่พบรูป'); return p.data; };
  ext.saveAlbum = (db, b, sess) => {
    const u = sess('gallery'), g = demoDb(db);
    if (!String(b.title || '').trim()) throw new Error('กรุณาระบุชื่อกิจกรรม');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) throw new Error('วันที่ไม่ถูกต้อง');
    const v = { title: b.title.trim(), date: b.date, detail: String(b.detail || '').trim() };
    if (b.id) { Object.assign(findAlbum(db, b.id), v); return { id: b.id }; }
    const id = SC.uid();
    g.albums.push({ id, ...v, folderId: 'demo-' + id, status: 'active', createdByName: u.name });
    return { id };
  };
  ext.deleteAlbum = (db, b, sess) => { sess('gallery'); findAlbum(db, b.id).status = 'deleted'; return true; };
  ext.uploadGalleryPhoto = (db, b, sess) => {
    sess('gallery'); findAlbum(db, b.albumId);
    const p = { id: SC.uid(), albumId: b.albumId, fileId: 'demo', thumb: b.thumb, public: false, data: b.thumb };
    demoDb(db).photos.push(p);
    const { data, ...rest } = p;
    return out(rest);
  };
  ext.deleteGalleryPhoto = (db, b, sess) => { sess('gallery'); const g = demoDb(db); g.photos = g.photos.filter(p => p.id !== b.id); return true; };
  ext.syncAlbum = (db, b, sess) => { sess('gallery'); findAlbum(db, b.id); return { added: 0 }; };
  ext.setGalleryThumb = (db, b, sess) => { sess('gallery'); const p = demoDb(db).photos.find(x => x.id === b.id); if (p) p.thumb = b.thumb; return true; };
})();
