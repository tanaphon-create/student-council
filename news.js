// ประกาศ/ข่าวประชาสัมพันธ์ — ทุกคนอ่านได้ ผู้มีสิทธิ์ "ประกาศข่าว" ลง แก้ไข ปักหมุด และลบประกาศได้
// รูปประกอบเก็บใน Google Drive (ประกาศสภานักเรียน / ปี พ.ศ.) ส่วนรายการใช้รูปย่อจากชีต
(() => {
  'use strict';
  const SC = window.SC;
  const { $, $$, esc, can, toast, openDialog, dlgHead } = SC;

  const CATS = {
    general: { label: 'ทั่วไป', icon: '📣' },
    event: { label: 'กิจกรรม', icon: '🎉' },
    urgent: { label: 'ด่วน', icon: '⚡' },
    recruit: { label: 'รับสมัคร', icon: '📝' },
  };
  const ns = { list: null, view: '', q: '', cat: '' };
  const images = {}; // รูปเต็มที่โหลดแล้ว (เฉพาะรอบนี้)
  const staff = () => can('news');
  const today = () => SC.iso(new Date());
  const expired = (n) => n.showUntil && n.showUntil < today();
  const when = (s) => s ? new Date(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '';
  const whenLong = (s) => s ? new Date(s).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const catBadge = (k) => `<span class="badge news-cat news-${k}">${CATS[k].icon} ${CATS[k].label}</span>`;
  // ปักหมุดก่อน แล้วเรียงใหม่ไปเก่า
  const sorted = (list) => [...list].sort((a, b) => (b.pinned - a.pinned) || String(b.createdAt).localeCompare(String(a.createdAt)));
  // ผู้อ่านทั่วไปไม่เห็นประกาศที่เลยวันแสดงผล ผู้ดูแลยังเห็น (มีป้ายบอก)
  const visible = (list) => list.filter(n => staff() || !expired(n));
  // ข้อความ: เว้นบรรทัดได้ และทำลิงก์ให้กดได้
  const richText = (s) => esc(s).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`).replace(/\n/g, '<br>');
  const excerpt = (s, n = 110) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };

  /* ================= เส้นทาง ================= */
  document.addEventListener('sc:news', async (e) => {
    ns.view = e.detail || '';
    if (!ns.list) await SC.prime(async (get) => { ns.list = get('news'); });
    if (ns.list) render(); else $('#newsView').innerHTML = '<p class="empty">กำลังโหลดประกาศ…</p>';
    try { ns.list = await SC.apiGet('news'); if (!$('#page-news').hidden) render(); } catch (err) {
      if (!ns.list) $('#newsView').innerHTML = `<p class="empty">โหลดประกาศไม่สำเร็จ: ${esc(err.message)}</p>`; else toast(err.message, true);
    }
  });
  document.addEventListener('sc:auth', () => { if (ns.list && !$('#page-news').hidden) render(); if (ns.list) homeStrip(); });
  const render = () => (ns.view ? renderOne() : renderList());

  /* ================= หน้าแรก: ประกาศล่าสุด ================= */
  document.addEventListener('sc:home', async () => {
    if (!ns.list) await SC.prime(async (get) => { ns.list = get('news'); });
    if (ns.list) homeStrip();
    try { ns.list = await SC.apiGet('news'); homeStrip(); } catch (_) { /* หน้าแรกไม่ต้องแจ้งข้อผิดพลาด */ }
  });
  function homeStrip() {
    const box = $('#homeNews');
    const list = sorted(ns.list.filter(n => !expired(n))).slice(0, 3);
    box.hidden = !list.length;
    if (!list.length) return;
    box.innerHTML = `<div class="home-news-head"><h2>📣 ประกาศล่าสุด</h2><a href="#news">ดูทั้งหมด →</a></div>
      <div class="news-grid">${list.map(newsCard).join('')}</div>`;
  }

  /* ================= รายการ ================= */
  function renderList() {
    const q = ns.q.trim().toLowerCase();
    const all = visible(ns.list);
    const list = sorted(all.filter(n => (!ns.cat || n.category === ns.cat) && (!q || (n.title + ' ' + n.body).toLowerCase().includes(q))));
    $('#newsView').innerHTML = `
      <div class="card gal-tools">
        <input type="search" id="nwQ" placeholder="ค้นหาประกาศ" value="${esc(ns.q)}" aria-label="ค้นหาประกาศ">
        <select id="nwCat" aria-label="ประเภท"><option value="">ทุกประเภท</option>${Object.entries(CATS).map(([k, v]) => `<option value="${k}" ${k === ns.cat ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}</select>
        ${staff() ? '<button class="btn btn-gold" id="nwNew">+ ลงประกาศ</button>' : ''}
      </div>
      ${list.length ? `<div class="news-grid">${list.map(newsCard).join('')}</div>`
        : `<div class="card empty-state"><p class="empty">${all.length ? 'ไม่พบประกาศที่ค้นหา' : 'ยังไม่มีประกาศ'}</p>
          ${staff() && !all.length ? '<p class="hint" style="text-align:center">กด “+ ลงประกาศ” เพื่อเริ่มประชาสัมพันธ์ข่าวสารของสภานักเรียน</p>' : ''}</div>`}`;
    $('#nwQ').oninput = (e) => { ns.q = e.target.value; const pos = e.target.selectionStart; renderList(); const i = $('#nwQ'); i.focus(); i.setSelectionRange(pos, pos); };
    $('#nwCat').onchange = (e) => { ns.cat = e.target.value; renderList(); };
    const nb = $('#nwNew');
    if (nb) nb.onclick = () => newsForm(null);
  }

  function newsCard(n) {
    return `<a class="news-card ${n.pinned ? 'is-pinned' : ''} ${n.category === 'urgent' ? 'is-urgent' : ''}" href="#news/${esc(n.id)}">
      ${n.thumb ? `<div class="news-thumb"><img src="${esc(n.thumb)}" alt="" loading="lazy"></div>` : ''}
      <div class="news-body">
        <div class="news-tags">${n.pinned ? '<span class="badge news-pin">📌 ปักหมุด</span>' : ''}${catBadge(n.category)}${expired(n) ? '<span class="badge">หมดเวลาแสดง</span>' : ''}</div>
        <h3>${esc(n.title)}</h3>
        ${n.body ? `<p>${esc(excerpt(n.body))}</p>` : ''}
        <small>${when(n.createdAt)}${n.createdByName ? ' · ' + esc(n.createdByName) : ''}</small>
      </div></a>`;
  }

  /* ================= อ่านประกาศ ================= */
  async function imageSrc(n) {
    if (images[n.id]) return images[n.id];
    if (n.public && !SC.isDemo) return (images[n.id] = `https://lh3.googleusercontent.com/d/${encodeURIComponent(n.imageFileId)}=w1600`);
    return (images[n.id] = await SC.apiGet('newsImage', { id: n.id }, { cache: false }));
  }

  function renderOne() {
    const n = ns.list.find(x => x.id === ns.view);
    if (!n) { $('#newsView').innerHTML = '<a href="#news" class="back-link">← ประกาศทั้งหมด</a><p class="empty">ไม่พบประกาศนี้ อาจถูกลบไปแล้ว</p>'; return; }
    $('#newsView').innerHTML = `
      <a href="#news" class="back-link">← ประกาศทั้งหมด</a>
      <article class="card news-article">
        <div class="news-tags">${n.pinned ? '<span class="badge news-pin">📌 ปักหมุด</span>' : ''}${catBadge(n.category)}${expired(n) ? '<span class="badge">หมดเวลาแสดง</span>' : ''}</div>
        <h2>${esc(n.title)}</h2>
        <p class="hint">${whenLong(n.createdAt)}${n.createdByName ? ' · โดย ' + esc(n.createdByName) : ''}${n.updatedAt && n.updatedAt !== n.createdAt ? ` · แก้ไขล่าสุด ${when(n.updatedAt)}` : ''}${n.showUntil && staff() ? ` · แสดงถึง ${SC.thDate(n.showUntil)}` : ''}</p>
        ${n.imageFileId ? `<figure class="news-img">${n.thumb ? `<img src="${esc(n.thumb)}" alt="" class="news-low">` : ''}</figure>` : ''}
        ${n.body ? `<div class="news-text">${richText(n.body)}</div>` : ''}
        ${n.link ? `<p><a class="btn btn-gold" href="${esc(n.link)}" target="_blank" rel="noopener">เปิดลิงก์ที่แนบ ↗</a></p>` : ''}
        ${staff() ? `<div class="head-actions news-actions">
          <button class="btn btn-ghost btn-sm" id="nwPin">${n.pinned ? 'เลิกปักหมุด' : '📌 ปักหมุด'}</button>
          <button class="btn btn-ghost btn-sm" id="nwEdit">แก้ไข</button>
          <button class="btn btn-ghost btn-sm danger" id="nwDel">ลบประกาศ</button></div>` : ''}
      </article>`;
    if (n.imageFileId) {
      imageSrc(n).then(src => {
        if (ns.view !== n.id) return;
        const img = new Image();
        img.alt = n.title;
        img.onload = () => { const fig = $('.news-img'); if (fig) fig.replaceChildren(img); };
        img.src = src;
      }).catch(() => { /* ใช้รูปย่อแทน */ });
    }
    if (!staff()) return;
    $('#nwEdit').onclick = () => newsForm(n);
    $('#nwPin').onclick = async (e) => {
      e.target.disabled = true;
      try { await SC.authed({ action: 'saveNews', ...fields(n), pinned: !n.pinned }); n.pinned = !n.pinned; renderOne(); toast(n.pinned ? 'ปักหมุดแล้ว' : 'เลิกปักหมุดแล้ว'); } catch (err) { toast(err.message, true); e.target.disabled = false; }
    };
    $('#nwDel').onclick = async () => {
      if (!confirm(`ลบประกาศ “${n.title}”?`)) return;
      try { await SC.authed({ action: 'deleteNews', id: n.id }); ns.list = ns.list.filter(x => x.id !== n.id); toast('ลบประกาศแล้ว'); location.hash = '#news'; } catch (err) { toast(err.message, true); }
    };
  }
  const fields = (n) => ({ id: n.id, title: n.title, body: n.body, category: n.category, pinned: n.pinned, link: n.link, showUntil: n.showUntil });

  /* ================= ฟอร์ม ================= */
  function draw(img, max, q) {
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  }
  async function prepareImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('เปิดไฟล์รูปนี้ไม่ได้')); i.src = url; });
      let thumb = '';
      for (const [max, q] of [[640, 0.72], [480, 0.65], [360, 0.6]]) { thumb = draw(img, max, q); if (thumb.length <= 44000) break; }
      return { image: draw(img, 1600, 0.85).split(',')[1], thumb };
    } finally { URL.revokeObjectURL(url); }
  }

  function newsForm(n) {
    const v = n || { title: '', body: '', category: 'general', pinned: false, link: '', showUntil: '' };
    openDialog(`${dlgHead(n ? 'แก้ไขประกาศ' : 'ลงประกาศ')}
      <form class="dlg-body" id="nwForm">
        <div class="field"><label for="nf1">หัวข้อ</label><input id="nf1" name="title" maxlength="200" required value="${esc(v.title)}" placeholder="เช่น เปิดรับสมัครคณะกรรมการชุมนุม"></div>
        <div class="row2">
          <div class="field"><label for="nf2">ประเภท</label><select id="nf2" name="category">${Object.entries(CATS).map(([k, c]) => `<option value="${k}" ${k === v.category ? 'selected' : ''}>${c.icon} ${c.label}</option>`).join('')}</select></div>
          <div class="field"><label for="nf3">แสดงถึงวันที่ <small>(เว้นว่าง = ตลอดไป)</small></label><input id="nf3" name="showUntil" type="date" value="${esc(v.showUntil)}"></div>
        </div>
        <div class="field"><label for="nf4">รายละเอียด</label><textarea id="nf4" name="body" rows="7" maxlength="5000" placeholder="รายละเอียดประกาศ ใส่ลิงก์ในข้อความได้">${esc(v.body)}</textarea></div>
        <div class="field"><label for="nf5">ลิงก์แนบ <small>(ไม่บังคับ เช่น ฟอร์มสมัคร)</small></label><input id="nf5" name="link" type="url" maxlength="500" value="${esc(v.link)}" placeholder="https://"></div>
        <div class="field"><label>รูปประกอบ <small>(ไม่บังคับ)</small></label>
          <div class="news-pick"><div class="news-prev" id="nfPrev">${n && n.thumb ? `<img src="${esc(n.thumb)}" alt="">` : '<span>ไม่มีรูป</span>'}</div>
            <div><label class="btn btn-ghost btn-sm" for="nfFile">เลือกรูป…</label><input type="file" id="nfFile" accept="image/*" hidden>
            ${n && n.imageFileId ? '<button type="button" class="btn-link" id="nfRm">ลบรูป</button>' : ''}</div></div></div>
        <label class="chk"><input type="checkbox" name="pinned" ${v.pinned ? 'checked' : ''}> 📌 ปักหมุดไว้บนสุด</label>
        <p class="err"></p>
        <div class="dlg-actions"><span class="spacer"></span><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button type="submit" class="btn btn-gold">${n ? 'บันทึก' : 'ลงประกาศ'}</button></div>
      </form>`);
    const f = $('#nwForm');
    let pic = null, removeImage = false;
    $('#nfFile').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try { pic = await prepareImage(file); removeImage = false; $('#nfPrev').innerHTML = `<img src="${pic.thumb}" alt="">`; } catch (err) { $('.err', f).textContent = err.message; }
    };
    const rm = $('#nfRm');
    if (rm) rm.onclick = () => { pic = null; removeImage = true; $('#nfPrev').innerHTML = '<span>ไม่มีรูป</span>'; rm.remove(); };
    f.onsubmit = (e) => {
      e.preventDefault();
      SC.submitting(f, async () => {
        const body = { action: 'saveNews', id: n ? n.id : '', title: f.title.value.trim(), body: f.body.value, category: f.category.value,
          pinned: f.pinned.checked, link: f.link.value.trim(), showUntil: f.showUntil.value, ...(pic || {}), removeImage };
        const r = await SC.authed(body);
        SC.dialog.close();
        ns.list = await SC.apiGet('news');
        toast(n ? 'บันทึกประกาศแล้ว' : 'ลงประกาศแล้ว');
        if (n) { delete images[n.id]; if (ns.view === n.id) renderOne(); } else location.hash = '#news/' + r.id;
      });
    };
  }

  /* ================= โหมดทดลอง ================= */
  const ext = SC.demoExt;
  const demoList = (db) => (db.news = db.news || []);
  const out = (x) => JSON.parse(JSON.stringify(x));
  ext.news = (db) => out(demoList(db).filter(x => x.status !== 'deleted').map(({ image, ...x }) => x));
  // โหมดทดลองเก็บเฉพาะรูปย่อ (พื้นที่ในเบราว์เซอร์มีจำกัด)
  ext.newsImage = (db, b) => { const x = demoList(db).find(y => y.id === b.id); if (!x || !x.thumb) throw new Error('ประกาศนี้ไม่มีรูป'); return x.thumb; };
  ext.saveNews = (db, b, sess) => {
    const u = sess('news');
    if (!String(b.title || '').trim()) throw new Error('กรุณาระบุหัวข้อประกาศ');
    if (b.link && !/^https?:\/\/\S+$/i.test(b.link)) throw new Error('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://');
    const now = new Date().toISOString();
    const v = { title: b.title.trim(), body: String(b.body || ''), category: CATS[b.category] ? b.category : 'general', pinned: b.pinned === true,
      link: b.link || '', showUntil: b.showUntil || '', updatedAt: now };
    if (b.image) Object.assign(v, { imageFileId: 'demo', thumb: b.thumb, public: false });
    else if (b.removeImage) Object.assign(v, { imageFileId: '', thumb: '' });
    if (b.id) { const x = demoList(db).find(y => y.id === b.id && y.status !== 'deleted'); if (!x) throw new Error('ไม่พบประกาศ'); Object.assign(x, v); return { id: b.id }; }
    const id = SC.uid();
    demoList(db).push({ id, imageFileId: '', thumb: '', ...v, status: 'active', createdByName: u.name, createdAt: now });
    return { id };
  };
  ext.deleteNews = (db, b, sess) => { sess('news'); const x = demoList(db).find(y => y.id === b.id); if (x) x.status = 'deleted'; return true; };
})();
