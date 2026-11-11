// คลังเกียรติบัตร — ไฟล์ PDF/รูปเก็บใน Google Drive (คลังเกียรติบัตรสภานักเรียน / ปี พ.ศ.)
// ทุกคนค้นหา ดู และดาวน์โหลดได้ ผู้มีสิทธิ์ "คลังเกียรติบัตร" อัปโหลด แก้ไข และลบได้
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
  const cs = { list: null, q: '', year: '', cat: '', sort: 'new' };
  const files = {}; // ไฟล์เต็มที่โหลดแล้ว (blob URL) เฉพาะรอบนี้
  const staff = () => can('certs');
  const beYear = (s) => String(Number(s.slice(0, 4)) + 543);
  const isPdf = (c) => c.mime === 'application/pdf';

  /* ================= เส้นทาง ================= */
  document.addEventListener('sc:certs', async () => {
    if (!cs.list) await SC.prime(async (get) => { cs.list = get('certs'); });
    if (cs.list) render(); else $('#certsView').innerHTML = '<p class="empty">กำลังโหลดคลังเกียรติบัตร…</p>';
    await reload();
  });
  document.addEventListener('sc:auth', () => { if (cs.list && !$('#page-certs').hidden) render(); });

  async function reload() {
    try { cs.list = await SC.apiGet('certs'); if (!$('#page-certs').hidden) render(); } catch (err) {
      if (!cs.list) $('#certsView').innerHTML = `<p class="empty">โหลดคลังเกียรติบัตรไม่สำเร็จ: ${esc(err.message)}</p>`; else toast(err.message, true);
    }
  }

  /* ================= รายการ ================= */
  function filtered() {
    const q = cs.q.trim().toLowerCase();
    const list = cs.list.filter(c => (!cs.year || beYear(c.date) === cs.year) && (!cs.cat || c.category === cs.cat)
      && (!q || [c.title, c.recipient, c.issuer].join(' ').toLowerCase().includes(q)));
    const by = {
      new: (a, b) => b.date.localeCompare(a.date) || a.recipient.localeCompare(b.recipient, 'th'),
      old: (a, b) => a.date.localeCompare(b.date) || a.recipient.localeCompare(b.recipient, 'th'),
      name: (a, b) => a.recipient.localeCompare(b.recipient, 'th') || b.date.localeCompare(a.date),
    };
    return list.sort(by[cs.sort]);
  }

  function render() {
    const years = [...new Set(cs.list.map(c => beYear(c.date)))].sort().reverse();
    if (cs.year && !years.includes(cs.year)) cs.year = '';
    const list = filtered();
    const people = new Set(cs.list.map(c => c.recipient)).size;
    $('#certsView').innerHTML = `
      <div class="stats">
        <div class="stat"><span>เกียรติบัตรทั้งหมด</span><strong>${cs.list.length.toLocaleString('th-TH')}</strong></div>
        <div class="stat"><span>ด้านรางวัล</span><strong class="c-in">${cs.list.filter(c => c.category === 'award').length}</strong></div>
        <div class="stat"><span>ผู้ได้รับ</span><strong>${people} ราย</strong></div>
      </div>
      <div class="card gal-tools">
        <input type="search" id="ctQ" placeholder="ค้นหาชื่อผู้ได้รับ ชื่อรายการ หรือหน่วยงาน" value="${esc(cs.q)}" aria-label="ค้นหาเกียรติบัตร">
        <select id="ctCat" aria-label="ประเภท"><option value="">ทุกประเภท</option>${Object.entries(CATS).map(([k, v]) => `<option value="${k}" ${k === cs.cat ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}</select>
        <select id="ctSort" aria-label="เรียงตาม">
          <option value="new" ${cs.sort === 'new' ? 'selected' : ''}>วันที่ล่าสุดก่อน</option>
          <option value="old" ${cs.sort === 'old' ? 'selected' : ''}>วันที่เก่าสุดก่อน</option>
          <option value="name" ${cs.sort === 'name' ? 'selected' : ''}>ชื่อผู้ได้รับ ก–ฮ</option>
        </select>
        ${staff() ? '<button class="btn btn-gold" id="ctNew">+ เพิ่มเกียรติบัตร</button>' : ''}
        ${years.length ? `<div class="gal-years" role="group" aria-label="ปี พ.ศ.">
          <button class="${cs.year ? '' : 'on'}" data-cyear="">ทุกปี</button>${years.map(y => `<button class="${y === cs.year ? 'on' : ''}" data-cyear="${y}">พ.ศ. ${y}</button>`).join('')}</div>` : ''}
      </div>
      ${list.length ? `<p class="hint ct-count">พบ ${list.length.toLocaleString('th-TH')} รายการ</p><div class="ct-grid">${list.map(card).join('')}</div>`
        : `<div class="card empty-state"><p class="empty">${cs.list.length ? 'ไม่พบเกียรติบัตรที่ตรงกับการค้นหา' : 'ยังไม่มีเกียรติบัตรในคลัง'}</p>
          ${staff() && !cs.list.length ? '<p class="hint" style="text-align:center">กด “+ เพิ่มเกียรติบัตร” อัปโหลดไฟล์ PDF หรือรูป ได้ทีละหลายไฟล์</p>' : ''}</div>`}`;
    $('#ctQ').oninput = (e) => { cs.q = e.target.value; const pos = e.target.selectionStart; render(); const q = $('#ctQ'); q.focus(); q.setSelectionRange(pos, pos); };
    $('#ctCat').onchange = (e) => { cs.cat = e.target.value; render(); };
    $('#ctSort').onchange = (e) => { cs.sort = e.target.value; render(); };
    $$('[data-cyear]').forEach(b => (b.onclick = () => { cs.year = b.dataset.cyear; render(); }));
    $$('.ct-card').forEach(b => (b.onclick = () => viewer(cs.list.find(c => c.id === b.dataset.id))));
    const nb = $('#ctNew');
    if (nb) nb.onclick = () => uploadForm();
  }

  function card(c) {
    return `<button class="ct-card" data-id="${esc(c.id)}">
      <div class="ct-thumb">${c.thumb ? `<img src="${esc(c.thumb)}" alt="" loading="lazy">` : `<span aria-hidden="true">${CATS[c.category].icon}</span>`}
        ${isPdf(c) ? '<span class="ct-type">PDF</span>' : ''}</div>
      <div class="ct-cap">
        <span class="badge ct-cat ct-${c.category}">${CATS[c.category].icon} ${CATS[c.category].label}</span>
        <b>${esc(c.recipient)}</b>
        <span>${esc(c.title)}</span>
        <small>${[c.issuer, SC.thDate(c.date)].filter(Boolean).map(esc).join(' · ')}</small>
      </div></button>`;
  }

  /* ================= ดูไฟล์ ================= */
  async function blobUrl(c) {
    if (files[c.id]) return files[c.id];
    const data = await SC.apiGet('certFile', { id: c.id }, { cache: false });
    const blob = await (await fetch(data)).blob();
    return (files[c.id] = URL.createObjectURL(blob));
  }
  const fileName = (c) => `${c.title} - ${c.recipient}`.replace(/[\\/:*?"<>|]/g, '-') + (isPdf(c) ? '.pdf' : '.jpg');

  function viewer(c) {
    if (!c) return;
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
      <div class="lb-top"><span class="ct-lb-title"><b>${esc(c.recipient)}</b> · ${esc(c.title)}</span><span class="spacer"></span>
        <a class="lb-btn" id="ctDl" ${direct ? `href="https://drive.google.com/uc?export=download&id=${encodeURIComponent(c.fileId)}" target="_blank" rel="noopener"` : 'hidden'} download="${esc(fileName(c))}">⬇︎ ดาวน์โหลด</a>
        ${staff() ? '<button class="lb-btn" id="ctEdit">แก้ไข</button><button class="lb-btn" id="ctDel">ลบ</button>' : ''}
        <button class="lb-btn" id="ctX" aria-label="ปิด">✕</button></div>
      <div class="ct-stage">${direct && isPdf(c)
        ? `<iframe src="https://drive.google.com/file/d/${encodeURIComponent(c.fileId)}/preview" title="เกียรติบัตร" allow="autoplay"></iframe>`
        : direct ? `<img src="https://lh3.googleusercontent.com/d/${encodeURIComponent(c.fileId)}=w2000" alt="เกียรติบัตร ${esc(c.recipient)}">`
        : `${c.thumb ? `<img class="lb-low" src="${esc(c.thumb)}" alt="">` : ''}<span class="lb-load">กำลังโหลดไฟล์…</span>`}</div>`;
    document.documentElement.classList.add('lb-on');
    $('#ctX').onclick = closeViewer;
    box.onclick = (e) => { if (e.target === box || e.target.classList.contains('ct-stage')) closeViewer(); };
    document.onkeydown = (e) => { if (e.key === 'Escape') closeViewer(); };
    const ed = $('#ctEdit');
    if (ed) {
      ed.onclick = () => { closeViewer(); editForm(c); };
      $('#ctDel').onclick = async () => {
        if (!confirm(`ลบเกียรติบัตร “${c.title}” ของ ${c.recipient}?\nไฟล์จะถูกย้ายไปถังขยะของ Google Drive (กู้คืนได้ภายใน 30 วัน)`)) return;
        try { await SC.authed({ action: 'deleteCert', id: c.id }); cs.list = cs.list.filter(x => x.id !== c.id); closeViewer(); render(); toast('ลบเกียรติบัตรแล้ว'); } catch (err) { toast(err.message, true); }
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
  window.addEventListener('hashchange', closeViewer);

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
        const sc = 480 / Math.max(vp.width, vp.height);
        const v2 = page.getViewport({ scale: sc });
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

  async function uploadForm() {
    const names = await memberNames();
    openDialog(`${dlgHead('เพิ่มเกียรติบัตร')}
      <form class="dlg-body" id="ctForm">
        <div class="field"><label for="cf1">ชื่อรายการ / เรื่อง</label><input id="cf1" name="title" maxlength="200" required placeholder="เช่น รางวัลชนะเลิศการประกวดโครงงาน"></div>
        <div class="row2">
          <div class="field"><label for="cf2">ประเภท</label><select id="cf2" name="category">${catOptions('award')}</select></div>
          <div class="field"><label for="cf3">วันที่ในเกียรติบัตร</label><input id="cf3" name="date" type="date" required value="${SC.iso(new Date())}"></div>
        </div>
        <div class="field"><label for="cf4">หน่วยงานที่มอบ <small>(ไม่บังคับ)</small></label><input id="cf4" name="issuer" maxlength="150" placeholder="เช่น สำนักงานเขตพื้นที่การศึกษามัธยมศึกษา"></div>
        <div class="field"><label class="btn btn-ghost" for="cfFiles">เลือกไฟล์ PDF หรือรูป…</label><input type="file" id="cfFiles" accept="application/pdf,image/*" multiple hidden>
          <p class="hint">เลือกได้หลายไฟล์ ระบบตั้งชื่อผู้ได้รับจากชื่อไฟล์ให้ก่อน แก้ไขได้ · ไฟล์ละไม่เกิน 10 MB</p></div>
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
        const base = { title: f.title.value.trim(), category: f.category.value, date: f.date.value, issuer: f.issuer.value.trim() };
        if (!base.title) throw new Error('กรุณาระบุชื่อรายการ');
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
            const c = await SC.authed({ action: 'uploadCert', ...base, recipient: p.recipient.trim(), ...r });
            cs.list.push(c);
            p.done = true;
            ok++;
          } catch (err) { fails.push(`${p.file.name}: ${err.message}`); }
        }
        picked = picked.filter(p => !p.done);
        render();
        if (!fails.length) { SC.dialog.close(); toast(`อัปโหลดเกียรติบัตรแล้ว ${ok} ไฟล์`); return; }
        draw();
        box.hidden = true;
        throw new Error(`สำเร็จ ${ok} ไฟล์ ไม่สำเร็จ ${fails.length} ไฟล์ — ${fails.join(' / ')}`);
      });
    };
  }

  async function editForm(c) {
    const names = await memberNames();
    openDialog(`${dlgHead('แก้ไขเกียรติบัตร')}
      <form class="dlg-body" id="ctEditForm">
        <div class="field"><label for="ce1">ชื่อรายการ / เรื่อง</label><input id="ce1" name="title" maxlength="200" required value="${esc(c.title)}"></div>
        <div class="field"><label for="ce2">ชื่อผู้ได้รับ</label><input id="ce2" name="recipient" maxlength="150" required list="ceNames" value="${esc(c.recipient)}"></div>
        <datalist id="ceNames">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        <div class="row2">
          <div class="field"><label for="ce3">ประเภท</label><select id="ce3" name="category">${catOptions(c.category)}</select></div>
          <div class="field"><label for="ce4">วันที่ในเกียรติบัตร</label><input id="ce4" name="date" type="date" required value="${esc(c.date)}"></div>
        </div>
        <div class="field"><label for="ce5">หน่วยงานที่มอบ</label><input id="ce5" name="issuer" maxlength="150" value="${esc(c.issuer)}"></div>
        <p class="err"></p>
        <div class="dlg-actions"><span class="spacer"></span><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button type="submit" class="btn btn-gold">บันทึก</button></div>
      </form>`);
    const f = $('#ctEditForm');
    f.onsubmit = (e) => {
      e.preventDefault();
      SC.submitting(f, async () => {
        const v = { title: f.title.value.trim(), recipient: f.recipient.value.trim(), category: f.category.value, date: f.date.value, issuer: f.issuer.value.trim() };
        await SC.authed({ action: 'updateCert', id: c.id, ...v });
        Object.assign(c, v);
        SC.dialog.close();
        render();
        toast('บันทึกแล้ว');
      });
    };
  }

  /* ================= โหมดทดลอง ================= */
  const ext = SC.demoExt;
  const demoList = (db) => (db.certs = db.certs || []);
  const out = (x) => JSON.parse(JSON.stringify(x));
  const strip = ({ data, ...c }) => c;
  const check = (b) => {
    if (!String(b.title || '').trim()) throw new Error('กรุณาระบุชื่อรายการเกียรติบัตร');
    if (!String(b.recipient || '').trim()) throw new Error('กรุณาระบุชื่อผู้ได้รับ');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) throw new Error('วันที่ไม่ถูกต้อง');
    return { title: b.title.trim(), recipient: b.recipient.trim(), issuer: String(b.issuer || '').trim(), date: b.date, category: CATS[b.category] ? b.category : 'other' };
  };
  ext.certs = (db) => out(demoList(db).filter(c => c.status !== 'deleted').map(strip));
  // โหมดทดลองเก็บเฉพาะรูปย่อ (พื้นที่ในเบราว์เซอร์มีจำกัด) จึงแสดงรูปย่อแทนไฟล์จริง
  ext.certFile = (db, b) => { const c = demoList(db).find(x => x.id === b.id); if (!c) throw new Error('ไม่พบเกียรติบัตร'); return c.thumb || 'data:text/plain,demo'; };
  ext.uploadCert = (db, b, sess) => {
    sess('certs');
    const c = { id: SC.uid(), ...check(b), fileId: 'demo', mime: 'image/jpeg', thumb: b.thumb, public: false, status: 'active' };
    demoList(db).push(c);
    return out(c);
  };
  ext.updateCert = (db, b, sess) => { sess('certs'); const c = demoList(db).find(x => x.id === b.id && x.status !== 'deleted'); if (!c) throw new Error('ไม่พบเกียรติบัตร'); Object.assign(c, check(b)); return true; };
  ext.deleteCert = (db, b, sess) => { sess('certs'); const c = demoList(db).find(x => x.id === b.id); if (c) c.status = 'deleted'; return true; };
})();
