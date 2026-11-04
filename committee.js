// ทำเนียบกรรมการ — ดึงจากรายชื่อสมาชิกในระบบเช็คชื่อ จัดกลุ่มตามตำแหน่ง/ฝ่าย (ไม่แสดงเลขประจำตัวนักเรียน)
(() => {
  'use strict';
  const SC = window.SC;
  const { $, $$, esc, can, toast, openDialog, dlgHead } = SC;

  const cs = { members: null, photos: {}, q: '' };
  const PREFIX = /^(นางสาว|นาย|นาง|เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.)\s*/;
  // ตำแหน่งบริหารเรียงตามลำดับนี้ ตำแหน่งอื่นจัดกลุ่มตาม "ฝ่าย..."
  const EXEC = [/^ประธาน/, /^รองประธาน/, /^เลขานุการ/, /^ผู้ช่วยเลขานุการ/, /^เหรัญญิก/, /^ผู้ช่วยเหรัญญิก/, /^ปฏิคม/, /^ประชาสัมพันธ์/, /^นายทะเบียน/];

  const posOf = (m) => String(m.position || '').trim();
  const execRank = (m) => { const p = posOf(m).replace(/\s/g, ''); const i = EXEC.findIndex(re => re.test(p)); return i < 0 ? 99 : i; };
  const byClass = (a, b) => String(a.classroom || '').localeCompare(String(b.classroom || ''), 'th', { numeric: true }) || a.name.localeCompare(b.name, 'th');
  // ตัวอักษรย่อ: พยัญชนะตัวแรกของชื่อ (ข้ามสระหน้า เ แ โ ใ ไ)
  const initial = (name) => (String(name).replace(PREFIX, '').trim().replace(/^[เแโใไ]/, '')[0] || '?');
  const sideOf = (p) => { const m = p.match(/ฝ่าย\s*\S+/); return m ? m[0].replace(/\s/g, '') : ''; };

  document.addEventListener('sc:committee', async () => {
    if (cs.members) render(); else $('#committeeView').innerHTML = '<p class="empty">กำลังโหลดข้อมูล…</p>';
    try {
      const [duty, photos] = await Promise.all([SC.apiGet('duty'), SC.apiGet('photos').catch(() => ({}))]);
      cs.members = duty.members.filter(m => m.active);
      cs.photos = photos || {};
      render();
    } catch (err) {
      if (!cs.members) $('#committeeView').innerHTML = `<p class="empty">โหลดข้อมูลไม่สำเร็จ: ${esc(err.message)}</p>`;
    }
  });
  document.addEventListener('sc:auth', () => { if (cs.members && !$('#page-committee').hidden) render(); });

  function groups(list) {
    const exec = list.filter(m => execRank(m) < 99).sort((a, b) => execRank(a) - execRank(b) || byClass(a, b));
    const rest = list.filter(m => execRank(m) === 99);
    const sides = {}, others = [], plain = {};
    rest.forEach(m => {
      const p = posOf(m);
      if (!p) { (plain[m.classroom || 'ไม่ระบุชั้น'] = plain[m.classroom || 'ไม่ระบุชั้น'] || []).push(m); return; }
      const side = sideOf(p);
      if (side) (sides[side] = sides[side] || []).push(m); else others.push(m);
    });
    // หัวหน้าฝ่ายขึ้นก่อนในแต่ละฝ่าย
    const head = (m) => /^(หัวหน้า|ประธาน)/.test(posOf(m)) ? 0 : /^รองหัวหน้า/.test(posOf(m)) ? 1 : 2;
    Object.values(sides).forEach(a => a.sort((x, y) => head(x) - head(y) || byClass(x, y)));
    return {
      exec,
      sides: Object.entries(sides).sort(([a], [b]) => a.localeCompare(b, 'th')),
      others: others.sort(byClass),
      plain: Object.entries(plain).sort(([a], [b]) => a.localeCompare(b, 'th', { numeric: true })),
    };
  }

  const avatar = (m) => cs.photos[m.id]
    ? `<img class="cm-avatar cm-photo" src="${esc(cs.photos[m.id])}" alt="">`
    : `<span class="cm-avatar" aria-hidden="true">${esc(initial(m.name))}</span>`;
  const card = (m, big) => `<div class="cm-card ${big ? 'cm-big' : ''}">
    ${can('attendance') ? `<button class="cm-photo-btn" data-photo="${esc(m.id)}" title="ใส่/เปลี่ยนรูป" aria-label="ใส่รูปของ ${esc(m.name)}">${avatar(m)}<span class="cm-cam" aria-hidden="true">📷</span></button>` : avatar(m)}
    <span class="cm-text"><b>${esc(m.name)}</b>${posOf(m) ? `<span class="cm-pos">${esc(posOf(m))}</span>` : ''}<small>${esc(m.classroom || '')}</small></span>
  </div>`;

  function render() {
    const all = cs.members;
    const s = cs.q.trim().toLowerCase();
    const list = s ? all.filter(m => [m.name, m.classroom, m.position].join(' ').toLowerCase().includes(s)) : all;
    const g = groups(list);
    const pres = g.exec.filter(m => /^ประธาน/.test(posOf(m).replace(/\s/g, '')));
    const execRest = g.exec.filter(m => !pres.includes(m));
    const classes = new Set(all.map(m => m.classroom).filter(Boolean)).size;
    const sec = (title, inner, n) => `<section class="cm-sec"><h2 class="section-title">${title}${n != null ? ` <small class="hint">(${n} คน)</small>` : ''}</h2>${inner}</section>`;

    $('#committeeView').innerHTML = `
      <div class="stats cm-stats">
        <div class="stat stat-balance"><span>กรรมการสภานักเรียน ปีการศึกษา ${esc((window.SC_CONFIG || {}).ACADEMIC_YEAR || '')}</span><strong>${all.length} คน</strong></div>
        <div class="stat"><span>คณะกรรมการบริหาร</span><strong>${groups(all).exec.length}</strong></div>
        <div class="stat"><span>ฝ่าย</span><strong>${groups(all).sides.length}</strong></div>
        <div class="stat"><span>จากห้องเรียน</span><strong>${classes} ห้อง</strong></div>
      </div>
      <div class="card cm-tools">
        <input type="search" id="cmQ" placeholder="ค้นหาชื่อ ชั้น หรือตำแหน่ง" value="${esc(cs.q)}" aria-label="ค้นหากรรมการ">
        <button class="btn btn-ghost btn-sm" id="cmPrint">พิมพ์ทำเนียบ</button>
        ${can('attendance') ? '<a class="btn btn-ghost btn-sm" href="#duty/roster">แก้ไขรายชื่อ / ตำแหน่ง</a>' : ''}
      </div>
      ${!list.length ? '<div class="card"><p class="empty">ไม่พบรายชื่อ</p></div>' : ''}
      ${pres.length ? `<div class="cm-pres">${pres.map(m => card(m, true)).join('')}</div>` : ''}
      ${execRest.length ? sec('คณะกรรมการบริหาร', `<div class="cm-grid cm-exec">${execRest.map(m => card(m, true)).join('')}</div>`) : ''}
      ${g.sides.map(([side, ms]) => sec(esc(side), `<div class="cm-grid">${ms.map(m => card(m)).join('')}</div>`, ms.length)).join('')}
      ${g.others.length ? sec('ตำแหน่งอื่น ๆ', `<div class="cm-grid">${g.others.map(m => card(m)).join('')}</div>`, g.others.length) : ''}
      ${g.plain.length ? sec(g.exec.length || g.sides.length || g.others.length ? 'กรรมการสภานักเรียน' : 'รายชื่อกรรมการสภานักเรียน',
        g.plain.map(([cls, ms]) => `<h3 class="cm-class">${esc(cls)} <small>${ms.length} คน</small></h3><div class="cm-grid cm-plain">${ms.sort(byClass).map(m => card(m)).join('')}</div>`).join(''),
        g.plain.reduce((n, [, ms]) => n + ms.length, 0)) : ''}
      ${!g.exec.length && !s && can('attendance') ? '<p class="hint" style="text-align:center;margin-bottom:30px">ใส่ตำแหน่งในหน้า “รายชื่อสมาชิก” แล้วประธาน รองประธาน และฝ่ายต่าง ๆ จะแยกขึ้นด้านบนอัตโนมัติ</p>' : ''}`;
    const q = $('#cmQ');
    q.oninput = () => { cs.q = q.value; const pos = q.selectionStart; render(); const n = $('#cmQ'); n.focus(); n.setSelectionRange(pos, pos); };
    $('#cmPrint').onclick = () => window.print();
    $$('[data-photo]').forEach(b => (b.onclick = () => photoDialog(cs.members.find(m => m.id === b.dataset.photo))));
  }

  /* ================= รูปกรรมการ ================= */
  // ครอปกลางเป็นจัตุรัสแล้วย่อ ให้ไฟล์เล็กพอเก็บในช่องของ Google Sheet
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const c = document.createElement('canvas');
        for (const [size, q] of [[240, .82], [200, .75], [160, .7], [128, .6]]) {
          c.width = c.height = size;
          const g = c.getContext('2d');
          g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
          g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
          const data = c.toDataURL('image/jpeg', q);
          if (data.length <= 44000) return resolve(data);
        }
        reject(new Error('รูปนี้ย่อให้เล็กพอไม่ได้ ลองรูปอื่น'));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('เปิดไฟล์รูปนี้ไม่ได้ (รองรับ JPG, PNG)')); };
      img.src = url;
    });
  }

  function photoDialog(m) {
    let data = cs.photos[m.id] || '';
    openDialog(`${dlgHead('รูปกรรมการ')}
      <div class="dlg-body cm-photo-dlg">
        <div class="cm-preview">${data ? `<img src="${esc(data)}" alt="">` : `<span>${esc(initial(m.name))}</span>`}</div>
        <p><b>${esc(m.name)}</b><br><small class="hint">${esc([posOf(m), m.classroom].filter(Boolean).join(' · '))}</small></p>
        <label class="btn btn-ghost" for="cmFile">เลือกรูป…</label>
        <input type="file" id="cmFile" accept="image/*" hidden>
        <p class="hint">ใช้รูปหน้าตรง ระบบจะตัดเป็นรูปจัตุรัสตรงกลางและย่อขนาดให้อัตโนมัติ</p>
        <p class="err"></p>
        <div class="dlg-actions">
          ${cs.photos[m.id] ? '<button class="btn btn-ghost danger-link" id="cmDel">ลบรูป</button>' : ''}
          <span class="spacer"></span>
          <button class="btn btn-ghost" data-close>ยกเลิก</button>
          <button class="btn btn-gold" id="cmSave" disabled>บันทึกรูป</button>
        </div>
      </div>`);
    const err = $('.cm-photo-dlg .err'), save = $('#cmSave');
    $('#cmFile').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      err.textContent = '';
      try {
        data = await shrink(file);
        $('.cm-preview').innerHTML = `<img src="${data}" alt="">`;
        save.disabled = false;
      } catch (x) { err.textContent = x.message; }
    };
    const send = async (value, btn, msg) => {
      btn.disabled = true; err.textContent = '';
      try {
        await SC.authed({ action: 'setMemberPhoto', memberId: m.id, data: value });
        if (value) cs.photos[m.id] = value; else delete cs.photos[m.id];
        SC.dialog.close(); toast(msg); render();
      } catch (x) { err.textContent = x.message; btn.disabled = false; }
    };
    save.onclick = () => send(data, save, 'บันทึกรูปแล้ว');
    const del = $('#cmDel');
    if (del) del.onclick = () => { if (confirm(`ลบรูปของ ${m.name}?`)) send('', del, 'ลบรูปแล้ว'); };
  }

  /* ============ โหมดทดลอง ============ */
  const ext = SC.demoExt;
  ext.photos = (db) => JSON.parse(JSON.stringify(db.photos || {}));
  ext.setMemberPhoto = (db, b, sess) => {
    sess('attendance');
    const data = String(b.data || '');
    if (data && (!/^data:image\/(jpeg|png|webp);base64,/.test(data) || data.length > 45000)) throw new Error('ไฟล์รูปไม่ถูกต้องหรือใหญ่เกินไป');
    db.photos = db.photos || {};
    if (data) db.photos[b.memberId] = data; else delete db.photos[b.memberId];
    return true;
  };
})();
