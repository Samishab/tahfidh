/* متابعة التحفيظ — واجهة المدير والمعلم وولي الأمر والطالب. البيانات من الخادم (api/index.php). */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GRADES = ['ممتاز', 'جيد جداً', 'جيد', 'مقبول', 'إعادة'];
const gcls = g => 'g-' + g.replace(' ', '-');
const ROLE_AR = { admin: 'مدير', teacher: 'معلم', parent: 'ولي أمر', student: 'طالب' };

/* ---------- الاتصال بالخادم ---------- */
async function api(route, body, qs = '') {
  let r;
  try {
    r = await fetch(`api/index.php?r=${route}${qs}`, {
      method: body ? 'POST' : 'GET', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Tahfidh': '1' }, body: body ? JSON.stringify(body) : undefined
    });
  } catch { throw new Error('تعذر الاتصال بالخادم، تحقق من الإنترنت'); }
  const j = await r.json().catch(() => ({ error: 'خطأ غير متوقع' }));
  if (r.status === 401 && route !== 'login') { db.me = null; render(); }
  if (!r.ok) throw new Error(j.error || 'حدث خطأ');
  return j;
}

/* ---------- البيانات ---------- */
const blank = () => ({ me: null, school: null, schools: [], users: [], students: [], records: [], messages: [], reads: {} });
let db = blank();
const refresh = async () => { db = Object.assign(blank(), await api('bootstrap')); };
const role = () => db.me.role;
const isAdmin = () => role() === 'admin';
const staff = () => role() === 'admin' || role() === 'teacher';
const brand = () => db.school || { name: 'متابعة التحفيظ', logo: '' };
const student = id => db.students.find(s => s.id === +id);
const userById = id => db.users.find(u => u.id === +id);
const schoolName = id => (db.schools.find(s => s.id === id) || {}).name || '';

/* ---------- التاريخ (الأسبوع يبدأ السبت) ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const weekStart = d => addDays(d, -((d.getDay() + 1) % 7));
const L = 'ar-u-nu-latn';
const fmtDay = d => d.toLocaleDateString(L, { weekday: 'long' });
const fmtG = d => d.toLocaleDateString(L, { day: 'numeric', month: 'long', year: 'numeric' });
const fmtS = d => d.toLocaleDateString(L, { day: 'numeric', month: 'short' });
const fmtH = d => d.toLocaleDateString('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtT = s => new Date(s).toLocaleString(L, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const today = () => ymd(new Date());

/* ---------- الحالة ---------- */
const st = { view: 'home', ready: false, sid: null, mode: 'week', off: 0, q: '', form: null, thread: null, draft: '', mt: 'schools', tmpLogo: null };

const ayahs = r => r.to - r.from + 1;
const inRange = (a, b) => db.records.filter(r => r.date >= a && r.date <= b);
function agg(recs) {
  const o = { h: 0, r: 0, n: recs.length, days: new Set(), students: new Set() };
  recs.forEach(r => { r.type === 'hifz' ? o.h += ayahs(r) : o.r += ayahs(r); o.days.add(r.date); o.students.add(r.studentId); });
  return o;
}
function lastOf(sid, type) {
  return db.records.filter(r => r.studentId === +sid && r.type === type).sort((a, b) => (a.date + String(a.id).padStart(9, '0')).localeCompare(b.date + String(b.id).padStart(9, '0'))).pop();
}
function nextPos(sid, type) {
  const l = lastOf(sid, type);
  if (!l) return { surah: type === 'hifz' ? 78 : 1, from: 1, to: '' };
  if (l.to < Q.count(l.surah)) return { surah: l.surah, from: l.to + 1, to: '' };
  return { surah: Math.min(114, l.surah + 1), from: 1, to: '' };
}
const newForm = (sid, type = 'hifz') => ({ id: null, sid: sid || '', type, date: today(), grade: '', note: '', ...nextPos(sid, type) });
function memorized(sid) {
  const m = new Uint8Array(Q.TOTAL);
  db.records.filter(r => r.studentId === +sid && r.type === 'hifz').forEach(r => {
    for (let i = Q.abs(r.surah, r.from); i <= Q.abs(r.surah, r.to); i++) m[i - 1] = 1;
  });
  return m;
}
const recText = r => `سورة ${Q.name(r.surah)} (${r.from === r.to ? 'آية ' + r.from : 'من آية ' + r.from + ' إلى ' + r.to})`;

/* ---------- الرسائل ---------- */
const msgsOf = sid => db.messages.filter(m => m.studentId === +sid);
const unread = sid => msgsOf(sid).filter(m => m.id > (db.reads[sid] || 0) && m.senderId !== db.me.id).length;
const totalUnread = () => db.students.reduce((n, s) => n + unread(s.id), 0);
function markRead(sid) {
  const ms = msgsOf(sid), last = ms.length ? ms[ms.length - 1].id : 0;
  if (last > (db.reads[sid] || 0)) { db.reads[sid] = last; api('messages_read', { studentId: +sid, lastId: last }).catch(() => { }); updateTabbar(); }
}

/* ---------- أدوات واجهة ---------- */
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2600);
}
function modal(html) {
  const m = $('#modal'); m.innerHTML = `<div class="sheet">${html}</div>`; m.hidden = false;
  m.onclick = e => { if (e.target === m) closeModal(); };
}
const closeModal = () => { $('#modal').hidden = true; $('#modal').innerHTML = ''; };
const logoImg = (c = 'logo') => `<img class="${c}" src="${esc(brand().logo) || 'icon.svg'}" alt="شعار">`;
const initial = n => esc([...String(n).trim()][0] || '؟');
const go = (v, extra = {}) => { Object.assign(st, extra, { view: v }); render(); scrollTo(0, 0); };
const empty = (ico, txt) => `<div class="empty"><span class="ico">${ico}</span>${txt}</div>`;
const waNum = p => { const d = String(p || '').replace(/\D/g, ''); return /^05\d{8}$/.test(d) ? '966' + d.slice(1) : d; };
const appUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');

/* ---------- الدخول ---------- */
function renderLogin() {
  $('#app').innerHTML = `
  <div class="auth">
    <div class="brand">${logoImg()}<h1>متابعة التحفيظ</h1><p>سجّل دخولك لمتابعة الحفظ والمراجعة</p></div>
    <div class="card">
      <h3>👋 تسجيل الدخول</h3>
      <form id="login" class="gap">
        <div><label class="f">رقم الجوال / اسم المستخدم</label><input name="username" required autocomplete="username" autocapitalize="off" inputmode="text" autofocus></div>
        <div><label class="f">كلمة المرور</label>
          <div class="pwbox"><input name="pw" id="pw" type="password" required autocomplete="current-password"><button type="button" data-act="showpw">👁</button></div></div>
        <label class="row" style="gap:8px;font-size:14px"><input type="checkbox" name="rem" style="width:auto;flex:none" checked> تذكّر دخولي على هذا الجهاز</label>
        <button class="btn block">دخول</button>
        <p class="hint" style="text-align:center;margin:0">الحسابات تُنشأ من إدارة المدرسة فقط. إذا لم يصلك حساب تواصل مع المعلم.</p>
      </form>
    </div>
    <div class="verse">﴿ وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ فَهَلْ مِن مُّدَّكِرٍ ﴾</div>
  </div>`;
}
function renderForce() {
  $('#app').innerHTML = `
  <div class="auth"><div class="brand">${logoImg()}<h1>مرحباً ${esc(db.me.name)}</h1><p>اختر كلمة مرور جديدة لحسابك قبل المتابعة</p></div>
    <div class="card"><form id="pwform" class="gap" data-force="1">
      <div><label class="f">كلمة المرور الحالية (المؤقتة)</label><input name="old" type="password" required autocomplete="current-password"></div>
      <div><label class="f">كلمة المرور الجديدة (٦ أحرف على الأقل)</label><input name="new" type="password" minlength="6" required autocomplete="new-password"></div>
      <button class="btn block gold">حفظ ومتابعة</button><button type="button" class="btn light block sm" data-act="logout">تسجيل الخروج</button>
    </form></div></div>`;
}
async function logout() { try { await api('logout', {}); } catch { } db = blank(); st.view = 'home'; st.thread = null; st.form = null; render(); }

/* ---------- الإطار ---------- */
const TITLES = {
  home: () => staff() ? ['الرئيسية', ''] : [role() === 'parent' ? 'أبنائي' : 'متابعتي', ''],
  add: () => ['تسجيل تسميع', 'حفظ جديد أو مراجعة'], students: () => ['الطلاب', ''], student: () => ['ملف الطالب', ''],
  stats: () => ['الإحصائيات', 'أسبوعية وشهرية'], messages: () => ['الرسائل', 'ملاحظات واستفسارات'],
  manage: () => ['الإدارة', 'المدارس والحسابات'], account: () => ['حسابي', '']
};
function tabsHtml() {
  const v = st.view, n = totalUnread();
  const on = (...k) => k.includes(v) ? 'on' : '';
  const t = (k, ic, l, key, badge) => `<button class="${on(...key)}" data-act="nav" data-id="${k}"><span>${ic}${badge ? `<em class="bdg">${badge}</em>` : ''}</span>${l}</button>`;
  if (staff()) return `
    ${t('home', '🏠', 'الرئيسية', ['home'])}${t('students', '👥', 'الطلاب', ['students', 'student'])}
    <button class="fab" data-act="nav" data-id="add"><span>＋</span>تسميع</button>
    ${t('messages', '💬', 'الرسائل', ['messages'], n)}${t(isAdmin() ? 'manage' : 'account', '⚙️', isAdmin() ? 'الإدارة' : 'حسابي', ['manage', 'account'])}`;
  return `${t('home', '🏠', role() === 'parent' ? 'أبنائي' : 'متابعتي', ['home', 'student'])}${t('stats', '📊', 'إحصائيات', ['stats'])}
    ${t('messages', '💬', 'الرسائل', ['messages'], n)}${t('account', '👤', 'حسابي', ['account'])}`;
}
function updateTabbar() { const t = $('.tabbar'); if (t) t.innerHTML = tabsHtml(); }
function shell(body) {
  const d = new Date(), [t, sub] = TITLES[st.view]();
  $('#app').innerHTML = `
  <header class="hdr">
    <div class="hdr-row">${logoImg()}<div class="grow"><h1>${esc(brand().name)}</h1><small>${esc(db.me.name)} • ${ROLE_AR[role()]}</small></div>
      <div style="text-align:end;font-size:12.5px;line-height:1.4"><b>${fmtDay(d)}</b><br>${fmtG(d)}<br>${fmtH(d)}</div></div>
    <div class="pagetitle">${t}${sub ? `<small>${sub}</small>` : ''}</div>
  </header>
  <main>${body}</main>
  <nav class="tabbar">${tabsHtml()}</nav>`;
}

/* ---------- عناصر مشتركة ---------- */
function recCard(r, opts = {}) {
  const s = student(r.studentId), d = parse(r.date);
  return `<div class="rec ${r.type === 'review' ? 'review' : ''}">
    <div class="top"><span class="badge ${r.type === 'hifz' ? 'b-hifz' : 'b-rev'}">${r.type === 'hifz' ? '📖 حفظ' : '🔁 مراجعة'}</span>
      ${r.grade ? `<span class="badge ${gcls(r.grade)}">${r.grade}</span>` : ''}
      ${opts.noName || !s ? '' : `<span class="who">${esc(s.name)}</span>`}</div>
    <div class="sn">${recText(r)}</div>
    <div class="meta">${ayahs(r)} آية • ${Q.juzText(r.surah, r.from, r.to)} • ${fmtDay(d)} ${fmtS(d)}</div>
    ${r.note ? `<div class="meta">📝 ${esc(r.note)}</div>` : ''}
    ${staff() ? `<div class="acts"><button class="btn light sm" data-act="edit-rec" data-id="${r.id}">تعديل</button><button class="btn red sm" data-act="del-rec" data-id="${r.id}">حذف</button></div>` : ''}
  </div>`;
}
function progressCard(s) {
  const total = memorized(s.id).reduce((x, y) => x + y, 0), p = total * 100 / Q.TOTAL;
  const ws = weekStart(new Date()), w = agg(inRange(ymd(ws), ymd(addDays(ws, 6))).filter(r => r.studentId === s.id));
  return { total, p, w };
}

/* ---------- الرئيسية (معلم / مدير) ---------- */
function viewHome() {
  if (!staff()) return viewKids();
  const now = new Date(), ws = weekStart(now), a = ymd(ws), b = ymd(addDays(ws, 6));
  const tod = db.records.filter(r => r.date === today());
  const wk = agg(inRange(a, b)), td = agg(tod);
  const absent = db.students.filter(s => !td.students.has(s.id));
  const top = db.students.map(s => ({ s, a: agg(inRange(a, b).filter(r => r.studentId === s.id)) }))
    .filter(x => x.a.n).sort((x, y) => (y.a.h + y.a.r) - (x.a.h + x.a.r)).slice(0, 3);
  const un = totalUnread();
  return `
  <div class="stats">
    <div class="stat"><b>${td.n}</b><span>تسميع اليوم</span></div>
    <div class="stat gold"><b>${wk.h}</b><span>آيات حفظ الأسبوع</span></div>
    <div class="stat blue"><b>${wk.r}</b><span>آيات مراجعة الأسبوع</span></div>
  </div>
  ${un ? `<div class="card" data-act="nav" data-id="messages" style="cursor:pointer"><h3>💬 لديك ${un} رسالة جديدة <span class="more">عرض ›</span></h3></div>` : ''}
  ${!db.students.length ? `<div class="card">${empty('👥', isAdmin() ? 'ابدأ بإنشاء مدرسة ومعلم وطلاب من تبويب الإدارة' : 'لم يُسند إليك طلاب بعد، تواصل مع المدير')}${isAdmin() ? '<button class="btn block" data-act="nav" data-id="manage">⚙️ الذهاب للإدارة</button>' : ''}</div>` : `
  <div class="card"><h3>🌟 الأكثر نشاطاً هذا الأسبوع</h3>
    ${top.length ? `<div class="list">${top.map(({ s, a: x }, i) => `<div class="item" data-act="open-student" data-id="${s.id}"><div class="avatar">${['🥇', '🥈', '🥉'][i]}</div>
      <div class="t"><b>${esc(s.name)}</b><small>حفظ ${x.h} • مراجعة ${x.r} آية</small></div><div class="side"><b>${x.days.size}</b><small>أيام</small></div></div>`).join('')}</div>` : empty('🌱', 'لا يوجد تسميع هذا الأسبوع بعد')}
  </div>
  ${absent.length ? `<div class="card"><h3>⏳ لم يسمّعوا اليوم (${absent.length})</h3><div class="chips">${absent.map(s => `<button class="chip" data-act="quick" data-id="${s.id}">${esc(s.name)}</button>`).join('')}</div><p class="hint">اضغط على الاسم لتسجيل تسميعه</p></div>` : ''}`}
  <div class="card"><h3>📋 تسميع اليوم</h3>
    ${tod.length ? `<div class="list">${tod.map(r => recCard(r)).join('')}</div>` : empty('📖', 'لا يوجد تسميع اليوم')}
  </div>`;
}

/* ---------- الرئيسية (ولي أمر / طالب) ---------- */
function viewKids() {
  if (!db.students.length) return `<div class="card">${empty('🔗', 'لم يُربط أي طالب بحسابك بعد.<br>تواصل مع إدارة الحلقة.')}</div>`;
  if (db.students.length === 1) { st.sid = db.students[0].id; return viewStudent(); }
  return `<div class="list">${db.students.map(s => {
    const { total, p, w } = progressCard(s), un = unread(s.id);
    return `<div class="item" data-act="open-student" data-id="${s.id}"><div class="avatar">${initial(s.name)}</div>
      <div class="t"><b>${esc(s.name)}</b><small>${esc(schoolName(s.school_id))}${s.group ? ' • ' + esc(s.group) : ''}</small>
        <div class="pbar"><i style="width:${Math.max(p, 1)}%"></i></div><small>محفوظ ${total} آية (${p.toFixed(1)}%)</small></div>
      <div class="side"><b>${w.h + w.r}</b><small>آية/أسبوع</small>${un ? `<em class="bdg inl">${un}</em>` : ''}</div></div>`;
  }).join('')}</div>`;
}

/* ---------- تسجيل تسميع ---------- */
function viewAdd() {
  const f = st.form || (st.form = newForm(''));
  if (!db.students.length) return `<div class="card">${empty('👥', 'لا يوجد طلاب لتسجيل التسميع')}</div>`;
  return `
  <div class="card gap">
    <div><label class="f">الطالب</label>
      <select data-f="sid"><option value="">— اختر الطالب —</option>${db.students.map(s => `<option value="${s.id}" ${+f.sid === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
    <div class="seg gold"><button class="${f.type === 'hifz' ? 'on' : ''}" data-act="type" data-id="hifz">📖 حفظ جديد</button><button class="${f.type === 'review' ? 'on' : ''}" data-act="type" data-id="review">🔁 مراجعة</button></div>
    <div><label class="f">تاريخ التسميع</label><input type="date" data-f="date" value="${f.date}" max="${today()}"><div class="hint" id="dayname"></div></div>
    <div><label class="f">السورة</label>
      <select data-f="surah">${SURAHS.map((s, i) => `<option value="${i + 1}" ${+f.surah === i + 1 ? 'selected' : ''}>${i + 1} - ${s[0]} (${s[1]} آية)</option>`).join('')}</select></div>
    <div class="row">
      <div><label class="f">من آية</label><input type="number" inputmode="numeric" data-f="from" value="${f.from}" min="1"></div>
      <div><label class="f">إلى آية</label><input type="number" inputmode="numeric" data-f="to" value="${f.to}" min="1"></div>
    </div>
    <div class="info" id="info"></div>
    <div><label class="f">التقدير <span class="hint">(اختياري)</span></label>
      <div class="chips" id="grades">${GRADES.map(g => `<button type="button" class="chip ${f.grade === g ? 'on' : ''}" data-act="grade" data-id="${g}">${g}</button>`).join('')}</div></div>
    <div><label class="f">ملاحظة <span class="hint">(اختياري - تظهر لولي الأمر)</span></label><textarea data-f="note" maxlength="500" placeholder="أخطاء، توصية، واجب...">${esc(f.note)}</textarea></div>
    <button class="btn block gold" data-act="save-rec">${f.id ? '💾 حفظ التعديل' : '✅ حفظ التسميع'}</button>
    ${f.id ? '<button class="btn light block" data-act="cancel-edit">إلغاء التعديل</button>' : ''}
  </div>`;
}
function checkForm() {
  const f = st.form, s = +f.surah, a = +f.from, b = +f.to, max = Q.count(s);
  if (!f.from || !f.to) return { ok: false, msg: `أدخل رقم الآية — سورة ${Q.name(s)} فيها ${max} آية` };
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 1) return { ok: false, msg: 'أرقام الآيات غير صحيحة' };
  if (b > max || a > max) return { ok: false, msg: `سورة ${Q.name(s)} عدد آياتها ${max} فقط` };
  if (a > b) return { ok: false, msg: 'آية البداية أكبر من آية النهاية' };
  return { ok: true, msg: `${recText({ surah: s, from: a, to: b })} • ${b - a + 1} آية • ${Q.juzText(s, a, b)}` };
}
function updateInfo() {
  const i = $('#info'); if (!i) return;
  const c = checkForm(); i.textContent = c.msg; i.classList.toggle('err', !c.ok && !!(st.form.from || st.form.to));
  const dn = $('#dayname'); if (dn && st.form.date) { const d = parse(st.form.date); dn.textContent = `${fmtDay(d)} • ${fmtG(d)} • ${fmtH(d)}`; }
}
async function saveRec() {
  const f = st.form, c = checkForm();
  if (!f.sid) return toast('اختر الطالب أولاً');
  if (!f.date) return toast('اختر التاريخ');
  if (!c.ok) return toast(c.msg);
  const r = await api('record_save', { id: f.id, studentId: +f.sid, date: f.date, type: f.type, surah: +f.surah, from: +f.from, to: +f.to, grade: f.grade, note: f.note.trim() });
  db.records = db.records.filter(x => x.id !== r.record.id); db.records.push(r.record);
  const was = f.id, sid = f.sid, type = f.type, date = f.date;
  st.form = { ...newForm(sid, type), date };
  toast(was ? 'تم تعديل التسميع ✔' : 'تم حفظ التسميع ✔'); render();
}

/* ---------- الطلاب ---------- */
function viewStudents() {
  const list = db.students.filter(s => s.name.includes(st.q) || (s.group || '').includes(st.q));
  return `
  <div class="card"><div class="row"><input id="q" placeholder="🔍 بحث عن طالب..." value="${esc(st.q)}">${isAdmin() ? '<button class="btn auto" data-act="add-student">＋ طالب</button>' : ''}</div></div>
  ${list.length ? `<div class="list">${list.map(s => {
    const { total, w } = progressCard(s), t = userById(s.teacher_id), un = unread(s.id);
    return `<div class="item" data-act="open-student" data-id="${s.id}"><div class="avatar">${initial(s.name)}</div>
      <div class="t"><b>${esc(s.name)}</b><small>${s.group ? esc(s.group) + ' • ' : ''}محفوظ ${total} آية${isAdmin() && t ? ' • ' + esc(t.name) : ''}</small></div>
      <div class="side"><b>${w.h + w.r}</b><small>آية/أسبوع</small>${un ? `<em class="bdg inl">${un}</em>` : ''}</div></div>`;
  }).join('')}</div>` : `<div class="card">${empty('👥', db.students.length ? 'لا توجد نتائج' : 'لا يوجد طلاب بعد')}</div>`}`;
}
function teacherOptions(school, sel) {
  const ts = db.users.filter(u => u.role === 'teacher' && (!school || u.school_id === +school));
  return `<option value="">— بدون معلم —</option>` + ts.map(t => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
}
function studentForm(s) {
  if (!db.schools.length) return toast('أنشئ مدرسة أولاً من تبويب الإدارة');
  const parents = db.users.filter(u => u.role === 'parent'), su = s && s.user_id ? userById(s.user_id) : null;
  const sch = s ? s.school_id : db.schools[0].id;
  modal(`<h2>${s ? 'تعديل بيانات الطالب' : 'إضافة طالب'}</h2>
  <form id="stform" class="gap" data-id="${s ? s.id : ''}">
    <div><label class="f">اسم الطالب</label><input name="name" required value="${esc(s?.name)}"></div>
    <div><label class="f">المدرسة</label><select name="school" id="st_school">${db.schools.map(x => `<option value="${x.id}" ${x.id === sch ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
    <div><label class="f">المعلم المسؤول</label><select name="teacher" id="st_teacher">${teacherOptions(sch, s?.teacher_id)}</select></div>
    <div><label class="f">المجموعة / الحلقة <span class="hint">(اختياري)</span></label><input name="group" value="${esc(s?.group)}" placeholder="مثال: حلقة الفجر"></div>
    <div><label class="f">أولياء الأمور المرتبطون</label>
      ${parents.length ? `<div class="checks">${parents.map(p => `<label><input type="checkbox" name="par" value="${p.id}" ${s && s.parents.includes(p.id) ? 'checked' : ''}> ${esc(p.name)} <small class="hint">${esc(p.username)}</small></label>`).join('')}</div>` : '<p class="hint">لا يوجد أولياء أمور بعد — أضفهم من تبويب الإدارة ثم عد لربطهم.</p>'}</div>
    <div><label class="f">دخول الطالب بنفسه <span class="hint">(اختياري — اسم مستخدم)</span></label>
      <input name="login" value="${esc(su?.username)}" placeholder="اتركه فارغاً إن لم يكن للطالب حساب" autocapitalize="off">
      ${su ? `<button type="button" class="btn light sm" style="margin-top:8px" data-act="reset-pw" data-id="${su.id}">🔑 إعادة تعيين كلمة مرور الطالب</button>` : ''}</div>
    <button class="btn block">حفظ</button>
    ${s ? `<button type="button" class="btn red block" data-act="del-student" data-id="${s.id}">🗑 حذف الطالب وكل بياناته</button>` : ''}
    <button type="button" class="btn light block" data-act="close">إلغاء</button>
  </form>`);
}
function viewStudent() {
  const s = student(st.sid); if (!s) return staff() ? viewStudents() : viewKids();
  const m = memorized(s.id), total = m.reduce((x, y) => x + y, 0), { w } = progressCard(s);
  const recs = db.records.filter(r => r.studentId === s.id).sort((a, b) => (b.date + String(b.id).padStart(9, '0')).localeCompare(a.date + String(a.id).padStart(9, '0')));
  const juz = Array.from({ length: 30 }, (_, i) => {
    const a = Q.juzAbs[i], e = (Q.juzAbs[i + 1] || Q.TOTAL + 1) - 1; let c = 0;
    for (let k = a; k <= e; k++) c += m[k - 1]; return Math.round(c * 100 / (e - a + 1));
  });
  const lastH = lastOf(s.id, 'hifz'), t = userById(s.teacher_id), un = unread(s.id);
  const back = staff() ? 'students' : (db.students.length > 1 ? 'home' : '');
  return `
  <div class="card">
    <div class="row" style="margin-bottom:12px">${back ? `<button class="btn light sm auto" data-act="nav" data-id="${back}">→ رجوع</button>` : ''}<span></span>
      ${isAdmin() ? `<button class="btn light sm auto" data-act="edit-student" data-id="${s.id}">✏️ تعديل</button>` : ''}</div>
    <div class="item" style="border:0;padding:0;cursor:default"><div class="avatar">${initial(s.name)}</div>
      <div class="t"><b style="font-size:19px">${esc(s.name)}</b><small>${[schoolName(s.school_id), s.group, t ? 'المعلم: ' + t.name : ''].filter(Boolean).map(esc).join(' • ')}</small></div></div>
  </div>
  <div class="stats">
    <div class="stat"><b>${total}</b><span>آية محفوظة</span></div>
    <div class="stat gold"><b>${(total * 100 / Q.TOTAL).toFixed(1)}%</b><span>من القرآن</span></div>
    <div class="stat blue"><b>${w.h + w.r}</b><span>آيات الأسبوع</span></div>
  </div>
  <div class="row" style="margin-bottom:14px">
    ${staff() ? `<button class="btn gold" data-act="quick" data-id="${s.id}">＋ تسميع جديد</button><button class="btn ghost" data-act="report" data-id="${s.id}">📤 تقرير الأسبوع</button>`
      : `<button class="btn gold" data-act="open-thread" data-id="${s.id}">💬 مراسلة المعلم${un ? ` (${un})` : ''}</button>`}
  </div>
  ${staff() ? `<div class="row" style="margin:-4px 0 14px"><button class="btn light" data-act="open-thread" data-id="${s.id}">💬 الرسائل${un ? ` (${un} جديدة)` : ''}</button></div>` : ''}
  <div class="card"><h3>🗺 خريطة الأجزاء</h3>
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">${juz.map((p, i) => `<div style="text-align:center;font-size:12px;border:1.5px solid ${p ? 'var(--g2)' : 'var(--line)'};border-radius:12px;padding:6px 0;background:linear-gradient(to top,${p === 100 ? 'var(--g2)' : 'var(--g3)'} ${p}%,#fff ${p}%);color:${p === 100 ? '#fff' : 'var(--ink)'}"><b>${i + 1}</b><br><small>${p}%</small></div>`).join('')}</div>
    <p class="hint">اللون الممتلئ = الجزء محفوظ بالكامل</p></div>
  ${lastH ? `<div class="card"><h3>📍 آخر موضع حفظ</h3><div style="font-family:Amiri,serif;font-size:21px;color:var(--g1);font-weight:700">${recText(lastH)}</div></div>` : ''}
  <div class="card"><h3>🕘 جدول التسميع (${recs.length})</h3>${staff()
    ? (recs.length ? `<div class="list">${recs.slice(0, 40).map(r => recCard(r, { noName: true })).join('')}</div>` : empty('📖', 'لا يوجد تسميع مسجل'))
    : recTable(recs)}</div>`;
}
function recTable(recs) {
  const f = st.rf || 'all', rows = recs.filter(r => f === 'all' || r.type === f);
  const seg = [['all', 'الكل'], ['hifz', '📖 حفظ'], ['review', '🔁 مراجعة']].map(([k, l]) => `<button class="${f === k ? 'on' : ''}" data-act="rfilter" data-id="${k}">${l}</button>`).join('');
  return `<div class="seg" style="margin-bottom:10px">${seg}</div>` + (rows.length ? `<div class="tw"><table class="rt"><tr><th>التاريخ</th><th>النوع</th><th>السورة والآيات</th><th>الجزء</th><th>التقدير</th></tr>
    ${rows.map(r => { const d = parse(r.date); return `<tr><td><b>${fmtDay(d)}</b><br><small>${fmtS(d)}</small></td>
      <td><span class="badge ${r.type === 'hifz' ? 'b-hifz' : 'b-rev'}">${r.type === 'hifz' ? 'حفظ' : 'مراجعة'}</span></td>
      <td style="text-align:start"><b>${Q.name(r.surah)}</b><br><small>${r.from}–${r.to} (${ayahs(r)} آية)</small>${r.note ? `<br><small>📝 ${esc(r.note)}</small>` : ''}</td>
      <td>${Q.juz(r.surah, r.from, r.to).join('–')}</td><td>${r.grade ? `<span class="badge ${gcls(r.grade)}">${r.grade}</span>` : '—'}</td></tr>`; }).join('')}</table></div>` : empty('📖', 'لا يوجد تسميع مسجل'));
}
function weekReport(s) {
  const ws = weekStart(new Date()), a = ymd(ws), b = ymd(addDays(ws, 6));
  const recs = inRange(a, b).filter(r => r.studentId === s.id).sort((x, y) => x.date.localeCompare(y.date)), g = agg(recs);
  let t = `📘 *${brand().name}*\nتقرير الطالب: *${s.name}*\nالأسبوع: ${fmtS(ws)} – ${fmtS(addDays(ws, 6))}\n\n`;
  t += recs.length ? recs.map(r => `• ${fmtDay(parse(r.date))}: ${r.type === 'hifz' ? 'حفظ' : 'مراجعة'} ${recText(r)}${r.grade ? ' — ' + r.grade : ''}`).join('\n') : 'لا يوجد تسميع هذا الأسبوع';
  return t + `\n\n📖 حفظ: ${g.h} آية\n🔁 مراجعة: ${g.r} آية\n📅 أيام التسميع: ${g.days.size}\n\nالمعلم: ${db.me.name}`;
}

/* ---------- الإحصائيات ---------- */
function period() {
  const now = new Date();
  if (st.mode === 'week') {
    const s = addDays(weekStart(now), st.off * 7), e = addDays(s, 6);
    return { s, e, title: `${fmtS(s)} – ${fmtS(e)}`, sub: st.off === 0 ? 'هذا الأسبوع' : `قبل ${-st.off} أسبوع`, days: 7 };
  }
  const s = new Date(now.getFullYear(), now.getMonth() + st.off, 1), e = new Date(s.getFullYear(), s.getMonth() + 1, 0);
  return { s, e, title: s.toLocaleDateString(L, { month: 'long', year: 'numeric' }), sub: st.off === 0 ? 'هذا الشهر' : `قبل ${-st.off} شهر`, days: e.getDate() };
}
function viewStats() {
  const p = period(), recs = inRange(ymd(p.s), ymd(p.e)), g = agg(recs);
  const per = Array.from({ length: p.days }, (_, i) => { const d = addDays(p.s, i), a = agg(recs.filter(r => r.date === ymd(d))); return { d, h: a.h, r: a.r }; });
  const mx = Math.max(1, ...per.map(x => x.h + x.r)), dense = p.days > 7;
  const grades = GRADES.map(n => [n, recs.filter(r => r.grade === n).length]).filter(x => x[1]);
  const rows = db.students.map(s => ({ s, a: agg(recs.filter(r => r.studentId === s.id)) })).sort((x, y) => (y.a.h + y.a.r) - (x.a.h + x.a.r));
  return `
  <div class="card">
    <div class="seg" style="margin-bottom:12px"><button class="${st.mode === 'week' ? 'on' : ''}" data-act="mode" data-id="week">أسبوعي</button><button class="${st.mode === 'month' ? 'on' : ''}" data-act="mode" data-id="month">شهري</button></div>
    <div class="nav-period"><button data-act="prev">›</button><div>${p.title}<small>${p.sub}</small></div><button data-act="next" ${st.off >= 0 ? 'disabled' : ''}>‹</button></div>
    <div class="stats two" style="margin:0">
      <div class="stat"><b>${g.h}</b><span>آيات الحفظ</span></div><div class="stat gold"><b>${g.r}</b><span>آيات المراجعة</span></div>
      <div class="stat blue"><b>${g.n}</b><span>عدد التسميعات</span></div><div class="stat"><b>${g.students.size}<small style="font-size:14px;color:var(--mut)">/${db.students.length}</small></b><span>الطلاب النشطون</span></div>
    </div>
  </div>
  <div class="card"><h3>📈 النشاط اليومي</h3>
    <div class="chart ${dense ? 'dense' : ''}">${per.map(x => `<div class="col"><b>${x.h + x.r || ''}</b><div class="bars">
      <i class="r" style="height:${x.r * 100 / mx}%"></i><i class="h" style="height:${x.h * 100 / mx}%"></i></div>
      <small>${dense ? x.d.getDate() : fmtDay(x.d).replace('ال', '')}</small></div>`).join('')}</div>
    <div class="legend"><span><i style="background:var(--g2)"></i>حفظ</span><span><i style="background:var(--gold)"></i>مراجعة</span></div></div>
  ${grades.length ? `<div class="card"><h3>🏅 التقديرات</h3><div class="chips">${grades.map(([n, c]) => `<span class="badge ${gcls(n)}" style="font-size:14px;padding:5px 14px">${n}: ${c}</span>`).join('')}</div></div>` : ''}
  <div class="card"><h3>👥 ${staff() ? 'ترتيب الطلاب' : 'الأبناء'}</h3>${rows.length ? `<div class="tw"><table><tr><th>الطالب</th><th>حفظ</th><th>مراجعة</th><th>أيام</th></tr>
    ${rows.map(({ s, a }) => `<tr data-act="open-student" data-id="${s.id}" style="cursor:pointer"><td><b>${esc(s.name)}</b></td><td>${a.h}</td><td>${a.r}</td><td>${a.days.size}</td></tr>`).join('')}</table></div>` : empty('👥', 'لا يوجد طلاب')}</div>`;
}

/* ---------- الرسائل ---------- */
function viewMessages() {
  if (st.thread) return viewThread();
  const rows = db.students.map(s => { const ms = msgsOf(s.id); return { s, last: ms[ms.length - 1], un: unread(s.id) }; })
    .sort((a, b) => (b.last?.id || 0) - (a.last?.id || 0));
  if (!rows.length) return `<div class="card">${empty('💬', 'لا يوجد طلاب مرتبطون بحسابك')}</div>`;
  return `<p class="hint" style="margin:0 4px 10px">${staff() ? 'رسائل أولياء الأمور والطلاب' : 'أرسل ملاحظاتك واستفساراتك للمعلم'}</p>
  <div class="list">${rows.map(({ s, last, un }) => `<div class="item" data-act="open-thread" data-id="${s.id}"><div class="avatar">${initial(s.name)}</div>
    <div class="t"><b>${esc(s.name)}</b><small>${last ? esc((last.senderId === db.me.id ? 'أنت: ' : '') + last.body.slice(0, 42)) : 'لا توجد رسائل — ابدأ المحادثة'}</small></div>
    <div class="side">${last ? `<small>${fmtT(last.at)}</small>` : ''}${un ? `<em class="bdg inl">${un}</em>` : ''}</div></div>`).join('')}</div>`;
}
function viewThread() {
  const s = student(st.thread); if (!s) { st.thread = null; return viewMessages(); }
  const ms = msgsOf(s.id);
  setTimeout(() => { const b = $('#bub'); if (b) b.scrollTop = b.scrollHeight; markRead(s.id); }, 0);
  return `<div class="card">
    <div class="row" style="margin-bottom:10px"><button class="btn light sm auto" data-act="close-thread">→ رجوع</button><b>💬 ${esc(s.name)}</b></div>
    <div class="bub" id="bub">${ms.length ? ms.map(m => `<div class="m ${m.senderId === db.me.id ? 'mine' : ''}"><small>${esc(m.senderName)} • ${ROLE_AR[m.senderRole] || ''}</small><p>${esc(m.body)}</p><small>${fmtT(m.at)}</small></div>`).join('') : empty('💬', 'لا توجد رسائل بعد')}</div>
    <form id="msgform" class="row" style="margin-top:10px;align-items:flex-end"><textarea id="msgin" rows="2" maxlength="1000" placeholder="اكتب ملاحظتك...">${esc(st.draft)}</textarea><button class="btn auto">إرسال</button></form>
  </div>`;
}

/* ---------- الإدارة (مدير) ---------- */
function viewManage() {
  const T = [['schools', 'المدارس'], ['teacher', 'المعلمون'], ['parent', 'أولياء الأمور'], ['admin', 'المدراء']];
  let list;
  if (st.mt === 'schools') {
    list = db.schools.length ? db.schools.map(s => `<div class="item" data-act="edit-school" data-id="${s.id}">${s.logo ? `<img class="logo" style="width:44px;height:44px;border-radius:12px" src="${esc(s.logo)}">` : '<div class="avatar">🏫</div>'}
      <div class="t"><b>${esc(s.name)}</b><small>${db.users.filter(u => u.school_id === s.id && u.role === 'teacher').length} معلم • ${db.students.filter(x => x.school_id === s.id).length} طالب</small></div></div>`).join('')
      : empty('🏫', 'لا توجد مدارس — أضف أول مدرسة');
  } else {
    const us = db.users.filter(u => u.role === st.mt);
    list = us.length ? us.map(u => {
      const kids = u.role === 'parent' ? db.students.filter(s => s.parents.includes(u.id)).map(s => s.name) : [];
      const sub = u.role === 'teacher' ? `${schoolName(u.school_id)} • ${db.students.filter(s => s.teacher_id === u.id).length} طالب` : u.role === 'parent' ? (kids.length ? 'الأبناء: ' + kids.join('، ') : 'غير مرتبط بطالب') : '';
      return `<div class="item" data-act="edit-user" data-id="${u.id}"><div class="avatar">${initial(u.name)}</div>
        <div class="t"><b>${esc(u.name)} ${u.active ? '' : '<span class="badge g-إعادة">معطّل</span>'}</b><small>${esc(u.username)}${sub ? ' • ' + esc(sub) : ''}</small></div></div>`;
    }).join('') : empty('👤', 'لا توجد حسابات في هذا القسم');
  }
  return `
  <div class="card"><div class="seg" style="margin-bottom:12px;flex-wrap:wrap">${T.map(([k, l]) => `<button class="${st.mt === k ? 'on' : ''}" data-act="mtab" data-id="${k}" style="font-size:13px">${l}</button>`).join('')}</div>
    <button class="btn block gold" data-act="${st.mt === 'schools' ? 'add-school' : 'add-user'}">＋ إضافة ${{ schools: 'مدرسة', teacher: 'معلم', parent: 'ولي أمر', admin: 'مدير' }[st.mt]}</button></div>
  <div class="list" style="margin-bottom:14px">${list}</div>
  <p class="hint" style="text-align:center">الطلاب تُدار من تبويب «الطلاب». كل شخص يدخل من نفس الرابط ويرى ما يخصه فقط.</p>
  ${accountView()}`;
}
function schoolForm(s) {
  st.tmpLogo = s ? s.logo : '';
  modal(`<h2>${s ? 'تعديل المدرسة' : 'إضافة مدرسة'}</h2>
  <form id="schform" class="gap" data-id="${s ? s.id : ''}">
    <div class="logo-pick"><img class="logo" id="schprev" src="${esc(st.tmpLogo) || 'icon.svg'}"><div style="flex:1"><label class="f">شعار المدرسة</label><input type="file" id="schlogo" accept="image/*" style="padding:8px"></div></div>
    <div><label class="f">اسم المدرسة / الحلقة</label><input name="name" required value="${esc(s?.name)}"></div>
    <button class="btn block">حفظ</button>
    ${s ? `<button type="button" class="btn red block" data-act="del-school" data-id="${s.id}">🗑 حذف المدرسة</button>` : ''}
    <button type="button" class="btn light block" data-act="close">إلغاء</button>
  </form>`);
}
function userForm(u) {
  const r = u ? u.role : st.mt;
  modal(`<h2>${u ? 'تعديل' : 'إضافة'} ${ROLE_AR[r]}</h2>
  <form id="usform" class="gap" data-id="${u ? u.id : ''}" data-role="${r}">
    <div><label class="f">الاسم</label><input name="name" required value="${esc(u?.name)}"></div>
    <div><label class="f">${r === 'parent' ? 'رقم الجوال (يستخدم لتسجيل الدخول)' : 'اسم المستخدم'}</label><input name="username" required value="${esc(u?.username)}" inputmode="${r === 'parent' ? 'tel' : 'text'}" autocapitalize="off"></div>
    <div><label class="f">جوال للواتساب <span class="hint">(اختياري)</span></label><input name="phone" type="tel" inputmode="tel" value="${esc(u?.phone)}" placeholder="05xxxxxxxx أو 9665xxxxxxxx"></div>
    ${r === 'teacher' ? `<div><label class="f">المدرسة</label><select name="school">${db.schools.map(x => `<option value="${x.id}" ${u && u.school_id === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>` : ''}
    ${u ? `<label class="row" style="gap:8px"><input type="checkbox" name="active" style="width:auto;flex:none" ${u.active ? 'checked' : ''}> الحساب مفعّل</label>` : '<p class="hint">ستُنشأ كلمة مرور مؤقتة تظهر لك بعد الحفظ لترسلها له.</p>'}
    <button class="btn block">حفظ</button>
    ${u ? `<button type="button" class="btn ghost block" data-act="reset-pw" data-id="${u.id}">🔑 إعادة تعيين كلمة المرور</button>
    <button type="button" class="btn red block" data-act="del-user" data-id="${u.id}">🗑 حذف الحساب</button>` : ''}
    <button type="button" class="btn light block" data-act="close">إلغاء</button>
  </form>`);
}
function showCreds(name, username, password, phone) {
  const txt = `مرحباً ${name}\nتم إنشاء حسابك في «${brand().name}» لمتابعة الحفظ والمراجعة.\n\nالرابط: ${appUrl()}\nاسم المستخدم: ${username}\nكلمة المرور المؤقتة: ${password}\n\nيرجى تغيير كلمة المرور بعد أول دخول.`;
  modal(`<h2>✅ بيانات الدخول</h2>
  <div class="creds"><div><small>الرابط</small><b>${esc(appUrl())}</b></div><div><small>اسم المستخدم</small><b dir="ltr">${esc(username)}</b></div><div><small>كلمة المرور المؤقتة</small><b dir="ltr">${esc(password)}</b></div></div>
  <p class="hint">احفظها الآن — لن تظهر كلمة المرور مرة أخرى (يمكنك إعادة تعيينها).</p>
  <div class="gap"><button class="btn block" data-act="wa-creds" data-txt="${esc(txt)}" data-phone="${esc(phone || username)}">📲 إرسال بالواتساب</button>
  <button class="btn light block" data-act="copy" data-txt="${esc(txt)}">📋 نسخ الرسالة</button><button class="btn ghost block" data-act="close">إغلاق</button></div>`);
}

/* ---------- حسابي ---------- */
function accountView() {
  return `
  <div class="card"><h3>👤 ${esc(db.me.name)}</h3><p class="hint" style="margin:0">${ROLE_AR[role()]} • ${esc(db.me.username)}</p></div>
  <div class="card"><h3>🔑 تغيير كلمة المرور</h3>
    <form id="pwform" class="gap"><input name="old" type="password" placeholder="كلمة المرور الحالية" required autocomplete="current-password">
      <input name="new" type="password" placeholder="كلمة المرور الجديدة (٦ أحرف على الأقل)" minlength="6" required autocomplete="new-password"><button class="btn block">تغيير</button></form></div>
  <div class="card"><button class="btn block ghost" data-act="logout">🚪 تسجيل الخروج</button></div>`;
}
function resizeLogo(file) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
      const k = Math.max(n / img.width, n / img.height), w = img.width * k, h = img.height * k;
      c.getContext('2d').drawImage(img, (n - w) / 2, (n - h) / 2, w, h); URL.revokeObjectURL(url); res(c.toDataURL('image/png'));
    };
    img.onerror = rej; img.src = url;
  });
}

/* ---------- الرسم ---------- */
function render() {
  const fa = document.activeElement && document.activeElement.id;
  if (!st.ready) { $('#app').innerHTML = `<div class="auth"><div class="brand">${logoImg()}<h1>متابعة التحفيظ</h1><p>جارٍ التحميل...</p></div></div>`; return; }
  if (!db.me) return renderLogin();
  if (db.me.must_change) return renderForce();
  const views = { home: viewHome, add: viewAdd, students: viewStudents, student: viewStudent, stats: viewStats, messages: viewMessages, manage: viewManage, account: accountView };
  if (!staff() && ['add', 'students', 'manage'].includes(st.view)) st.view = 'home';
  if (!isAdmin() && st.view === 'manage') st.view = 'account';
  shell(views[st.view]());
  if (st.view === 'add') updateInfo();
  if (fa === 'msgin' && $('#msgin')) { const m = $('#msgin'); m.focus(); m.setSelectionRange(m.value.length, m.value.length); }
}

/* ---------- الأحداث ---------- */
const run = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message || 'حدث خطأ'); } };
const acts = {
  nav: id => { if (id === 'add' && (!st.form || st.form.id)) st.form = newForm(''); go(id, { thread: null }); },
  showpw: () => { const p = $('#pw'); p.type = p.type === 'password' ? 'text' : 'password'; },
  close: closeModal,
  type: id => { st.form.type = id; if (!st.form.id && st.form.sid) Object.assign(st.form, nextPos(st.form.sid, id)); render(); },
  grade: id => { st.form.grade = st.form.grade === id ? '' : id; document.querySelectorAll('#grades .chip').forEach(c => c.classList.toggle('on', c.dataset.id === st.form.grade)); },
  'save-rec': saveRec,
  'cancel-edit': () => { st.form = newForm(''); go('home'); },
  'edit-rec': id => { const r = db.records.find(x => x.id === +id); st.form = { id: r.id, sid: r.studentId, type: r.type, date: r.date, surah: r.surah, from: r.from, to: r.to, grade: r.grade || '', note: r.note || '' }; go('add'); },
  'del-rec': async id => { if (!confirm('حذف هذا التسميع؟')) return; await api('record_delete', { id: +id }); db.records = db.records.filter(r => r.id !== +id); render(); toast('تم الحذف'); },
  quick: id => { st.form = newForm(id); go('add'); },
  'open-student': id => go('student', { sid: +id }),
  report: id => {
    const s = student(id), p = db.users.find(u => s.parents.includes(u.id) && u.phone);
    window.open(`https://wa.me/${p ? waNum(p.phone) : ''}?text=${encodeURIComponent(weekReport(s))}`, '_blank');
  },
  rfilter: id => { st.rf = id; render(); },
  mode: id => { st.mode = id; st.off = 0; render(); },
  prev: () => { st.off--; render(); },
  next: () => { if (st.off < 0) { st.off++; render(); } },
  'open-thread': id => go('messages', { thread: +id }),
  'close-thread': () => { st.thread = null; st.draft = ''; render(); },
  logout,
  /* الإدارة */
  mtab: id => { st.mt = id; render(); },
  'add-school': () => schoolForm(),
  'edit-school': id => schoolForm(db.schools.find(s => s.id === +id)),
  'del-school': async id => { if (!confirm('حذف هذه المدرسة؟')) return; await api('school_delete', { id: +id }); await refresh(); closeModal(); render(); toast('تم الحذف'); },
  'add-user': () => { if (st.mt === 'teacher' && !db.schools.length) return toast('أنشئ مدرسة أولاً'); userForm(); },
  'edit-user': id => userForm(userById(id)),
  'del-user': async id => { if (!confirm('حذف هذا الحساب نهائياً؟')) return; await api('user_delete', { id: +id }); await refresh(); closeModal(); render(); toast('تم الحذف'); },
  'reset-pw': async id => {
    if (!confirm('إنشاء كلمة مرور مؤقتة جديدة؟ ستتوقف كلمة المرور الحالية.')) return;
    const r = await api('reset_password', { id: +id }), u = userById(id) || {};
    showCreds(u.name || r.username, r.username, r.password, u.phone);
  },
  'add-student': () => studentForm(),
  'edit-student': id => studentForm(student(id)),
  'del-student': async id => { const s = student(id); if (!confirm(`حذف الطالب "${s.name}" وكل تسميعاته ورسائله نهائياً؟`)) return; await api('student_delete', { id: +id }); await refresh(); closeModal(); go('students'); toast('تم حذف الطالب'); },
  'wa-creds': (id, el) => window.open(`https://wa.me/${waNum(el.dataset.phone)}?text=${encodeURIComponent(el.dataset.txt)}`, '_blank'),
  copy: async (id, el) => { try { await navigator.clipboard.writeText(el.dataset.txt); toast('تم النسخ ✔'); } catch { toast('تعذر النسخ'); } }
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = acts[el.dataset.act]; if (fn) run(fn)(el.dataset.id, el);
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'q') { st.q = t.value; const p = t.selectionStart; render(); const q = $('#q'); q.focus(); q.setSelectionRange(p, p); return; }
  if (t.id === 'msgin') { st.draft = t.value; return; }
  if (!t.dataset.f || !st.form) return;
  st.form[t.dataset.f] = t.value;
  if (t.dataset.f === 'sid' && !st.form.id) { Object.assign(st.form, nextPos(t.value, st.form.type)); render(); return; }
  if (t.dataset.f === 'surah') { st.form.from = 1; st.form.to = ''; document.querySelector('[data-f=from]').value = 1; document.querySelector('[data-f=to]').value = ''; }
  updateInfo();
});

document.addEventListener('submit', run(async e => {
  e.preventDefault(); const f = e.target;
  if (f.id === 'login') {
    await api('login', { username: f.username.value, password: f.pw.value, remember: f.rem.checked });
    await refresh(); st.view = 'home'; render(); return;
  }
  if (f.id === 'pwform') {
    await api('change_password', { old: f.old.value, new: f.new.value });
    if (f.dataset.force) { db.me.must_change = false; render(); } else f.reset();
    toast('تم تغيير كلمة المرور ✔'); return;
  }
  if (f.id === 'msgform') {
    const text = $('#msgin').value.trim(); if (!text) return;
    const r = await api('message_send', { studentId: st.thread, body: text });
    db.messages.push(r.message); st.draft = ''; render(); return;
  }
  if (f.id === 'stform') {
    const r = await api('student_save', {
      id: +f.dataset.id || 0, name: f.name.value, school_id: +f.school.value, teacher_id: +f.teacher.value || 0, group: f.group.value,
      parent_ids: [...f.querySelectorAll('[name=par]:checked')].map(x => +x.value), login_username: f.login.value
    });
    await refresh(); closeModal(); render(); toast('تم الحفظ ✔');
    if (r.login) showCreds(f.name.value, r.login.username, r.login.password, '');
    return;
  }
  if (f.id === 'schform') {
    await api('school_save', { id: +f.dataset.id || 0, name: f.name.value, logo: st.tmpLogo || '' });
    await refresh(); closeModal(); render(); toast('تم الحفظ ✔'); return;
  }
  if (f.id === 'usform') {
    const id = +f.dataset.id || 0;
    const r = await api('user_save', { id, role: f.dataset.role, name: f.name.value, username: f.username.value, phone: f.phone.value,
      school_id: f.school ? +f.school.value : 0, active: f.active ? f.active.checked : true });
    await refresh(); closeModal(); render();
    if (r.password) showCreds(f.name.value, r.username, r.password, f.phone.value); else toast('تم الحفظ ✔');
  }
}));

document.addEventListener('change', run(async e => {
  const t = e.target;
  if (t.id === 'schlogo' && t.files[0]) { st.tmpLogo = await resizeLogo(t.files[0]); $('#schprev').src = st.tmpLogo; }
  if (t.id === 'st_school') $('#st_teacher').innerHTML = teacherOptions(t.value, 0);
}));

/* ---------- تنبيه الرسائل الجديدة ---------- */
setInterval(async () => {
  if (!db.me || db.me.must_change || document.hidden) return;
  try {
    const since = db.messages.reduce((m, x) => Math.max(m, x.id), 0);
    const r = await api('poll', null, '&since=' + since);
    if (!r.messages.length) return;
    db.messages.push(...r.messages);
    const fresh = r.messages.some(m => m.senderId !== db.me.id);
    if (st.view === 'messages') render(); else { updateTabbar(); if (fresh) toast('📩 وصلتك رسالة جديدة'); }
  } catch { }
}, 20000);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
(async () => { try { await refresh(); } catch { } st.ready = true; render(); })();
