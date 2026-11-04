// ทำเนียบกรรมการ — ดึงจากรายชื่อสมาชิกในระบบเช็คชื่อ จัดกลุ่มตามตำแหน่ง/ฝ่าย (ไม่แสดงเลขประจำตัวนักเรียน)
(() => {
  'use strict';
  const SC = window.SC;
  const { $, $$, esc, can, toast, openDialog, dlgHead } = SC;

  const cs = { members: null, advisors: [], photos: {}, q: '', mode: 'list' };
  const PREFIX = /^(นางสาว|นาย|นาง|เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.)\s*/;
  // ตำแหน่งบริหารเรียงตามลำดับนี้ ตำแหน่งอื่นจัดกลุ่มตาม "ฝ่าย..."
  const EXEC = [/^ประธาน/, /^รองประธาน/, /^เลขานุการ/, /^ผู้ช่วยเลขานุการ/, /^เหรัญญิก/, /^ผู้ช่วยเหรัญญิก/, /^ปฏิคม/, /^ประชาสัมพันธ์/, /^นายทะเบียน/];

  const posOf = (m) => String(m.position || '').trim();
  const execRank = (m) => { const p = posOf(m).replace(/\s/g, ''); const i = EXEC.findIndex(re => re.test(p)); return i < 0 ? 99 : i; };
  const byClass = (a, b) => String(a.classroom || '').localeCompare(String(b.classroom || ''), 'th', { numeric: true }) || a.name.localeCompare(b.name, 'th');
  // ตัวอักษรย่อ: พยัญชนะตัวแรกของชื่อ (ข้ามสระหน้า เ แ โ ใ ไ)
  const initial = (name) => (String(name).replace(PREFIX, '').trim().replace(/^[เแโใไ]/, '')[0] || '?');
  const sideOf = (p) => { const m = p.match(/ฝ่าย\s*\S+/); return m ? m[0].replace(/\s/g, '') : ''; };
  // หัวหน้าฝ่ายขึ้นก่อนในแต่ละฝ่าย
  const head = (m) => /^(หัวหน้า|ประธาน)/.test(posOf(m)) ? 0 : /^รองหัวหน้า/.test(posOf(m)) ? 1 : 2;

  document.addEventListener('sc:committee', async (e) => {
    cs.mode = e.detail === 'chart' ? 'chart' : 'list';
    if (cs.members) render(); else $('#committeeView').innerHTML = '<p class="empty">กำลังโหลดข้อมูล…</p>';
    try {
      const [duty, photos, advisors] = await Promise.all([SC.apiGet('duty'), SC.apiGet('photos').catch(() => ({})), SC.apiGet('advisors').catch(() => [])]);
      cs.members = duty.members.filter(m => m.active);
      cs.advisors = advisors || [];
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
    ${m.teacher && can('attendance') ? `<button class="cm-edit" data-adv="${esc(m.id)}" title="แก้ไข" aria-label="แก้ไขข้อมูล ${esc(m.name)}">✎</button>` : ''}
  </div>`;
  const teachers = () => cs.advisors.map(a => ({ ...a, teacher: true, classroom: '' }));

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
        <div class="seg" role="tablist" aria-label="รูปแบบการแสดง">
          <a href="#committee" role="tab" aria-selected="${cs.mode === 'list'}" class="${cs.mode === 'list' ? 'on' : ''}">☰ รายชื่อ</a>
          <a href="#committee/chart" role="tab" aria-selected="${cs.mode === 'chart'}" class="${cs.mode === 'chart' ? 'on' : ''}">⧉ ผังองค์กร</a>
        </div>
        ${cs.mode === 'list' ? `<input type="search" id="cmQ" placeholder="ค้นหาชื่อ ชั้น หรือตำแหน่ง" value="${esc(cs.q)}" aria-label="ค้นหากรรมการ">` : '<span class="spacer"></span>'}
        <button class="btn btn-ghost btn-sm" id="cmPrint">พิมพ์ทำเนียบ</button>
        ${can('attendance') ? '<button class="btn btn-ghost btn-sm" id="cmAddAdv">+ ครูที่ปรึกษา</button><a class="btn btn-ghost btn-sm" href="#duty/roster">แก้ไขรายชื่อ / ตำแหน่ง</a>' : ''}
      </div>
      ${cs.mode === 'chart' ? chartHtml(groups(all)) : `
      ${teachers().length && !s ? `<section class="cm-sec cm-teachers"><h2 class="section-title">ครูที่ปรึกษา</h2><div class="cm-pres">${teachers().map(m => card(m, true)).join('')}</div></section>` : ''}
      ${!list.length ? '<div class="card"><p class="empty">ไม่พบรายชื่อ</p></div>' : ''}
      ${pres.length ? `<div class="cm-pres">${pres.map(m => card(m, true)).join('')}</div>` : ''}
      ${execRest.length ? sec('คณะกรรมการบริหาร', `<div class="cm-grid cm-exec">${execRest.map(m => card(m, true)).join('')}</div>`) : ''}
      ${g.sides.map(([side, ms]) => sec(esc(side), `<div class="cm-grid">${ms.map(m => card(m)).join('')}</div>`, ms.length)).join('')}
      ${g.others.length ? sec('ตำแหน่งอื่น ๆ', `<div class="cm-grid">${g.others.map(m => card(m)).join('')}</div>`, g.others.length) : ''}
      ${g.plain.length ? sec(g.exec.length || g.sides.length || g.others.length ? 'กรรมการสภานักเรียน' : 'รายชื่อกรรมการสภานักเรียน',
        g.plain.map(([cls, ms]) => `<h3 class="cm-class">${esc(cls)} <small>${ms.length} คน</small></h3><div class="cm-grid cm-plain">${ms.sort(byClass).map(m => card(m)).join('')}</div>`).join(''),
        g.plain.reduce((n, [, ms]) => n + ms.length, 0)) : ''}
      ${!g.exec.length && !s && can('attendance') ? '<p class="hint" style="text-align:center;margin-bottom:30px">ใส่ตำแหน่งในหน้า “รายชื่อสมาชิก” แล้วประธาน รองประธาน และฝ่ายต่าง ๆ จะแยกขึ้นด้านบนอัตโนมัติ</p>' : ''}`}`;
    const q = $('#cmQ');
    if (q) q.oninput = () => { cs.q = q.value; const pos = q.selectionStart; render(); const n = $('#cmQ'); n.focus(); n.setSelectionRange(pos, pos); };
    $('#cmPrint').onclick = () => window.print();
    $$('[data-photo]').forEach(b => (b.onclick = () => photoDialog(cs.members.concat(teachers()).find(m => m.id === b.dataset.photo))));
    $$('[data-adv]').forEach(b => (b.onclick = () => advisorForm(cs.advisors.find(a => a.id === b.dataset.adv))));
    const add = $('#cmAddAdv');
    if (add) add.onclick = () => advisorForm(null);
    const wrap = $('.org-wrap');
    if (wrap) wrap.scrollLeft = (wrap.scrollWidth - wrap.clientWidth) / 2; // ผังกว้างกว่าจอ: เริ่มที่กึ่งกลาง
  }

  /* ================= ผังองค์กร ================= */
  const node = (m) => `<div class="org-node">${avatar(m)}<b>${esc(m.name)}</b><span class="cm-pos">${esc(posOf(m))}</span>${m.classroom ? `<small>${esc(m.classroom)}</small>` : ''}</div>`;
  // แถวของตำแหน่งระดับเดียวกัน: up/down = มีเส้นเชื่อมระดับบน/ล่าง
  const row = (ms, up, down, cls) => `<div class="org-row ${cls || ''} ${ms.length > 1 ? 'multi' : ''} ${up ? 'up' : ''} ${down ? 'down' : ''}">
    ${ms.map(m => `<div class="org-cell"><i class="ob" aria-hidden="true"></i>${node(m)}</div>`).join('')}</div>`;
  const stem = '<div class="org-stem" aria-hidden="true"></div>';

  function chartHtml(g) {
    const flat = (p) => posOf(p).replace(/\s/g, '');
    const pres = g.exec.filter(m => /^ประธาน/.test(flat(m)));
    const vice = g.exec.filter(m => /^รองประธาน/.test(flat(m)));
    const board = g.exec.filter(m => !pres.includes(m) && !vice.includes(m));
    const depts = g.sides.concat(g.others.length ? [['ตำแหน่งอื่น ๆ', g.others]] : []);
    const plain = g.plain.reduce((n, [, ms]) => n + ms.length, 0);
    const levels = [teachers(), pres, vice, board].filter(l => l.length);
    const tail = depts.length || plain;
    if (!levels.length && !depts.length) {
      return `<div class="card"><p class="empty">ยังไม่มีตำแหน่ง จึงยังสร้างผังไม่ได้</p>
        <p class="hint" style="text-align:center">ใส่ตำแหน่ง เช่น ประธานสภานักเรียน รองประธาน เลขานุการ หัวหน้าฝ่าย… ในหน้า “รายชื่อสมาชิก”</p></div>`;
    }
    const parts = levels.map((l, i) => row(l, i > 0, i < levels.length - 1 || !!tail, l === pres ? 'org-pres' : l[0].teacher ? 'org-teach' : ''));
    let html = parts.join(stem);
    if (depts.length) {
      html += (levels.length ? stem : '') + `<div class="org-depts">
        <div class="org-depts-title">ฝ่ายงาน <small>${depts.length} ฝ่าย</small></div>
        <div class="org-dgrid">${depts.map(([name, ms]) => {
          const heads = ms.filter(m => head(m) < 2), rest = ms.filter(m => head(m) === 2);
          return `<div class="org-dept">
            <h4>${esc(name)} <small>${ms.length} คน</small></h4>
            ${heads.map(m => `<div class="org-head">${avatar(m)}<span><b>${esc(m.name)}</b><small>${esc(posOf(m))} · ${esc(m.classroom || '')}</small></span></div>`).join('')}
            ${rest.length ? `<ul>${rest.map(m => `<li>${esc(m.name)} <small>${esc(m.classroom || '')}</small></li>`).join('')}</ul>` : ''}
          </div>`;
        }).join('')}</div>
      </div>`;
    }
    if (plain) html += stem + `<div class="org-plain">สมาชิกสภานักเรียน <b>${plain}</b> คน · <a href="#committee">ดูรายชื่อทั้งหมด</a></div>`;
    return `<div class="card org-card"><div class="org-wrap"><div class="org">${html}</div></div></div>`;
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

  /* ================= ครูที่ปรึกษา ================= */
  function advisorForm(a) {
    openDialog(`${dlgHead(a ? 'แก้ไขครูที่ปรึกษา' : 'เพิ่มครูที่ปรึกษา')}
      <form class="dlg-body" id="fAdv">
        <div class="field"><label for="ad1">ชื่อ-สกุล</label><input id="ad1" name="fullname" maxlength="100" value="${esc(a ? a.name : '')}" placeholder="เช่น นายสมชาย ใจดี" required></div>
        <div class="field"><label for="ad2">ตำแหน่ง</label><input id="ad2" name="pos" maxlength="100" value="${esc(a ? a.position : 'ครูที่ปรึกษาสภานักเรียน')}"></div>
        <div class="field"><label for="ad3">ลำดับการแสดง <small>(เลขน้อยขึ้นก่อน)</small></label><input id="ad3" name="sort" type="number" min="0" max="99" value="${a ? a.sort : cs.advisors.length + 1}"></div>
        <p class="hint">ใส่รูปได้โดยกดที่วงกลมรูป 📷 ในทำเนียบหลังบันทึก</p>
        <p class="err"></p>
        <div class="dlg-actions">
          ${a ? '<button type="button" class="btn btn-ghost danger-link" id="advDel">ลบ</button><span class="spacer"></span>' : ''}
          <button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button type="submit" class="btn btn-gold">บันทึก</button>
        </div>
      </form>`);
    const f = $('#fAdv');
    const reload = async (msg) => { cs.advisors = await SC.apiGet('advisors'); SC.dialog.close(); toast(msg); render(); };
    f.onsubmit = (e) => {
      e.preventDefault();
      SC.submitting(f, async () => {
        await SC.authed({ action: 'saveAdvisor', id: a ? a.id : '', name: f.fullname.value, position: f.pos.value, sort: Number(f.sort.value) || 0 });
        await reload(a ? 'บันทึกแล้ว' : 'เพิ่มครูที่ปรึกษาแล้ว');
      });
    };
    const del = $('#advDel');
    if (del) del.onclick = async () => {
      if (!confirm(`ลบ ${a.name} ออกจากทำเนียบ?`)) return;
      try { await SC.authed({ action: 'deleteAdvisor', id: a.id }); await reload('ลบแล้ว'); } catch (x) { toast(x.message, true); }
    };
  }

  /* ============ โหมดทดลอง ============ */
  const ext = SC.demoExt;
  ext.advisors = (db) => JSON.parse(JSON.stringify((db.advisors || []).filter(a => a.active !== false).sort((x, y) => x.sort - y.sort)));
  ext.saveAdvisor = (db, b, sess) => {
    sess('attendance');
    if (!String(b.name || '').trim()) throw new Error('กรุณาระบุชื่อครู');
    db.advisors = db.advisors || [];
    const v = { name: b.name.trim(), position: String(b.position || '').trim() || 'ครูที่ปรึกษา', sort: Math.floor(b.sort) || 0, active: true };
    if (b.id) { Object.assign(db.advisors.find(a => a.id === b.id), v); return { id: b.id }; }
    const id = SC.uid();
    db.advisors.push({ id, ...v });
    return { id };
  };
  ext.deleteAdvisor = (db, b, sess) => { sess('attendance'); db.advisors.find(a => a.id === b.id).active = false; return true; };
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
