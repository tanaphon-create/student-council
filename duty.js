// ระบบเช็คชื่อปฏิบัติงาน — ใช้ตัวช่วยร่วมจาก app.js ผ่าน window.SC
(() => {
  'use strict';
  const SC = window.SC;
  const { $, $$, esc, toast, openDialog, dlgHead, submitting, iso, can } = SC;

  const STATUS = {
    present: { label: 'มา', mark: '✓' },
    late: { label: 'สาย', mark: 'ส' },
    leave: { label: 'ลา', mark: 'ล' },
    absent: { label: 'ขาด', mark: '✗' },
  };
  const DAY_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const ds = { loaded: false, members: [], duties: [], att: [], idx: new Map(), view: '', tab: 'check', date: null, draft: {}, saved: '' };

  /* ================= วันที่ ================= */
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => iso(new Date());
  const longDate = (s) => parse(s).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  function scheduleDates(d) {
    const out = [];
    for (let t = parse(d.startDate), end = parse(d.endDate); t <= end && out.length < 400; t.setDate(t.getDate() + 1)) {
      if (d.days.includes(t.getDay())) out.push(iso(t));
    }
    return out;
  }
  function dayLabel(days) {
    const s = [...days].sort().join(',');
    if (s === '0,1,2,3,4,5,6') return 'ทุกวัน';
    if (s === '1,2,3,4,5') return 'จันทร์–ศุกร์';
    if (s === '0,6') return 'เสาร์–อาทิตย์';
    return [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => DAY_SHORT[d]).join(' ');
  }
  const periodLabel = (d) => d.startDate === d.endDate ? SC.thDate(d.startDate) : `${SC.thDate(d.startDate)} – ${SC.thDate(d.endDate)}`;
  const timeLabel = (d) => d.timeStart ? `${d.timeStart}${d.timeEnd ? '–' + d.timeEnd : ''} น.` : 'ไม่ระบุเวลา';
  function phase(d) {
    const t = today();
    if (t < d.startDate) return { key: 'upcoming', label: 'ยังไม่เริ่ม' };
    if (t > d.endDate) return { key: 'ended', label: 'สิ้นสุดแล้ว' };
    return { key: 'ongoing', label: 'กำลังดำเนินการ' };
  }

  /* ================= ข้อมูล ================= */
  const key = (dutyId, date, memberId) => `${dutyId}|${date}|${memberId}`;
  const memberById = (id) => ds.members.find(m => m.id === id);
  const memberQ = (m) => [m.studentId, m.name, m.classroom, m.position].join(' ').toLowerCase();
  const dutyById = (id) => ds.duties.find(d => d.id === id);
  // ลำดับรายชื่อ: ประธาน → รองประธาน → ตำแหน่งอื่น → สมาชิกทั่วไป แล้วเรียงตามห้อง เลขประจำตัว ชื่อ
  const rankOf = (m) => {
    const p = String(m.position || '').replace(/\s/g, '');
    return /^รองประธาน/.test(p) ? 1 : /^ประธาน/.test(p) ? 0 : p ? 2 : 3;
  };
  const byRank = (a, b) => rankOf(a) - rankOf(b)
    || String(a.classroom || '').localeCompare(String(b.classroom || ''), 'th', { numeric: true })
    || String(a.studentId || '').localeCompare(String(b.studentId || ''), 'th', { numeric: true })
    || String(a.name || '').localeCompare(String(b.name || ''), 'th');
  const orderIds = (ids) => [...ids].sort((a, b) => byRank(memberById(a) || {}, memberById(b) || {}));

  async function load(get = SC.apiGet) {
    const data = await get('duty');
    ds.members = [...data.members].sort(byRank);
    ds.duties = data.duties;
    ds.att = data.attendance;
    ds.idx = new Map(ds.att.map(a => [key(a.dutyId, a.date, a.memberId), a]));
    ds.loaded = true;
  }

  // วันที่ต้องเช็ค (ถึงวันนี้) สำหรับคำนวณสรุป — งานแบบเช็ครวมมีครั้งเดียวคือ 'ALL'
  const dueSessions = (d) => d.mode === 'overall' ? ['ALL'] : scheduleDates(d).filter(x => x <= today());

  function summarize(d) {
    const sessions = dueSessions(d);
    const per = {};
    let checkedSessions = 0;
    d.memberIds.forEach(id => (per[id] = { present: 0, late: 0, leave: 0, absent: 0, none: 0 }));
    sessions.forEach(s => {
      let any = false;
      d.memberIds.forEach(id => {
        const a = ds.idx.get(key(d.id, s, id));
        if (a) { per[id][a.status]++; any = true; } else per[id].none++;
      });
      if (any) checkedSessions++;
    });
    const tot = Object.values(per).reduce((o, p) => { Object.keys(p).forEach(k => (o[k] += p[k])); return o; }, { present: 0, late: 0, leave: 0, absent: 0, none: 0 });
    const checked = tot.present + tot.late + tot.leave + tot.absent;
    return { per, tot, sessions, checkedSessions, rate: checked ? Math.round((tot.present + tot.late) * 100 / checked) : null };
  }
  const rateOf = (p) => { const n = p.present + p.late + p.leave + p.absent; return n ? Math.round((p.present + p.late) * 100 / n) : null; };

  /* ================= เส้นทาง ================= */
  document.addEventListener('sc:duty', async (e) => {
    ds.view = e.detail;
    ds.tab = 'check';
    ds.date = null;
    ds.saved = '';
    const view = ds.view;
    if (!ds.loaded) await SC.prime(load);
    if (ds.loaded) render();
    else $('#dutyView').innerHTML = '<p class="empty">กำลังโหลดข้อมูล…</p>';
    // โหลดข้อมูลล่าสุดเบื้องหลัง แต่ไม่ทับสิ่งที่หัวหน้ากำลังเช็คค้างอยู่
    try { await load(); if (view === ds.view && !dirty()) render(); } catch (err) { if (!ds.loaded) $('#dutyView').innerHTML = `<p class="empty">โหลดข้อมูลไม่สำเร็จ: ${esc(err.message)}</p>`; else toast(err.message, true); }
  });
  document.addEventListener('sc:auth', () => { if (ds.loaded && !$('#page-duty').hidden) render(); });
  $('#btnNewDuty').addEventListener('click', () => dutyForm());

  async function refresh() { await load(); render(); }

  function render() {
    if (ds.view === 'roster') return renderRoster();
    if (ds.view) {
      const d = dutyById(ds.view);
      if (d) return renderDuty(d);
    }
    renderList();
  }

  /* ================= รายการงาน ================= */
  function renderList() {
    const order = { ongoing: 0, upcoming: 1, ended: 2 };
    const list = [...ds.duties].sort((a, b) => order[phase(a).key] - order[phase(b).key] || b.startDate.localeCompare(a.startDate));
    const ongoing = list.filter(d => phase(d).key === 'ongoing').length;
    const todayDuties = list.filter(d => d.mode === 'daily' && scheduleDates(d).includes(today()));
    $('#dutyView').innerHTML = `
      <div class="stats">
        <div class="stat stat-balance"><span>งานวันนี้</span><strong>${todayDuties.length ? todayDuties.map(d => esc(d.title)).join(', ') : 'ไม่มีงานเช็ครายวัน'}</strong></div>
        <div class="stat"><span>งานทั้งหมด</span><strong>${list.length}</strong></div>
        <div class="stat"><span>กำลังดำเนินการ</span><strong class="c-in">${ongoing}</strong></div>
        <div class="stat"><span>สมาชิก</span><strong>${ds.members.filter(m => m.active).length} คน</strong></div>
      </div>
      ${list.length ? `<div class="duty-grid">${list.map(dutyCard).join('')}</div>` : `
        <div class="card empty-state">
          <p class="empty">ยังไม่มีงานปฏิบัติ</p>
          ${can('attendance') ? `<p class="hint" style="text-align:center">${ds.members.length ? 'กด “+ สร้างงาน” เพื่อเริ่ม' : 'เริ่มจากเพิ่มรายชื่อสมาชิกก่อน แล้วจึงสร้างงาน'}</p>` : ''}
        </div>`}`;
    const big = $('#dutyView .stat-balance strong');
    if (big) big.style.fontSize = todayDuties.length ? '20px' : '18px';
  }

  function dutyCard(d) {
    const ph = phase(d), s = summarize(d);
    const total = d.mode === 'overall' ? 1 : scheduleDates(d).length;
    const pct = total ? Math.round(s.checkedSessions * 100 / total) : 0;
    return `
      <a class="duty-card ph-${ph.key}" href="#duty/${esc(d.id)}">
        <div class="dc-top"><span class="badge ph">${ph.label}</span><span class="badge mode">${d.mode === 'overall' ? 'เช็ครวม' : 'เช็ครายวัน'}</span></div>
        <h3>${esc(d.title)}</h3>
        <p class="dc-meta">${periodLabel(d)} · ${dayLabel(d.days)}</p>
        <p class="dc-meta">${timeLabel(d)} · ${d.memberIds.length} คน</p>
        <div class="progress" aria-hidden="true"><span style="width:${pct}%"></span></div>
        <div class="dc-foot">
          <span>${d.mode === 'overall' ? (s.checkedSessions ? 'เช็คแล้ว' : 'ยังไม่เช็ค') : `เช็คแล้ว ${s.checkedSessions}/${total} วัน`}</span>
          <b>${s.rate == null ? '—' : `มาปฏิบัติงาน ${s.rate}%`}</b>
        </div>
      </a>`;
  }

  /* ================= รายละเอียดงาน ================= */
  function renderDuty(d) {
    const ph = phase(d);
    $('#dutyView').innerHTML = `
      <a href="#duty" class="back-link">← งานทั้งหมด</a>
      <div class="card duty-info">
        <div class="di-head">
          <div>
            <div class="dc-top"><span class="badge ph ph-${ph.key}">${ph.label}</span><span class="badge mode">${d.mode === 'overall' ? 'เช็ครวม' : 'เช็ครายวัน'}</span></div>
            <h2>${esc(d.title)}</h2>
          </div>
          ${can('attendance') ? `<div class="head-actions"><button class="btn btn-ghost btn-sm" id="btnEditDuty">แก้ไขงาน</button><button class="btn btn-ghost btn-sm danger" id="btnDelDuty">ลบงาน</button></div>` : ''}
        </div>
        ${d.detail ? `<p class="di-detail">${esc(d.detail)}</p>` : ''}
        <dl class="di-meta">
          <div><dt>ช่วงวันที่</dt><dd>${periodLabel(d)}</dd></div>
          <div><dt>วันปฏิบัติงาน</dt><dd>${dayLabel(d.days)}</dd></div>
          <div><dt>เวลา</dt><dd>${timeLabel(d)}</dd></div>
          <div><dt>สมาชิก</dt><dd>${d.memberIds.length} คน</dd></div>
          <div><dt>สร้างโดย</dt><dd>${esc(d.createdByName)}</dd></div>
        </dl>
      </div>
      <div class="tabs" role="tablist">
        <button role="tab" data-tab="check">${d.mode === 'overall' ? 'เช็ครวม' : 'เช็คชื่อรายวัน'}</button>
        <button role="tab" data-tab="summary">สรุปผล</button>
      </div>
      <div id="dutyTab"></div>`;
    $$('.tabs button').forEach(b => (b.onclick = () => { if (confirmLeave()) { ds.tab = b.dataset.tab; renderTab(d); } }));
    const ed = $('#btnEditDuty');
    if (ed) {
      ed.onclick = () => dutyForm(d);
      $('#btnDelDuty').onclick = async () => {
        if (!confirm(`ลบงาน “${d.title}” ? ผลการเช็คชื่อของงานนี้จะไม่แสดงอีก`)) return;
        try { await SC.authed({ action: 'deleteDuty', id: d.id }); toast('ลบงานแล้ว'); location.hash = '#duty'; } catch (e) { toast(e.message, true); }
      };
    }
    renderTab(d);
  }

  function renderTab(d) {
    $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === ds.tab));
    if (ds.tab === 'summary') return renderSummary(d);
    if (d.mode === 'overall') ds.date = 'ALL';
    else if (!ds.date) {
      const dates = scheduleDates(d), t = today();
      ds.date = dates.includes(t) ? t : ([...dates].reverse().find(x => x <= t) || dates[0]);
    }
    loadDraft(d);
    renderSheet(d);
  }

  function loadDraft(d) {
    ds.draft = {};
    d.memberIds.forEach(id => {
      const a = ds.idx.get(key(d.id, ds.date, id));
      ds.draft[id] = { status: a ? a.status : '', note: a ? a.note : '' };
    });
    ds.saved = JSON.stringify(ds.draft);
  }
  const dirty = () => ds.saved && JSON.stringify(ds.draft) !== ds.saved;
  const confirmLeave = () => !dirty() || confirm('ยังไม่ได้บันทึกการเช็คชื่อ ต้องการออกโดยไม่บันทึกใช่ไหม');
  window.addEventListener('beforeunload', (e) => { if (dirty()) e.preventDefault(); });

  function renderSheet(d) {
    const editable = can('attendance');
    const dates = d.mode === 'daily' ? scheduleDates(d) : [];
    const records = d.memberIds.map(id => ds.idx.get(key(d.id, ds.date, id))).filter(Boolean);
    const last = records.sort((a, b) => String(b.checkedAt).localeCompare(String(a.checkedAt)))[0];
    const isFuture = ds.date !== 'ALL' && ds.date > today();
    $('#dutyTab').innerHTML = `
      ${d.mode === 'daily' ? `<div class="date-strip" role="listbox" aria-label="เลือกวันที่">${dates.map(x => {
        const done = d.memberIds.some(id => ds.idx.has(key(d.id, x, id)));
        const dt = parse(x);
        return `<button class="dchip ${x === ds.date ? 'on' : ''} ${done ? 'done' : ''} ${x > today() ? 'future' : ''} ${x === today() ? 'today' : ''}" data-date="${x}">
          <small>${DAY_SHORT[dt.getDay()]}</small><b>${dt.getDate()}</b><small>${dt.toLocaleDateString('th-TH', { month: 'short' })}</small></button>`;
      }).join('')}</div>` : ''}
      <div class="card">
        <div class="sheet-head">
          <div>
            <h3>${ds.date === 'ALL' ? 'เช็ครวมตลอดช่วงงาน' : longDate(ds.date)}</h3>
            <p class="hint">${last ? `เช็คล่าสุดโดย ${esc(last.checkedByName)} · ${new Date(last.checkedAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}` : 'ยังไม่ได้เช็คชื่อ'}${isFuture ? ' · วันนี้ยังมาไม่ถึง' : ''}</p>
          </div>
          <div class="count-chips" id="countChips"></div>
        </div>
        <input type="search" class="sheet-search" id="sheetSearch" placeholder="ค้นหาด้วยชื่อ หรือเลขประจำตัวนักเรียน" aria-label="ค้นหาสมาชิก">
        ${editable ? `<div class="sheet-tools">
          <span class="hint">ตั้งทุกคนเป็น</span>
          ${Object.entries(STATUS).map(([k, v]) => `<button class="btn btn-ghost btn-sm" data-all="${k}">${v.label}</button>`).join('')}
          <button class="btn-link" data-all="">ล้างทั้งหมด</button>
        </div>` : ''}
        <ol class="sheet">${orderIds(d.memberIds).map((id, i) => sheetRow(id, i, editable)).join('')}</ol>
        ${editable ? `<div class="sheet-save"><span class="hint" id="dirtyMsg"></span><button class="btn btn-in" id="btnSaveAtt">บันทึกการเช็คชื่อ</button></div>` : ''}
      </div>`;
    $$('.dchip').forEach(b => (b.onclick = () => {
      if (b.dataset.date === ds.date || !confirmLeave()) return;
      ds.date = b.dataset.date; loadDraft(d); renderSheet(d);
    }));
    const on = $('.dchip.on');
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
    updateCounts(d);
    $('#sheetSearch').oninput = (e) => {
      const q = e.target.value.trim().toLowerCase();
      $$('.sheet-row').forEach(li => (li.hidden = q && !li.dataset.q.includes(q)));
    };
    if (!editable) return;
    $$('[data-st]').forEach(b => (b.onclick = () => {
      const r = ds.draft[b.dataset.m];
      r.status = r.status === b.dataset.st ? '' : b.dataset.st;
      syncRow(b.dataset.m); updateCounts(d);
    }));
    $$('.note').forEach(inp => (inp.oninput = () => { ds.draft[inp.dataset.m].note = inp.value; updateCounts(d); }));
    $$('[data-all]').forEach(b => (b.onclick = () => {
      d.memberIds.forEach(id => { ds.draft[id].status = b.dataset.all; syncRow(id); });
      updateCounts(d);
    }));
    $('#btnSaveAtt').onclick = async () => {
      const btn = $('#btnSaveAtt');
      btn.disabled = true;
      try {
        const records = d.memberIds.map(id => ({ memberId: id, status: ds.draft[id].status, note: ds.draft[id].note }));
        await SC.authed({ action: 'saveAttendance', dutyId: d.id, date: ds.date, records });
        toast('บันทึกการเช็คชื่อเรียบร้อย');
        ds.saved = '';
        await load();
        loadDraft(d);
        renderSheet(d);
      } catch (e) { toast(e.message, true); btn.disabled = false; }
    };
  }

  function sheetRow(id, i, editable) {
    const m = memberById(id) || { name: '(ไม่พบรายชื่อ)', classroom: '', position: '' };
    const r = ds.draft[id];
    const sub = [m.studentId && 'เลขที่ ' + m.studentId, m.classroom, m.position].filter(Boolean).map(esc).join(' · ');
    return `<li class="sheet-row" data-row="${esc(id)}" data-q="${esc(memberQ(m))}">
      <span class="idx">${i + 1}</span>
      <div class="who"><b>${esc(m.name)}</b>${sub ? `<small>${sub}</small>` : ''}</div>
      ${editable ? `<div class="st-seg" role="group" aria-label="สถานะของ ${esc(m.name)}">${Object.entries(STATUS).map(([k, v]) =>
        `<button type="button" class="st-${k} ${r.status === k ? 'on' : ''}" data-st="${k}" data-m="${esc(id)}" aria-pressed="${r.status === k}">${v.label}</button>`).join('')}</div>
        <input class="note" data-m="${esc(id)}" value="${esc(r.note)}" maxlength="200" placeholder="หมายเหตุ" aria-label="หมายเหตุ">`
      : `<div class="st-view">${r.status ? `<span class="pill st-${r.status}">${STATUS[r.status].label}</span>` : '<span class="pill">ยังไม่เช็ค</span>'}</div>
        <span class="note-view">${esc(r.note)}</span>`}
    </li>`;
  }

  function syncRow(id) {
    const row = $(`.sheet-row[data-row="${CSS.escape(id)}"]`);
    $$('[data-st]', row).forEach(b => { const on = b.dataset.st === ds.draft[id].status; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  }

  function updateCounts(d) {
    const c = { present: 0, late: 0, leave: 0, absent: 0, none: 0 };
    d.memberIds.forEach(id => c[ds.draft[id].status || 'none']++);
    $('#countChips').innerHTML = Object.entries(STATUS).map(([k, v]) => `<span class="pill st-${k}">${v.label} ${c[k]}</span>`).join('') +
      `<span class="pill">ยังไม่เช็ค ${c.none}</span>`;
    const msg = $('#dirtyMsg');
    if (msg) msg.textContent = dirty() ? 'มีการเปลี่ยนแปลงที่ยังไม่บันทึก' : '';
  }

  /* ================= สรุปผล ================= */
  function renderSummary(d) {
    const s = summarize(d);
    const dates = d.mode === 'daily' ? scheduleDates(d) : [];
    const rows = orderIds(d.memberIds).map(id => ({ id, m: memberById(id) || { name: '(ไม่พบรายชื่อ)' }, p: s.per[id] }));
    $('#dutyTab').innerHTML = `
      <div class="stats">
        <div class="stat stat-balance"><span>อัตรามาปฏิบัติงาน (มา + สาย)</span><strong>${s.rate == null ? '—' : s.rate + '%'}</strong></div>
        <div class="stat"><span>มา / สาย</span><strong class="c-in">${s.tot.present} / ${s.tot.late}</strong></div>
        <div class="stat"><span>ลา</span><strong>${s.tot.leave}</strong></div>
        <div class="stat"><span>ขาด</span><strong class="c-out">${s.tot.absent}</strong></div>
      </div>
      <div class="card">
        <div class="card-head"><h2>สรุปรายบุคคล${d.mode === 'daily' ? ` <small class="hint">(นับถึงวันนี้ ${s.sessions.length} วัน)</small>` : ''}</h2>
          <button class="btn btn-ghost btn-sm" id="btnAttCsv">ดาวน์โหลด CSV</button></div>
        <div class="table-wrap"><table class="ledger plain">
          <thead><tr><th>#</th><th>ชื่อ-สกุล</th><th class="num">มา</th><th class="num">สาย</th><th class="num">ลา</th><th class="num">ขาด</th><th class="num">ยังไม่เช็ค</th><th class="num">อัตรามา</th></tr></thead>
          <tbody>${rows.map((r, i) => {
            const rate = rateOf(r.p);
            return `<tr><td>${i + 1}</td><td>${esc(r.m.name)}</td><td class="num c-in">${r.p.present}</td><td class="num">${r.p.late}</td><td class="num">${r.p.leave}</td><td class="num c-out">${r.p.absent}</td><td class="num">${r.p.none}</td>
              <td class="num"><span class="rate ${rate == null ? '' : rate >= 80 ? 'good' : rate >= 60 ? 'mid' : 'low'}">${rate == null ? '—' : rate + '%'}</span></td></tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>
      ${d.mode === 'daily' ? `<div class="card">
        <div class="card-head"><h2>ตารางเช็คชื่อรายวัน</h2>
          <div class="legend">${Object.entries(STATUS).map(([k, v]) => `<span><span class="mk st-${k}">${v.mark}</span>${v.label}</span>`).join('')}</div></div>
        <div class="table-wrap"><table class="matrix">
          <thead><tr><th class="mname">ชื่อ</th>${dates.map(x => `<th class="${x === today() ? 'today' : ''}"><small>${DAY_SHORT[parse(x).getDay()]}</small><br>${parse(x).getDate()}/${parse(x).getMonth() + 1}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(r => `<tr><td class="mname">${esc(r.m.name)}</td>${dates.map(x => {
            const a = ds.idx.get(key(d.id, x, r.id));
            return `<td>${a ? `<span class="mk st-${a.status}" title="${STATUS[a.status].label}${a.note ? ': ' + esc(a.note) : ''}">${STATUS[a.status].mark}</span>` : (x <= today() ? '<span class="mk none">·</span>' : '')}</td>`;
          }).join('')}</tr>`).join('')}</tbody>
        </table></div>
      </div>` : ''}`;
    $('#btnAttCsv').onclick = () => {
      const head = ['ลำดับ', 'เลขประจำตัว', 'ชื่อ-สกุล', 'ชั้น', 'ตำแหน่ง', 'มา', 'สาย', 'ลา', 'ขาด', 'ยังไม่เช็ค', 'อัตรามา(%)', ...dates];
      const lines = [head, ...rows.map((r, i) => [i + 1, r.m.studentId || '', r.m.name, r.m.classroom || '', r.m.position || '', r.p.present, r.p.late, r.p.leave, r.p.absent, r.p.none, rateOf(r.p) ?? '',
        ...dates.map(x => { const a = ds.idx.get(key(d.id, x, r.id)); return a ? STATUS[a.status].label : ''; })])];
      const csv = '﻿' + lines.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = `เช็คชื่อ-${d.title}-${today()}.csv`;
      a.click(); URL.revokeObjectURL(a.href);
    };
  }

  /* ================= ฟอร์มสร้าง/แก้ไขงาน ================= */
  function dutyForm(d) {
    if (!can('attendance')) return toast('ต้องเข้าสู่ระบบด้วยบัญชีหัวหน้าเช็คชื่อ', true);
    const active = ds.members.filter(m => m.active || (d && d.memberIds.includes(m.id)));
    if (!active.length) { toast('กรุณาเพิ่มรายชื่อสมาชิกก่อนสร้างงาน', true); location.hash = '#duty/roster'; return; }
    const v = d || { title: '', detail: '', startDate: today(), endDate: today(), days: [1, 2, 3, 4, 5], timeStart: '', timeEnd: '', mode: 'daily', memberIds: [] };
    openDialog(`${dlgHead(d ? 'แก้ไขงาน' : 'สร้างงานปฏิบัติ')}
      <form class="dlg-body" id="fDuty">
        <div class="field"><label for="dt1">ชื่องาน</label><input id="dt1" name="title" maxlength="150" value="${esc(v.title)}" placeholder="เช่น เวรยืนหน้าประตูโรงเรียน" required></div>
        <div class="field"><label for="dt2">รายละเอียดงาน</label><textarea id="dt2" name="detail" maxlength="1000" placeholder="หน้าที่ที่ต้องทำ จุดปฏิบัติงาน การแต่งกาย ฯลฯ">${esc(v.detail)}</textarea></div>
        <div class="row2">
          <div class="field"><label for="dt3">วันเริ่ม</label><input id="dt3" name="startDate" type="date" value="${v.startDate}" required></div>
          <div class="field"><label for="dt4">วันสิ้นสุด</label><input id="dt4" name="endDate" type="date" value="${v.endDate}" required></div>
        </div>
        <div class="field"><label>วันที่ต้องปฏิบัติงาน</label>
          <div class="day-pick">${[1, 2, 3, 4, 5, 6, 0].map(n => `<label><input type="checkbox" name="days" value="${n}" ${v.days.includes(n) ? 'checked' : ''}><span>${DAY_SHORT[n]}</span></label>`).join('')}</div>
          <small id="dayCount"></small>
        </div>
        <div class="row2">
          <div class="field"><label for="dt5">เวลาเริ่ม <small>(ไม่บังคับ)</small></label><input id="dt5" name="timeStart" type="time" value="${v.timeStart}"></div>
          <div class="field"><label for="dt6">เวลาสิ้นสุด</label><input id="dt6" name="timeEnd" type="time" value="${v.timeEnd}"></div>
        </div>
        <div class="field"><label>รูปแบบการเช็คชื่อ</label>
          <div class="mode-pick">
            <label><input type="radio" name="mode" value="daily" ${v.mode !== 'overall' ? 'checked' : ''}><span><b>เช็ครายวัน</b><small>เช็คทุกวันที่ปฏิบัติงาน</small></span></label>
            <label><input type="radio" name="mode" value="overall" ${v.mode === 'overall' ? 'checked' : ''}><span><b>เช็ครวม</b><small>เช็คครั้งเดียวทั้งช่วงงาน</small></span></label>
          </div>
        </div>
        <div class="field">
          <label>สมาชิกที่ปฏิบัติงาน <small id="selCount"></small></label>
          <div class="pick-tools"><input type="search" id="mSearch" placeholder="ค้นหาชื่อ / เลขประจำตัว / ชั้น"><button type="button" class="btn-link" id="mAll">เลือกทั้งหมด</button><button type="button" class="btn-link" id="mNone">ไม่เลือก</button></div>
          <div class="member-pick">${active.map(m => `<label data-q="${esc(memberQ(m))}"><input type="checkbox" name="mid" value="${esc(m.id)}" ${v.memberIds.includes(m.id) ? 'checked' : ''}>
            <span>${esc(m.name)}<small>${esc([m.studentId, m.classroom, m.position].filter(Boolean).join(' · '))}</small></span></label>`).join('')}</div>
        </div>
        <p class="err"></p>
        <div class="dlg-actions"><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button type="submit" class="btn btn-gold">${d ? 'บันทึกการแก้ไข' : 'สร้างงาน'}</button></div>
      </form>`, 'dlg-wide');
    const f = $('#fDuty');
    const picked = () => $$('input[name=mid]:checked', f).map(i => i.value);
    const days = () => $$('input[name=days]:checked', f).map(i => Number(i.value));
    const refreshInfo = () => {
      $('#selCount').textContent = `(เลือก ${picked().length} คน)`;
      const n = f.startDate.value && f.endDate.value && f.endDate.value >= f.startDate.value
        ? scheduleDates({ startDate: f.startDate.value, endDate: f.endDate.value, days: days() }).length : 0;
      $('#dayCount').textContent = `รวม ${n} วันปฏิบัติงาน`;
    };
    f.addEventListener('change', refreshInfo);
    refreshInfo();
    $('#mSearch').oninput = (e) => {
      const q = e.target.value.trim().toLowerCase();
      $$('.member-pick label', f).forEach(l => (l.hidden = q && !l.dataset.q.includes(q)));
    };
    $('#mAll').onclick = () => { $$('.member-pick label:not([hidden]) input', f).forEach(i => (i.checked = true)); refreshInfo(); };
    $('#mNone').onclick = () => { $$('input[name=mid]', f).forEach(i => (i.checked = false)); refreshInfo(); };
    f.onsubmit = (e) => {
      e.preventDefault();
      submitting(f, async () => {
        if (f.endDate.value < f.startDate.value) throw new Error('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');
        if (!days().length) throw new Error('กรุณาเลือกวันปฏิบัติงานอย่างน้อย 1 วัน');
        if (!scheduleDates({ startDate: f.startDate.value, endDate: f.endDate.value, days: days() }).length) throw new Error('ช่วงวันที่ที่เลือกไม่มีวันปฏิบัติงานเลย');
        if (!picked().length) throw new Error('กรุณาเลือกสมาชิกอย่างน้อย 1 คน');
        const r = await SC.authed({
          action: 'saveDuty', id: d ? d.id : '', title: f.elements.title.value, detail: f.detail.value,
          startDate: f.startDate.value, endDate: f.endDate.value, days: days(), timeStart: f.timeStart.value, timeEnd: f.timeEnd.value,
          mode: f.mode.value, memberIds: picked(),
        });
        SC.dialog.close();
        toast(d ? 'แก้ไขงานแล้ว' : 'สร้างงานเรียบร้อย');
        if (location.hash === '#duty/' + r.id) { ds.date = null; refresh(); } else location.hash = '#duty/' + r.id;
      });
    };
  }

  /* ================= รายชื่อสมาชิก ================= */
  function renderRoster() {
    const editable = can('attendance');
    const list = [...ds.members].sort((a, b) => (b.active - a.active) || byRank(a, b));
    $('#dutyView').innerHTML = `
      <a href="#duty" class="back-link">← งานทั้งหมด</a>
      <div class="card">
        <div class="toolbar">
          <h2 class="card-title">รายชื่อสมาชิกสภานักเรียน <small class="hint">(${ds.members.filter(m => m.active).length} คน)</small></h2>
          <span class="spacer"></span>
          <input type="search" id="rSearch" placeholder="ค้นหาชื่อ / เลขประจำตัว" aria-label="ค้นหาสมาชิก">
          ${editable ? `<button class="btn btn-ghost btn-sm" id="btnBulk">เพิ่มหลายคน</button><button class="btn btn-gold btn-sm" id="btnAddMember">+ เพิ่มสมาชิก</button>` : ''}
        </div>
        ${list.length ? `<div class="table-wrap"><table class="ledger plain roster">
          <thead><tr><th>#</th><th>เลขประจำตัว</th><th>ชื่อ-สกุล</th><th>ชั้น/ห้อง</th><th>ตำแหน่ง/ฝ่าย</th><th>สถานะ</th>${editable ? '<th></th>' : ''}</tr></thead>
          <tbody id="rosterBody">${list.map((m, i) => `
            <tr data-q="${esc(memberQ(m))}" class="${m.active ? '' : 'void'}">
              <td>${i + 1}</td><td class="no">${esc(m.studentId) || '—'}</td><td>${esc(m.name)}</td><td>${esc(m.classroom)}</td><td>${esc(m.position)}</td>
              <td>${m.active ? '<span class="badge badge-ok">ปฏิบัติงาน</span>' : '<span class="badge">พ้นสภาพ</span>'}</td>
              ${editable ? `<td class="nowrap"><button class="btn-link" data-edit="${esc(m.id)}">แก้ไข</button> <button class="btn-link" data-act="${esc(m.id)}">${m.active ? 'พ้นสภาพ' : 'คืนสภาพ'}</button></td>` : ''}
            </tr>`).join('')}</tbody>
        </table></div>` : `<p class="empty">ยังไม่มีรายชื่อสมาชิก${editable ? ' — กด “เพิ่มหลายคน” เพื่อวางรายชื่อจาก Excel ได้ทีเดียว' : ''}</p>`}
      </div>`;
    const rs = $('#rSearch');
    rs.oninput = () => { const q = rs.value.trim().toLowerCase(); $$('#rosterBody tr').forEach(tr => (tr.hidden = q && !tr.dataset.q.includes(q))); };
    if (!editable) return;
    $('#btnAddMember').onclick = () => memberForm();
    $('#btnBulk').onclick = bulkForm;
    const body = $('#rosterBody');
    if (body) body.onclick = async (e) => {
      const ed = e.target.closest('[data-edit]'), ac = e.target.closest('[data-act]');
      if (ed) memberForm(memberById(ed.dataset.edit));
      if (ac) {
        const m = memberById(ac.dataset.act);
        try { await SC.authed({ action: 'setMemberActive', id: m.id, active: !m.active }); toast(m.active ? 'ปรับเป็นพ้นสภาพแล้ว' : 'คืนสภาพแล้ว'); refresh(); } catch (err) { toast(err.message, true); }
      }
    };
  }

  function memberForm(m) {
    openDialog(`${dlgHead(m ? 'แก้ไขข้อมูลสมาชิก' : 'เพิ่มสมาชิก')}
      <form class="dlg-body" id="fMember">
        <div class="row2">
          <div class="field"><label for="ms">เลขประจำตัวนักเรียน</label><input id="ms" name="studentId" inputmode="numeric" maxlength="15" pattern="[0-9A-Za-z\-]*" value="${esc(m ? m.studentId || '' : '')}" placeholder="เช่น 12345"></div>
          <div class="field"><label for="mn">ชื่อ-สกุล</label><input id="mn" name="fullname" maxlength="100" value="${esc(m ? m.name : '')}" required></div>
        </div>
        <div class="row2">
          <div class="field"><label for="mc">ชั้น/ห้อง</label><input id="mc" name="classroom" maxlength="30" value="${esc(m ? m.classroom : '')}" placeholder="เช่น ม.5/2"></div>
          <div class="field"><label for="mp">ตำแหน่ง/ฝ่าย</label><input id="mp" name="position" maxlength="100" value="${esc(m ? m.position : '')}" placeholder="เช่น ฝ่ายสถานที่"></div>
        </div>
        <p class="err"></p>
        <div class="dlg-actions"><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button type="submit" class="btn btn-gold">บันทึก</button></div>
      </form>`);
    $('#fMember').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      submitting(f, async () => {
        await SC.authed({ action: 'saveMember', id: m ? m.id : '', studentId: f.studentId.value.trim(), name: f.fullname.value, classroom: f.classroom.value, position: f.position.value });
        SC.dialog.close(); toast('บันทึกรายชื่อแล้ว'); refresh();
      });
    };
  }

  function parseBulk(text) {
    return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
      const parts = (l.includes('\t') ? l.split('\t') : l.split(',')).map(x => x.trim());
      // ถ้าคอลัมน์แรกเป็นตัวเลข ถือเป็นเลขประจำตัวนักเรียน
      const studentId = /^\d{3,15}$/.test(parts[0]) ? parts.shift() : '';
      return { studentId, name: parts[0] || '', classroom: parts[1] || '', position: parts[2] || '' };
    }).filter(m => m.name);
  }

  function bulkForm() {
    openDialog(`${dlgHead('เพิ่มสมาชิกหลายคน')}
      <form class="dlg-body" id="fBulk">
        <p class="hint">วางรายชื่อ 1 คนต่อ 1 บรรทัด รูปแบบ <b>เลขประจำตัว, ชื่อ-สกุล, ชั้น, ตำแหน่ง</b> (ใส่แค่ชื่อก็ได้ ช่องอื่นไม่บังคับ) หรือคัดลอกคอลัมน์จาก Excel/Google Sheets มาวางได้เลย</p>
        <div class="field"><textarea name="list" rows="9" placeholder="12345, นายสมชาย ใจดี, ม.5/1, ฝ่ายสถานที่&#10;12346, นางสาวสมหญิง รักเรียน, ม.4/2, ฝ่ายกิจกรรม" required></textarea></div>
        <p class="hint" id="bulkCount">พบ 0 คน</p>
        <p class="err"></p>
        <div class="dlg-actions"><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button type="submit" class="btn btn-gold">เพิ่มทั้งหมด</button></div>
      </form>`);
    const f = $('#fBulk');
    f.list.oninput = () => ($('#bulkCount').textContent = `พบ ${parseBulk(f.list.value).length} คน`);
    f.onsubmit = (e) => {
      e.preventDefault();
      submitting(f, async () => {
        const members = parseBulk(f.list.value);
        if (!members.length) throw new Error('ไม่พบรายชื่อ');
        const r = await SC.authed({ action: 'bulkAddMembers', members });
        SC.dialog.close(); toast(`เพิ่มสมาชิก ${r.added} คนแล้ว`); refresh();
      });
    };
  }

  /* ============ โหมดทดลอง: จำลองหลังบ้านของเช็คชื่อ ============ */
  const ext = SC.demoExt;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function demoDb(db) {
    if (db.duty) return db.duty;
    const off = (n) => { const t = new Date(); t.setDate(t.getDate() + n); return iso(t); };
    const names = [
      ['นายภูมิพัฒน์ ศรีสุข', 'ม.6/1', 'ประธานสภานักเรียน'], ['นางสาวกานต์ธิดา ใจงาม', 'ม.6/2', 'รองประธาน'],
      ['นายธนวัฒน์ แก้วมณี', 'ม.5/1', 'เลขานุการ'], ['นางสาวพิมพ์ชนก บุญมา', 'ม.5/3', 'เหรัญญิก'],
      ['นายณัฐพล วงศ์ดี', 'ม.5/2', 'ฝ่ายสถานที่'], ['นางสาวปวีณา สายทอง', 'ม.4/1', 'ฝ่ายประชาสัมพันธ์'],
      ['นายกิตติศักดิ์ ทองดี', 'ม.4/2', 'ฝ่ายกิจกรรม'], ['นางสาวสุภาวดี มีสุข', 'ม.4/3', 'ฝ่ายปฏิคม'],
    ];
    const members = names.map(([name, classroom, position], i) => ({ id: SC.uid(), studentId: String(24101 + i * 37), name, classroom, position, active: true }));
    const ids = members.map(m => m.id);
    const leader = 'นายหัวหน้า ตัวอย่าง', now = new Date().toISOString();
    const duties = [
      { id: SC.uid(), title: 'เวรยืนหน้าประตูโรงเรียน', detail: 'ต้อนรับนักเรียนตอนเช้า ตรวจการแต่งกาย และดูแลความเรียบร้อยบริเวณประตูหน้า', startDate: off(-11), endDate: off(10), days: [1, 2, 3, 4, 5], timeStart: '07:00', timeEnd: '07:45', mode: 'daily', memberIds: ids.slice(0, 6), status: 'active', createdByName: leader, createdAt: now },
      { id: SC.uid(), title: 'จิตอาสาทำความสะอาดบริเวณโรงเรียน', detail: 'Big Cleaning Day ก่อนเปิดภาคเรียน แบ่งโซนตามฝ่าย', startDate: off(25), endDate: off(25), days: [0, 1, 2, 3, 4, 5, 6], timeStart: '08:30', timeEnd: '12:00', mode: 'overall', memberIds: ids, status: 'active', createdByName: leader, createdAt: now },
      { id: SC.uid(), title: 'ช่วยงานพิธีไหว้ครู', detail: 'จัดสถานที่ รับพานไหว้ครู และดูแลแถวนักเรียน', startDate: off(-60), endDate: off(-58), days: [0, 1, 2, 3, 4, 5, 6], timeStart: '07:30', timeEnd: '12:00', mode: 'overall', memberIds: ids, status: 'active', createdByName: leader, createdAt: now },
    ];
    const att = [];
    scheduleDates(duties[0]).filter(x => x < today()).forEach((x, di) => duties[0].memberIds.forEach((id, mi) => {
      const k = (mi * 3 + di) % 13;
      att.push({ dutyId: duties[0].id, date: x, memberId: id, status: k === 0 ? 'absent' : k === 5 ? 'late' : k === 9 ? 'leave' : 'present', note: k === 9 ? 'ลาป่วย' : '', checkedByName: leader, checkedAt: now });
    }));
    ids.forEach((id, i) => att.push({ dutyId: duties[2].id, date: 'ALL', memberId: id, status: i === 3 ? 'leave' : 'present', note: i === 3 ? 'ติดสอบแข่งขัน' : '', checkedByName: leader, checkedAt: now }));
    return (db.duty = { members, duties, att });
  }
  function demoMember(m) {
    const name = String(m.name || '').trim();
    if (!name) throw new Error('กรุณาระบุชื่อ-สกุล');
    const studentId = String(m.studentId || '').trim();
    if (!/^[0-9A-Za-z-]{0,15}$/.test(studentId)) throw new Error('เลขประจำตัวนักเรียนไม่ถูกต้อง: ' + studentId);
    return { studentId, name, classroom: String(m.classroom || '').trim(), position: String(m.position || '').trim() };
  }
  function demoCheckIds(x, list, selfId) {
    const taken = {};
    x.members.forEach(m => { if (m.studentId && m.id !== selfId) taken[m.studentId] = m.name; });
    list.forEach(m => {
      if (!m.studentId) return;
      if (taken[m.studentId]) throw new Error(`เลขประจำตัว ${m.studentId} ซ้ำกับ ${taken[m.studentId]}`);
      taken[m.studentId] = m.name;
    });
  }
  ext.duty = (db) => { const x = demoDb(db); return clone({ members: x.members, duties: x.duties.filter(d => d.status !== 'deleted'), attendance: x.att }); };
  ext.saveMember = (db, b, sess) => {
    sess('attendance');
    const x = demoDb(db), v = demoMember(b);
    demoCheckIds(x, [v], b.id);
    if (b.id) { Object.assign(x.members.find(m => m.id === b.id), v); return { id: b.id }; }
    const id = SC.uid(); x.members.push({ id, ...v, active: true }); return { id };
  };
  ext.bulkAddMembers = (db, b, sess) => {
    sess('attendance');
    const x = demoDb(db), list = (b.members || []).map(demoMember);
    demoCheckIds(x, list, '');
    list.forEach(v => x.members.push({ id: SC.uid(), ...v, active: true }));
    return { added: list.length };
  };
  ext.setMemberActive = (db, b, sess) => { sess('attendance'); demoDb(db).members.find(m => m.id === b.id).active = b.active === true; return true; };
  ext.saveDuty = (db, b, sess) => {
    const u = sess('attendance'), x = demoDb(db);
    if (!String(b.title || '').trim()) throw new Error('กรุณาระบุชื่องาน');
    if (!b.startDate || !b.endDate || b.endDate < b.startDate) throw new Error('ช่วงวันที่ไม่ถูกต้อง');
    if (!(b.days || []).length) throw new Error('กรุณาเลือกวันปฏิบัติงานอย่างน้อย 1 วัน');
    if (!(b.memberIds || []).length) throw new Error('กรุณาเลือกสมาชิกอย่างน้อย 1 คน');
    const v = { title: b.title.trim(), detail: String(b.detail || '').trim(), startDate: b.startDate, endDate: b.endDate, days: b.days.map(Number),
      timeStart: b.timeStart || '', timeEnd: b.timeEnd || '', mode: b.mode === 'overall' ? 'overall' : 'daily', memberIds: b.memberIds.map(String) };
    if (b.id) { Object.assign(x.duties.find(d => d.id === b.id), v); return { id: b.id }; }
    const id = SC.uid();
    x.duties.push({ id, ...v, status: 'active', createdByName: u.name, createdAt: new Date().toISOString() });
    return { id };
  };
  ext.deleteDuty = (db, b, sess) => { sess('attendance'); demoDb(db).duties.find(d => d.id === b.id).status = 'deleted'; return true; };
  ext.saveAttendance = (db, b, sess) => {
    const u = sess('attendance'), x = demoDb(db);
    const d = x.duties.find(t => t.id === b.dutyId && t.status !== 'deleted');
    if (!d) throw new Error('ไม่พบงาน');
    if (d.mode === 'overall' ? b.date !== 'ALL' : !scheduleDates(d).includes(b.date)) throw new Error('วันที่นี้ไม่อยู่ในตารางปฏิบัติงาน');
    const recs = (b.records || []).filter(r => d.memberIds.includes(r.memberId));
    const touched = new Set(recs.map(r => r.memberId)), now = new Date().toISOString();
    x.att = x.att.filter(a => !(a.dutyId === d.id && a.date === b.date && touched.has(a.memberId)));
    recs.filter(r => r.status).forEach(r => {
      if (!STATUS[r.status]) throw new Error('สถานะไม่ถูกต้อง');
      x.att.push({ dutyId: d.id, date: b.date, memberId: r.memberId, status: r.status, note: String(r.note || '').trim().slice(0, 200), checkedByName: u.name, checkedAt: now });
    });
    return { saved: recs.filter(r => r.status).length };
  };
})();
