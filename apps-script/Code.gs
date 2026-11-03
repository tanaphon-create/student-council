/**
 * ระบบบัญชีสภานักเรียน โรงเรียนวังจันทร์วิทยา — ส่วนหลังบ้าน (Google Apps Script + Google Sheets)
 *
 * วิธีติดตั้ง (ดูละเอียดใน README.md):
 *   1) สร้าง Google Sheet ใหม่ > ส่วนขยาย > Apps Script > วางโค้ดนี้ทั้งหมด
 *   2) แก้ ADMIN_INITIAL_PASSWORD ด้านล่าง แล้วกดรันฟังก์ชัน setup หนึ่งครั้ง
 *   3) ทำให้ใช้งานได้ > การทำให้ใช้งานได้รายการใหม่ > เว็บแอป
 *      ดำเนินการในฐานะ: ฉัน / ผู้มีสิทธิ์เข้าถึง: ทุกคน  แล้วนำ URL ไปใส่ใน config.js
 */

const ADMIN_USERNAME = 'admin';
const ADMIN_NAME = 'ผู้ดูแลระบบ';
const ADMIN_INITIAL_PASSWORD = 'ChangeMe-2569'; // แก้ก่อนรัน setup และเปลี่ยนอีกครั้งบนหน้าเว็บ

const SHEET_TX = 'Transactions';
const SHEET_USERS = 'Users';
const SESSION_SECONDS = 6 * 60 * 60;
const MAX_FAILED_LOGINS = 5;
const LOCK_SECONDS = 10 * 60;

const SHEET_MEMBERS = 'Members';
const SHEET_DUTIES = 'Duties';
const SHEET_ATT = 'Attendance';
const SHEET_EVENTS = 'Events';

const TX_HEADERS = ['id', 'no', 'date', 'type', 'amount', 'source', 'detail',
  'recorderUsername', 'recorderName', 'createdAt', 'status', 'voidReason', 'voidByName', 'voidAt'];
// perms: สิทธิ์คั่นด้วยจุลภาค finance = บันทึกบัญชี, attendance = หัวหน้าเช็คชื่อ,
// calendar = บันทึกปฏิทินงาน (ประธานนักเรียน/ครู) — admin ได้ทุกสิทธิ์
const USER_HEADERS = ['username', 'name', 'position', 'role', 'salt', 'hash', 'active', 'createdAt', 'perms'];
const MEMBER_HEADERS = ['id', 'name', 'classroom', 'position', 'active', 'createdAt', 'studentId'];
const DUTY_HEADERS = ['id', 'title', 'detail', 'startDate', 'endDate', 'days', 'timeStart', 'timeEnd',
  'mode', 'memberIds', 'status', 'createdByName', 'createdAt', 'updatedAt'];
const ATT_HEADERS = ['dutyId', 'date', 'memberId', 'status', 'note', 'checkedByName', 'checkedAt'];
const ATT_STATUSES = ['present', 'late', 'leave', 'absent'];
const EVENT_HEADERS = ['id', 'title', 'detail', 'date', 'endDate', 'timeStart', 'timeEnd', 'location', 'category',
  'status', 'createdByName', 'createdAt', 'updatedByName', 'updatedAt'];
const EVENT_CATEGORIES = ['meeting', 'activity', 'work', 'special', 'other'];

/* ---------- ติดตั้งครั้งแรก (รันซ้ำได้ ไม่ลบข้อมูลเดิม) ---------- */
function setup() {
  // โค้ดนี้เผยแพร่สาธารณะ จึงห้ามติดตั้งด้วยรหัสตัวอย่าง
  if (ADMIN_INITIAL_PASSWORD === 'ChangeMe-2569' || ADMIN_INITIAL_PASSWORD.length < 8) {
    throw new Error('กรุณาแก้ ADMIN_INITIAL_PASSWORD เป็นรหัสของคุณเอง (อย่างน้อย 8 ตัว) ก่อนรัน setup');
  }
  const ss = SpreadsheetApp.getActive();
  const ensure = (name, headers, plainText) => {
    const s = ss.getSheetByName(name) || ss.insertSheet(name);
    if (plainText) s.getRange('A:Z').setNumberFormat('@'); // กันชีตแปลงวันที่/เวลาเป็นรูปแบบอื่น
    s.getRange(1, 1, 1, headers.length).setValues([headers]);
    s.setFrozenRows(1);
    return s;
  };
  ensure(SHEET_TX, TX_HEADERS);
  const users = ensure(SHEET_USERS, USER_HEADERS);
  ensure(SHEET_MEMBERS, MEMBER_HEADERS, true);
  ensure(SHEET_DUTIES, DUTY_HEADERS, true);
  ensure(SHEET_ATT, ATT_HEADERS, true);
  ensure(SHEET_EVENTS, EVENT_HEADERS, true);
  if (!findUser_(ADMIN_USERNAME)) {
    const salt = Utilities.getUuid();
    users.appendRow([ADMIN_USERNAME, ADMIN_NAME, 'ผู้ดูแลระบบ', 'admin', salt,
      hash_(salt, ADMIN_INITIAL_PASSWORD), true, new Date(), '']);
  }
  Logger.log('ติดตั้งเรียบร้อย ผู้ใช้เริ่มต้น: ' + ADMIN_USERNAME);
}

/* ---------- จุดรับคำขอ ---------- */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'list';
  try {
    if (action === 'list') return json_({ ok: true, data: listTransactions_() });
    if (action === 'duty') return json_({ ok: true, data: getDutyData_() });
    if (action === 'events') return json_({ ok: true, data: listEvents_() });
    return json_({ ok: false, error: 'ไม่รู้จักคำสั่ง' });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const handlers = {
      login: login_, logout: logout_, addTransaction: addTransaction_, voidTransaction: voidTransaction_,
      changePassword: changePassword_, listUsers: listUsers_, addUser: addUser_,
      resetPassword: resetPassword_, setUserActive: setUserActive_, setUserPerms: setUserPerms_,
      saveMember: saveMember_, bulkAddMembers: bulkAddMembers_, setMemberActive: setMemberActive_,
      saveDuty: saveDuty_, deleteDuty: deleteDuty_, saveAttendance: saveAttendance_,
      saveEvent: saveEvent_, deleteEvent: deleteEvent_,
    };
    const fn = handlers[body.action];
    if (!fn) throw new Error('ไม่รู้จักคำสั่ง');
    return json_({ ok: true, data: fn(body) });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

/* ---------- บัญชี ---------- */
function listTransactions_() {
  const rows = readRows_(SHEET_TX, TX_HEADERS);
  return rows.map(r => ({
    id: r.id, no: r.no, date: toIsoDate_(r.date), type: r.type, amount: Number(r.amount),
    source: r.source, detail: r.detail, recorderName: r.recorderName,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : '',
    status: r.status || 'active', voidReason: r.voidReason, voidByName: r.voidByName,
    voidAt: r.voidAt ? new Date(r.voidAt).toISOString() : '',
  }));
}

function balance_() {
  return readRows_(SHEET_TX, TX_HEADERS)
    .filter(r => r.status !== 'void')
    .reduce((s, r) => s + (r.type === 'in' ? 1 : -1) * Number(r.amount), 0);
}

function addTransaction_(b) {
  const user = requireSession_(b.token, 'finance');
  const type = b.type === 'out' ? 'out' : b.type === 'in' ? 'in' : null;
  if (!type) throw new Error('ประเภทรายการไม่ถูกต้อง');
  const amount = Math.round(Number(b.amount) * 100) / 100;
  if (!(amount > 0) || amount > 10000000) throw new Error('จำนวนเงินไม่ถูกต้อง');
  const source = clean_(b.source, 200);
  if (!source) throw new Error(type === 'in' ? 'กรุณาระบุว่าเงินมาจากไหน' : 'กรุณาระบุว่าจ่ายให้ใคร/ใช้ทำอะไร');
  const detail = clean_(b.detail, 1000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date || ''))) throw new Error('วันที่ไม่ถูกต้อง');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (type === 'out' && amount > balance_() + 1e-9) {
      throw new Error('ยอดเงินคงเหลือไม่พอสำหรับการถอน');
    }
    const sheet = sheet_(SHEET_TX);
    const count = Math.max(sheet.getLastRow() - 1, 0);
    const no = (type === 'in' ? 'IN-' : 'OUT-') + String(count + 1).padStart(5, '0');
    const row = {
      id: Utilities.getUuid(), no, date: b.date, type, amount, source, detail,
      recorderUsername: user.username, recorderName: user.name, createdAt: new Date(),
      status: 'active', voidReason: '', voidByName: '', voidAt: '',
    };
    sheet.appendRow(TX_HEADERS.map(h => row[h]));
    sheet.getRange(sheet.getLastRow(), 3).setNumberFormat('@').setValue(b.date);
    return { id: row.id, no };
  } finally {
    lock.releaseLock();
  }
}

function voidTransaction_(b) {
  const user = requireSession_(b.token, true);
  const reason = clean_(b.reason, 300);
  if (!reason) throw new Error('กรุณาระบุเหตุผลการยกเลิก');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = sheet_(SHEET_TX);
    const ids = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues().map(r => r[0]);
    const idx = ids.indexOf(b.id);
    if (idx < 0) throw new Error('ไม่พบรายการ');
    const rowNum = idx + 2;
    const statusCol = TX_HEADERS.indexOf('status') + 1;
    if (sheet.getRange(rowNum, statusCol).getValue() === 'void') throw new Error('รายการนี้ถูกยกเลิกแล้ว');
    sheet.getRange(rowNum, statusCol, 1, 4).setValues([['void', reason, user.name, new Date()]]);
    return true;
  } finally {
    lock.releaseLock();
  }
}

/* ---------- ผู้ใช้และการเข้าสู่ระบบ ---------- */
function login_(b) {
  const username = String(b.username || '').trim().toLowerCase();
  const cache = CacheService.getScriptCache();
  const failKey = 'fail_' + username;
  const fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_FAILED_LOGINS) throw new Error('ใส่รหัสผิดหลายครั้ง กรุณารอ 10 นาทีแล้วลองใหม่');
  const found = findUser_(username);
  if (!found || found.user.active !== true || hash_(found.user.salt, String(b.password || '')) !== found.user.hash) {
    cache.put(failKey, String(fails + 1), LOCK_SECONDS);
    throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }
  cache.remove(failKey);
  const token = Utilities.getUuid() + Utilities.getUuid();
  const profile = { username, name: found.user.name, position: found.user.position, role: found.user.role, perms: permsOf_(found.user) };
  cache.put('s_' + token, JSON.stringify(profile), SESSION_SECONDS);
  return Object.assign({ token }, profile);
}

function logout_(b) {
  CacheService.getScriptCache().remove('s_' + b.token);
  return true;
}

function changePassword_(b) {
  const user = requireSession_(b.token);
  const found = findUser_(user.username);
  if (hash_(found.user.salt, String(b.oldPassword || '')) !== found.user.hash) throw new Error('รหัสผ่านเดิมไม่ถูกต้อง');
  setPassword_(found.row, b.newPassword);
  return true;
}

function listUsers_(b) {
  requireSession_(b.token, true);
  return readRows_(SHEET_USERS, USER_HEADERS).map(u => ({
    username: u.username, name: u.name, position: u.position, role: u.role, active: u.active === true, perms: permsOf_(u),
  }));
}

function addUser_(b) {
  requireSession_(b.token, true);
  const username = String(b.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error('ชื่อผู้ใช้ต้องเป็น a-z, 0-9, . _ - ยาว 3–30 ตัว');
  if (findUser_(username)) throw new Error('มีชื่อผู้ใช้นี้แล้ว');
  const name = clean_(b.name, 100);
  if (!name) throw new Error('กรุณาระบุชื่อ-สกุล');
  checkPassword_(b.password);
  const salt = Utilities.getUuid();
  sheet_(SHEET_USERS).appendRow([username, name, clean_(b.position, 100), b.role === 'admin' ? 'admin' : 'member',
    salt, hash_(salt, b.password), true, new Date(), cleanPerms_(b.perms)]);
  return true;
}

function setUserPerms_(b) {
  const me = requireSession_(b.token, 'admin');
  const found = findUser_(String(b.username || '').toLowerCase());
  if (!found) throw new Error('ไม่พบผู้ใช้');
  const role = b.role === 'admin' ? 'admin' : 'member';
  if (found.user.username === me.username && role !== 'admin') throw new Error('ลดสิทธิ์ผู้ดูแลของตัวเองไม่ได้');
  const s = sheet_(SHEET_USERS);
  s.getRange(found.row, USER_HEADERS.indexOf('role') + 1).setValue(role);
  s.getRange(found.row, USER_HEADERS.indexOf('perms') + 1).setValue(cleanPerms_(b.perms));
  return true;
}

function resetPassword_(b) {
  requireSession_(b.token, true);
  const found = findUser_(String(b.username || '').toLowerCase());
  if (!found) throw new Error('ไม่พบผู้ใช้');
  setPassword_(found.row, b.newPassword);
  return true;
}

function setUserActive_(b) {
  const me = requireSession_(b.token, true);
  const found = findUser_(String(b.username || '').toLowerCase());
  if (!found) throw new Error('ไม่พบผู้ใช้');
  if (found.user.username === me.username) throw new Error('ปิดบัญชีของตัวเองไม่ได้');
  sheet_(SHEET_USERS).getRange(found.row, USER_HEADERS.indexOf('active') + 1).setValue(b.active === true);
  return true;
}

/* ---------- ตัวช่วย ---------- */
// need: true หรือ 'admin' = เฉพาะผู้ดูแล, 'finance' / 'attendance' = ต้องมีสิทธิ์นั้น
function requireSession_(token, need) {
  const raw = token && CacheService.getScriptCache().get('s_' + token);
  if (!raw) throw new Error('SESSION_EXPIRED');
  const user = JSON.parse(raw);
  const found = findUser_(user.username);
  if (!found || found.user.active !== true) throw new Error('บัญชีนี้ถูกปิดใช้งาน');
  const req = need === true ? 'admin' : need;
  if (req && !hasPerm_(found.user, req)) {
    throw new Error(req === 'admin' ? 'เฉพาะผู้ดูแลระบบเท่านั้น' : 'บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้');
  }
  return { username: user.username, name: found.user.name, role: found.user.role };
}

// ผู้ใช้เก่าที่ยังไม่มีคอลัมน์ perms และเป็น member ถือว่าบันทึกบัญชีได้ตามเดิม
function permsOf_(u) {
  if (u.role === 'admin') return ['finance', 'attendance', 'calendar'];
  const p = String(u.perms || '').trim();
  return p ? p.split(',').filter(x => x) : ['finance'];
}

function hasPerm_(u, need) {
  if (u.role === 'admin') return true;
  return need !== 'admin' && permsOf_(u).indexOf(need) >= 0;
}

function cleanPerms_(perms) {
  const list = (Array.isArray(perms) ? perms : []).filter(p => ['finance', 'attendance', 'calendar'].indexOf(p) >= 0);
  return list.length ? list.join(',') : 'none';
}

function setPassword_(rowNum, password) {
  checkPassword_(password);
  const salt = Utilities.getUuid();
  sheet_(SHEET_USERS).getRange(rowNum, USER_HEADERS.indexOf('salt') + 1, 1, 2).setValues([[salt, hash_(salt, password)]]);
}

function checkPassword_(p) {
  if (typeof p !== 'string' || p.length < 6) throw new Error('รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร');
}

function findUser_(username) {
  const rows = readRows_(SHEET_USERS, USER_HEADERS);
  const i = rows.findIndex(u => String(u.username).toLowerCase() === username);
  return i < 0 ? null : { user: rows[i], row: i + 2 };
}

function hash_(salt, password) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + password, Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

// ตัดความยาวและกันข้อความที่ขึ้นต้นด้วย = + - @ ไม่ให้ชีตตีความเป็นสูตร
function clean_(v, max) {
  let s = String(v == null ? '' : v).trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function sheet_(name) {
  const s = SpreadsheetApp.getActive().getSheetByName(name);
  if (!s) throw new Error('ยังไม่ได้รัน setup');
  return s;
}

function readRows_(name, headers) {
  const s = sheet_(name);
  if (s.getLastRow() < 2) return [];
  return s.getRange(2, 1, s.getLastRow() - 1, headers.length).getValues()
    .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}

function toIsoDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- เช็คชื่อปฏิบัติงาน ---------- */
function getDutyData_() {
  const members = readRows_(SHEET_MEMBERS, MEMBER_HEADERS).map(m => ({
    id: str_(m.id), name: str_(m.name), classroom: str_(m.classroom), position: str_(m.position), active: str_(m.active) !== 'false',
    studentId: str_(m.studentId),
  }));
  const duties = readRows_(SHEET_DUTIES, DUTY_HEADERS).filter(d => d.status !== 'deleted').map(dutyOut_);
  const attendance = readRows_(SHEET_ATT, ATT_HEADERS).map(a => ({
    dutyId: str_(a.dutyId), date: str_(a.date), memberId: str_(a.memberId), status: str_(a.status),
    note: str_(a.note), checkedByName: str_(a.checkedByName), checkedAt: str_(a.checkedAt),
  }));
  return { members, duties, attendance };
}

function dutyOut_(d) {
  return {
    id: str_(d.id), title: str_(d.title), detail: str_(d.detail), startDate: str_(d.startDate), endDate: str_(d.endDate),
    days: str_(d.days).split(',').filter(x => x !== '').map(Number), timeStart: str_(d.timeStart), timeEnd: str_(d.timeEnd),
    mode: str_(d.mode) || 'daily', memberIds: str_(d.memberIds).split(',').filter(x => x),
    createdByName: str_(d.createdByName), createdAt: str_(d.createdAt),
  };
}

function saveMember_(b) {
  requireSession_(b.token, 'attendance');
  const m = memberIn_(b);
  checkStudentIds_([m], b.id);
  const sheet = sheet_(SHEET_MEMBERS);
  if (b.id) {
    const row = findRow_(SHEET_MEMBERS, b.id);
    sheet.getRange(row, 2, 1, 3).setValues([[m.name, m.classroom, m.position]]);
    sheet.getRange(row, MEMBER_HEADERS.indexOf('studentId') + 1).setValue(m.studentId);
    return { id: b.id };
  }
  const id = Utilities.getUuid();
  sheet.appendRow([id, m.name, m.classroom, m.position, 'true', new Date().toISOString(), m.studentId]);
  return { id };
}

function bulkAddMembers_(b) {
  requireSession_(b.token, 'attendance');
  const lines = Array.isArray(b.members) ? b.members.slice(0, 300) : [];
  const now = new Date().toISOString();
  const list = lines.map(memberIn_);
  checkStudentIds_(list, '');
  const rows = list.map(m => [Utilities.getUuid(), m.name, m.classroom, m.position, 'true', now, m.studentId]);
  if (!rows.length) throw new Error('ไม่มีรายชื่อที่จะเพิ่ม');
  const sheet = sheet_(SHEET_MEMBERS);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, MEMBER_HEADERS.length).setValues(rows);
  return { added: rows.length };
}

function memberIn_(m) {
  const name = clean_(m.name, 100);
  if (!name) throw new Error('กรุณาระบุชื่อ-สกุล');
  const studentId = String(m.studentId == null ? '' : m.studentId).trim();
  if (!/^[0-9A-Za-z-]{0,15}$/.test(studentId)) throw new Error('เลขประจำตัวนักเรียนไม่ถูกต้อง: ' + studentId);
  return { name, classroom: clean_(m.classroom, 30), position: clean_(m.position, 100), studentId };
}

// เลขประจำตัวต้องไม่ซ้ำกับสมาชิกคนอื่น (เว้นว่างได้)
function checkStudentIds_(list, selfId) {
  const taken = {};
  readRows_(SHEET_MEMBERS, MEMBER_HEADERS).forEach(r => {
    if (str_(r.studentId) && str_(r.id) !== String(selfId || '')) taken[str_(r.studentId)] = str_(r.name);
  });
  list.forEach(m => {
    if (!m.studentId) return;
    if (taken[m.studentId]) throw new Error('เลขประจำตัว ' + m.studentId + ' ซ้ำกับ ' + taken[m.studentId]);
    taken[m.studentId] = m.name;
  });
}

function setMemberActive_(b) {
  requireSession_(b.token, 'attendance');
  const row = findRow_(SHEET_MEMBERS, b.id);
  sheet_(SHEET_MEMBERS).getRange(row, MEMBER_HEADERS.indexOf('active') + 1).setValue(b.active === true ? 'true' : 'false');
  return true;
}

function saveDuty_(b) {
  const user = requireSession_(b.token, 'attendance');
  const title = clean_(b.title, 150);
  if (!title) throw new Error('กรุณาระบุชื่องาน');
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(b.startDate) || !re.test(b.endDate) || b.endDate < b.startDate) throw new Error('ช่วงวันที่ไม่ถูกต้อง');
  if ((new Date(b.endDate) - new Date(b.startDate)) / 864e5 > 400) throw new Error('ช่วงงานยาวเกิน 1 ปี');
  const days = (Array.isArray(b.days) ? b.days : []).map(Number).filter(n => n >= 0 && n <= 6);
  if (!days.length) throw new Error('กรุณาเลือกวันปฏิบัติงานอย่างน้อย 1 วัน');
  const t = /^(\d{2}:\d{2})?$/;
  if (!t.test(b.timeStart || '') || !t.test(b.timeEnd || '')) throw new Error('เวลาไม่ถูกต้อง');
  const memberIds = (Array.isArray(b.memberIds) ? b.memberIds : []).map(String);
  if (!memberIds.length) throw new Error('กรุณาเลือกสมาชิกอย่างน้อย 1 คน');
  const known = readRows_(SHEET_MEMBERS, MEMBER_HEADERS).map(m => str_(m.id));
  if (memberIds.some(id => known.indexOf(id) < 0)) throw new Error('พบรายชื่อสมาชิกที่ไม่มีในระบบ');
  const now = new Date().toISOString();
  const values = {
    title, detail: clean_(b.detail, 1000), startDate: b.startDate, endDate: b.endDate, days: days.join(','),
    timeStart: b.timeStart || '', timeEnd: b.timeEnd || '', mode: b.mode === 'overall' ? 'overall' : 'daily',
    memberIds: memberIds.join(','), status: 'active', updatedAt: now,
  };
  const sheet = sheet_(SHEET_DUTIES);
  if (b.id) {
    const row = findRow_(SHEET_DUTIES, b.id);
    const cur = sheet.getRange(row, 1, 1, DUTY_HEADERS.length).getValues()[0];
    sheet.getRange(row, 1, 1, DUTY_HEADERS.length).setValues([DUTY_HEADERS.map((h, i) => h in values ? values[h] : cur[i])]);
    return { id: b.id };
  }
  const id = Utilities.getUuid();
  Object.assign(values, { id, createdByName: user.name, createdAt: now });
  sheet.appendRow(DUTY_HEADERS.map(h => values[h]));
  return { id };
}

function deleteDuty_(b) {
  requireSession_(b.token, 'attendance');
  const row = findRow_(SHEET_DUTIES, b.id);
  sheet_(SHEET_DUTIES).getRange(row, DUTY_HEADERS.indexOf('status') + 1).setValue('deleted');
  return true;
}

// บันทึกผลเช็คชื่อของงานหนึ่งในวันหนึ่ง (date = 'ALL' สำหรับงานแบบเช็ครวม)
// status ว่าง = ล้างผลเช็คของคนนั้น
function saveAttendance_(b) {
  const user = requireSession_(b.token, 'attendance');
  const duty = readRows_(SHEET_DUTIES, DUTY_HEADERS).map(dutyOut_).filter(d => d.id === b.dutyId)[0];
  if (!duty) throw new Error('ไม่พบงาน');
  const date = String(b.date || '');
  if (duty.mode === 'overall') {
    if (date !== 'ALL') throw new Error('งานนี้เป็นแบบเช็ครวม');
  } else {
    const d = new Date(date + 'T00:00:00');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < duty.startDate || date > duty.endDate || duty.days.indexOf(d.getDay()) < 0) {
      throw new Error('วันที่นี้ไม่อยู่ในตารางปฏิบัติงาน');
    }
  }
  const records = (Array.isArray(b.records) ? b.records : []).filter(r => duty.memberIds.indexOf(String(r.memberId)) >= 0);
  records.forEach(r => {
    if (r.status && ATT_STATUSES.indexOf(r.status) < 0) throw new Error('สถานะไม่ถูกต้อง');
  });
  const touched = records.map(r => String(r.memberId));
  const now = new Date().toISOString();

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = sheet_(SHEET_ATT);
    const n = Math.max(sheet.getLastRow() - 1, 0);
    const old = n ? sheet.getRange(2, 1, n, ATT_HEADERS.length).getValues() : [];
    const kept = old.filter(r => !(String(r[0]) === duty.id && String(r[1]) === date && touched.indexOf(String(r[2])) >= 0));
    const fresh = records.filter(r => r.status).map(r =>
      [duty.id, date, String(r.memberId), r.status, clean_(r.note, 200), user.name, now]);
    const all = kept.concat(fresh);
    if (n) sheet.getRange(2, 1, n, ATT_HEADERS.length).clearContent();
    if (all.length) sheet.getRange(2, 1, all.length, ATT_HEADERS.length).setValues(all);
    return { saved: fresh.length };
  } finally {
    lock.releaseLock();
  }
}

function findRow_(name, id) {
  const s = sheet_(name);
  const ids = s.getLastRow() < 2 ? [] : s.getRange(2, 1, s.getLastRow() - 1, 1).getValues().map(r => String(r[0]));
  const i = ids.indexOf(String(id));
  if (i < 0) throw new Error('ไม่พบข้อมูล');
  return i + 2;
}

function str_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return v == null ? '' : String(v);
}

/* ---------- ปฏิทินการปฏิบัติงาน ---------- */
function listEvents_() {
  return readRows_(SHEET_EVENTS, EVENT_HEADERS).filter(e => e.status !== 'deleted').map(e => ({
    id: str_(e.id), title: str_(e.title), detail: str_(e.detail), date: str_(e.date), endDate: str_(e.endDate) || str_(e.date),
    timeStart: str_(e.timeStart), timeEnd: str_(e.timeEnd), location: str_(e.location), category: str_(e.category) || 'other',
    createdByName: str_(e.createdByName), updatedByName: str_(e.updatedByName),
  }));
}

function saveEvent_(b) {
  const user = requireSession_(b.token, 'calendar');
  const title = clean_(b.title, 150);
  if (!title) throw new Error('กรุณาระบุชื่องาน');
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const endDate = b.endDate || b.date;
  if (!re.test(b.date || '') || !re.test(endDate) || endDate < b.date) throw new Error('วันที่ไม่ถูกต้อง');
  const t = /^(\d{2}:\d{2})?$/;
  if (!t.test(b.timeStart || '') || !t.test(b.timeEnd || '')) throw new Error('เวลาไม่ถูกต้อง');
  const now = new Date().toISOString();
  const values = {
    title, detail: clean_(b.detail, 1000), date: b.date, endDate, timeStart: b.timeStart || '', timeEnd: b.timeEnd || '',
    location: clean_(b.location, 150), category: EVENT_CATEGORIES.indexOf(b.category) >= 0 ? b.category : 'other',
    status: 'active', updatedByName: user.name, updatedAt: now,
  };
  const sheet = sheet_(SHEET_EVENTS);
  if (b.id) {
    const row = findRow_(SHEET_EVENTS, b.id);
    const cur = sheet.getRange(row, 1, 1, EVENT_HEADERS.length).getValues()[0];
    sheet.getRange(row, 1, 1, EVENT_HEADERS.length).setValues([EVENT_HEADERS.map((h, i) => h in values ? values[h] : cur[i])]);
    return { id: b.id };
  }
  const id = Utilities.getUuid();
  Object.assign(values, { id, createdByName: user.name, createdAt: now });
  sheet.appendRow(EVENT_HEADERS.map(h => values[h]));
  return { id };
}

function deleteEvent_(b) {
  requireSession_(b.token, 'calendar');
  const row = findRow_(SHEET_EVENTS, b.id);
  sheet_(SHEET_EVENTS).getRange(row, EVENT_HEADERS.indexOf('status') + 1).setValue('deleted');
  return true;
}
