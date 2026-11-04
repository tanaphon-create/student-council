// โหวต / สำรวจความเห็น — ผู้ดูแลระบบเปิดโหวต เลือกได้ว่าใครโหวตได้และจะเห็นผลเมื่อไร
(() => {
  'use strict';
  const SC = window.SC;
  const { $, $$, esc, toast, openDialog, dlgHead, submitting, can } = SC;

  const MODES = {
    device: { label: 'ทุกคน', short: 'ทุกคนโหวตได้', desc: 'ใครเข้าเว็บก็โหวตได้ เครื่องละ 1 ครั้ง (ง่ายที่สุด แต่เปลี่ยนเครื่อง/เบราว์เซอร์แล้วโหวตซ้ำได้)' },
    member: { label: 'สมาชิกสภา', short: 'เฉพาะสมาชิกสภา', desc: 'สมาชิกสภายืนยันด้วยเลขประจำตัวนักเรียน คนละ 1 ครั้ง (ต้องใส่เลขประจำตัวในรายชื่อสมาชิกก่อน)' },
    code: { label: 'รหัสโหวต', short: 'ใช้รหัสโหวต', desc: 'สร้างรหัสสุ่มพิมพ์แจกทีละคน รหัสละ 1 ครั้ง กันโหวตซ้ำได้จริงและไม่ระบุตัวตน เหมาะกับการเลือกตั้ง' },
  };
  const STATUS = { open: 'กำลังเปิดโหวต', draft: 'ร่าง · ยังไม่เปิด', closed: 'ปิดโหวตแล้ว' };
  const vs = { loaded: false, polls: [], view: '' };

  const isAdmin = () => can('admin');
  const pollById = (id) => vs.polls.find(p => p.id === id);
  const closeText = (s) => s ? new Date(s).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' น.' : '';

  // เครื่องนี้โหวตโพลไหนไปแล้ว (ใช้กับโหมด "ทุกคน")
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
  const votedHere = (p) => p.voterMode === 'device' && store.get('sc_voted_' + p.id) === '1';

  async function load() {
    vs.polls = isAdmin() ? await SC.authed({ action: 'adminPolls' }) : await SC.apiGet('polls');
    vs.loaded = true;
  }

  /* ================= เส้นทาง ================= */
  document.addEventListener('sc:vote', async (e) => {
    vs.view = e.detail || '';
    if (vs.loaded) render(); else $('#voteView').innerHTML = '<p class="empty">กำลังโหลดข้อมูล…</p>';
    try { await load(); render(); } catch (err) {
      if (!vs.loaded) $('#voteView').innerHTML = `<p class="empty">โหลดข้อมูลไม่สำเร็จ: ${esc(err.message)}</p>`; else toast(err.message, true);
    }
  });
  document.addEventListener('sc:auth', () => { if (!$('#page-vote').hidden) { vs.loaded = false; document.dispatchEvent(new CustomEvent('sc:vote', { detail: vs.view })); } });
  $('#btnNewPoll').addEventListener('click', () => pollForm(null));

  // แถบ "กำลังเปิดโหวต" ในหน้าแรก
  document.addEventListener('sc:home', async () => {
    const box = $('#homePolls');
    try {
      const open = (await SC.apiGet('polls')).filter(p => p.status === 'open');
      box.hidden = !open.length;
      box.innerHTML = open.map(p => `<a class="poll-strip" href="#vote/${esc(p.id)}">
        <span class="ps-icon" aria-hidden="true">🗳️</span>
        <span class="ps-text"><small>กำลังเปิดโหวต${p.closeAt ? ' · ปิด ' + closeText(p.closeAt) : ''}</small><b>${esc(p.title)}</b></span>
        <span class="ps-go">${votedHere(p) ? 'ดูผล' : 'โหวตเลย'} →</span></a>`).join('');
    } catch (_) { box.hidden = true; }
  });

  function render() {
    const p = vs.view && pollById(vs.view);
    if (vs.view && !p) { $('#voteView').innerHTML = '<a class="back-link" href="#vote">← โหวตทั้งหมด</a><p class="empty">ไม่พบโพลนี้</p>'; return; }
    if (p) renderPoll(p); else renderList();
  }

  /* ================= รายการโพล ================= */
  function renderList() {
    const group = (st) => vs.polls.filter(p => p.status === st).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const section = (title, list) => list.length ? `<h2 class="section-title vote-sec">${title}</h2><div class="duty-grid">${list.map(pollCard).join('')}</div>` : '';
    const html = section('กำลังเปิดโหวต', group('open')) + (isAdmin() ? section('ร่าง (ยังไม่เปิดให้โหวต)', group('draft')) : '') + section('ปิดโหวตแล้ว', group('closed'));
    $('#voteView').innerHTML = html || `<div class="card empty-state"><p class="empty">ยังไม่มีการเปิดโหวต</p>
      ${isAdmin() ? '<p class="hint" style="text-align:center">กด “+ เปิดโหวตใหม่” เพื่อเริ่ม</p>' : ''}</div>`;
  }

  function pollCard(p) {
    const ph = p.status === 'open' ? 'ongoing' : p.status === 'draft' ? 'upcoming' : 'ended';
    return `<a class="duty-card poll-card ph-${ph}" href="#vote/${esc(p.id)}">
      <div class="dc-top"><span class="badge ph">${STATUS[p.status]}</span><span class="badge mode">${MODES[p.voterMode].short}</span>${votedHere(p) ? '<span class="badge badge-ok">คุณโหวตแล้ว</span>' : ''}</div>
      <h3>${esc(p.title)}</h3>
      ${p.detail ? `<p class="dc-meta clamp2">${esc(p.detail)}</p>` : ''}
      <div class="dc-foot" style="margin-top:12px"><span>👥 <b>${p.voters}</b> คนโหวตแล้ว</span><span>${p.status === 'open' && p.closeAt ? 'ปิด ' + closeText(p.closeAt) : p.options.length + ' ตัวเลือก'}</span></div>
    </a>`;
  }

  /* ================= หน้าโพล ================= */
  function renderPoll(p) {
    const multi = p.maxChoices > 1;
    const canVote = p.status === 'open' && !votedHere(p);
    $('#voteView').innerHTML = `
      <a class="back-link" href="#vote">← โหวตทั้งหมด</a>
      <div class="vote-layout">
        <div>
          <div class="card">
            <div class="dc-top"><span class="badge ph ${p.status === 'open' ? '' : p.status === 'draft' ? 'ph-upcoming' : 'ph-ended'}">${STATUS[p.status]}</span><span class="badge mode">${MODES[p.voterMode].short}</span></div>
            <h2 class="poll-title">${esc(p.title)}</h2>
            ${p.detail ? `<p class="poll-detail">${esc(p.detail)}</p>` : ''}
            <p class="dc-meta">${[p.createdByName && 'เปิดโดย ' + esc(p.createdByName), p.closeAt && (p.status === 'open' ? 'ปิดโหวต ' : 'กำหนดปิด ') + closeText(p.closeAt)].filter(Boolean).join(' · ')}</p>
          </div>
          ${canVote ? voteForm(p, multi) : `<div class="card vote-done">${
            p.status === 'draft' ? '<p class="empty">โพลนี้ยังไม่เปิดให้โหวต</p>'
            : p.status === 'closed' ? '<p class="empty">ปิดโหวตแล้ว ขอบคุณทุกคนที่ร่วมโหวต</p>'
            : '<p class="empty">✅ เครื่องนี้โหวตแล้ว ขอบคุณที่ร่วมโหวต</p>'}</div>`}
        </div>
        <div>
          ${resultsCard(p)}
          ${isAdmin() ? adminCard(p) : ''}
        </div>
      </div>`;
    if (canVote) bindVote(p, multi);
    bindAdmin(p);
    const rf = $('#btnRefreshPoll');
    if (rf) rf.onclick = async () => { rf.disabled = true; try { await load(); render(); toast('อัปเดตผลแล้ว'); } catch (e) { toast(e.message, true); rf.disabled = false; } };
  }

  function voteForm(p, multi) {
    return `<form class="card" id="fVote">
      <h3 class="card-title">${multi ? `เลือกได้ไม่เกิน ${p.maxChoices} ตัวเลือก` : 'เลือก 1 ตัวเลือก'}</h3>
      <div class="vote-opts">${p.options.map((o, i) => `<label class="vote-opt">
        <input type="${multi ? 'checkbox' : 'radio'}" name="choice" value="${i}"><span class="vo-mark" aria-hidden="true"></span><span class="vo-text">${esc(o)}</span></label>`).join('')}</div>
      ${p.voterMode === 'member' ? `<div class="field"><label for="vSid">เลขประจำตัวนักเรียน <small>(ยืนยันว่าเป็นสมาชิกสภา)</small></label><input id="vSid" name="studentId" inputmode="numeric" autocomplete="off" maxlength="15" required></div>` : ''}
      ${p.voterMode === 'code' ? `<div class="field"><label for="vCode">รหัสโหวต <small>(ที่ได้รับแจก)</small></label><input id="vCode" name="code" class="code-input" autocomplete="off" autocapitalize="characters" maxlength="10" placeholder="เช่น K7Q2MX" required></div>` : ''}
      <p class="hint vote-note">🔒 ไม่มีการบันทึกว่าใครเลือกตัวเลือกไหน${p.voterMode === 'device' ? ' · โหวตได้เครื่องละ 1 ครั้ง' : ''}</p>
      <p class="err"></p>
      <div class="dlg-actions"><button type="submit" class="btn btn-gold">ส่งคะแนนโหวต</button></div>
    </form>`;
  }

  function bindVote(p, multi) {
    const f = $('#fVote');
    if (multi) {
      // จำกัดจำนวนที่เลือกได้
      $$('input[name=choice]', f).forEach(i => (i.onchange = () => {
        const n = $$('input[name=choice]:checked', f).length;
        $$('input[name=choice]', f).forEach(x => (x.disabled = !x.checked && n >= p.maxChoices));
      }));
    }
    f.onsubmit = (e) => {
      e.preventDefault();
      submitting(f, async () => {
        const choices = $$('input[name=choice]:checked', f).map(i => Number(i.value));
        if (!choices.length) throw new Error('กรุณาเลือกอย่างน้อย 1 ตัวเลือก');
        const picked = choices.map(i => '• ' + p.options[i]).join('\n');
        if (!confirm(`ยืนยันการโหวต\n${picked}\n\nโหวตแล้วแก้ไขไม่ได้`)) return;
        const body = { action: 'vote', pollId: p.id, choices };
        if (p.voterMode === 'device') body.deviceId = deviceId();
        if (p.voterMode === 'member') body.studentId = f.studentId.value.trim();
        if (p.voterMode === 'code') body.code = f.code.value.trim();
        await SC.apiPost(body);
        if (p.voterMode === 'device') store.set('sc_voted_' + p.id, '1');
        toast('โหวตสำเร็จ ขอบคุณที่ร่วมโหวต');
        await load();
        render();
        // เครื่องที่ใช้ร่วมกัน (โหมดสมาชิก/รหัส) แสดงฟอร์มว่างให้คนถัดไป
        if (p.voterMode !== 'device' && p.status === 'open') { const t = $('.vote-layout'); if (t) t.insertAdjacentHTML('beforebegin', '<p class="vote-thanks">✅ บันทึกคะแนนแล้ว — คนถัดไปโหวตต่อได้เลย</p>'); }
      });
    };
  }

  function resultsCard(p) {
    const head = `<div class="card-head"><h3 class="card-title">ผลโหวต</h3><button class="btn btn-ghost btn-sm" id="btnRefreshPoll">รีเฟรช</button></div>`;
    if (!p.counts) {
      return `<div class="card">${head}<p class="empty hidden-res">🔒 ผลโหวตจะแสดงเมื่อปิดโหวต<br><small>ตอนนี้มีผู้โหวตแล้ว <b>${p.voters}</b> คน</small></p></div>`;
    }
    const totalPicks = p.counts.reduce((s, n) => s + n, 0);
    const top = Math.max(0, ...p.counts);
    const rows = p.options.map((o, i) => ({ o, n: p.counts[i] })).sort((a, b) => p.status === 'closed' ? b.n - a.n : 0);
    return `<div class="card">${head}
      ${isAdmin() && p.showResults === 'closed' && p.status !== 'closed' ? '<p class="hint">ผู้ดูแลเห็นผลก่อน คนอื่นจะเห็นเมื่อปิดโหวต</p>' : ''}
      <div class="res-list">${rows.map(({ o, n }) => {
        const pct = p.voters ? Math.round(n / p.voters * 1000) / 10 : 0;
        return `<div class="res-row ${n && n === top ? 'res-lead' : ''}">
          <div class="res-top"><span>${n && n === top && p.status === 'closed' ? '🏆 ' : ''}${esc(o)}</span><b>${n} <small>(${pct}%)</small></b></div>
          <div class="progress"><span style="width:${pct}%"></span></div></div>`;
      }).join('')}</div>
      <p class="dc-meta">ผู้โหวตทั้งหมด <b>${p.voters}</b> คน${p.maxChoices > 1 ? ` · รวม ${totalPicks} คะแนน (คนละไม่เกิน ${p.maxChoices})` : ''}</p>
    </div>`;
  }

  /* ================= จัดการ (ผู้ดูแลระบบ) ================= */
  function adminCard(p) {
    return `<div class="card admin-card">
      <h3 class="card-title">จัดการโพล <small class="hint">(ผู้ดูแลระบบ)</small></h3>
      <div class="admin-actions">
        ${p.status === 'open' ? '<button class="btn btn-out btn-sm" data-st="closed">ปิดโหวต</button>' : `<button class="btn btn-in btn-sm" data-st="open">${p.status === 'draft' ? 'เปิดให้โหวต' : 'เปิดโหวตอีกครั้ง'}</button>`}
        <button class="btn btn-ghost btn-sm" id="btnEditPoll">แก้ไข</button>
        <button class="btn btn-ghost btn-sm danger-link" id="btnDelPoll">ลบโพล</button>
      </div>
      ${p.voterMode === 'code' ? `<div class="code-box">
        <p>รหัสโหวต: สร้างแล้ว <b>${p.codes.total}</b> รหัส · ใช้แล้ว <b>${p.codes.used}</b> · เหลือ <b>${p.codes.total - p.codes.used}</b></p>
        <div class="admin-actions"><button class="btn btn-gold btn-sm" id="btnGenCodes">+ สร้างรหัสโหวต</button>${p.codes.total ? '<button class="btn btn-ghost btn-sm" id="btnPrintCodes">พิมพ์รหัสที่ยังไม่ใช้</button>' : ''}</div>
      </div>` : ''}
      ${p.voterMode === 'member' ? '<p class="hint" style="margin-top:12px">สมาชิกต้องมีเลขประจำตัวนักเรียนในหน้า “เช็คชื่อปฏิบัติงาน → รายชื่อสมาชิก” จึงจะโหวตได้</p>' : ''}
    </div>`;
  }

  function bindAdmin(p) {
    if (!isAdmin()) return;
    $$('[data-st]').forEach(b => (b.onclick = async () => {
      const st = b.dataset.st;
      if (!confirm(st === 'open' ? `เปิดให้โหวต “${p.title}”?` : `ปิดโหวต “${p.title}”?\nหลังปิดจะไม่มีใครโหวตเพิ่มได้`)) return;
      b.disabled = true;
      try { await SC.authed({ action: 'setPollStatus', id: p.id, status: st }); toast(st === 'open' ? 'เปิดโหวตแล้ว' : 'ปิดโหวตแล้ว'); await load(); render(); } catch (e) { toast(e.message, true); b.disabled = false; }
    }));
    $('#btnEditPoll').onclick = () => pollForm(p);
    $('#btnDelPoll').onclick = async () => {
      if (!confirm(`ลบโพล “${p.title}”?\nผลโหวตจะไม่แสดงบนเว็บอีก (ข้อมูลยังอยู่ใน Google Sheet)`)) return;
      try { await SC.authed({ action: 'deletePoll', id: p.id }); toast('ลบโพลแล้ว'); location.hash = '#vote'; await load(); render(); } catch (e) { toast(e.message, true); }
    };
    const gen = $('#btnGenCodes');
    if (gen) gen.onclick = () => genCodes(p);
    const pr = $('#btnPrintCodes');
    if (pr) pr.onclick = () => printCodes(p, pr);
  }

  function genCodes(p) {
    openDialog(`${dlgHead('สร้างรหัสโหวต')}
      <form class="dlg-body" id="fCodes">
        <p class="hint">สร้างรหัสตามจำนวนผู้มีสิทธิ์โหวต แล้วพิมพ์ตัดแจกคนละ 1 ใบ แต่ละรหัสโหวตได้ครั้งเดียว</p>
        <div class="field"><label for="cn">จำนวนรหัส</label><input id="cn" name="count" type="number" min="1" max="1000" value="${p.codes.total ? 10 : 100}" required></div>
        <p class="err"></p>
        <div class="dlg-actions"><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button type="submit" class="btn btn-gold">สร้างรหัส</button></div>
      </form>`);
    const f = $('#fCodes');
    f.onsubmit = (e) => {
      e.preventDefault();
      submitting(f, async () => {
        const r = await SC.authed({ action: 'genVoteCodes', pollId: p.id, count: Number(f.count.value) });
        SC.dialog.close();
        toast(`สร้างรหัสแล้ว ${r.added} รหัส`);
        await load();
        render();
      });
    };
  }

  async function printCodes(p, btn) {
    btn.disabled = true;
    try {
      const codes = (await SC.authed({ action: 'listVoteCodes', pollId: p.id })).filter(c => !c.used);
      if (!codes.length) return toast('ไม่มีรหัสที่ยังไม่ใช้', true);
      const url = location.href.split('#')[0] + '#vote/' + p.id;
      let box = $('#printCodes');
      if (!box) { box = document.createElement('div'); box.id = 'printCodes'; document.body.append(box); }
      box.innerHTML = codes.map(c => `<div class="slip">
        <div class="slip-head"><img src="assets/logo.png" alt=""><span>สภานักเรียน โรงเรียนวังจันทร์วิทยา</span></div>
        <b class="slip-title">${esc(p.title)}</b>
        <span class="slip-label">รหัสโหวต</span><span class="slip-code">${esc(c.code)}</span>
        <small class="slip-url">${esc(url)}</small><small>ใช้ได้ 1 ครั้ง ห้ามให้ผู้อื่น</small></div>`).join('');
      document.body.classList.add('print-codes');
      const done = () => { document.body.classList.remove('print-codes'); window.removeEventListener('afterprint', done); };
      window.addEventListener('afterprint', done);
      setTimeout(() => window.print(), 300); // รอโลโก้โหลด
    } catch (e) { toast(e.message, true); } finally { btn.disabled = false; }
  }

  /* ================= ฟอร์มเปิด/แก้ไขโพล ================= */
  function pollForm(p) {
    if (!isAdmin()) return toast('เฉพาะผู้ดูแลระบบเท่านั้นที่เปิดโหวตได้', true);
    const locked = !!(p && p.voters);
    const v = p || { title: '', detail: '', options: ['', ''], maxChoices: 1, voterMode: 'device', showResults: 'live', closeAt: '' };
    openDialog(`${dlgHead(p ? 'แก้ไขโพล' : 'เปิดโหวตใหม่')}
      <form class="dlg-body" id="fPoll">
        <div class="field"><label for="pl1">หัวข้อ / คำถาม</label><input id="pl1" name="pollTitle" maxlength="200" value="${esc(v.title)}" placeholder="เช่น กิจกรรมวันเด็กที่อยากให้จัดมากที่สุด" required></div>
        <div class="field"><label for="pl2">รายละเอียด <small>(ถ้ามี)</small></label><textarea id="pl2" name="detail" maxlength="2000" placeholder="คำอธิบาย เงื่อนไข หรือข้อมูลผู้สมัคร">${esc(v.detail)}</textarea></div>
        <div class="field"><label for="pl3">ตัวเลือก <small>(บรรทัดละ 1 ตัวเลือก อย่างน้อย 2)</small></label>
          <textarea id="pl3" name="options" rows="5" ${locked ? 'disabled' : ''} placeholder="ตัวเลือกที่ 1&#10;ตัวเลือกที่ 2&#10;ตัวเลือกที่ 3" required>${esc(v.options.filter(Boolean).join('\n'))}</textarea>
          ${locked ? '<small>มีคนโหวตแล้ว จึงแก้ตัวเลือก จำนวนที่เลือกได้ และผู้มีสิทธิ์โหวตไม่ได้</small>' : ''}</div>
        <div class="row2">
          <div class="field"><label for="pl4">เลือกได้คนละกี่ตัวเลือก</label><input id="pl4" name="maxChoices" type="number" min="1" max="30" value="${v.maxChoices}" ${locked ? 'disabled' : ''}></div>
          <div class="field"><label for="pl5">ปิดโหวตอัตโนมัติ <small>(เว้นว่าง = ปิดเอง)</small></label><input id="pl5" name="closeAt" type="datetime-local" value="${esc(v.closeAt)}"></div>
        </div>
        <div class="field"><label>ใครโหวตได้</label>
          <div class="vmode-pick">${Object.entries(MODES).map(([k, m]) => `<label><input type="radio" name="voterMode" value="${k}" ${v.voterMode === k ? 'checked' : ''} ${locked ? 'disabled' : ''}>
            <span><b>${m.label}</b><small>${m.desc}</small></span></label>`).join('')}</div>
        </div>
        <div class="field"><label>การแสดงผลโหวต</label>
          <div class="vmode-pick two">
            <label><input type="radio" name="showResults" value="live" ${v.showResults === 'live' ? 'checked' : ''}><span><b>แสดงผลทันที</b><small>ทุกคนเห็นคะแนนระหว่างโหวต</small></span></label>
            <label><input type="radio" name="showResults" value="closed" ${v.showResults === 'closed' ? 'checked' : ''}><span><b>แสดงเมื่อปิดโหวต</b><small>ซ่อนคะแนนจนกว่าจะปิด เหมาะกับการเลือกตั้ง</small></span></label>
          </div>
        </div>
        ${p ? '' : '<label class="chk" style="margin-bottom:14px"><input type="checkbox" name="openNow" checked> เปิดให้โหวตทันที (ไม่ติ๊ก = บันทึกเป็นร่างไว้ก่อน เช่น เพื่อสร้างรหัสโหวต)</label>'}
        <p class="err"></p>
        <div class="dlg-actions"><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button type="submit" class="btn btn-gold">${p ? 'บันทึกการแก้ไข' : 'เปิดโหวต'}</button></div>
      </form>`, 'dlg-wide');
    const f = $('#fPoll');
    if (f.openNow) f.openNow.onchange = () => { $('button[type=submit]', f).textContent = f.openNow.checked ? 'เปิดโหวต' : 'บันทึกร่าง'; };
    f.onsubmit = (e) => {
      e.preventDefault();
      submitting(f, async () => {
        const options = f.options.value.split('\n').map(s => s.trim()).filter(Boolean);
        if (!locked) {
          if (options.length < 2) throw new Error('ต้องมีตัวเลือกอย่างน้อย 2 ตัวเลือก');
          if (new Set(options).size !== options.length) throw new Error('มีตัวเลือกซ้ำกัน');
        }
        const r = await SC.authed({
          action: 'savePoll', id: p ? p.id : '', title: f.pollTitle.value, detail: f.detail.value, options,
          maxChoices: Number(f.maxChoices.value) || 1, voterMode: $('input[name=voterMode]:checked', f).value,
          showResults: $('input[name=showResults]:checked', f).value, closeAt: f.closeAt.value, open: !p && f.openNow.checked,
        });
        SC.dialog.close();
        toast(p ? 'บันทึกการแก้ไขแล้ว' : (f.openNow && f.openNow.checked ? 'เปิดโหวตแล้ว' : 'บันทึกร่างแล้ว'));
        await load();
        if (location.hash === '#vote/' + r.id) render(); else location.hash = '#vote/' + r.id;
      });
    };
  }

  /* ============ โหมดทดลอง ============ */
  const ext = SC.demoExt;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const localNow = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  function demoDb(db) {
    if (db.vote) return db.vote;
    const later = new Date(Date.now() + 3 * 864e5); later.setMinutes(later.getMinutes() - later.getTimezoneOffset());
    const mk = (title, detail, options, extra) => ({ id: SC.uid(), title, detail, options, maxChoices: 1, voterMode: 'device', showResults: 'live', status: 'open', closeAt: '', createdByName: 'ผู้ดูแลระบบ', createdAt: new Date().toISOString(), ...extra });
    const polls = [
      mk('กิจกรรมวันเด็กที่อยากให้สภาจัดมากที่สุด', 'เลือกได้ 2 กิจกรรม ผลโหวตจะนำไปวางแผนกิจกรรมวันเด็กปีนี้', ['ซุ้มเกมและของรางวัล', 'ดนตรีในสวน', 'ตลาดนัดนักเรียน', 'กีฬาสัมพันธ์ระหว่างห้อง'], { maxChoices: 2, closeAt: later.toISOString().slice(0, 16) }),
      mk('สีเสื้อประจำสภานักเรียนปีการศึกษาใหม่', 'สำหรับสมาชิกสภาเท่านั้น ยืนยันด้วยเลขประจำตัวนักเรียน (โหมดทดลองลอง 24101)', ['เขียว', 'เหลืองทอง', 'กรมท่า'], { voterMode: 'member', showResults: 'closed' }),
      mk('เลือกตั้งหัวหน้าฝ่ายกิจกรรม', 'ใช้รหัสโหวตที่ได้รับแจก', ['หมายเลข 1 นายกิตติศักดิ์ ทองดี', 'หมายเลข 2 นางสาวปวีณา สายทอง'], { voterMode: 'code', showResults: 'closed', status: 'closed' }),
    ];
    const votes = [], voters = [];
    [[0, 2], [0], [2, 3], [0, 1], [2], [0, 2], [1, 3]].forEach((c, i) => { votes.push({ pollId: polls[0].id, choices: c }); voters.push({ pollId: polls[0].id, key: 'd:seed' + i }); });
    [0, 0, 1, 0, 1, 0, 0, 1, 0].forEach((c, i) => { votes.push({ pollId: polls[2].id, choices: [c] }); voters.push({ pollId: polls[2].id, key: 'c:SEED' + i }); });
    db.vote = { polls, votes, voters, codes: [{ pollId: polls[2].id, code: 'TEST01', used: false }] };
    return db.vote;
  }
  const statusOf = (p) => p.status === 'open' && p.closeAt && localNow() >= p.closeAt ? 'closed' : p.status;
  function demoList(db, admin) {
    const v = demoDb(db);
    return clone(v.polls.filter(p => p.status !== 'deleted').map(p => ({ ...p, status: statusOf(p) })).filter(p => admin || p.status !== 'draft').map(p => {
      const mine = v.votes.filter(x => x.pollId === p.id);
      const counts = p.options.map((_, i) => mine.filter(x => x.choices.includes(i)).length);
      const cs = v.codes.filter(c => c.pollId === p.id);
      return { ...p, voters: mine.length, counts: admin || p.showResults === 'live' || p.status === 'closed' ? counts : null,
        codes: admin ? { total: cs.length, used: cs.filter(c => c.used).length } : undefined };
    }));
  }
  const findDemo = (db, id) => { const p = demoDb(db).polls.find(x => x.id === id && x.status !== 'deleted'); if (!p) throw new Error('ไม่พบโพลนี้'); return p; };
  ext.polls = (db) => demoList(db, false);
  ext.adminPolls = (db, b, sess) => { sess('admin'); return demoList(db, true); };
  ext.vote = (db, b) => {
    const v = demoDb(db), p = findDemo(db, b.pollId), st = statusOf(p);
    if (st !== 'open') throw new Error(st === 'closed' ? 'โพลนี้ปิดโหวตแล้ว' : 'โพลนี้ยังไม่เปิดโหวต');
    const picks = (b.choices || []).map(Number);
    if (!picks.length || picks.length > p.maxChoices || picks.some(i => !(i >= 0 && i < p.options.length)) || new Set(picks).size !== picks.length) throw new Error('ตัวเลือกไม่ถูกต้อง');
    let key, code;
    if (p.voterMode === 'member') {
      if (!db.duty && ext.duty) ext.duty(db);
      const m = ((db.duty && db.duty.members) || []).find(x => x.studentId && x.studentId === String(b.studentId || '').trim() && x.active);
      if (!m) throw new Error('ไม่พบเลขประจำตัวนี้ในรายชื่อสมาชิกสภานักเรียน');
      key = 'm:' + m.id;
    } else if (p.voterMode === 'code') {
      const c = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      code = v.codes.find(x => x.pollId === p.id && x.code === c);
      if (!code) throw new Error('รหัสโหวตไม่ถูกต้อง');
      if (code.used) throw new Error('รหัสนี้ถูกใช้โหวตไปแล้ว');
      key = 'c:' + c;
    } else key = 'd:' + b.deviceId;
    if (v.voters.some(x => x.pollId === p.id && x.key === key)) throw new Error(p.voterMode === 'member' ? 'เลขประจำตัวนี้โหวตไปแล้ว' : 'โหวตไปแล้ว โหวตซ้ำไม่ได้');
    if (code) code.used = true;
    v.voters.push({ pollId: p.id, key });
    v.votes.push({ pollId: p.id, choices: picks });
    return true;
  };
  ext.savePoll = (db, b, sess) => {
    const u = sess('admin'), v = demoDb(db);
    if (!String(b.title || '').trim()) throw new Error('กรุณาระบุหัวข้อโหวต');
    const vals = { title: b.title.trim(), detail: String(b.detail || '').trim(), closeAt: b.closeAt || '', showResults: b.showResults === 'closed' ? 'closed' : 'live' };
    const shape = () => {
      const options = (b.options || []).map(o => String(o).trim()).filter(Boolean);
      if (options.length < 2) throw new Error('ต้องมีตัวเลือกอย่างน้อย 2 ตัวเลือก');
      return { options, maxChoices: Math.min(Math.max(Math.floor(b.maxChoices) || 1, 1), options.length), voterMode: b.voterMode in MODES ? b.voterMode : 'device' };
    };
    if (b.id) {
      const p = findDemo(db, b.id), locked = v.voters.some(x => x.pollId === p.id);
      Object.assign(p, vals, locked ? {} : shape());
      return { id: p.id, locked };
    }
    const id = SC.uid();
    v.polls.push({ id, ...vals, ...shape(), status: b.open ? 'open' : 'draft', createdByName: u.name, createdAt: new Date().toISOString() });
    return { id };
  };
  ext.setPollStatus = (db, b, sess) => {
    sess('admin');
    const p = findDemo(db, b.id);
    p.status = b.status === 'open' ? 'open' : 'closed';
    if (p.status === 'open' && p.closeAt && localNow() >= p.closeAt) p.closeAt = '';
    return true;
  };
  ext.deletePoll = (db, b, sess) => { sess('admin'); findDemo(db, b.id).status = 'deleted'; return true; };
  ext.genVoteCodes = (db, b, sess) => {
    sess('admin');
    const v = demoDb(db), p = findDemo(db, b.pollId);
    if (p.voterMode !== 'code') throw new Error('โพลนี้ไม่ได้ใช้รหัสโหวต');
    const n = Math.floor(b.count);
    if (!(n >= 1 && n <= 1000)) throw new Error('สร้างได้ครั้งละ 1–1000 รหัส');
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', taken = new Set(v.codes.filter(c => c.pollId === p.id).map(c => c.code));
    let added = 0;
    while (added < n) {
      let c = '';
      for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
      if (taken.has(c)) continue;
      taken.add(c); v.codes.push({ pollId: p.id, code: c, used: false }); added++;
    }
    return { added };
  };
  ext.listVoteCodes = (db, b, sess) => { sess('admin'); return clone(demoDb(db).codes.filter(c => c.pollId === b.pollId)); };
})();
