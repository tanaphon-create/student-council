(() => {
  'use strict';
  const CFG = window.SC_CONFIG || {};
  const DEMO = !CFG.API_URL;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const state = { tx: [], session: loadSession(), users: [] };

  /* ================= API ================= */
  async function apiGet(action) {
    if (DEMO) return demo.call({ action });
    const res = await fetch(`${CFG.API_URL}?action=${action}`);
    return unwrap(await res.json());
  }
  async function apiPost(payload) {
    if (DEMO) return demo.call(payload);
    // text/plain หลีกเลี่ยง CORS preflight ที่ Apps Script ไม่รองรับ
    const res = await fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
    return unwrap(await res.json());
  }
  function unwrap(r) {
    if (!r.ok) {
      if (r.error === 'SESSION_EXPIRED') { setSession(null); throw new Error('หมดเวลาการเข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่'); }
      throw new Error(r.error || 'เกิดข้อผิดพลาด');
    }
    return r.data;
  }
  const authed = (payload) => apiPost({ ...payload, token: state.session && state.session.token });

  /* ============ โหมดทดลอง (จำลองหลังบ้านในเบราว์เซอร์) ============ */
  const demo = (() => {
    const KEY = 'sc_demo_v4';
    let mem = null;
    function load() {
      if (mem) return mem;
      try { mem = JSON.parse(localStorage.getItem(KEY)); } catch (_) { /* ไม่มี storage */ }
      if (!mem) mem = seed();
      return mem;
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (_) { /* ไม่มี storage */ } }
    function seed() {
      const d = (n) => { const t = new Date(); t.setDate(t.getDate() - n); return iso(t); };
      const db = {
        users: [
          { username: 'admin', name: 'ผู้ดูแลระบบ', position: 'ครูที่ปรึกษาสภา', role: 'admin', perms: [], password: 'admin1234', active: true },
          { username: 'treasurer', name: 'นางสาวตัวอย่าง ใจดี', position: 'เหรัญญิก', role: 'member', perms: ['finance'], password: 'demo1234', active: true },
          { username: 'president', name: 'นายภูมิพัฒน์ ศรีสุข', position: 'ประธานนักเรียน', role: 'member', perms: ['calendar', 'attendance'], password: 'demo1234', active: true },
          { username: 'leader', name: 'นายหัวหน้า ตัวอย่าง', position: 'หัวหน้าฝ่ายปฏิบัติงาน', role: 'member', perms: ['attendance'], password: 'demo1234', active: true },
        ],
        tx: [], sessions: {},
      };
      const add = (date, type, amount, source, detail, who) => db.tx.push({
        id: uid(), no: (type === 'in' ? 'IN-' : 'OUT-') + String(db.tx.length + 1).padStart(5, '0'),
        date, type, amount, source, detail, recorderName: who, createdAt: new Date().toISOString(),
        status: 'active', voidReason: '', voidByName: '', voidAt: '',
      });
      add(d(70), 'in', 5000, 'งบประมาณสนับสนุนจากโรงเรียน', 'งบกิจกรรมสภานักเรียน ภาคเรียนที่ 2', 'ผู้ดูแลระบบ');
      add(d(52), 'in', 3250, 'จำหน่ายเครื่องดื่มงานกีฬาสี', 'รายได้จากซุ้มสภานักเรียน 2 วัน', 'นางสาวตัวอย่าง ใจดี');
      add(d(40), 'out', 1280, 'ร้านเครื่องเขียนวังจันทร์', 'ซื้อกระดาษชาร์ต ปากกาเคมี สำหรับป้ายรณรงค์', 'นางสาวตัวอย่าง ใจดี');
      add(d(21), 'in', 1500, 'เงินบริจาคจากศิษย์เก่า', 'สมทบกองทุนกิจกรรมจิตอาสา', 'ผู้ดูแลระบบ');
      add(d(9), 'out', 2400, 'ค่าเช่าเครื่องเสียง', 'กิจกรรมวันลอยกระทง', 'นางสาวตัวอย่าง ใจดี');
      return db;
    }
    const balance = (db) => db.tx.filter(t => t.status !== 'void').reduce((s, t) => s + (t.type === 'in' ? 1 : -1) * t.amount, 0);
    function sess(db, token, need) {
      const u = db.sessions[token] && db.users.find(x => x.username === db.sessions[token] && x.active);
      if (!u) throw new Error('SESSION_EXPIRED');
      const req = need === true ? 'admin' : need;
      if (req && !hasPerm(u, req)) throw new Error(req === 'admin' ? 'เฉพาะผู้ดูแลระบบเท่านั้น' : 'บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้');
      return u;
    }
    function needPw(p) { if (typeof p !== 'string' || p.length < 6) throw new Error('รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร'); }
    async function call(b) {
      await new Promise(r => setTimeout(r, 200));
      const db = load();
      try {
        const data = run(db, b);
        save();
        return data;
      } catch (e) { return unwrap({ ok: false, error: e.message }); }
    }
    function run(db, b) {
      switch (b.action) {
        case 'list': return db.tx.map(t => ({ ...t }));
        case 'login': {
          const u = db.users.find(x => x.username === String(b.username || '').trim().toLowerCase());
          if (!u || !u.active || u.password !== b.password) throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
          const token = uid();
          db.sessions[token] = u.username;
          return { token, username: u.username, name: u.name, position: u.position, role: u.role, perms: permsOf(u) };
        }
        case 'logout': delete db.sessions[b.token]; return true;
        case 'addTransaction': {
          const u = sess(db, b.token, 'finance');
          const amount = Math.round(Number(b.amount) * 100) / 100;
          if (!(amount > 0)) throw new Error('จำนวนเงินไม่ถูกต้อง');
          if (!String(b.source || '').trim()) throw new Error('กรุณาระบุที่มา/ผู้รับเงิน');
          if (b.type === 'out' && amount > balance(db)) throw new Error('ยอดเงินคงเหลือไม่พอสำหรับการถอน');
          const no = (b.type === 'in' ? 'IN-' : 'OUT-') + String(db.tx.length + 1).padStart(5, '0');
          db.tx.push({ id: uid(), no, date: b.date, type: b.type, amount, source: b.source.trim(), detail: (b.detail || '').trim(),
            recorderName: u.name, createdAt: new Date().toISOString(), status: 'active', voidReason: '', voidByName: '', voidAt: '' });
          return { no };
        }
        case 'voidTransaction': {
          const u = sess(db, b.token, true);
          const t = db.tx.find(x => x.id === b.id);
          if (!t) throw new Error('ไม่พบรายการ');
          if (!String(b.reason || '').trim()) throw new Error('กรุณาระบุเหตุผลการยกเลิก');
          Object.assign(t, { status: 'void', voidReason: b.reason.trim(), voidByName: u.name, voidAt: new Date().toISOString() });
          return true;
        }
        case 'changePassword': {
          const u = sess(db, b.token);
          if (u.password !== b.oldPassword) throw new Error('รหัสผ่านเดิมไม่ถูกต้อง');
          needPw(b.newPassword); u.password = b.newPassword; return true;
        }
        case 'listUsers': sess(db, b.token, true); return db.users.map(({ password, ...u }) => ({ ...u, perms: permsOf(u) }));
        case 'setUserPerms': {
          const me = sess(db, b.token, true);
          const u = db.users.find(x => x.username === b.username);
          if (!u) throw new Error('ไม่พบผู้ใช้');
          if (u.username === me.username && b.role !== 'admin') throw new Error('ลดสิทธิ์ผู้ดูแลของตัวเองไม่ได้');
          u.role = b.role === 'admin' ? 'admin' : 'member'; u.perms = cleanPerms(b.perms); return true;
        }
        case 'addUser': {
          sess(db, b.token, true);
          const username = String(b.username || '').trim().toLowerCase();
          if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error('ชื่อผู้ใช้ต้องเป็น a-z, 0-9, . _ - ยาว 3–30 ตัว');
          if (db.users.some(x => x.username === username)) throw new Error('มีชื่อผู้ใช้นี้แล้ว');
          if (!String(b.name || '').trim()) throw new Error('กรุณาระบุชื่อ-สกุล');
          needPw(b.password);
          db.users.push({ username, name: b.name.trim(), position: (b.position || '').trim(), role: b.role === 'admin' ? 'admin' : 'member', perms: cleanPerms(b.perms), password: b.password, active: true });
          return true;
        }
        case 'resetPassword': {
          sess(db, b.token, true);
          const u = db.users.find(x => x.username === b.username);
          if (!u) throw new Error('ไม่พบผู้ใช้');
          needPw(b.newPassword); u.password = b.newPassword; return true;
        }
        case 'setUserActive': {
          const me = sess(db, b.token, true);
          if (b.username === me.username) throw new Error('ปิดบัญชีของตัวเองไม่ได้');
          const u = db.users.find(x => x.username === b.username);
          if (!u) throw new Error('ไม่พบผู้ใช้');
          u.active = b.active === true; return true;
        }
        default:
          if (ext[b.action]) return ext[b.action](db, b, (need) => sess(db, b.token, need));
          throw new Error('ไม่รู้จักคำสั่ง');
      }
    }
    const ext = {};
    return { call, ext };
  })();

  /* ================= สิทธิ์ ================= */
  // finance = บันทึกบัญชี, attendance = หัวหน้าเช็คชื่อ, calendar = บันทึกปฏิทินงาน, admin ได้ทุกสิทธิ์
  const PERM_LABELS = { finance: 'บันทึกบัญชี', attendance: 'หัวหน้าเช็คชื่อ', calendar: 'บันทึกปฏิทินงาน' };
  function permsOf(u) {
    if (u.role === 'admin') return Object.keys(PERM_LABELS);
    return Array.isArray(u.perms) ? u.perms.filter(p => p !== 'none') : ['finance'];
  }
  function hasPerm(u, need) { return u.role === 'admin' || (need !== 'admin' && permsOf(u).includes(need)); }
  function cleanPerms(p) { return (Array.isArray(p) ? p : []).filter(x => x in PERM_LABELS); }
  const can = (need) => !!state.session && hasPerm(state.session, need);

  /* ================= utils ================= */
  function uid() { return (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); }
  function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  const money = (n) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const baht = (n) => `฿${money(n)}`;
  const thDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }); };
  const thDateLong = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }); };
  const thMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' }); };
  const thMonthLong = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }); };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initial = (name) => esc(String(name || '?').replace(/^(นาย|นางสาว|นาง|เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.)\s*/, '').trim().charAt(0) || '?');

  function toast(msg, bad) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = 'toast'), 3200);
  }

  function loadSession() { try { return JSON.parse(sessionStorage.getItem('sc_session')); } catch (_) { return null; } }
  function setSession(s) {
    state.session = s;
    try { s ? sessionStorage.setItem('sc_session', JSON.stringify(s)) : sessionStorage.removeItem('sc_session'); } catch (_) { /* ไม่มี storage */ }
    renderAuth();
  }
  const isAdmin = () => state.session && state.session.role === 'admin';

  /* ================= dialog ================= */
  const dlg = $('#dlg');
  function openDialog(html, cls = '') {
    $('#dlgBody').innerHTML = html;
    dlg.className = 'dlg ' + cls;
    $$('[data-close]', dlg).forEach(b => b.addEventListener('click', () => dlg.close()));
    dlg.showModal();
    const f = $('input:not([type=hidden]), textarea', dlg);
    if (f) f.focus();
  }
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  const dlgHead = (title, extra = '') => `<div class="dlg-head ${extra}"><img src="assets/logo.png" alt=""><h2>${title}</h2><button class="dlg-x" data-close aria-label="ปิด">×</button></div>`;

  async function submitting(form, fn) {
    const btn = $('button[type=submit]', form), err = $('.err', form);
    err.textContent = ''; btn.disabled = true;
    try { await fn(); } catch (e) { err.textContent = e.message; } finally { btn.disabled = false; }
  }

  /* ================= auth ================= */
  function renderAuth() {
    const s = state.session, box = $('#authBox');
    if (s) {
      box.innerHTML = `<div class="user-chip"><b>${esc(s.name)}</b><small>${esc(s.position || (s.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้บันทึก'))}</small></div>
        <button class="btn btn-ghost btn-sm" id="btnPw">เปลี่ยนรหัส</button>
        <button class="btn btn-ghost btn-sm" id="btnLogout">ออก</button>`;
      $('#btnLogout').onclick = async () => { try { await authed({ action: 'logout' }); } catch (_) { /* ไม่สำคัญ */ } setSession(null); toast('ออกจากระบบแล้ว'); };
      $('#btnPw').onclick = showChangePassword;
    } else {
      box.innerHTML = `<button class="btn btn-gold btn-sm" id="btnLogin">เข้าสู่ระบบ</button>`;
      $('#btnLogin').onclick = showLogin;
    }
    $$('.recorder-only').forEach(el => (el.hidden = !can('finance')));
    $$('.check-only').forEach(el => (el.hidden = !can('attendance')));
    $$('.cal-only').forEach(el => (el.hidden = !can('calendar')));
    $$('.guest-only').forEach(el => (el.hidden = !!s));
    $$('.admin-only').forEach(el => (el.hidden = !isAdmin()));
    if (location.hash === '#members' && !isAdmin()) location.hash = '#finance';
    if (state.tx.length) renderLedger();
    document.dispatchEvent(new CustomEvent('sc:auth'));
  }

  function showLogin() {
    openDialog(`${dlgHead('เข้าสู่ระบบผู้บันทึก')}
      <form class="dlg-body" id="fLogin">
        <p class="hint">สำหรับกรรมการสภาที่ได้รับสิทธิ์บันทึกบัญชี — ทุกคนดูบัญชีได้โดยไม่ต้องเข้าสู่ระบบ</p>
        <div class="field"><label for="lu">ชื่อผู้ใช้</label><input id="lu" name="username" autocomplete="username" required></div>
        <div class="field"><label for="lp">รหัสผ่าน</label><input id="lp" name="password" type="password" autocomplete="current-password" required></div>
        <p class="err"></p>
        <div class="dlg-actions"><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button type="submit" class="btn btn-gold">เข้าสู่ระบบ</button></div>
      </form>`);
    $('#fLogin').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      submitting(f, async () => {
        const s = await apiPost({ action: 'login', username: f.username.value, password: f.password.value });
        setSession(s); dlg.close(); toast(`ยินดีต้อนรับ ${s.name}`);
      });
    };
  }

  function showChangePassword() {
    openDialog(`${dlgHead('เปลี่ยนรหัสผ่าน')}
      <form class="dlg-body" id="fPw">
        <div class="field"><label for="po">รหัสผ่านเดิม</label><input id="po" name="old" type="password" autocomplete="current-password" required></div>
        <div class="field"><label for="pn">รหัสผ่านใหม่ <small>(อย่างน้อย 6 ตัว)</small></label><input id="pn" name="nw" type="password" minlength="6" autocomplete="new-password" required></div>
        <div class="field"><label for="pc">ยืนยันรหัสผ่านใหม่</label><input id="pc" name="cf" type="password" autocomplete="new-password" required></div>
        <p class="err"></p>
        <div class="dlg-actions"><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button type="submit" class="btn btn-gold">บันทึก</button></div>
      </form>`);
    $('#fPw').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      submitting(f, async () => {
        if (f.nw.value !== f.cf.value) throw new Error('รหัสผ่านใหม่ไม่ตรงกัน');
        await authed({ action: 'changePassword', oldPassword: f.old.value, newPassword: f.nw.value });
        dlg.close(); toast('เปลี่ยนรหัสผ่านเรียบร้อย');
      });
    };
  }

  /* ================= ledger ================= */
  const active = () => state.tx.filter(t => t.status !== 'void');
  const sortTx = (a, b) => a.date.localeCompare(b.date) || String(a.createdAt).localeCompare(String(b.createdAt));
  const totals = () => active().reduce((o, t) => { o[t.type] += t.amount; return o; }, { in: 0, out: 0 });

  async function loadTx() {
    $('#ledgerBody').innerHTML = Array.from({ length: 4 }, () => '<tr class="skeleton">' + '<td>&nbsp;</td>'.repeat(7) + '</tr>').join('');
    try {
      state.tx = (await apiGet('list')).sort(sortTx);
      renderAll();
    } catch (e) {
      $('#ledgerBody').innerHTML = '';
      $('#ledgerEmpty').hidden = false;
      $('#ledgerEmpty').textContent = 'โหลดข้อมูลไม่สำเร็จ: ' + e.message;
    }
  }

  function renderAll() {
    const { in: tin, out: tout } = totals();
    const bal = tin - tout;
    $('#heroBalance').textContent = baht(bal);
    $('#sBalance').textContent = baht(bal);
    $('#sIn').textContent = baht(tin);
    $('#sOut').textContent = baht(tout);
    $('#sCount').textContent = active().length.toLocaleString('th-TH');
    const months = [...new Set(state.tx.map(t => t.date.slice(0, 7)))].sort().reverse();
    const sel = $('#fMonth'), cur = sel.value;
    sel.innerHTML = '<option value="">ทุกเดือน</option>' + months.map(m => `<option value="${m}">${thMonthLong(m)}</option>`).join('');
    sel.value = months.includes(cur) ? cur : '';
    renderChart();
    renderLedger();
  }

  function withRunning() {
    let run = 0;
    return state.tx.map(t => {
      if (t.status !== 'void') run += (t.type === 'in' ? 1 : -1) * t.amount;
      return { ...t, running: run };
    });
  }

  function filtered() {
    const q = $('#fSearch').value.trim().toLowerCase(), type = $('#fType').value, month = $('#fMonth').value, showVoid = $('#fVoid').checked;
    return withRunning().filter(t =>
      (showVoid || t.status !== 'void') && (!type || t.type === type) && (!month || t.date.startsWith(month)) &&
      (!q || [t.no, t.source, t.detail, t.recorderName].join(' ').toLowerCase().includes(q))
    ).reverse();
  }

  function renderLedger() {
    const rows = filtered();
    $('#ledgerEmpty').hidden = rows.length > 0;
    $('#ledgerEmpty').textContent = state.tx.length ? 'ไม่พบรายการที่ตรงกับเงื่อนไข' : 'ยังไม่มีรายการ';
    $('#ledgerBody').innerHTML = rows.map(t => `
      <tr class="${t.status === 'void' ? 'void' : ''}" data-id="${esc(t.id)}" tabindex="0">
        <td class="nowrap">${thDate(t.date)}</td>
        <td class="no hide-sm">${esc(t.no)}</td>
        <td><div class="src">${esc(t.source)}${t.status === 'void' ? '<span class="badge">ยกเลิก</span>' : ''}</div><div class="det">${esc(t.detail)}</div></td>
        <td class="num c-in">${t.type === 'in' ? money(t.amount) : ''}</td>
        <td class="num c-out">${t.type === 'out' ? money(t.amount) : ''}</td>
        <td class="num hide-sm">${t.status === 'void' ? '—' : money(t.running)}</td>
        <td><span class="recorder"><span class="avatar" aria-hidden="true">${initial(t.recorderName)}</span><span class="hide-sm">${esc(t.recorderName)}</span></span></td>
      </tr>`).join('');
  }

  $('#ledgerBody').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) showDetail(tr.dataset.id); });
  $('#ledgerBody').addEventListener('keydown', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && e.key === 'Enter') showDetail(tr.dataset.id); });
  ['#fSearch', '#fType', '#fMonth', '#fVoid'].forEach(s => $(s).addEventListener('input', renderLedger));

  function showDetail(id) {
    const t = state.tx.find(x => x.id === id);
    if (!t) return;
    const isIn = t.type === 'in';
    const created = t.createdAt ? new Date(t.createdAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
    openDialog(`${dlgHead(isIn ? 'รายละเอียดรายรับ' : 'รายละเอียดรายจ่าย', isIn ? '' : 'out')}
      <div class="dlg-body">
        <p class="big-amount ${isIn ? 'c-in' : 'c-out'}">${isIn ? '+' : '−'}${baht(t.amount)}</p>
        <dl class="detail-list">
          <dt>เลขที่</dt><dd>${esc(t.no)}</dd>
          <dt>วันที่</dt><dd>${thDateLong(t.date)}</dd>
          <dt>${isIn ? 'เงินมาจาก' : 'จ่ายให้ / ใช้สำหรับ'}</dt><dd><b>${esc(t.source)}</b></dd>
          <dt>รายละเอียด</dt><dd>${esc(t.detail) || '-'}</dd>
          <dt>ผู้บันทึก</dt><dd>${esc(t.recorderName)}</dd>
          <dt>เวลาที่บันทึก</dt><dd>${created}</dd>
        </dl>
        ${t.status === 'void' ? `<div class="void-box"><b>รายการนี้ถูกยกเลิก</b> โดย ${esc(t.voidByName)}<br>เหตุผล: ${esc(t.voidReason)}</div>` : ''}
        ${t.status !== 'void' && isAdmin() ? `
          <form id="fVoidTx" style="margin-top:18px">
            <div class="field"><label for="vr">ยกเลิกรายการนี้ (ผู้ดูแลระบบ)</label><input id="vr" name="reason" placeholder="ระบุเหตุผล เช่น บันทึกจำนวนเงินผิด" required></div>
            <p class="err"></p>
            <div class="dlg-actions"><button type="submit" class="btn btn-out btn-sm">ยืนยันยกเลิกรายการ</button></div>
          </form>` : ''}
      </div>`);
    const f = $('#fVoidTx');
    if (f) f.onsubmit = (e) => {
      e.preventDefault();
      submitting(f, async () => {
        await authed({ action: 'voidTransaction', id: t.id, reason: f.reason.value });
        dlg.close(); toast('ยกเลิกรายการแล้ว (ยังคงแสดงในประวัติเพื่อการตรวจสอบ)'); loadTx();
      });
    };
  }

  const SOURCES_IN = ['งบประมาณสนับสนุนจากโรงเรียน', 'ค่าบำรุงกิจกรรมนักเรียน', 'เงินบริจาค', 'รายได้จากการจำหน่ายสินค้า', 'รายได้จากกิจกรรม', 'ดอกเบี้ยเงินฝาก'];
  const SOURCES_OUT = ['ค่าวัสดุอุปกรณ์', 'ค่าอาหารและเครื่องดื่ม', 'ค่าเช่าอุปกรณ์', 'ค่าตกแต่งสถานที่', 'ค่าของรางวัล', 'ค่าเดินทาง'];

  function showNewTx(type) {
    if (!can('finance')) return state.session ? toast('บัญชีนี้ไม่มีสิทธิ์บันทึกบัญชี', true) : showLogin();
    const bal = totals().in - totals().out;
    openDialog(`${dlgHead('บันทึกรายการบัญชี', type === 'out' ? 'out' : '')}
      <form class="dlg-body" id="fTx">
        <div class="seg" role="radiogroup" aria-label="ประเภท">
          <button type="button" data-t="in">+ รายรับ (เพิ่มเงิน)</button>
          <button type="button" data-t="out">− รายจ่าย (ถอนเงิน)</button>
        </div>
        <div class="row2">
          <div class="field"><label for="td">วันที่</label><input id="td" name="date" type="date" value="${iso(new Date())}" required></div>
          <div class="field"><label for="ta">จำนวนเงิน (บาท)</label><input id="ta" name="amount" class="amount-input" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="0.00" required></div>
        </div>
        <div class="field"><label for="ts" id="tsLabel"></label><input id="ts" name="source" list="srcList" maxlength="200" required><datalist id="srcList"></datalist></div>
        <div class="field"><label for="tdt">รายละเอียด</label><textarea id="tdt" name="detail" maxlength="1000" placeholder="เช่น ใช้ในกิจกรรมอะไร ใครเป็นผู้รับผิดชอบ มีใบเสร็จเลขที่เท่าไร"></textarea></div>
        <div class="recorder-note">ผู้บันทึก: <b>${esc(state.session.name)}</b> · ยอดคงเหลือขณะนี้ ${baht(bal)}</div>
        <p class="err"></p>
        <div class="dlg-actions"><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button type="submit" class="btn" id="txSubmit">บันทึก</button></div>
      </form>`, '');
    const f = $('#fTx');
    let cur = type;
    const setType = (t) => {
      cur = t;
      $$('.seg button', f).forEach(b => (b.className = b.dataset.t === t ? 'on-' + t : ''));
      $('.dlg-head', dlg).classList.toggle('out', t === 'out');
      $('#tsLabel').textContent = t === 'in' ? 'เงินมาจากไหน' : 'จ่ายให้ใคร / ใช้ทำอะไร';
      $('#srcList').innerHTML = (t === 'in' ? SOURCES_IN : SOURCES_OUT).map(s => `<option value="${s}">`).join('');
      const sb = $('#txSubmit');
      sb.className = 'btn ' + (t === 'in' ? 'btn-in' : 'btn-out');
      sb.textContent = t === 'in' ? 'บันทึกรายรับ' : 'บันทึกรายจ่าย';
    };
    $$('.seg button', f).forEach(b => (b.onclick = () => setType(b.dataset.t)));
    setType(type);
    $('#ta').focus();
    f.onsubmit = (e) => {
      e.preventDefault();
      submitting(f, async () => {
        const amount = Number(f.amount.value);
        if (cur === 'out' && amount > bal) throw new Error(`ยอดเงินคงเหลือไม่พอ (คงเหลือ ${baht(bal)})`);
        const r = await authed({ action: 'addTransaction', type: cur, date: f.date.value, amount, source: f.source.value, detail: f.detail.value });
        dlg.close(); toast(`บันทึกเรียบร้อย เลขที่ ${r.no}`); loadTx();
      });
    };
  }
  $$('[data-new]').forEach(b => b.addEventListener('click', () => showNewTx(b.dataset.new)));
  $('#loginCta').addEventListener('click', showLogin);

  /* ================= chart ================= */
  function renderChart() {
    const by = {};
    active().forEach(t => { const m = t.date.slice(0, 7); (by[m] = by[m] || { in: 0, out: 0 })[t.type] += t.amount; });
    const months = Object.keys(by).sort().slice(-12);
    const W = 760, H = 220, L = 56, B = 28, T = 12;
    if (!months.length) { $('#chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}"><text class="empty-chart" x="${W / 2}" y="${H / 2}" text-anchor="middle">ยังไม่มีข้อมูล</text></svg>`; return; }
    const max = Math.max(...months.flatMap(m => [by[m].in, by[m].out])) || 1;
    const step = Math.pow(10, Math.floor(Math.log10(max)));
    const top = Math.ceil(max / step) * step;
    const y = (v) => T + (H - B - T) * (1 - v / top);
    const slot = (W - L) / months.length, bw = Math.min(26, slot / 3);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="กราฟรายรับรายจ่ายรายเดือน">`;
    for (let i = 0; i <= 4; i++) {
      const v = top * i / 4;
      s += `<line class="grid" x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v >= 1000 ? (v / 1000).toLocaleString('th-TH') + 'k' : v}</text>`;
    }
    months.forEach((m, i) => {
      const cx = L + slot * i + slot / 2;
      s += `<rect x="${cx - bw - 2}" y="${y(by[m].in)}" width="${bw}" height="${H - B - y(by[m].in)}" rx="4" fill="var(--green-600)"><title>รายรับ ${thMonthLong(m)}: ${baht(by[m].in)}</title></rect>`;
      s += `<rect x="${cx + 2}" y="${y(by[m].out)}" width="${bw}" height="${H - B - y(by[m].out)}" rx="4" fill="var(--red)"><title>รายจ่าย ${thMonthLong(m)}: ${baht(by[m].out)}</title></rect>`;
      s += `<text class="axis" x="${cx}" y="${H - 8}" text-anchor="middle">${thMonth(m)}</text>`;
    });
    $('#chart').innerHTML = s + '</svg>';
  }

  /* ================= export ================= */
  $('#btnCsv').addEventListener('click', () => {
    const rows = [['วันที่', 'เลขที่', 'ประเภท', 'ที่มา/ผู้รับ', 'รายละเอียด', 'รายรับ', 'รายจ่าย', 'คงเหลือ', 'ผู้บันทึก', 'สถานะ', 'เหตุผลยกเลิก']];
    filtered().reverse().forEach(t => rows.push([t.date, t.no, t.type === 'in' ? 'รายรับ' : 'รายจ่าย', t.source, t.detail,
      t.type === 'in' ? t.amount : '', t.type === 'out' ? t.amount : '', t.status === 'void' ? '' : t.running, t.recorderName,
      t.status === 'void' ? 'ยกเลิก' : 'ปกติ', t.voidReason || '']));
    const csv = '﻿' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `บัญชีสภานักเรียน-${iso(new Date())}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  });
  $('#btnPrint').addEventListener('click', () => window.print());

  /* ================= members ================= */
  async function loadUsers() {
    try {
      state.users = await authed({ action: 'listUsers' });
      $('#usersBody').innerHTML = state.users.map(u => `
        <tr>
          <td class="no">${esc(u.username)}</td><td>${esc(u.name)}</td><td>${esc(u.position)}</td>
          <td>${u.role === 'admin' ? '<span class="badge badge-admin">ผู้ดูแลระบบ</span>' : (permsOf(u).map(p => `<span class="badge badge-ok">${PERM_LABELS[p]}</span>`).join(' ') || '<span class="hint">ดูอย่างเดียว</span>')}</td>
          <td>${u.active ? '<span class="badge badge-ok">ใช้งาน</span>' : '<span class="badge">ปิดใช้งาน</span>'}</td>
          <td class="nowrap"><button class="btn-link" data-perm="${esc(u.username)}">แก้สิทธิ์</button> <button class="btn-link" data-reset="${esc(u.username)}">ตั้งรหัสใหม่</button>
            ${u.username !== state.session.username ? `<button class="btn-link" data-toggle="${esc(u.username)}" data-active="${u.active}">${u.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button>` : ''}</td>
        </tr>`).join('');
    } catch (e) { toast(e.message, true); }
  }
  $('#usersBody').addEventListener('click', async (e) => {
    const r = e.target.closest('[data-reset]'), tg = e.target.closest('[data-toggle]'), pm = e.target.closest('[data-perm]');
    if (pm) {
      const u = state.users.find(x => x.username === pm.dataset.perm);
      openDialog(`${dlgHead('แก้ไขสิทธิ์')}
        <form class="dlg-body" id="fPerm">
          <p class="hint"><b>${esc(u.name)}</b> (${esc(u.username)})</p>
          ${permFields(u)}
          <p class="err"></p>
          <div class="dlg-actions"><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button type="submit" class="btn btn-gold">บันทึก</button></div>
        </form>`);
      $('#fPerm').onsubmit = (ev) => {
        ev.preventDefault();
        submitting(ev.target, async () => { await authed({ action: 'setUserPerms', username: u.username, ...readPerms(ev.target) }); dlg.close(); toast('แก้ไขสิทธิ์แล้ว'); loadUsers(); });
      };
    } else if (r) {
      const name = r.dataset.reset;
      openDialog(`${dlgHead('ตั้งรหัสผ่านใหม่')}
        <form class="dlg-body" id="fReset">
          <p class="hint">ตั้งรหัสผ่านใหม่ให้ <b>${esc(name)}</b> แล้วแจ้งเจ้าของบัญชีให้เปลี่ยนเองภายหลัง</p>
          <div class="field"><label for="rp">รหัสผ่านใหม่</label><input id="rp" name="pw" type="text" minlength="6" autocomplete="off" required></div>
          <p class="err"></p>
          <div class="dlg-actions"><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button type="submit" class="btn btn-gold">บันทึก</button></div>
        </form>`);
      $('#fReset').onsubmit = (ev) => {
        ev.preventDefault();
        submitting(ev.target, async () => { await authed({ action: 'resetPassword', username: name, newPassword: ev.target.pw.value }); dlg.close(); toast('ตั้งรหัสผ่านใหม่แล้ว'); });
      };
    } else if (tg) {
      try { await authed({ action: 'setUserActive', username: tg.dataset.toggle, active: tg.dataset.active !== 'true' }); loadUsers(); } catch (err) { toast(err.message, true); }
    }
  });
  function permFields(u) {
    const has = (p) => u.role !== 'admin' && permsOf(u).includes(p) ? 'checked' : '';
    return `<div class="field"><label>สิทธิ์</label>
      <div class="perm-list">
        <label class="chk"><input type="checkbox" name="pf" value="finance" ${has('finance')}> บันทึกบัญชีสภา</label>
        <label class="chk"><input type="checkbox" name="pf" value="attendance" ${has('attendance')}> หัวหน้าเช็คชื่อปฏิบัติงาน</label>
        <label class="chk"><input type="checkbox" name="pf" value="calendar" ${has('calendar')}> บันทึกปฏิทินงาน (ประธานนักเรียน / ครู)</label>
        <label class="chk"><input type="checkbox" name="isAdmin" ${u.role === 'admin' ? 'checked' : ''}> ผู้ดูแลระบบ (ทำได้ทุกอย่าง)</label>
      </div></div>`;
  }
  function readPerms(f) {
    return { role: f.isAdmin.checked ? 'admin' : 'member', perms: $$('input[name=pf]:checked', f).map(i => i.value) };
  }

  $('#btnAddUser').addEventListener('click', () => {
    openDialog(`${dlgHead('เพิ่มสมาชิกผู้บันทึก')}
      <form class="dlg-body" id="fUser">
        <div class="row2">
          <div class="field"><label for="un">ชื่อผู้ใช้ <small>(ภาษาอังกฤษ)</small></label><input id="un" name="username" pattern="[a-zA-Z0-9._\-]{3,30}" autocomplete="off" required></div>
          <div class="field"><label for="upw">รหัสผ่านเริ่มต้น</label><input id="upw" name="password" type="text" minlength="6" autocomplete="off" required></div>
        </div>
        <div class="field"><label for="unm">ชื่อ-สกุล <small>(แสดงเป็นชื่อผู้บันทึก)</small></label><input id="unm" name="name" maxlength="100" required></div>
        <div class="field"><label for="ups">ตำแหน่ง</label><input id="ups" name="position" maxlength="100" placeholder="เช่น เหรัญญิก, หัวหน้าฝ่ายสถานที่"></div>
        ${permFields({ role: 'member', perms: ['finance'] })}
        <p class="err"></p>
        <div class="dlg-actions"><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button type="submit" class="btn btn-gold">เพิ่มสมาชิก</button></div>
      </form>`);
    $('#fUser').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      submitting(f, async () => {
        await authed({ action: 'addUser', username: f.username.value, password: f.password.value, name: f.elements.name.value, position: f.position.value, ...readPerms(f) });
        dlg.close(); toast('เพิ่มสมาชิกเรียบร้อย'); loadUsers();
      });
    };
  });

  /* ================= router ================= */
  function route() {
    let [r, param] = (location.hash || '#home').slice(1).split('/');
    if (!['home', 'calendar', 'finance', 'members', 'duty'].includes(r)) r = 'home';
    if (r === 'members' && !isAdmin()) r = 'finance';
    const page = r === 'calendar' ? 'home' : r; // ปฏิทินอยู่ในหน้าแรก
    $$('.page').forEach(p => (p.hidden = p.id !== 'page-' + page));
    $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.route === r));
    if (r === 'members') loadUsers();
    if (r === 'duty') document.dispatchEvent(new CustomEvent('sc:duty', { detail: param || '' }));
    window.scrollTo(0, 0);
    if (page === 'home') document.dispatchEvent(new CustomEvent('sc:home', { detail: { scroll: r === 'calendar' } }));
  }
  window.addEventListener('hashchange', route);

  // ให้โมดูลอื่น (เช่น duty.js) ใช้ตัวช่วยร่วมกัน
  window.SC = { $, $$, state, apiGet, apiPost, authed, can, esc, toast, openDialog, dlgHead, submitting, iso, uid, thDate, thDateLong, demoExt: demo.ext, isDemo: DEMO, dialog: dlg };

  document.addEventListener('DOMContentLoaded', () => {
    $$('[data-year]').forEach(el => (el.textContent = CFG.ACADEMIC_YEAR || ''));
    $('#demoBanner').hidden = !DEMO;
    renderAuth();
    route();
    loadTx();
  });
})();
