// รับฟังความคิดเห็น — ทุกคนส่งได้ (ระบุชื่อหรือไม่ก็ได้) ผู้มีสิทธิ์ "ตอบรับความคิดเห็น" ตอบและเลือกเผยแพร่
(() => {
  'use strict';
  const SC = window.SC;
  const { $, $$, esc, toast, openDialog, dlgHead, submitting, can } = SC;

  const CATS = {
    suggest: { label: 'ข้อเสนอแนะ', icon: '💡' },
    complain: { label: 'เรื่องร้องเรียน', icon: '📢' },
    praise: { label: 'คำชื่นชม', icon: '👏' },
    question: { label: 'สอบถาม', icon: '❓' },
    other: { label: 'อื่น ๆ', icon: '💬' },
  };
  const STATUS = { new: 'รับเรื่องแล้ว', progress: 'กำลังดำเนินการ', done: 'ดำเนินการแล้ว', rejected: 'ไม่สามารถดำเนินการได้' };
  const fs = { pub: null, inbox: null, mine: [], view: '', filter: { status: '', category: '', q: '' } };

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
  const myCodes = () => { try { return JSON.parse(store.get('sc_fb_codes') || '[]'); } catch (_) { return []; } };
  const when = (s) => s ? new Date(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '';
  const staff = () => can('feedback');
  const statusPill = (st) => `<span class="pill fb-st st-${st}">${STATUS[st] || st}</span>`;
  const catBadge = (c) => `<span class="badge fb-cat">${CATS[c].icon} ${CATS[c].label}</span>`;

  async function load() {
    const codes = myCodes();
    const [pub, mine, inbox] = await Promise.all([
      SC.apiGet('feedback'),
      codes.length ? SC.apiPost({ action: 'trackFeedback', codes }).catch(() => []) : [],
      staff() ? SC.authed({ action: 'listFeedback' }) : null,
    ]);
    fs.pub = pub; fs.mine = mine; fs.inbox = inbox;
  }

  /* ================= เส้นทาง ================= */
  document.addEventListener('sc:feedback', async (e) => {
    fs.view = e.detail === 'inbox' && staff() ? 'inbox' : '';
    if (fs.pub) render(); else $('#feedbackView').innerHTML = '<p class="empty">กำลังโหลดข้อมูล…</p>';
    try { await load(); render(); } catch (err) {
      if (!fs.pub) $('#feedbackView').innerHTML = `<p class="empty">โหลดข้อมูลไม่สำเร็จ: ${esc(err.message)}</p>`; else toast(err.message, true);
    }
  });
  document.addEventListener('sc:auth', () => {
    if (!$('#page-feedback').hidden) document.dispatchEvent(new CustomEvent('sc:feedback', { detail: location.hash.split('/')[1] || '' }));
  });

  function render() {
    const newCount = fs.inbox ? fs.inbox.filter(f => f.status === 'new').length : 0;
    const tabs = staff() ? `<div class="tabs fb-tabs">
      <a class="tab ${fs.view ? '' : 'on'}" href="#feedback">ส่งความคิดเห็น / เรื่องที่ตอบแล้ว</a>
      <a class="tab ${fs.view ? 'on' : ''}" href="#feedback/inbox">กล่องความคิดเห็น${newCount ? ` <span class="badge">${newCount} ใหม่</span>` : ''}</a></div>` : '';
    $('#feedbackView').innerHTML = tabs + (fs.view === 'inbox' ? inboxHtml() : publicHtml());
    if (fs.view === 'inbox') bindInbox(); else bindPublic();
  }

  /* ================= หน้าสาธารณะ ================= */
  function publicHtml() {
    const s = fs.pub.stats;
    return `
      <div class="stats fb-stats">
        <div class="stat stat-balance"><span>เรื่องที่ได้รับทั้งหมด</span><strong>${s.total}</strong></div>
        <div class="stat"><span>รอดำเนินการ</span><strong>${s.new}</strong></div>
        <div class="stat"><span>กำลังดำเนินการ</span><strong class="c-gold">${s.progress}</strong></div>
        <div class="stat"><span>ดำเนินการแล้ว</span><strong class="c-in">${s.done}</strong></div>
      </div>
      <div class="fb-layout">
        <form class="card" id="fFeedback" autocomplete="off">
          <h2 class="card-title">ส่งความคิดเห็นถึงสภานักเรียน</h2>
          <p class="hint">ทุกเสียงมีความหมาย เสนอแนะ ร้องเรียน ชื่นชม หรือสอบถามได้เลย</p>
          <div class="field"><label>ประเภท</label>
            <div class="fb-cats">${Object.entries(CATS).map(([k, c], i) => `<label><input type="radio" name="category" value="${k}" ${i === 0 ? 'checked' : ''}><span>${c.icon} ${c.label}</span></label>`).join('')}</div>
          </div>
          <div class="field"><label for="fb1">หัวข้อ</label><input id="fb1" name="subject" maxlength="150" placeholder="เช่น อยากให้มีน้ำดื่มเย็นที่โรงอาหาร" required></div>
          <div class="field"><label for="fb2">รายละเอียด</label><textarea id="fb2" name="detail" rows="5" maxlength="3000" placeholder="เล่าสิ่งที่พบ หรือสิ่งที่อยากให้สภาช่วย ยิ่งละเอียดยิ่งช่วยได้ตรงจุด" required></textarea></div>
          <details class="fb-who">
            <summary>ระบุชื่อ / ช่องทางติดต่อกลับ <small>(ไม่บังคับ — เว้นว่าง = ไม่ระบุตัวตน)</small></summary>
            <div class="row2">
              <div class="field"><label for="fb3">ชื่อ-สกุล</label><input id="fb3" name="sender" maxlength="100"></div>
              <div class="field"><label for="fb4">ชั้น/ห้อง</label><input id="fb4" name="classroom" maxlength="30" placeholder="เช่น ม.4/2"></div>
            </div>
            <div class="field"><label for="fb5">ช่องทางติดต่อ</label><input id="fb5" name="contact" maxlength="150" placeholder="เช่น LINE ID หรือเบอร์โทร"></div>
          </details>
          <input class="hp" name="website" tabindex="-1" aria-hidden="true">
          <p class="hint fb-privacy">🔒 ชื่อและช่องทางติดต่อเห็นเฉพาะผู้รับผิดชอบของสภา ไม่แสดงบนเว็บ</p>
          <p class="err"></p>
          <div class="dlg-actions"><button type="submit" class="btn btn-gold">ส่งความคิดเห็น</button></div>
        </form>
        <div>
          <div class="card">
            <h2 class="card-title">ติดตามเรื่องของฉัน</h2>
            <form class="track-row" id="fTrack"><input name="code" placeholder="รหัสติดตาม เช่น FB-K7Q2MX" maxlength="12" aria-label="รหัสติดตามเรื่อง" required><button class="btn btn-ghost">ตรวจสอบ</button></form>
            <div id="myList">${fs.mine.length ? fs.mine.map(myItem).join('') : '<p class="hint" style="margin-top:12px">เรื่องที่ส่งจากเครื่องนี้จะแสดงที่นี่อัตโนมัติ</p>'}</div>
          </div>
        </div>
      </div>
      <h2 class="section-title">เรื่องที่สภาตอบแล้ว</h2>
      ${fs.pub.items.length ? `<div class="fb-board">${fs.pub.items.map(boardItem).join('')}</div>` : '<div class="card"><p class="empty">ยังไม่มีเรื่องที่เผยแพร่</p></div>'}`;
  }

  function myItem(f) {
    return `<div class="fb-mine">
      <div class="fb-mine-top"><code>${esc(f.code)}</code>${statusPill(f.status)}</div>
      <b>${esc(f.subject)}</b><small class="hint">${CATS[f.category].label} · ส่งเมื่อ ${when(f.createdAt)}</small>
      ${f.reply ? `<div class="fb-reply"><b>สภาตอบ:</b> ${esc(f.reply)}</div>` : ''}
    </div>`;
  }

  function boardItem(f) {
    return `<article class="card fb-item">
      <div class="dc-top">${catBadge(f.category)}${statusPill(f.status)}</div>
      <h3>${esc(f.subject)}</h3>
      <p class="fb-detail">${esc(f.detail)}</p>
      ${f.reply ? `<div class="fb-reply"><b>สภานักเรียนตอบ</b><span>${esc(f.reply)}</span><small>${when(f.repliedAt)}</small></div>` : ''}
      <small class="hint">ส่งเมื่อ ${when(f.createdAt)}</small>
    </article>`;
  }

  function bindPublic() {
    const f = $('#fFeedback');
    f.onsubmit = (e) => {
      e.preventDefault();
      submitting(f, async () => {
        const r = await SC.apiPost({
          action: 'submitFeedback', category: $('input[name=category]:checked', f).value, subject: f.subject.value,
          detail: f.detail.value, name: f.sender.value, classroom: f.classroom.value, contact: f.contact.value,
          website: f.website.value, deviceId: deviceId(),
        });
        store.set('sc_fb_codes', JSON.stringify([r.code, ...myCodes()].slice(0, 30)));
        f.reset();
        openDialog(`${dlgHead('ส่งความคิดเห็นแล้ว')}
          <div class="dlg-body fb-done">
            <p>ขอบคุณที่ส่งความคิดเห็นถึงสภานักเรียน 🙏</p>
            <p class="hint">รหัสติดตามเรื่องของคุณ</p>
            <div class="fb-code">${esc(r.code)}</div>
            <p class="hint">จดหรือแคปหน้าจอไว้ ใช้ตรวจสอบสถานะและคำตอบได้ในช่อง “ติดตามเรื่องของฉัน”<br>(เครื่องนี้จำรหัสไว้ให้แล้ว)</p>
            <div class="dlg-actions"><button class="btn btn-gold" data-close>ตกลง</button></div>
          </div>`);
        await load();
        render();
      });
    };
    $('#fTrack').onsubmit = async (e) => {
      e.preventDefault();
      const code = e.target.code.value.trim().toUpperCase();
      try {
        const [item] = await SC.apiPost({ action: 'trackFeedback', code });
        openDialog(`${dlgHead('สถานะเรื่อง')}<div class="dlg-body">${myItem(item)}<div class="dlg-actions"><button class="btn btn-gold" data-close>ปิด</button></div></div>`);
        if (!myCodes().includes(item.code)) { store.set('sc_fb_codes', JSON.stringify([item.code, ...myCodes()].slice(0, 30))); fs.mine.unshift(item); $('#myList').innerHTML = fs.mine.map(myItem).join(''); }
      } catch (err) { toast(err.message, true); }
    };
  }

  /* ================= กล่องความคิดเห็น (ผู้มีสิทธิ์) ================= */
  function inboxHtml() {
    const q = fs.filter;
    return `<div class="card">
      <div class="toolbar">
        <input type="search" id="ibQ" placeholder="ค้นหา หัวข้อ / รายละเอียด / ชื่อ / รหัส" value="${esc(q.q)}" aria-label="ค้นหา">
        <select id="ibSt" aria-label="สถานะ"><option value="">ทุกสถานะ</option>${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${q.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select id="ibCat" aria-label="ประเภท"><option value="">ทุกประเภท</option>${Object.entries(CATS).map(([k, c]) => `<option value="${k}" ${q.category === k ? 'selected' : ''}>${c.label}</option>`).join('')}</select>
        <span class="spacer"></span><button class="btn btn-ghost btn-sm" id="ibCsv">ดาวน์โหลด CSV</button>
      </div>
      <div id="ibList"></div>
    </div>`;
  }

  function filtered() {
    const q = fs.filter, s = q.q.toLowerCase();
    return fs.inbox.filter(f => (!q.status || f.status === q.status) && (!q.category || f.category === q.category)
      && (!s || [f.subject, f.detail, f.name, f.classroom, f.code].join(' ').toLowerCase().includes(s)));
  }

  function drawInbox() {
    const list = filtered();
    $('#ibList').innerHTML = list.length ? list.map(f => `<button class="ib-row st-${f.status}" data-fb="${esc(f.id)}">
      <span class="ib-main"><span class="dc-top">${catBadge(f.category)}${statusPill(f.status)}${f.public ? '<span class="badge badge-ok">เผยแพร่</span>' : ''}</span>
        <b>${esc(f.subject)}</b><small class="clamp2">${esc(f.detail)}</small></span>
      <span class="ib-side"><small>${when(f.createdAt)}</small><small>${f.name ? esc(f.name) : 'ไม่ระบุชื่อ'}</small><code>${esc(f.code)}</code></span>
    </button>`).join('') : '<p class="empty">ไม่พบเรื่องตามเงื่อนไข</p>';
    $$('[data-fb]').forEach(b => (b.onclick = () => manage(fs.inbox.find(f => f.id === b.dataset.fb))));
  }

  function bindInbox() {
    drawInbox();
    $('#ibQ').oninput = (e) => { fs.filter.q = e.target.value; drawInbox(); };
    $('#ibSt').onchange = (e) => { fs.filter.status = e.target.value; drawInbox(); };
    $('#ibCat').onchange = (e) => { fs.filter.category = e.target.value; drawInbox(); };
    $('#ibCsv').onclick = () => {
      const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      const head = ['รหัส', 'วันที่ส่ง', 'ประเภท', 'หัวข้อ', 'รายละเอียด', 'ชื่อ', 'ชั้น', 'ติดต่อ', 'สถานะ', 'คำตอบ', 'ผู้ตอบ', 'เผยแพร่'];
      const rows = filtered().map(f => [f.code, when(f.createdAt), CATS[f.category].label, f.subject, f.detail, f.name, f.classroom, f.contact, STATUS[f.status], f.reply, f.repliedByName, f.public ? 'ใช่' : '']);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + [head, ...rows].map(r => r.map(cell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }));
      a.download = 'ความคิดเห็น-สภานักเรียน.csv';
      a.click();
    };
  }

  function manage(f) {
    openDialog(`${dlgHead('จัดการความคิดเห็น')}
      <form class="dlg-body" id="fManage">
        <div class="dc-top">${catBadge(f.category)}<code>${esc(f.code)}</code></div>
        <h3 class="fb-m-title">${esc(f.subject)}</h3>
        <p class="fb-detail">${esc(f.detail)}</p>
        <div class="fb-sender">
          <span>ผู้ส่ง: <b>${f.name ? esc(f.name) : 'ไม่ระบุชื่อ'}</b>${f.classroom ? ' · ' + esc(f.classroom) : ''}</span>
          ${f.contact ? `<span>ติดต่อ: <b>${esc(f.contact)}</b></span>` : ''}
          <span>ส่งเมื่อ ${new Date(f.createdAt).toLocaleString('th-TH')}</span>
        </div>
        <div class="field"><label for="m1">สถานะ</label><select id="m1" name="status">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="m2">คำตอบจากสภา <small>(ผู้ส่งเห็นผ่านรหัสติดตาม)</small></label><textarea id="m2" name="reply" rows="4" maxlength="3000">${esc(f.reply)}</textarea>
          ${f.repliedByName ? `<small>ตอบล่าสุดโดย ${esc(f.repliedByName)} · ${when(f.repliedAt)}</small>` : ''}</div>
        <label class="chk" style="margin-bottom:14px"><input type="checkbox" name="pub" ${f.public ? 'checked' : ''}> เผยแพร่บนหน้า “เรื่องที่สภาตอบแล้ว” (ไม่แสดงชื่อและช่องทางติดต่อผู้ส่ง)</label>
        <p class="err"></p>
        <div class="dlg-actions"><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button type="submit" class="btn btn-gold">บันทึก</button></div>
      </form>`, 'dlg-wide');
    const m = $('#fManage');
    m.onsubmit = (e) => {
      e.preventDefault();
      submitting(m, async () => {
        await SC.authed({ action: 'updateFeedback', id: f.id, status: m.status.value, reply: m.reply.value, public: m.pub.checked });
        SC.dialog.close();
        toast('บันทึกแล้ว');
        await load();
        render();
      });
    };
  }

  /* ============ โหมดทดลอง ============ */
  const ext = SC.demoExt;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function demoDb(db) {
    if (db.fb) return db.fb;
    const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
    const mk = (d, category, subject, detail, status, reply, pub, name = '') => ({
      id: SC.uid(), code: 'FB-' + Math.random().toString(36).slice(2, 8).toUpperCase(), category, subject, detail, name, classroom: name ? 'ม.4/2' : '', contact: '',
      status, reply, repliedByName: reply ? 'นายภูมิพัฒน์ ศรีสุข' : '', repliedAt: reply ? ago(d - 1) : '', public: pub, createdAt: ago(d), updatedAt: ago(d),
    });
    db.fb = [
      mk(12, 'suggest', 'อยากให้มีจุดเติมน้ำดื่มเย็นที่โรงอาหาร', 'ช่วงบ่ายอากาศร้อนมาก น้ำในตู้หมดเร็ว อยากให้เพิ่มจุดเติมน้ำอีก 1 จุด', 'done', 'สภาได้เสนอฝ่ายอาคารสถานที่แล้ว ติดตั้งตู้น้ำเย็นเพิ่มข้างโรงอาหารเรียบร้อย เริ่มใช้งานสัปดาห์นี้', true),
      mk(6, 'complain', 'ไฟทางเดินหลังอาคาร 3 ดับ', 'ทางเดินมืดตอนเลิกเรียนช่วงเย็น ไม่ปลอดภัย', 'progress', 'แจ้งช่างของโรงเรียนแล้ว อยู่ระหว่างรออะไหล่ คาดว่าเสร็จภายในสัปดาห์หน้า', true),
      mk(3, 'praise', 'ขอบคุณสภาที่จัดกิจกรรมลอยกระทง', 'สนุกมาก จัดดีมาก อยากให้มีทุกปี', 'done', 'ขอบคุณสำหรับกำลังใจ ปีหน้าจะจัดให้ยิ่งใหญ่กว่าเดิม', true, 'นางสาวตัวอย่าง ใจดี'),
      mk(1, 'question', 'สมัครเป็นอาสาสมัครสภาได้อย่างไร', 'อยากช่วยงานสภาค่ะ', 'new', '', false, 'นางสาวอยากช่วย งานดี'),
    ];
    return db.fb;
  }
  const outDemo = (f, full) => full ? clone(f) : (({ name, classroom, contact, repliedByName, code, ...rest }) => clone(rest))(f);
  ext.feedback = (db) => {
    const all = demoDb(db), stats = { total: all.length, new: 0, progress: 0, done: 0, rejected: 0 };
    all.forEach(f => stats[f.status]++);
    return { stats, items: all.filter(f => f.public).map(f => outDemo(f, false)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
  };
  ext.submitFeedback = (db, b) => {
    if (b.website) throw new Error('ส่งไม่สำเร็จ');
    if (!String(b.subject || '').trim()) throw new Error('กรุณาระบุหัวข้อ');
    if (String(b.detail || '').trim().length < 5) throw new Error('กรุณาเขียนรายละเอียด');
    const now = new Date().toISOString(), code = 'FB-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    demoDb(db).push({ id: SC.uid(), code, category: b.category in CATS ? b.category : 'other', subject: b.subject.trim(), detail: b.detail.trim(),
      name: String(b.name || '').trim(), classroom: String(b.classroom || '').trim(), contact: String(b.contact || '').trim(),
      status: 'new', reply: '', repliedByName: '', repliedAt: '', public: false, createdAt: now, updatedAt: now });
    return { code };
  };
  ext.trackFeedback = (db, b) => {
    const codes = (Array.isArray(b.codes) ? b.codes : [b.code]).map(c => String(c || '').toUpperCase());
    const rows = demoDb(db).filter(f => codes.includes(f.code));
    if (!rows.length && !Array.isArray(b.codes)) throw new Error('ไม่พบรหัสติดตามเรื่องนี้');
    return rows.map(f => ({ ...outDemo(f, false), code: f.code }));
  };
  ext.listFeedback = (db, b, sess) => { sess('feedback'); return clone(demoDb(db)).sort((a, x) => x.createdAt.localeCompare(a.createdAt)); };
  ext.updateFeedback = (db, b, sess) => {
    const u = sess('feedback'), f = demoDb(db).find(x => x.id === b.id);
    if (!f) throw new Error('ไม่พบข้อมูล');
    const reply = String(b.reply || '').trim();
    if (reply !== f.reply) Object.assign(f, { reply, repliedByName: reply ? u.name : '', repliedAt: reply ? new Date().toISOString() : '' });
    Object.assign(f, { status: b.status in STATUS ? b.status : f.status, public: b.public === true, updatedAt: new Date().toISOString() });
    return true;
  };
})();
