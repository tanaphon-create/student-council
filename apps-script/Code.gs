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

// ID ของ Google Sheet ที่เก็บข้อมูล (เว้นว่างถ้าสคริปต์ผูกกับชีตอยู่แล้ว)
const SPREADSHEET_ID = '';
const ss_ = () => SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActive();

const SHEET_TX = 'Transactions';
const SHEET_USERS = 'Users';
const SESSION_SECONDS = 6 * 60 * 60;
const MAX_FAILED_LOGINS = 5;
const LOCK_SECONDS = 10 * 60;

const SHEET_MEMBERS = 'Members';
const SHEET_DUTIES = 'Duties';
const SHEET_ATT = 'Attendance';
const SHEET_EVENTS = 'Events';
const SHEET_POLLS = 'Polls';
const SHEET_VOTES = 'Votes';
const SHEET_VOTERS = 'Voters';
const SHEET_CODES = 'VoteCodes';
const SHEET_FEEDBACK = 'Feedback';
const SHEET_PHOTOS = 'Photos';
const SHEET_ADVISORS = 'Advisors';

const TX_HEADERS = ['id', 'no', 'date', 'type', 'amount', 'source', 'detail',
  'recorderUsername', 'recorderName', 'createdAt', 'status', 'voidReason', 'voidByName', 'voidAt'];
// perms: สิทธิ์คั่นด้วยจุลภาค finance = บันทึกบัญชี, attendance = หัวหน้าเช็คชื่อ,
// calendar = บันทึกปฏิทินงาน (ประธานนักเรียน/ครู), feedback = ตอบรับความคิดเห็น — admin ได้ทุกสิทธิ์
const USER_HEADERS = ['username', 'name', 'position', 'role', 'salt', 'hash', 'active', 'createdAt', 'perms'];
const MEMBER_HEADERS = ['id', 'name', 'classroom', 'position', 'active', 'createdAt', 'studentId'];
const DUTY_HEADERS = ['id', 'title', 'detail', 'startDate', 'endDate', 'days', 'timeStart', 'timeEnd',
  'mode', 'memberIds', 'status', 'createdByName', 'createdAt', 'updatedAt'];
const ATT_HEADERS = ['dutyId', 'date', 'memberId', 'status', 'note', 'checkedByName', 'checkedAt'];
const ATT_STATUSES = ['present', 'late', 'leave', 'absent'];
const EVENT_HEADERS = ['id', 'title', 'detail', 'date', 'endDate', 'timeStart', 'timeEnd', 'location', 'category',
  'status', 'createdByName', 'createdAt', 'updatedByName', 'updatedAt'];
const EVENT_CATEGORIES = ['meeting', 'activity', 'work', 'special', 'other'];
// voterMode: device = ทุกคน 1 ครั้งต่อเครื่อง, member = สมาชิกสภายืนยันด้วยเลขประจำตัว, code = รหัสโหวตใช้ครั้งเดียว
// showResults: live = เห็นผลระหว่างโหวต, closed = เห็นผลเมื่อปิดโหวต · status: draft | open | closed | deleted
const POLL_HEADERS = ['id', 'title', 'detail', 'options', 'maxChoices', 'voterMode', 'showResults', 'status', 'closeAt',
  'createdByName', 'createdAt', 'updatedAt'];
const POLL_MODES = ['device', 'member', 'code'];
// ผลโหวต (Votes) กับรายชื่อผู้ที่โหวตแล้ว (Voters) แยกชีตกัน จึงไม่ผูกว่าใครเลือกอะไร
const VOTE_HEADERS = ['pollId', 'choices', 'votedDate'];
const VOTER_HEADERS = ['pollId', 'voterKey', 'votedAt'];
const CODE_HEADERS = ['pollId', 'code', 'used', 'usedAt', 'createdAt'];
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
// รับฟังความคิดเห็น: ชื่อ/ชั้น/ช่องทางติดต่อของผู้ส่ง เห็นเฉพาะผู้มีสิทธิ์ feedback ไม่แสดงสาธารณะ
const FEEDBACK_HEADERS = ['id', 'code', 'category', 'subject', 'detail', 'name', 'classroom', 'contact', 'status',
  'reply', 'repliedByName', 'repliedAt', 'public', 'createdAt', 'updatedAt'];
const FEEDBACK_CATEGORIES = ['suggest', 'complain', 'praise', 'question', 'other'];
const FEEDBACK_STATUSES = ['new', 'progress', 'done', 'rejected'];
const FEEDBACK_PER_HOUR = 5;
// รูปกรรมการ: เว็บย่อเป็นรูปจัตุรัสเล็กแล้วส่งมาเป็น data URL เก็บในชีต (ช่องละไม่เกิน 50,000 ตัวอักษร)
const PHOTO_HEADERS = ['memberId', 'data', 'updatedByName', 'updatedAt'];
const PHOTO_MAX = 45000;
// ครูที่ปรึกษา: แยกจากรายชื่อนักเรียน (ไม่เข้าระบบเช็คชื่อ) แสดงบนสุดของทำเนียบ
const ADVISOR_HEADERS = ['id', 'name', 'position', 'sort', 'active', 'updatedByName', 'updatedAt'];

/* ---------- ติดตั้งครั้งแรก (รันซ้ำได้ ไม่ลบข้อมูลเดิม) ---------- */
function setup() {
  // โค้ดนี้เผยแพร่สาธารณะ จึงห้ามติดตั้งด้วยรหัสตัวอย่าง
  if (ADMIN_INITIAL_PASSWORD === 'ChangeMe-2569' || ADMIN_INITIAL_PASSWORD.length < 8) {
    throw new Error('กรุณาแก้ ADMIN_INITIAL_PASSWORD เป็นรหัสของคุณเอง (อย่างน้อย 8 ตัว) ก่อนรัน setup');
  }
  const ss = ss_();
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
  ensure(SHEET_POLLS, POLL_HEADERS, true);
  ensure(SHEET_VOTES, VOTE_HEADERS, true);
  ensure(SHEET_VOTERS, VOTER_HEADERS, true);
  ensure(SHEET_CODES, CODE_HEADERS, true);
  ensure(SHEET_FEEDBACK, FEEDBACK_HEADERS, true);
  ensure(SHEET_PHOTOS, PHOTO_HEADERS, true);
  ensure(SHEET_ADVISORS, ADVISOR_HEADERS, true);
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
    if (action === 'polls') return json_({ ok: true, data: listPolls_(false) });
    if (action === 'feedback') return json_({ ok: true, data: publicFeedback_() });
    if (action === 'photos') return json_({ ok: true, data: listPhotos_() });
    if (action === 'advisors') return json_({ ok: true, data: listAdvisors_() });
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
      vote: vote_, adminPolls: adminPolls_, savePoll: savePoll_, setPollStatus: setPollStatus_, deletePoll: deletePoll_,
      genVoteCodes: genVoteCodes_, listVoteCodes: listVoteCodes_,
      setMemberPhoto: setMemberPhoto_, saveAdvisor: saveAdvisor_, deleteAdvisor: deleteAdvisor_,
      submitFeedback: submitFeedback_, trackFeedback: trackFeedback_, listFeedback: listFeedback_, updateFeedback: updateFeedback_,
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
  if (u.role === 'admin') return ['finance', 'attendance', 'calendar', 'feedback'];
  const p = String(u.perms || '').trim();
  return p ? p.split(',').filter(x => x) : ['finance'];
}

function hasPerm_(u, need) {
  if (u.role === 'admin') return true;
  return need !== 'admin' && permsOf_(u).indexOf(need) >= 0;
}

function cleanPerms_(perms) {
  const list = (Array.isArray(perms) ? perms : []).filter(p => ['finance', 'attendance', 'calendar', 'feedback'].indexOf(p) >= 0);
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
  const s = ss_().getSheetByName(name);
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

/* ---------- โหวต / สำรวจความเห็น ---------- */
const nowLocal_ = () => Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm");

function pollOut_(p) {
  let options = [];
  try { options = JSON.parse(str_(p.options) || '[]'); } catch (_) { /* ข้อมูลเสีย */ }
  let status = str_(p.status) || 'draft';
  const closeAt = str_(p.closeAt);
  if (status === 'open' && closeAt && nowLocal_() >= closeAt) status = 'closed'; // ปิดอัตโนมัติเมื่อถึงเวลา
  return {
    id: str_(p.id), title: str_(p.title), detail: str_(p.detail), options, maxChoices: Number(p.maxChoices) || 1,
    voterMode: POLL_MODES.indexOf(str_(p.voterMode)) >= 0 ? str_(p.voterMode) : 'device',
    showResults: str_(p.showResults) === 'closed' ? 'closed' : 'live', status, closeAt,
    createdByName: str_(p.createdByName), createdAt: str_(p.createdAt),
  };
}

// admin = true คืนทุกโพลพร้อมผลเสมอ, false = เฉพาะโพลที่เปิด/ปิดแล้ว และซ่อนผลตามที่ตั้งไว้
function listPolls_(admin) {
  const polls = readRows_(SHEET_POLLS, POLL_HEADERS).map(pollOut_)
    .filter(p => p.status !== 'deleted' && (admin || p.status !== 'draft'));
  const counts = {}, voters = {};
  readRows_(SHEET_VOTES, VOTE_HEADERS).forEach(v => {
    const id = str_(v.pollId);
    counts[id] = counts[id] || {};
    voters[id] = (voters[id] || 0) + 1;
    str_(v.choices).split(',').filter(x => x !== '').forEach(i => { counts[id][i] = (counts[id][i] || 0) + 1; });
  });
  let codes = {};
  if (admin) {
    readRows_(SHEET_CODES, CODE_HEADERS).forEach(c => {
      const id = str_(c.pollId);
      codes[id] = codes[id] || { total: 0, used: 0 };
      codes[id].total++;
      if (str_(c.used) === 'true') codes[id].used++;
    });
  }
  return polls.map(p => {
    const visible = admin || p.showResults === 'live' || p.status === 'closed';
    const c = counts[p.id] || {};
    return Object.assign(p, {
      voters: voters[p.id] || 0,
      counts: visible ? p.options.map((_, i) => c[i] || 0) : null,
      codes: admin ? (codes[p.id] || { total: 0, used: 0 }) : undefined,
    });
  });
}

function adminPolls_(b) {
  requireSession_(b.token, 'admin');
  return listPolls_(true);
}

function findPoll_(id) {
  const p = readRows_(SHEET_POLLS, POLL_HEADERS).map(pollOut_).filter(x => x.id === String(id) && x.status !== 'deleted')[0];
  if (!p) throw new Error('ไม่พบโพลนี้');
  return p;
}

function vote_(b) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const poll = findPoll_(b.pollId);
    if (poll.status !== 'open') throw new Error(poll.status === 'closed' ? 'โพลนี้ปิดโหวตแล้ว' : 'โพลนี้ยังไม่เปิดโหวต');
    const picks = (Array.isArray(b.choices) ? b.choices : []).map(Number);
    if (!picks.length) throw new Error('กรุณาเลือกอย่างน้อย 1 ตัวเลือก');
    if (picks.length > poll.maxChoices) throw new Error('เลือกได้ไม่เกิน ' + poll.maxChoices + ' ตัวเลือก');
    if (picks.some(i => !(i >= 0 && i < poll.options.length && Math.floor(i) === i)) || new Set(picks).size !== picks.length) {
      throw new Error('ตัวเลือกไม่ถูกต้อง');
    }

    let key, codeRow = 0;
    if (poll.voterMode === 'member') {
      const sid = String(b.studentId || '').trim();
      const m = sid && readRows_(SHEET_MEMBERS, MEMBER_HEADERS).filter(x => str_(x.studentId) === sid && str_(x.active) !== 'false')[0];
      if (!m) throw new Error('ไม่พบเลขประจำตัวนี้ในรายชื่อสมาชิกสภานักเรียน');
      key = 'm:' + str_(m.id);
    } else if (poll.voterMode === 'code') {
      const code = String(b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const rows = readRows_(SHEET_CODES, CODE_HEADERS);
      const i = rows.findIndex(c => str_(c.pollId) === poll.id && str_(c.code) === code);
      if (!code || i < 0) throw new Error('รหัสโหวตไม่ถูกต้อง');
      if (str_(rows[i].used) === 'true') throw new Error('รหัสนี้ถูกใช้โหวตไปแล้ว');
      key = 'c:' + code;
      codeRow = i + 2;
    } else {
      const dev = String(b.deviceId || '');
      if (!/^[A-Za-z0-9-]{8,64}$/.test(dev)) throw new Error('ไม่สามารถระบุเครื่องได้ กรุณาเปิดหน้าเว็บใหม่');
      key = 'd:' + dev;
    }
    const done = readRows_(SHEET_VOTERS, VOTER_HEADERS).some(v => str_(v.pollId) === poll.id && str_(v.voterKey) === key);
    if (done) throw new Error(poll.voterMode === 'member' ? 'เลขประจำตัวนี้โหวตไปแล้ว' : 'โหวตไปแล้ว โหวตซ้ำไม่ได้');

    const now = new Date().toISOString();
    if (codeRow) sheet_(SHEET_CODES).getRange(codeRow, CODE_HEADERS.indexOf('used') + 1, 1, 2).setValues([['true', now]]);
    sheet_(SHEET_VOTERS).appendRow([poll.id, key, now]);
    sheet_(SHEET_VOTES).appendRow([poll.id, picks.sort((x, y) => x - y).join(','), now.slice(0, 10)]);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function savePoll_(b) {
  const user = requireSession_(b.token, 'admin');
  const title = clean_(b.title, 200);
  if (!title) throw new Error('กรุณาระบุหัวข้อโหวต');
  const closeAt = String(b.closeAt || '');
  if (closeAt && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(closeAt)) throw new Error('เวลาปิดโหวตไม่ถูกต้อง');
  const now = new Date().toISOString();
  const values = { title, detail: clean_(b.detail, 2000), closeAt, showResults: b.showResults === 'closed' ? 'closed' : 'live', updatedAt: now };
  const shape = () => {
    const options = (Array.isArray(b.options) ? b.options : []).map(o => clean_(o, 200)).filter(o => o);
    if (options.length < 2) throw new Error('ต้องมีตัวเลือกอย่างน้อย 2 ตัวเลือก');
    if (options.length > 30) throw new Error('ตัวเลือกได้ไม่เกิน 30 ตัวเลือก');
    if (new Set(options).size !== options.length) throw new Error('มีตัวเลือกซ้ำกัน');
    const maxChoices = Math.min(Math.max(Math.floor(Number(b.maxChoices) || 1), 1), options.length);
    return { options: JSON.stringify(options), maxChoices, voterMode: POLL_MODES.indexOf(b.voterMode) >= 0 ? b.voterMode : 'device' };
  };
  const sheet = sheet_(SHEET_POLLS);
  if (b.id) {
    const row = findRow_(SHEET_POLLS, b.id);
    const hasVotes = readRows_(SHEET_VOTERS, VOTER_HEADERS).some(v => str_(v.pollId) === String(b.id));
    if (!hasVotes) Object.assign(values, shape()); // มีคนโหวตแล้วแก้ตัวเลือกไม่ได้
    const cur = sheet.getRange(row, 1, 1, POLL_HEADERS.length).getValues()[0];
    sheet.getRange(row, 1, 1, POLL_HEADERS.length).setValues([POLL_HEADERS.map((h, i) => h in values ? values[h] : cur[i])]);
    return { id: b.id, locked: hasVotes };
  }
  const id = Utilities.getUuid();
  Object.assign(values, shape(), { id, status: b.open ? 'open' : 'draft', createdByName: user.name, createdAt: now });
  sheet.appendRow(POLL_HEADERS.map(h => values[h]));
  return { id };
}

function setPollStatus_(b) {
  requireSession_(b.token, 'admin');
  const status = b.status === 'open' ? 'open' : 'closed';
  const row = findRow_(SHEET_POLLS, b.id);
  const sheet = sheet_(SHEET_POLLS);
  sheet.getRange(row, POLL_HEADERS.indexOf('status') + 1).setValue(status);
  // เปิดใหม่หลังเลยเวลาปิด = ยกเลิกเวลาปิดอัตโนมัติเดิม
  const closeCol = POLL_HEADERS.indexOf('closeAt') + 1;
  if (status === 'open' && str_(sheet.getRange(row, closeCol).getValue()) && nowLocal_() >= str_(sheet.getRange(row, closeCol).getValue())) {
    sheet.getRange(row, closeCol).setValue('');
  }
  return true;
}

function deletePoll_(b) {
  requireSession_(b.token, 'admin');
  const row = findRow_(SHEET_POLLS, b.id);
  sheet_(SHEET_POLLS).getRange(row, POLL_HEADERS.indexOf('status') + 1).setValue('deleted');
  return true;
}

function genVoteCodes_(b) {
  requireSession_(b.token, 'admin');
  const poll = findPoll_(b.pollId);
  if (poll.voterMode !== 'code') throw new Error('โพลนี้ไม่ได้ใช้รหัสโหวต');
  const n = Math.floor(Number(b.count));
  if (!(n >= 1 && n <= 1000)) throw new Error('สร้างได้ครั้งละ 1–1000 รหัส');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const taken = {};
    readRows_(SHEET_CODES, CODE_HEADERS).forEach(c => { if (str_(c.pollId) === poll.id) taken[str_(c.code)] = true; });
    const now = new Date().toISOString(), rows = [];
    while (rows.length < n) {
      let code = '';
      for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (taken[code]) continue;
      taken[code] = true;
      rows.push([poll.id, code, 'false', '', now]);
    }
    const sheet = sheet_(SHEET_CODES);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, CODE_HEADERS.length).setValues(rows);
    return { added: rows.length };
  } finally {
    lock.releaseLock();
  }
}

function listVoteCodes_(b) {
  requireSession_(b.token, 'admin');
  return readRows_(SHEET_CODES, CODE_HEADERS).filter(c => str_(c.pollId) === String(b.pollId))
    .map(c => ({ code: str_(c.code), used: str_(c.used) === 'true' }));
}

/* ---------- รูปกรรมการ ---------- */
function listPhotos_() {
  const out = {};
  readRows_(SHEET_PHOTOS, PHOTO_HEADERS).forEach(r => { if (str_(r.data)) out[str_(r.memberId)] = str_(r.data); });
  return out;
}

// data ว่าง = ลบรูป
function setMemberPhoto_(b) {
  const user = requireSession_(b.token, 'attendance');
  // ต้องเป็นสมาชิกหรือครูที่ปรึกษาที่มีอยู่จริง
  try { findRow_(SHEET_MEMBERS, b.memberId); } catch (_) { findRow_(SHEET_ADVISORS, b.memberId); }
  const data = String(b.data || '');
  if (data && (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(data) || data.length > PHOTO_MAX)) {
    throw new Error('ไฟล์รูปไม่ถูกต้องหรือใหญ่เกินไป');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = sheet_(SHEET_PHOTOS);
    const ids = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().map(r => String(r[0]));
    const i = ids.indexOf(String(b.memberId));
    const row = [String(b.memberId), data, user.name, new Date().toISOString()];
    if (i >= 0) sheet.getRange(i + 2, 1, 1, PHOTO_HEADERS.length).setValues([row]);
    else if (data) sheet.appendRow(row);
    return true;
  } finally {
    lock.releaseLock();
  }
}

/* ---------- ครูที่ปรึกษา ---------- */
function listAdvisors_() {
  return readRows_(SHEET_ADVISORS, ADVISOR_HEADERS).filter(a => str_(a.active) !== 'false')
    .map(a => ({ id: str_(a.id), name: str_(a.name), position: str_(a.position), sort: Number(a.sort) || 0 }))
    .sort((x, y) => x.sort - y.sort || x.name.localeCompare(y.name));
}

function saveAdvisor_(b) {
  const user = requireSession_(b.token, 'attendance');
  const name = clean_(b.name, 100);
  if (!name) throw new Error('กรุณาระบุชื่อครู');
  const v = { name, position: clean_(b.position, 100) || 'ครูที่ปรึกษา', sort: Math.floor(Number(b.sort) || 0), active: 'true',
    updatedByName: user.name, updatedAt: new Date().toISOString() };
  const sheet = sheet_(SHEET_ADVISORS);
  if (b.id) {
    const row = findRow_(SHEET_ADVISORS, b.id);
    sheet.getRange(row, 1, 1, ADVISOR_HEADERS.length).setValues([ADVISOR_HEADERS.map(h => h === 'id' ? String(b.id) : v[h])]);
    return { id: b.id };
  }
  const id = Utilities.getUuid();
  sheet.appendRow(ADVISOR_HEADERS.map(h => h === 'id' ? id : v[h]));
  return { id };
}

function deleteAdvisor_(b) {
  requireSession_(b.token, 'attendance');
  const row = findRow_(SHEET_ADVISORS, b.id);
  sheet_(SHEET_ADVISORS).getRange(row, ADVISOR_HEADERS.indexOf('active') + 1).setValue('false');
  return true;
}

/* ---------- รับฟังความคิดเห็น ---------- */
function feedbackOut_(f, full) {
  const o = {
    id: str_(f.id), category: FEEDBACK_CATEGORIES.indexOf(str_(f.category)) >= 0 ? str_(f.category) : 'other',
    subject: str_(f.subject), detail: str_(f.detail), status: str_(f.status) || 'new', reply: str_(f.reply),
    repliedAt: str_(f.repliedAt), createdAt: str_(f.createdAt), public: str_(f.public) === 'true',
  };
  if (full) {
    Object.assign(o, { code: str_(f.code), name: str_(f.name), classroom: str_(f.classroom), contact: str_(f.contact),
      repliedByName: str_(f.repliedByName), updatedAt: str_(f.updatedAt) });
  }
  return o;
}

// เรื่องที่ผู้มีสิทธิ์เลือกเผยแพร่ (ไม่มีข้อมูลผู้ส่ง) + สถิติรวมเพื่อความโปร่งใส
function publicFeedback_() {
  const rows = readRows_(SHEET_FEEDBACK, FEEDBACK_HEADERS);
  const stats = { total: rows.length, new: 0, progress: 0, done: 0, rejected: 0 };
  rows.forEach(f => { const st = str_(f.status) || 'new'; if (st in stats) stats[st]++; });
  const items = rows.filter(f => str_(f.public) === 'true').map(f => feedbackOut_(f, false))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { stats, items };
}

function submitFeedback_(b) {
  if (b.website) throw new Error('ส่งไม่สำเร็จ'); // ช่องดักบอต
  const subject = clean_(b.subject, 150), detail = clean_(b.detail, 3000);
  if (!subject) throw new Error('กรุณาระบุหัวข้อ');
  if (detail.length < 5) throw new Error('กรุณาเขียนรายละเอียด');
  const dev = String(b.deviceId || '');
  if (!/^[A-Za-z0-9-]{8,64}$/.test(dev)) throw new Error('ไม่สามารถระบุเครื่องได้ กรุณาเปิดหน้าเว็บใหม่');
  const cache = CacheService.getScriptCache(), ck = 'fb_' + dev;
  const sent = Number(cache.get(ck) || 0);
  if (sent >= FEEDBACK_PER_HOUR) throw new Error('ส่งได้ไม่เกิน ' + FEEDBACK_PER_HOUR + ' เรื่องต่อชั่วโมง กรุณาลองใหม่ภายหลัง');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const taken = {};
    readRows_(SHEET_FEEDBACK, FEEDBACK_HEADERS).forEach(f => { taken[str_(f.code)] = true; });
    let code;
    do {
      code = 'FB-';
      for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    } while (taken[code]);
    const now = new Date().toISOString();
    const v = {
      id: Utilities.getUuid(), code, category: FEEDBACK_CATEGORIES.indexOf(b.category) >= 0 ? b.category : 'other',
      subject, detail, name: clean_(b.name, 100), classroom: clean_(b.classroom, 30), contact: clean_(b.contact, 150),
      status: 'new', reply: '', repliedByName: '', repliedAt: '', public: 'false', createdAt: now, updatedAt: now,
    };
    sheet_(SHEET_FEEDBACK).appendRow(FEEDBACK_HEADERS.map(h => v[h]));
    cache.put(ck, String(sent + 1), 3600);
    return { code };
  } finally {
    lock.releaseLock();
  }
}

// ผู้ส่งใช้รหัสติดตามดูสถานะและคำตอบ
function trackFeedback_(b) {
  const codes = (Array.isArray(b.codes) ? b.codes : [b.code]).slice(0, 30)
    .map(c => String(c || '').toUpperCase().replace(/[^A-Z0-9-]/g, '')).filter(c => c);
  if (!codes.length) throw new Error('กรุณาใส่รหัสติดตามเรื่อง');
  const rows = readRows_(SHEET_FEEDBACK, FEEDBACK_HEADERS).filter(f => codes.indexOf(str_(f.code)) >= 0);
  if (!rows.length && !Array.isArray(b.codes)) throw new Error('ไม่พบรหัสติดตามเรื่องนี้');
  return rows.map(f => Object.assign(feedbackOut_(f, false), { code: str_(f.code) }));
}

function listFeedback_(b) {
  requireSession_(b.token, 'feedback');
  return readRows_(SHEET_FEEDBACK, FEEDBACK_HEADERS).map(f => feedbackOut_(f, true))
    .sort((x, y) => y.createdAt.localeCompare(x.createdAt));
}

function updateFeedback_(b) {
  const user = requireSession_(b.token, 'feedback');
  const row = findRow_(SHEET_FEEDBACK, b.id);
  const sheet = sheet_(SHEET_FEEDBACK);
  const vals = sheet.getRange(row, 1, 1, FEEDBACK_HEADERS.length).getValues()[0];
  const cur = Object.fromEntries(FEEDBACK_HEADERS.map((h, i) => [h, vals[i]]));
  const reply = clean_(b.reply, 3000);
  const now = new Date().toISOString();
  const v = {
    status: FEEDBACK_STATUSES.indexOf(b.status) >= 0 ? b.status : str_(cur.status) || 'new',
    public: b.public === true ? 'true' : 'false', updatedAt: now, reply,
  };
  if (reply !== str_(cur.reply)) Object.assign(v, { repliedByName: reply ? user.name : '', repliedAt: reply ? now : '' });
  sheet.getRange(row, 1, 1, FEEDBACK_HEADERS.length).setValues([FEEDBACK_HEADERS.map(h => h in v ? v[h] : cur[h])]);
  return true;
}

/* ---------- กู้รหัสผู้ดูแล ---------- */
// ลืมรหัส admin: แก้ ADMIN_INITIAL_PASSWORD ด้านบน บันทึก แล้วรันฟังก์ชันนี้ (ปลดล็อกการใส่รหัสผิดด้วย)
function resetAdminPassword() {
  if (ADMIN_INITIAL_PASSWORD === 'ChangeMe-2569' || ADMIN_INITIAL_PASSWORD.length < 8) {
    throw new Error('กรุณาแก้ ADMIN_INITIAL_PASSWORD เป็นรหัสของคุณเอง (อย่างน้อย 8 ตัว) ก่อน');
  }
  const found = findUser_(ADMIN_USERNAME);
  if (!found) throw new Error('ไม่พบผู้ใช้ ' + ADMIN_USERNAME + ' กรุณารัน setup');
  setPassword_(found.row, ADMIN_INITIAL_PASSWORD);
  sheet_(SHEET_USERS).getRange(found.row, USER_HEADERS.indexOf('active') + 1).setValue(true);
  CacheService.getScriptCache().remove('fail_' + ADMIN_USERNAME);
  Logger.log('ตั้งรหัสผ่านของ ' + ADMIN_USERNAME + ' ใหม่เรียบร้อย');
}
