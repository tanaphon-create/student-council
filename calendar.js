// ปฏิทินการปฏิบัติงาน (แสดงในหน้าแรก) — รวมงานที่ประธานนักเรียน/ครูบันทึก กับเวรจากระบบเช็คชื่อ
(() => {
  'use strict';
  const SC = window.SC;
  const { $, $$, esc, toast, openDialog, dlgHead, submitting, iso, can } = SC;

  const KINDS = {
    meeting: 'ประชุม',
    activity: 'กิจกรรม',
    work: 'ปฏิบัติงาน',
    special: 'วันสำคัญ',
    other: 'อื่น ๆ',
    duty: 'เวรปฏิบัติงาน',
  };
  const WEEK = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const now = new Date();
  const cs = { loaded: false, events: [], duties: [], month: new Date(now.getFullYear(), now.getMonth(), 1), sel: iso(now) };

  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => iso(new Date());
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const longDate = (s) => parse(s).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeText = (it) => it.timeStart ? `${it.timeStart}${it.timeEnd ? '–' + it.timeEnd : ''} น.` : 'ทั้งวัน';

  async function load() {
    const [events, duty] = await Promise.all([SC.apiGet('events'), SC.apiGet('duty')]);
    cs.events = events;
    cs.duties = duty.duties;
    cs.loaded = true;
  }

  function itemsOn(date) {
    const dow = parse(date).getDay();
    const ev = cs.events.filter(e => e.date <= date && date <= (e.endDate || e.date)).map(e => ({ ...e, kind: e.category in KINDS ? e.category : 'other', ev: true }));
    const du = cs.duties.filter(d => d.startDate <= date && date <= d.endDate && d.days.includes(dow)).map(d => ({
      id: d.id, kind: 'duty', title: d.title, detail: d.detail, timeStart: d.timeStart, timeEnd: d.timeEnd,
      location: '', createdByName: d.createdByName, members: d.memberIds.length, href: '#duty/' + d.id,
    }));
    return [...ev, ...du].sort((a, b) => (a.timeStart || '00:00').localeCompare(b.timeStart || '00:00'));
  }

  /* ================= เส้นทาง ================= */
  document.addEventListener('sc:home', async (e) => {
    const scroll = e.detail && e.detail.scroll;
    if (cs.loaded) { render(); if (scroll) scrollToCal(); }
    try {
      await load();
      render();
      if (scroll) scrollToCal();
      else maybePopup();
    } catch (err) {
      if (!cs.loaded) $('#calendarBox').innerHTML = `<p class="empty">โหลดปฏิทินไม่สำเร็จ: ${esc(err.message)}</p>`;
    }
  });
  document.addEventListener('sc:auth', () => { if (cs.loaded) render(); });
  $('#btnAddEvent').addEventListener('click', () => eventForm(null, cs.sel));
  function scrollToCal() {
    const top = $('#calSection').getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior: 'smooth' });
  }

  /* ================= ปฏิทิน ================= */
  function render() {
    const y = cs.month.getFullYear(), m = cs.month.getMonth();
    const first = new Date(y, m, 1);
    const start = new Date(y, m, 1 - first.getDay());
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      cells.push(iso(d));
    }
    // ตัดแถวสุดท้ายถ้าเป็นเดือนถัดไปทั้งแถว
    while (cells.length > 35 && parse(cells[cells.length - 7]).getMonth() !== m) cells.splice(-7);
    const t = today();
    $('#calendarBox').innerHTML = `
      <div class="cal-layout">
        <div class="card cal-card">
          <div class="cal-nav">
            <button class="cal-arrow" data-nav="-1" aria-label="เดือนก่อนหน้า">‹</button>
            <h3>${first.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}</h3>
            <button class="cal-arrow" data-nav="1" aria-label="เดือนถัดไป">›</button>
            <button class="btn btn-ghost btn-sm" data-nav="0">วันนี้</button>
          </div>
          <div class="cal-grid" role="grid">
            ${WEEK.map((w, i) => `<div class="cal-wd ${i === 0 ? 'sun' : ''}">${w}</div>`).join('')}
            ${cells.map(c => {
              const items = itemsOn(c), d = parse(c);
              const cls = ['cal-cell', d.getMonth() !== m && 'other', c === t && 'today', c === cs.sel && 'sel', items.length && 'has'].filter(Boolean).join(' ');
              return `<button class="${cls}" data-date="${c}" aria-label="${longDate(c)} ${items.length ? items.length + ' งาน' : 'ไม่มีงาน'}">
                <span class="dn">${d.getDate()}</span>
                <span class="cal-pills">${items.slice(0, 2).map(it => `<span class="cp k-${it.kind}">${esc(it.title)}</span>`).join('')}${items.length > 2 ? `<span class="cp-more">+${items.length - 2}</span>` : ''}</span>
                <span class="cal-dots">${items.slice(0, 4).map(it => `<i class="k-${it.kind}"></i>`).join('')}</span>
              </button>`;
            }).join('')}
          </div>
          <div class="cal-legend">${Object.entries(KINDS).map(([k, v]) => `<span><i class="k-${k}"></i>${v}</span>`).join('')}</div>
        </div>
        <div class="card cal-side">
          <h3 class="cal-side-title">${cs.sel === t ? 'วันนี้ · ' : ''}${longDate(cs.sel)}</h3>
          <div id="calDay">${dayList(cs.sel)}</div>
          <h4 class="cal-up-title">งานที่กำลังจะมาถึง</h4>
          <div>${upcomingList()}</div>
        </div>
      </div>`;
    $$('[data-nav]', $('#calendarBox')).forEach(b => (b.onclick = () => {
      const n = Number(b.dataset.nav);
      if (n === 0) { const d = new Date(); cs.month = new Date(d.getFullYear(), d.getMonth(), 1); cs.sel = today(); }
      else cs.month = new Date(cs.month.getFullYear(), cs.month.getMonth() + n, 1);
      render();
    }));
    $$('.cal-cell').forEach(b => (b.onclick = () => {
      cs.sel = b.dataset.date;
      const d = parse(cs.sel);
      if (d.getMonth() !== cs.month.getMonth()) cs.month = new Date(d.getFullYear(), d.getMonth(), 1);
      render();
      if (window.innerWidth < 900) $('.cal-side').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    bindItemActions($('#calendarBox'));
  }

  function itemCard(it, compact) {
    const manage = it.ev && can('calendar');
    return `<div class="cal-item k-${it.kind}">
      <div class="ci-time">${timeText(it)}</div>
      <div class="ci-body">
        <div class="ci-top"><span class="ci-kind">${KINDS[it.kind]}</span>${it.ev && it.endDate && it.endDate !== it.date ? `<span class="ci-range">${SC.thDate(it.date)} – ${SC.thDate(it.endDate)}</span>` : ''}</div>
        <b class="ci-title">${esc(it.title)}</b>
        ${!compact && it.detail ? `<p class="ci-detail">${esc(it.detail)}</p>` : ''}
        <small class="ci-meta">${[it.location && '📍 ' + esc(it.location), it.members && `👥 ${it.members} คน`, it.createdByName && 'บันทึกโดย ' + esc(it.createdByName)].filter(Boolean).join(' · ')}</small>
        ${it.href || manage ? `<div class="ci-actions">
          ${it.href ? `<a class="btn-link" href="${it.href}" data-close>ดูการเช็คชื่อ →</a>` : ''}
          ${manage ? `<button class="btn-link" data-edit-ev="${esc(it.id)}">แก้ไข</button><button class="btn-link danger-link" data-del-ev="${esc(it.id)}">ลบ</button>` : ''}
        </div>` : ''}
      </div>
    </div>`;
  }

  function dayList(date) {
    const items = itemsOn(date);
    if (!items.length) return `<p class="cal-empty">ไม่มีงานในวันนี้${can('calendar') ? ` · <button class="btn-link" data-add-on="${date}">+ เพิ่มงาน</button>` : ''}</p>`;
    return items.map(it => itemCard(it)).join('');
  }

  function upcomingList() {
    // เวรที่ซ้ำทุกวันแสดงครั้งเดียว (ครั้งถัดไป)
    const out = [], seen = new Set(itemsOn(cs.sel).map(it => it.id));
    for (let i = 1; i <= 14 && out.length < 6; i++) {
      const d = addDays(cs.sel, i);
      itemsOn(d).forEach(it => { if (out.length < 6 && !seen.has(it.id)) { seen.add(it.id); out.push({ d, it }); } });
    }
    if (!out.length) return '<p class="cal-empty">ไม่มีงานใน 14 วันถัดไป</p>';
    return out.map(({ d, it }) => `<button class="up-row k-${it.kind}" data-go="${d}">
      <span class="up-date"><b>${parse(d).getDate()}</b><small>${parse(d).toLocaleDateString('th-TH', { month: 'short' })}</small></span>
      <span class="up-text"><b>${esc(it.title)}</b><small>${KINDS[it.kind]} · ${timeText(it)}</small></span></button>`).join('');
  }

  function bindItemActions(root) {
    $$('[data-edit-ev]', root).forEach(b => (b.onclick = () => eventForm(cs.events.find(e => e.id === b.dataset.editEv))));
    $$('[data-del-ev]', root).forEach(b => (b.onclick = async () => {
      const ev = cs.events.find(e => e.id === b.dataset.delEv);
      if (!confirm(`ลบงาน “${ev.title}” ออกจากปฏิทิน?`)) return;
      try { await SC.authed({ action: 'deleteEvent', id: ev.id }); SC.dialog.close(); toast('ลบงานแล้ว'); await load(); render(); } catch (e) { toast(e.message, true); }
    }));
    $$('[data-add-on]', root).forEach(b => (b.onclick = () => eventForm(null, b.dataset.addOn)));
    $$('[data-go]', root).forEach(b => (b.onclick = () => {
      cs.sel = b.dataset.go;
      const d = parse(cs.sel);
      cs.month = new Date(d.getFullYear(), d.getMonth(), 1);
      render();
    }));
  }

  /* ================= เด้งแจ้งเตือนเมื่อมีงาน ================= */
  // แสดงครั้งแรกที่เปิดหน้าแรกในแต่ละวัน (ต่อการเปิดเบราว์เซอร์หนึ่งครั้ง)
  function maybePopup() {
    // รอให้ INTRO จบก่อน ไม่ให้หน้าต่างแจ้งเตือนเด้งทับ
    if (document.getElementById('intro')) { document.addEventListener('sc:intro-done', maybePopup, { once: true }); return; }
    const t = today(), key = 'sc_cal_popup_' + t;
    try { if (sessionStorage.getItem(key)) return; } catch (_) { /* ไม่มี storage */ }
    if (SC.dialog.open || location.hash.replace('#', '') !== 'home' && location.hash !== '') return;
    const todayItems = itemsOn(t);
    const soon = [], seen = new Set(todayItems.map(it => it.id));
    for (let i = 1; i <= 3; i++) {
      itemsOn(addDays(t, i)).forEach(it => { if (!seen.has(it.id)) { seen.add(it.id); soon.push({ d: addDays(t, i), it }); } });
    }
    if (!todayItems.length && !soon.length) return;
    try { sessionStorage.setItem(key, '1'); } catch (_) { /* ไม่มี storage */ }
    openDialog(`
      <div class="dlg-head pop-head">
        <span class="bell" aria-hidden="true">🔔</span>
        <h2>${todayItems.length ? `วันนี้มีงาน ${todayItems.length} รายการ` : 'มีงานที่ใกล้จะถึง'}</h2>
        <button class="dlg-x" data-close aria-label="ปิด">×</button>
      </div>
      <div class="dlg-body">
        <p class="pop-date">${longDate(t)}</p>
        ${todayItems.length ? todayItems.map(it => itemCard(it)).join('') : ''}
        ${soon.length ? `<h4 class="cal-up-title">อีก 3 วันข้างหน้า</h4>${soon.map(({ d, it }) => `<div class="pop-soon k-${it.kind}"><span>${parse(d).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}</span><b>${esc(it.title)}</b><small>${timeText(it)}</small></div>`).join('')}` : ''}
        <div class="dlg-actions" style="margin-top:16px"><button class="btn btn-ghost" data-close>ปิด</button><a class="btn btn-gold" href="#calendar" data-close>ดูปฏิทินทั้งหมด</a></div>
      </div>`, 'dlg-wide dlg-pop');
    bindItemActions(SC.dialog);
  }

  /* ================= ฟอร์มเพิ่ม/แก้ไขงาน ================= */
  function eventForm(ev, date) {
    if (!can('calendar')) return toast('ต้องเข้าสู่ระบบด้วยบัญชีที่มีสิทธิ์บันทึกปฏิทินงาน', true);
    const v = ev || { title: '', category: 'meeting', date: date || today(), endDate: date || today(), timeStart: '', timeEnd: '', location: '', detail: '' };
    openDialog(`${dlgHead(ev ? 'แก้ไขงานในปฏิทิน' : 'เพิ่มงานในปฏิทิน')}
      <form class="dlg-body" id="fEvent">
        <div class="field"><label for="ev1">ชื่องาน</label><input id="ev1" name="evTitle" maxlength="150" value="${esc(v.title)}" placeholder="เช่น ประชุมคณะกรรมการสภานักเรียน" required></div>
        <div class="field"><label>ประเภท</label>
          <div class="kind-pick">${Object.entries(KINDS).filter(([k]) => k !== 'duty').map(([k, l]) =>
            `<label><input type="radio" name="category" value="${k}" ${v.category === k ? 'checked' : ''}><span class="k-${k}">${l}</span></label>`).join('')}</div>
        </div>
        <div class="row2">
          <div class="field"><label for="ev2">วันที่</label><input id="ev2" name="date" type="date" value="${v.date}" required></div>
          <div class="field"><label for="ev3">ถึงวันที่ <small>(ถ้าหลายวัน)</small></label><input id="ev3" name="endDate" type="date" value="${v.endDate || v.date}"></div>
        </div>
        <div class="row2">
          <div class="field"><label for="ev4">เวลาเริ่ม <small>(เว้นว่าง = ทั้งวัน)</small></label><input id="ev4" name="timeStart" type="time" value="${v.timeStart}"></div>
          <div class="field"><label for="ev5">เวลาสิ้นสุด</label><input id="ev5" name="timeEnd" type="time" value="${v.timeEnd}"></div>
        </div>
        <div class="field"><label for="ev6">สถานที่</label><input id="ev6" name="location" maxlength="150" value="${esc(v.location)}" placeholder="เช่น ห้องสภานักเรียน, หอประชุม"></div>
        <div class="field"><label for="ev7">รายละเอียด</label><textarea id="ev7" name="detail" maxlength="1000" placeholder="สิ่งที่ต้องเตรียม ผู้รับผิดชอบ การแต่งกาย ฯลฯ">${esc(v.detail)}</textarea></div>
        <div class="recorder-note">ผู้บันทึก: <b>${esc(SC.state.session.name)}</b></div>
        <p class="err"></p>
        <div class="dlg-actions"><button type="button" class="btn btn-ghost" data-close>ยกเลิก</button><button type="submit" class="btn btn-gold">${ev ? 'บันทึกการแก้ไข' : 'เพิ่มงาน'}</button></div>
      </form>`, 'dlg-wide');
    const f = $('#fEvent');
    f.date.addEventListener('change', () => { if (!f.endDate.value || f.endDate.value < f.date.value) f.endDate.value = f.date.value; });
    f.onsubmit = (e) => {
      e.preventDefault();
      submitting(f, async () => {
        if (f.endDate.value && f.endDate.value < f.date.value) throw new Error('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');
        if (f.timeStart.value && f.timeEnd.value && f.timeEnd.value < f.timeStart.value) throw new Error('เวลาสิ้นสุดต้องไม่ก่อนเวลาเริ่ม');
        await SC.authed({
          action: 'saveEvent', id: ev ? ev.id : '', title: f.evTitle.value, category: f.category.value,
          date: f.date.value, endDate: f.endDate.value || f.date.value, timeStart: f.timeStart.value, timeEnd: f.timeEnd.value,
          location: f.location.value, detail: f.detail.value,
        });
        SC.dialog.close();
        toast(ev ? 'แก้ไขงานแล้ว' : 'เพิ่มงานในปฏิทินแล้ว');
        cs.sel = f.date.value;
        const d = parse(cs.sel);
        cs.month = new Date(d.getFullYear(), d.getMonth(), 1);
        await load();
        render();
      });
    };
  }

  /* ============ โหมดทดลอง ============ */
  const ext = SC.demoExt;
  function demoEvents(db) {
    if (db.cal) return db.cal;
    const d = (n) => addDays(today(), n);
    const pres = 'นายภูมิพัฒน์ ศรีสุข', teacher = 'ผู้ดูแลระบบ';
    const mk = (n, title, category, timeStart, timeEnd, location, detail, by, len = 0) =>
      ({ id: SC.uid(), title, category, date: d(n), endDate: d(n + len), timeStart, timeEnd, location, detail, createdByName: by, status: 'active' });
    db.cal = [
      mk(0, 'ประชุมคณะกรรมการสภานักเรียน', 'meeting', '15:30', '16:30', 'ห้องสภานักเรียน', 'สรุปผลงานเดือนที่ผ่านมา และวางแผนกิจกรรมเดือนหน้า', pres),
      mk(2, 'ตรวจความเรียบร้อยการแต่งกายหน้าเสาธง', 'work', '07:30', '08:00', 'ลานหน้าเสาธง', 'กรรมการทุกฝ่ายพร้อมกันเวลา 07:20 น.', teacher),
      mk(9, 'กิจกรรมรณรงค์ลดขยะในโรงเรียน', 'activity', '', '', 'ทั่วบริเวณโรงเรียน', 'ฝ่ายประชาสัมพันธ์เตรียมป้ายรณรงค์ ฝ่ายสถานที่เตรียมถุงขยะ', pres),
      mk(14, 'ประชุมประจำเดือนกับครูที่ปรึกษา', 'meeting', '12:10', '12:50', 'ห้องกิจการนักเรียน', '', teacher),
      mk(20, 'ค่ายพัฒนาผู้นำนักเรียน', 'activity', '08:00', '16:00', 'หอประชุมโรงเรียน', 'ค่าย 2 วัน แต่งกายชุดพละ นำกระติกน้ำมาด้วย', teacher, 1),
      mk(-5, 'เลือกตั้งหัวหน้าห้อง', 'special', '', '', 'ทุกห้องเรียน', 'สภานักเรียนเป็นกรรมการกลางดูแลการเลือกตั้ง', pres),
    ];
    return db.cal;
  }
  ext.events = (db) => JSON.parse(JSON.stringify(demoEvents(db).filter(e => e.status !== 'deleted')));
  ext.saveEvent = (db, b, sess) => {
    const u = sess('calendar'), list = demoEvents(db);
    if (!String(b.title || '').trim()) throw new Error('กรุณาระบุชื่องาน');
    if (!b.date || (b.endDate && b.endDate < b.date)) throw new Error('วันที่ไม่ถูกต้อง');
    const v = { title: b.title.trim(), category: b.category in KINDS && b.category !== 'duty' ? b.category : 'other', date: b.date, endDate: b.endDate || b.date,
      timeStart: b.timeStart || '', timeEnd: b.timeEnd || '', location: String(b.location || '').trim(), detail: String(b.detail || '').trim(), updatedByName: u.name };
    if (b.id) { Object.assign(list.find(e => e.id === b.id), v); return { id: b.id }; }
    const id = SC.uid();
    list.push({ id, ...v, status: 'active', createdByName: u.name });
    return { id };
  };
  ext.deleteEvent = (db, b, sess) => { sess('calendar'); demoEvents(db).find(e => e.id === b.id).status = 'deleted'; return true; };
})();
