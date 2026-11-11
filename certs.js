// คลังเกียรติบัตร — จัดเป็นงาน/กิจกรรม ไฟล์ PDF/รูปเก็บใน Google Drive
// (คลังเกียรติบัตรสภานักเรียน / ปี พ.ศ. / วันที่ ชื่องาน / ชื่อผู้ได้รับ.pdf)
// ทุกคนค้นหา ดู และดาวน์โหลดได้ ผู้มีสิทธิ์ "คลังเกียรติบัตร" สร้างงาน อัปโหลด แก้ไข และลบได้
(() => {
  'use strict';
  const SC = window.SC;
  const { $, $$, esc, can, toast, openDialog, dlgHead } = SC;

  const CATS = {
    award: { label: 'รางวัล', icon: '🏆' },
    join: { label: 'เข้าร่วมกิจกรรม', icon: '🎖️' },
    thanks: { label: 'ขอบคุณ/อนุโมทนา', icon: '🙏' },
    other: { label: 'อื่น ๆ', icon: '📜' },
  };
  const PDF_JS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  const cs = { events: null, ev: null, view: '', q: '', inner: '', year: '', cat: '', sort: 'new' };
  const files = {}; // ไฟล์เต็มที่โหลดแล้ว (blob URL) เฉพาะรอบนี้
  const staff = () => can('certs');
  const beYear = (s) => String(Number(s.slice(0, 4)) + 543);
  const isPdf = (c) => c.mime === 'application/pdf';
  const longDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }); };
  const folderUrl = (id) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;
  const catBadge = (k) => `<span class="badge ct-cat ct-${k}">${CATS[k].icon} ${CATS[k].label}</span>`;

  /* ================= เส้นทาง ================= */
  document.addEventListener('sc:certs', async (e) => {
    cs.view = e.detail || '';
    if (cs.view) return openEvent(cs.view);
    if (!cs.events) await SC.prime(async (get) => { cs.events = get('certEvents'); });
    if (cs.events) renderList(); else $('#certsView').innerHTML = '<p class="empty">กำลังโหลดคลังเกียรติบัตร…</p>';
    try { cs.events = await SC.apiGet('certEvents'); if (!cs.view && !$('#page-certs').hidden) renderList(); } catch (err) {
      if (!cs.events) $('#certsView').innerHTML = `<p class="empty">โหลดคลังเกียรติบัตรไม่สำเร็จ: ${esc(err.message)}</p>`; else toast(err.message, true);
    }
  });
  document.addEventListener('sc:auth', () => {
    if ($('#page-certs').hidden) return;
    if (cs.view && cs.ev) renderEvent(); else if (cs.events) renderList();
  });

  async function openEvent(id) {
    if (!cs.ev || cs.ev.id !== id) {
      cs.ev = null;
      await SC.prime(async (get) => { cs.ev = get('certEvent', { id }); });
    }
    if (cs.ev) renderEvent(); else $('#certsView').innerHTML = '<p class="empty">กำลังโหลดงาน…</p>';
    try {
      const ev = await SC.apiGet('certEvent', { id });
      if (cs.view !== id) return;
      cs.ev = ev; renderEvent();
    } catch (err) {
      if (!cs.ev) $('#certsView').innerHTML = `<a href="#certs" class="back-link">← งานทั้งหมด</a><p class="empty">โหลดงานไม่สำเร็จ: ${esc(err.message)}</p>`;
      else toast(err.message, true);
    }
  }

  /* ================= รายการงาน/กิจกรรม ================= */
  // ค้นหาได้ทั้งชื่องาน หน่วยงาน และชื่อผู้ได้รับในงานนั้น
  const nameHits = (ev, q) => q ? ev.names.filter(n => n.toLowerCase().includes(q)) : [];
  function filtered() {
    const q = cs.q.trim().toLowerCase();
    const list = cs.events.filter(ev => (!cs.year || beYear(ev.date) === cs.year) && (!cs.cat || ev.category === cs.cat)
      && (!q || [ev.title, ev.issuer, ev.detail].join(' ').toLowerCase().includes(q) || nameHits(ev, q).length));
    const by = { new: (a, b) => b.date.localeCompare(a.date), old: (a, b) => a.date.localeCompare(b.date), name: (a, b) => a.title.localeCompare(b.title, 'th') || b.date.localeCompare(a.date) };
    return list.sort(by[cs.sort]);
  }

  function renderList() {
    const years = [...new Set(cs.events.map(ev => beYear(ev.date)))].sort().reverse();
    if (cs.year && !years.includes(cs.year)) cs.year = '';
    const list = filtered(), q = cs.q.trim().toLowerCase();
    const total = cs.events.reduce((n, ev) => n + ev.count, 0);
    $('#certsView').innerHTML = `
      <div class="stats">
        <div class="stat"><span>งาน/กิจกรรม</span><strong>${cs.events.length}</strong></div>
        <div class="stat"><span>เกียรติบัตรทั้งหมด</span><strong>${total.toLocaleString('th-TH')}</strong></div>
        <div class="stat"><span>งานด้านรางวัล</span><strong class="c-in">${cs.events.filter(ev => ev.category === 'award').length}</strong></div>
      </div>
      <div class="card gal-tools">
        <input type="search" id="ctQ" placeholder="ค้นหาชื่องาน หรือชื่อผู้ได้รับ" value="${esc(cs.q)}" aria-label="ค้นหาเกียรติบัตร">
        <select id="ctCat" aria-label="ประเภท"><option value="">ทุกประเภท</option>${Object.entries(CATS).map(([k, v]) => `<option value="${k}" ${k === cs.cat ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}</select>
        <select id="ctSort" aria-label="เรียงตาม">
          <option value="new" ${cs.sort === 'new' ? 'selected' : ''}>วันที่ล่าสุดก่อน</option>
          <option value="old" ${cs.sort === 'old' ? 'selected' : ''}>วันที่เก่าสุดก่อน</option>
          <option value="name" ${cs.sort === 'name' ? 'selected' : ''}>ชื่องาน ก–ฮ</option>
        </select>
        ${staff() ? '<button class="btn btn-gold" id="ctNew">+ สร้างงาน/กิจกรรม</button>' : ''}
        ${years.length ? `<div class="gal-years" role="group" aria-label="ปี พ.ศ.">
          <button class="${cs.year ? '' : 'on'}" data-cyear="">ทุกปี</button>${years.map(y => `<button class="${y === cs.year ? 'on' : ''}" data-cyear="${y}">พ.ศ. ${y}</button>`).join('')}</div>` : ''}
      </div>
      ${list.length ? `<div class="gal-grid">${list.map(ev => eventCard(ev, q)).join('')}</div>`
        : `<div class="card empty-state"><p class="empty">${cs.events.length ? 'ไม่พบงานหรือชื่อที่ค้นหา' : 'ยังไม่มีงาน/กิจกรรมในคลังเกียรติบัตร'}</p>
          ${staff() && !cs.events.length ? '<p class="hint" style="text-align:center">กด “+ สร้างงาน/กิจกรรม” แล้วอัปโหลดเกียรติบัตรของผู้ได้รับทุกคนในงานนั้น</p>' : ''}</div>`}`;
    $('#ctQ').oninput = (e) => { cs.q = e.target.value; const pos = e.target.selectionStart; renderList(); const qi = $('#ctQ'); qi.focus(); qi.setSelectionRange(pos, pos); };
    $('#ctCat').onchange = (e) => { cs.cat = e.target.value; renderList(); };
    $('#ctSort').onchange = (e) => { cs.sort = e.target.value; renderList(); };
    $$('[data-cyear]').forEach(b => (b.onclick = () => { cs.year = b.dataset.cyear; renderList(); }));
    // เปิดงานจากการค้นหาชื่อคน → ค้นชื่อนั้นต่อในงานให้เลย
    $$('.ct-ev').forEach(a => (a.onclick = () => { cs.inner = a.dataset.hit || ''; }));
    const nb = $('#ctNew');
    if (nb) nb.onclick = () => eventForm(null);
  }

  function eventCard(ev, q) {
    const hits = nameHits(ev, q);
    return `<a class="gal-card ct-ev" href="#certs/${esc(ev.id)}" ${hits.length ? `data-hit="${esc(cs.q.trim())}"` : ''}>
      <div class="gal-cover ct-cover">${ev.cover ? `<img src="${esc(ev.cover)}" alt="" loading="lazy">` : `<span aria-hidden="true">${CATS[ev.category].icon}</span>`}<span class="gal-count">${ev.count} ใบ</span></div>
      <div class="gal-cap">${catBadge(ev.category)}<b>${esc(ev.title)}</b><small>${[ev.issuer, SC.thDate(ev.date)].filter(Boolean).map(esc).join(' · ')}</small>
        ${hits.length ? `<small class="ct-hit">พบชื่อ: ${hits.slice(0, 3).map(esc).join(', ')}${hits.length > 3 ? ` และอีก ${hits.length - 3} คน` : ''}</small>` : ''}</div></a>`;
  }

  /* ================= หน้างาน ================= */
  function renderEvent() {
    const ev = cs.ev;
    const q = cs.inner.trim().toLowerCase();
    const certs = [...ev.certs].sort((a, b) => a.recipient.localeCompare(b.recipient, 'th')).filter(c => !q || c.recipient.toLowerCase().includes(q));
    $('#certsView').innerHTML = `
      <a href="#certs" class="back-link">← งานทั้งหมด</a>
      <div class="card gal-head">
        <div class="di-head">
          <div>${catBadge(ev.category)}<h2>${esc(ev.title)}</h2><p class="eyebrow-sm">${[ev.issuer, longDate(ev.date)].filter(Boolean).map(esc).join(' · ')}</p></div>
          ${staff() ? `<div class="head-actions">
            <button class="btn btn-gold btn-sm" id="ctAdd">+ เพิ่มเกียรติบัตร</button>
            <a class="btn btn-ghost btn-sm" href="${folderUrl(ev.folderId)}" target="_blank" rel="noopener">เปิดโฟลเดอร์ Drive</a>
            <button class="btn btn-ghost btn-sm" id="ctEditEv">แก้ไขงาน</button>
            <button class="btn btn-ghost btn-sm danger" id="ctDelEv">ลบงาน</button>
          </div>` : ''}
        </div>
        ${ev.detail ? `<p class="di-detail">${esc(ev.detail)}</p>` : ''}
        <p class="hint">เกียรติบัตร ${ev.certs.length} ใบ</p>
        ${ev.certs.length > 6 || cs.inner ? `<input type="search" class="sheet-search" id="ctInner" placeholder="ค้นหาชื่อผู้ได้รับในงานนี้" value="${esc(cs.inner)}" aria-label="ค้นหาชื่อผู้ได้รับ">` : ''}
      </div>
      ${certs.length ? `<div class="ct-grid">${certs.map(card).join('')}</div>`
        : `<div class="card empty-state"><p class="empty">${ev.certs.length ? 'ไม่พบชื่อที่ค้นหาในงานนี้' : 'งานนี้ยังไม่มีเกียรติบัตร'}</p>
          ${staff() && !ev.certs.length ? '<p class="hint" style="text-align:center">กด “+ เพิ่มเกียรติบัตร” เลือกไฟล์ได้ทีละหลายไฟล์ ตั้งชื่อไฟล์เป็นชื่อคนเพื่อให้ระบบใส่ชื่อให้</p>' : ''}</div>`}`;
    const inner = $('#ctInner');
    if (inner) inner.oninput = (e) => { cs.inner = e.target.value; const pos = e.target.selectionStart; renderEvent(); const i = $('#ctInner'); i.focus(); i.setSelectionRange(pos, pos); };
    $$('.ct-card').forEach(b => (b.onclick = () => viewer(ev.certs.find(c => c.id === b.dataset.id))));
    if (!staff()) return;
    $('#ctAdd').onclick = () => uploadForm(ev);
    $('#ctEditEv').onclick = () => eventForm(ev);
    $('#ctDelEv').onclick = async () => {
      if (!confirm(`ลบงาน “${ev.title}” และเกียรติบัตรทั้งหมด ${ev.certs.length} ใบ?\nโฟลเดอร์จะถูกย้ายไปถังขยะของ Google Drive (กู้คืนได้ภายใน 30 วัน)`)) return;
      try { await SC.authed({ action: 'deleteCertEvent', id: ev.id }); cs.events = null; toast('ลบงานแล้ว'); location.hash = '#certs'; } catch (err) { toast(err.message, true); }
    };
  }

  function card(c) {
    return `<button class="ct-card" data-id="${esc(c.id)}">
      <div class="ct-thumb">${c.thumb ? `<img src="${esc(c.thumb)}" alt="" loading="lazy">` : '<span aria-hidden="true">📜</span>'}
        ${isPdf(c) ? '<span class="ct-type">PDF</span>' : ''}</div>
      <div class="ct-cap"><b>${esc(c.recipient)}</b></div></button>`;
  }

  /* ================= ดูไฟล์ ================= */
  async function blobUrl(c) {
    if (files[c.id]) return files[c.id];
    const data = await SC.apiGet('certFile', { id: c.id }, { cache: false });
    const blob = await (await fetch(data)).blob();
    return (files[c.id] = URL.createObjectURL(blob));
  }
  const fileName = (c) => `${cs.ev.title} - ${c.recipient}`.replace(/[\\/:*?"<>|]/g, '-') + (isPdf(c) ? '.pdf' : '.jpg');

  function viewer(c) {
    if (!c) return;
    const ev = cs.ev;
    let box = $('#ctLb');
    if (!box) {
      box = document.createElement('div');
      box.id = 'ctLb';
      box.className = 'gal-lb ct-lb';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      document.body.append(box);
    }
    const direct = c.public && !SC.isDemo;
    box.innerHTML = `
      <div class="lb-top"><span class="ct-lb-title"><b>${esc(c.recipient)}</b> · ${esc(ev.title)}</span><span class="spacer"></span>
        <a class="lb-btn" id="ctDl" ${direct ? `href="https://drive.google.com/uc?export=download&id=${encodeURIComponent(c.fileId)}" target="_blank" rel="noopener"` : 'hidden'} download="${esc(fileName(c))}">⬇︎ ดาวน์โหลด</a>
        ${staff() ? '<button class="lb-btn" id="ctRename">แก้ชื่อ</button><button class="lb-btn" id="ctDel">ลบ</button>' : ''}
        <button class="lb-btn" id="ctX" aria-label="ปิด">✕</button></div>
      <div class="ct-stage">${direct && isPdf(c)
        ? `<iframe src="https://drive.google.com/file/d/${encodeURIComponent(c.fileId)}/preview" title="เกียรติบัตร"></iframe>`
        : direct ? `<img src="https://lh3.googleusercontent.com/d/${encodeURIComponent(c.fileId)}=w2000" alt="เกียรติบัตร ${esc(c.recipient)}">`
        : `${c.thumb ? `<img class="lb-low" src="${esc(c.thumb)}" alt="">` : ''}<span class="lb-load">กำลังโหลดไฟล์…</span>`}</div>`;
    document.documentElement.classList.add('lb-on');
    $('#ctX').onclick = closeViewer;
    box.onclick = (e) => { if (e.target === box || e.target.classList.contains('ct-stage')) closeViewer(); };
    document.onkeydown = (e) => { if (e.key === 'Escape') closeViewer(); };
    const rn = $('#ctRename');
    if (rn) {
      rn.onclick = async () => {
        const name = prompt('ชื่อผู้ได้รับ', c.recipient);
        if (name == null || !name.trim() || name.trim() === c.recipient) return;
        try { await SC.authed({ action: 'updateCert', id: c.id, recipient: name.trim() }); c.recipient = name.trim(); cs.events = null; renderEvent(); viewer(c); toast('แก้ชื่อแล้ว'); } catch (err) { toast(err.message, true); }
      };
      $('#ctDel').onclick = async () => {
        if (!confirm(`ลบเกียรติบัตรของ ${c.recipient}?\nไฟล์จะถูกย้ายไปถังขยะของ Google Drive (กู้คืนได้ภายใน 30 วัน)`)) return;
        try { await SC.authed({ action: 'deleteCert', id: c.id }); ev.certs = ev.certs.filter(x => x.id !== c.id); cs.events = null; closeViewer(); renderEvent(); toast('ลบเกียรติบัตรแล้ว'); } catch (err) { toast(err.message, true); }
      };
    }
    if (direct) return;
    blobUrl(c).then(url => {
      if ($('#ctLb') !== box) return;
      $('.ct-stage', box).innerHTML = isPdf(c) ? `<iframe src="${url}" title="เกียรติบัตร"></iframe>` : `<img src="${url}" alt="เกียรติบัตร ${esc(c.recipient)}">`;
      const dl = $('#ctDl');
      dl.href = url; dl.hidden = false;
    }).catch(err => { const l = $('.lb-load', box); if (l) l.textContent = 'เปิดไฟล์ไม่สำเร็จ: ' + err.message; });
  }
  function closeViewer() {
    const box = $('#ctLb');
    if (box) box.remove();
    document.documentElement.classList.remove('lb-on');
    document.onkeydown = null;
  }
  window.addEventListener('hashchange', () => { closeViewer(); if (!location.hash.startsWith('#certs/')) cs.inner = ''; });

  /* ================= เตรียมไฟล์ในเบราว์เซอร์ ================= */
  let pdfLib = null;
  function loadPdfJs() {
    if (pdfLib) return pdfLib;
    pdfLib = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PDF_JS + 'pdf.min.js';
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS + 'pdf.worker.min.js'; resolve(window.pdfjsLib); };
      s.onerror = () => { pdfLib = null; reject(new Error('โหลดตัวอ่าน PDF ไม่สำเร็จ')); };
      document.head.append(s);
    });
    return pdfLib;
  }
  const toB64 = (buf) => {
    let s = '';
    const a = new Uint8Array(buf);
    for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
    return btoa(s);
  };
  function canvasJpeg(src, w, h, max, q) {
    const k = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  }
  // รูปย่อไม่เกิน ~20 KB เพื่อให้รายการโหลดเร็ว
  function thumbFrom(src, w, h) {
    for (const [max, q] of [[360, 0.7], [300, 0.62], [240, 0.55]]) {
      const d = canvasJpeg(src, w, h, max, q);
      if (d.length <= 20000) return d;
    }
    return canvasJpeg(src, w, h, 200, 0.5);
  }
  async function prepare(file) {
    if (file.type === 'application/pdf') {
      if (file.size > 10 * 1024 * 1024) throw new Error('ไฟล์ PDF ใหญ่เกิน 10 MB');
      const buf = await file.arrayBuffer();
      let thumb = '';
      try {
        const lib = await loadPdfJs();
        const pdf = await lib.getDocument({ data: buf.slice(0) }).promise;
        const page = await pdf.getPage(1);
        const vp = page.getViewport({ scale: 1 });
        const v2 = page.getViewport({ scale: 480 / Math.max(vp.width, vp.height) });
        const c = document.createElement('canvas');
        c.width = Math.round(v2.width); c.height = Math.round(v2.height);
        await page.render({ canvasContext: c.getContext('2d'), viewport: v2 }).promise;
        thumb = thumbFrom(c, c.width, c.height);
      } catch (_) { /* ไม่มีรูปย่อก็อัปโหลดได้ */ }
      return { mime: 'application/pdf', data: toB64(buf), thumb };
    }
    if (!/^image\//.test(file.type)) throw new Error('รองรับเฉพาะไฟล์ PDF หรือรูปภาพ');
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('เปิดไฟล์รูปนี้ไม่ได้'));
        i.src = url;
      });
      const w = img.naturalWidth, h = img.naturalHeight;
      // ด้านยาวไม่เกิน 2480 px (ประมาณ A4 ที่ 210 dpi) ตัวอักษรยังคมชัด
      return { mime: 'image/jpeg', data: canvasJpeg(img, w, h, 2480, 0.88).split(',')[1], thumb: thumbFrom(img, w, h) };
    } finally { URL.revokeObjectURL(url); }
  }

  /* ================= ฟอร์ม ================= */
  const catOptions = (sel) => Object.entries(CATS).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('');
  async function memberNames() {
    try { return (await SC.apiGet('duty')).members.filter(m => m.active).map(m => m.name); } catch (_) { return []; }
  }
  const stripExt = (n) => n.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();

  async function eventForm(ev) {
    const v = ev || { title: '', date: SC.iso(new Date()), issuer: '', category: 'join', detail: '' };
    let events = [];
    if (!ev) {
      try { events = (await SC.apiGet('events')).filter(e => e.date <= SC.iso(new Date())).sort((x, y) => y.date.localeCompare(x.date)).slice(0, 30); } catch (_) { /* ไม่มีปฏิทินก็กรอกเองได้ */ }
    }
    openDialog(`${dlgHead(ev ? 'แก้ไขงาน/กิจกรรม' : 'สร้างงาน/กิจกรรม')}
      <form class="dlg-body" id="ctEvForm">
        ${events.length ? `<div class="field"><label for="ce0">เลือกจากปฏิทินงาน <small>(ไม่บังคับ)</small></label>
          <select id="ce0"><option value="">— พิมพ์ชื่องานเอง —</option>${events.map((e, i) => `<option value="${i}">${SC.thDate(e.date)} · ${esc(e.title)}</option>`).join('')}</select></div>` : ''}
        <div class="field"><label for="ce1">ชื่องาน / กิจกรรม</label><input id="ce1" name="title" maxlength="200" required value="${esc(v.title)}" placeholder="เช่น ค่ายพัฒนาผู้นำนักเรียน ปีการศึกษา 2569"></div>
        <div class="row2">
          <div class="field"><label for="ce2">ประเภทเกียรติบัตร</label><select id="ce2" name="category">${catOptions(v.category)}</select></div>
          <div class="field"><label for="ce3">วันที่ในเกียรติบัตร</label><input id="ce3" name="date" type="date" required value="${esc(v.date)}"></div>
        </div>
        <div class="field"><label for="ce4">หน่วยงานที่มอบ <small>(ไม่บังคับ)</small></label><input id="ce4" name="issuer" maxlength="150" value="${esc(v.issuer)}" placeholder="เช่น โรงเรียนวังจันทร์วิทยา"></div>
        <div class="field"><label for="ce5">รายละเอียด <small>(ไม่บังคับ)</small></label><textarea id="ce5" name="detail" rows="2" maxlength="1000">${esc(v.detail)}</textarea></div>
        <p class="hint">ระบบจะสร้างโฟลเดอร์ใน Google Drive ให้อัตโนมัติ: คลังเกียรติบัตรสภานักเรียน / ปี พ.ศ. / วันที่ ชื่องาน</p>
        <p class="err"></p>
        <div class="dlg-actions"><span class="spacer"></span><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button type="submit" class="btn btn-gold">${ev ? 'บันทึก' : 'สร้างงาน'}</button></div>
      </form>`);
    const f = $('#ctEvForm'), pick = $('#ce0');
    if (pick) pick.onchange = () => { const e = events[pick.value]; if (e) { f.title.value = e.title; f.date.value = e.date; } };
    f.onsubmit = (e) => {
      e.preventDefault();
      SC.submitting(f, async () => {
        const r = await SC.authed({ action: 'saveCertEvent', id: ev ? ev.id : '', title: f.title.value, date: f.date.value, category: f.category.value, issuer: f.issuer.value, detail: f.detail.value });
        SC.dialog.close();
        cs.events = null;
        toast(ev ? 'บันทึกงานแล้ว' : 'สร้างงานแล้ว — เพิ่มเกียรติบัตรได้เลย');
        if (ev) { cs.ev = null; openEvent(ev.id); } else location.hash = '#certs/' + r.id;
      });
    };
  }

  async function uploadForm(ev) {
    const names = await memberNames();
    openDialog(`${dlgHead('เพิ่มเกียรติบัตร')}
      <form class="dlg-body" id="ctForm">
        <p class="hint">งาน: <b>${esc(ev.title)}</b></p>
        <div class="field"><label class="btn btn-ghost" for="cfFiles">เลือกไฟล์ PDF หรือรูป…</label><input type="file" id="cfFiles" accept="application/pdf,image/*" multiple hidden>
          <p class="hint">เลือกได้หลายไฟล์ ระบบใช้ชื่อไฟล์เป็นชื่อผู้ได้รับ แก้ไขได้ · ไฟล์ละไม่เกิน 10 MB</p></div>
        <ol class="ct-files" id="cfList"></ol>
        <datalist id="cfNames">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        <div id="cfProgress" class="gal-progress" hidden></div>
        <p class="err"></p>
        <div class="dlg-actions"><span class="spacer"></span><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button type="submit" class="btn btn-gold" disabled>อัปโหลด</button></div>
      </form>`);
    const f = $('#ctForm'), list = $('#cfList'), go = $('button[type=submit]', f);
    let picked = [];
    const draw = () => {
      list.innerHTML = picked.map((p, i) => `<li><span class="ct-fname" title="${esc(p.file.name)}">${p.file.type === 'application/pdf' ? '📄' : '🖼️'} ${esc(p.file.name)}</span>
        <input data-i="${i}" list="cfNames" maxlength="150" placeholder="ชื่อผู้ได้รับ" value="${esc(p.recipient)}" aria-label="ชื่อผู้ได้รับ ${esc(p.file.name)}">
        <button type="button" class="btn-link" data-rm="${i}" aria-label="เอาออก">✕</button></li>`).join('');
      $$('input[data-i]', list).forEach(inp => (inp.oninput = () => { picked[inp.dataset.i].recipient = inp.value; }));
      $$('[data-rm]', list).forEach(b => (b.onclick = () => { picked.splice(Number(b.dataset.rm), 1); draw(); }));
      go.disabled = !picked.length;
      go.textContent = picked.length ? `อัปโหลด ${picked.length} ไฟล์` : 'อัปโหลด';
    };
    $('#cfFiles').onchange = (e) => {
      picked = picked.concat([...e.target.files].map(file => ({ file, recipient: stripExt(file.name) })));
      e.target.value = '';
      draw();
    };
    f.onsubmit = (e) => {
      e.preventDefault();
      SC.submitting(f, async () => {
        if (picked.some(p => !p.recipient.trim())) throw new Error('กรุณาระบุชื่อผู้ได้รับให้ครบทุกไฟล์');
        const box = $('#cfProgress');
        box.hidden = false;
        let ok = 0;
        const fails = [];
        for (let i = 0; i < picked.length; i++) {
          const p = picked[i];
          box.innerHTML = `<span>กำลังอัปโหลด ${i + 1}/${picked.length} — ${esc(p.file.name)}</span><div class="progress"><span style="width:${Math.round(i * 100 / picked.length)}%"></span></div>`;
          try {
            const r = await prepare(p.file);
            const c = await SC.authed({ action: 'uploadCert', eventId: ev.id, recipient: p.recipient.trim(), ...r });
            ev.certs.push(c);
            p.done = true;
            ok++;
          } catch (err) { fails.push(`${p.file.name}: ${err.message}`); }
        }
        picked = picked.filter(p => !p.done);
        cs.events = null;
        if (cs.ev === ev) renderEvent();
        if (!fails.length) { SC.dialog.close(); toast(`อัปโหลดเกียรติบัตรแล้ว ${ok} ไฟล์`); return; }
        draw();
        box.hidden = true;
        throw new Error(`สำเร็จ ${ok} ไฟล์ ไม่สำเร็จ ${fails.length} ไฟล์ — ${fails.join(' / ')}`);
      });
    };
  }

  /* ================= โหมดทดลอง ================= */
  const ext = SC.demoExt;
  const demoDb = (db) => (db.certStore = db.certStore || { events: [], certs: [] });
  const out = (x) => JSON.parse(JSON.stringify(x));
  const findEv = (db, id) => { const e = demoDb(db).events.find(x => x.id === id && x.status !== 'deleted'); if (!e) throw new Error('ไม่พบงาน/กิจกรรม'); return e; };
  ext.certEvents = (db) => {
    const g = demoDb(db);
    return out(g.events.filter(e => e.status !== 'deleted').map(e => {
      const cs2 = g.certs.filter(c => c.eventId === e.id);
      return { ...e, count: cs2.length, cover: (cs2.find(c => c.thumb) || {}).thumb || '', names: cs2.map(c => c.recipient) };
    }));
  };
  ext.certEvent = (db, b) => out({ ...findEv(db, b.id), certs: demoDb(db).certs.filter(c => c.eventId === b.id) });
  // โหมดทดลองเก็บเฉพาะรูปย่อ (พื้นที่ในเบราว์เซอร์มีจำกัด) จึงแสดงรูปย่อแทนไฟล์จริง
  ext.certFile = (db, b) => { const c = demoDb(db).certs.find(x => x.id === b.id); if (!c) throw new Error('ไม่พบเกียรติบัตร'); return c.thumb || 'data:text/plain,demo'; };
  ext.saveCertEvent = (db, b, sess) => {
    const u = sess('certs');
    if (!String(b.title || '').trim()) throw new Error('กรุณาระบุชื่องาน/กิจกรรม');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) throw new Error('วันที่ไม่ถูกต้อง');
    const v = { title: b.title.trim(), date: b.date, issuer: String(b.issuer || '').trim(), detail: String(b.detail || '').trim(), category: CATS[b.category] ? b.category : 'other' };
    if (b.id) { Object.assign(findEv(db, b.id), v); return { id: b.id }; }
    const id = SC.uid();
    demoDb(db).events.push({ id, ...v, folderId: 'demo-' + id, status: 'active', createdByName: u.name });
    return { id };
  };
  ext.deleteCertEvent = (db, b, sess) => { sess('certs'); findEv(db, b.id).status = 'deleted'; return true; };
  ext.uploadCert = (db, b, sess) => {
    sess('certs'); findEv(db, b.eventId);
    if (!String(b.recipient || '').trim()) throw new Error('กรุณาระบุชื่อผู้ได้รับ');
    const c = { id: SC.uid(), eventId: b.eventId, recipient: b.recipient.trim(), fileId: 'demo', mime: 'image/jpeg', thumb: b.thumb, public: false };
    demoDb(db).certs.push(c);
    return out(c);
  };
  ext.updateCert = (db, b, sess) => { sess('certs'); const c = demoDb(db).certs.find(x => x.id === b.id); if (!c) throw new Error('ไม่พบเกียรติบัตร'); c.recipient = String(b.recipient || '').trim(); return true; };
  ext.deleteCert = (db, b, sess) => { sess('certs'); const g = demoDb(db); g.certs = g.certs.filter(x => x.id !== b.id); return true; };
})();
