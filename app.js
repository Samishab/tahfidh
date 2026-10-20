/* متابعة التحفيظ — تطبيق للمدرس. البيانات تحفظ على الجهاز (localStorage) مع نسخ احتياطي. */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEY = 'tahfidh_v1', AUTH = 'tahfidh_auth';
const GRADES = ['ممتاز', 'جيد جداً', 'جيد', 'مقبول', 'إعادة'];
const gcls = g => 'g-' + g.replace(' ', '-');

/* ---------- البيانات ---------- */
const fresh = () => ({ settings: { school: '', teacher: '', hash: '', salt: '', logo: '' }, students: [], records: [] });
function load() { try { const d = JSON.parse(localStorage.getItem(KEY)); return d && d.settings ? d : fresh(); } catch { return fresh(); } }
let db = load();
const save = () => localStorage.setItem(KEY, JSON.stringify(db));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function hashPw(p, salt) {
  if (crypto.subtle) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + p));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (const c of salt + p) h = ((h << 5) + h + c.charCodeAt(0)) | 0; return String(h);
}

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
const today = () => ymd(new Date());

/* ---------- الحالة ---------- */
const st = { view: 'home', authed: false, sid: null, back: 'students', mode: 'week', off: 0, q: '', form: null, auth: 'login' };
st.authed = !!(sessionStorage.getItem(AUTH) || localStorage.getItem(AUTH)) && !!db.settings.hash;

const student = id => db.students.find(s => s.id === id);
const ayahs = r => r.to - r.from + 1;
const inRange = (a, b) => db.records.filter(r => r.date >= a && r.date <= b);
function agg(recs) {
  const o = { h: 0, r: 0, n: recs.length, days: new Set(), students: new Set() };
  recs.forEach(r => { r.type === 'hifz' ? o.h += ayahs(r) : o.r += ayahs(r); o.days.add(r.date); o.students.add(r.studentId); });
  return o;
}
function lastOf(sid, type) {
  return db.records.filter(r => r.studentId === sid && r.type === type).sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id)).pop();
}
function nextPos(sid, type) {
  const l = lastOf(sid, type);
  if (!l) return { surah: type === 'hifz' ? 78 : 1, from: 1, to: '' };
  if (l.to < Q.count(l.surah)) return { surah: l.surah, from: l.to + 1, to: '' };
  return { surah: Math.min(114, l.surah + 1), from: 1, to: '' };
}
function newForm(sid, type = 'hifz') {
  return { id: null, sid: sid || '', type, date: today(), grade: '', note: '', ...nextPos(sid, type) };
}
function memorized(sid) {
  const m = new Uint8Array(Q.TOTAL);
  db.records.filter(r => r.studentId === sid && r.type === 'hifz').forEach(r => {
    for (let i = Q.abs(r.surah, r.from); i <= Q.abs(r.surah, r.to); i++) m[i - 1] = 1;
  });
  return m;
}
function recText(r) {
  return `سورة ${Q.name(r.surah)} (${r.from === r.to ? 'آية ' + r.from : 'من آية ' + r.from + ' إلى ' + r.to})`;
}

/* ---------- أدوات واجهة ---------- */
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2300);
}
function modal(html) {
  const m = $('#modal'); m.innerHTML = `<div class="sheet">${html}</div>`; m.hidden = false;
  m.onclick = e => { if (e.target === m) closeModal(); };
}
const closeModal = () => { $('#modal').hidden = true; $('#modal').innerHTML = ''; };
const logoImg = (c = 'logo') => `<img class="${c}" src="${db.settings.logo || 'icon.svg'}" alt="شعار">`;
const initial = n => esc([...n.trim()][0] || '؟');
const go = (v, extra = {}) => { Object.assign(st, extra, { view: v }); render(); scrollTo(0, 0); };

/* ---------- الدخول ---------- */
function renderAuth() {
  const setup = !db.settings.hash;
  const s = db.settings;
  $('#app').innerHTML = `
  <div class="auth">
    <div class="brand">${logoImg()}<h1>${esc(s.school) || 'متابعة التحفيظ'}</h1><p>${setup ? 'مرحباً بك، لنجهّز الحلقة' : 'تسجيل دخول المدرس'}</p></div>
    <div class="card">
      ${setup ? `
      <h3>🕌 إعداد البرنامج لأول مرة</h3>
      <form id="setup" class="gap">
        <div><label class="f">اسم المدرسة / الحلقة</label><input name="school" required placeholder="مثال: مدرسة الإمام الشاطبي"></div>
        <div><label class="f">اسم المدرس</label><input name="teacher" required placeholder="الشيخ / الأستاذ ..."></div>
        <div><label class="f">كلمة المرور (٤ أحرف على الأقل)</label><input name="pw" type="password" minlength="4" required autocomplete="new-password"></div>
        <div><label class="f">تأكيد كلمة المرور</label><input name="pw2" type="password" minlength="4" required autocomplete="new-password"></div>
        <button class="btn block gold">ابدأ الآن</button>
      </form>` : `
      <h3>👋 أهلاً ${esc(s.teacher)}</h3>
      <form id="login" class="gap">
        <div><label class="f">كلمة المرور</label>
          <div class="pwbox"><input name="pw" id="pw" type="password" required autocomplete="current-password" autofocus><button type="button" data-act="showpw">👁</button></div></div>
        <label class="row" style="gap:8px;font-size:14px"><input type="checkbox" name="rem" style="width:auto;flex:none" checked> تذكّر دخولي على هذا الجهاز</label>
        <button class="btn block">دخول</button>
        <button type="button" class="btn light block sm" data-act="forgot">نسيت كلمة المرور؟</button>
      </form>`}
    </div>
    <div class="verse">﴿ وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ فَهَلْ مِن مُّدَّكِرٍ ﴾</div>
  </div>`;
}
async function doSetup(f) {
  if (f.pw.value !== f.pw2.value) return toast('كلمتا المرور غير متطابقتين');
  const salt = uid();
  db.settings = { ...db.settings, school: f.school.value.trim(), teacher: f.teacher.value.trim(), salt, hash: await hashPw(f.pw.value, salt) };
  save(); sessionStorage.setItem(AUTH, '1'); st.authed = true; render();
}
async function doLogin(f) {
  if (await hashPw(f.pw.value, db.settings.salt) !== db.settings.hash) { f.pw.value = ''; return toast('كلمة المرور غير صحيحة'); }
  (f.rem.checked ? localStorage : sessionStorage).setItem(AUTH, '1');
  st.authed = true; render();
}
function logout() { sessionStorage.removeItem(AUTH); localStorage.removeItem(AUTH); st.authed = false; render(); }

/* ---------- الإطار ---------- */
const TITLES = {
  home: ['الرئيسية', ''], add: ['تسجيل تسميع', 'حفظ جديد أو مراجعة'], students: ['الطلاب', ''],
  student: ['ملف الطالب', ''], stats: ['الإحصائيات', 'أسبوعية وشهرية'], settings: ['الإعدادات', '']
};
function shell(body) {
  const s = db.settings, d = new Date(), v = st.view;
  const [t, sub] = TITLES[v];
  const tab = (k, ic, label) => `<button class="${(v === k || (k === 'students' && v === 'student')) ? 'on' : ''}" data-act="nav" data-id="${k}"><span>${ic}</span>${label}</button>`;
  $('#app').innerHTML = `
  <header class="hdr">
    <div class="hdr-row">${logoImg()}<div class="grow"><h1>${esc(s.school)}</h1><small>${esc(s.teacher)}</small></div>
      <div style="text-align:end;font-size:12.5px;line-height:1.4"><b>${fmtDay(d)}</b><br>${fmtG(d)}<br>${fmtH(d)}</div></div>
    <div class="pagetitle">${t}${sub ? `<small>${sub}</small>` : ''}</div>
  </header>
  <main>${body}</main>
  <nav class="tabbar">
    ${tab('home', '🏠', 'الرئيسية')}${tab('students', '👥', 'الطلاب')}
    <button class="fab" data-act="nav" data-id="add"><span>＋</span>تسميع</button>
    ${tab('stats', '📊', 'إحصائيات')}${tab('settings', '⚙️', 'الإعدادات')}
  </nav>`;
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
    <div class="acts"><button class="btn light sm" data-act="edit-rec" data-id="${r.id}">تعديل</button><button class="btn red sm" data-act="del-rec" data-id="${r.id}">حذف</button></div>
  </div>`;
}
const empty = (ico, txt) => `<div class="empty"><span class="ico">${ico}</span>${txt}</div>`;

/* ---------- الرئيسية ---------- */
function viewHome() {
  const now = new Date(), ws = weekStart(now);
  const tod = db.records.filter(r => r.date === today());
  const wk = agg(inRange(ymd(ws), ymd(addDays(ws, 6))));
  const td = agg(tod);
  const absent = db.students.filter(s => !td.students.has(s.id));
  const top = db.students.map(s => ({ s, a: agg(inRange(ymd(ws), ymd(addDays(ws, 6))).filter(r => r.studentId === s.id)) }))
    .filter(x => x.a.n).sort((a, b) => (b.a.h + b.a.r) - (a.a.h + a.a.r)).slice(0, 3);
  return `
  <div class="stats">
    <div class="stat"><b>${td.n}</b><span>تسميع اليوم</span></div>
    <div class="stat gold"><b>${wk.h}</b><span>آيات حفظ الأسبوع</span></div>
    <div class="stat blue"><b>${wk.r}</b><span>آيات مراجعة الأسبوع</span></div>
  </div>
  ${!db.students.length ? `<div class="card">${empty('👥', 'ابدأ بإضافة طلاب الحلقة')}<button class="btn block" data-act="add-student">＋ إضافة أول طالب</button></div>` : `
  <div class="card"><h3>🌟 الأكثر نشاطاً هذا الأسبوع</h3>
    ${top.length ? `<div class="list">${top.map(({ s, a }, i) => `<div class="item" data-act="open-student" data-id="${s.id}"><div class="avatar">${['🥇', '🥈', '🥉'][i]}</div>
      <div class="t"><b>${esc(s.name)}</b><small>حفظ ${a.h} • مراجعة ${a.r} آية</small></div><div class="side"><b>${a.days.size}</b><small>أيام</small></div></div>`).join('')}</div>` : empty('🌱', 'لا يوجد تسميع هذا الأسبوع بعد')}
  </div>
  ${absent.length && db.students.length ? `<div class="card"><h3>⏳ لم يسمّعوا اليوم (${absent.length})</h3><div class="chips">${absent.map(s => `<button class="chip" data-act="quick" data-id="${s.id}">${esc(s.name)}</button>`).join('')}</div><p class="hint">اضغط على الاسم لتسجيل تسميعه</p></div>` : ''}`}
  <div class="card"><h3>📋 تسميع اليوم</h3>
    ${tod.length ? `<div class="list">${tod.slice().reverse().map(r => recCard(r)).join('')}</div>` : empty('📖', 'لا يوجد تسميع اليوم')}
  </div>`;
}

/* ---------- تسجيل تسميع ---------- */
function viewAdd() {
  const f = st.form || (st.form = newForm(''));
  if (!db.students.length) return `<div class="card">${empty('👥', 'أضف طلاباً أولاً لتسجيل التسميع')}<button class="btn block" data-act="add-student">＋ إضافة طالب</button></div>`;
  return `
  <div class="card gap">
    <div><label class="f">الطالب</label>
      <select data-f="sid"><option value="">— اختر الطالب —</option>${db.students.map(s => `<option value="${s.id}" ${f.sid === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
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
    <div><label class="f">ملاحظة <span class="hint">(اختياري)</span></label><textarea data-f="note" placeholder="أخطاء، توصية، واجب...">${esc(f.note)}</textarea></div>
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
function saveRec() {
  const f = st.form, c = checkForm();
  if (!f.sid) return toast('اختر الطالب أولاً');
  if (!f.date) return toast('اختر التاريخ');
  if (!c.ok) return toast(c.msg);
  const rec = { id: f.id || uid(), studentId: f.sid, date: f.date, type: f.type, surah: +f.surah, from: +f.from, to: +f.to, grade: f.grade, note: f.note.trim() };
  if (f.id) db.records = db.records.map(r => r.id === f.id ? rec : r); else db.records.push(rec);
  save(); const sid = f.sid, type = f.type, date = f.date;
  st.form = { ...newForm(sid, type), date };
  toast(f.id ? 'تم تعديل التسميع ✔' : 'تم حفظ التسميع ✔');
  render();
}

/* ---------- الطلاب ---------- */
function viewStudents() {
  const ws = weekStart(new Date()), a = ymd(ws), b = ymd(addDays(ws, 6));
  const list = db.students.filter(s => s.name.includes(st.q) || (s.group || '').includes(st.q));
  return `
  <div class="card"><div class="row"><input id="q" placeholder="🔍 بحث عن طالب..." value="${esc(st.q)}"><button class="btn auto" data-act="add-student">＋ طالب</button></div></div>
  ${list.length ? `<div class="list">${list.map(s => {
    const w = agg(inRange(a, b).filter(r => r.studentId === s.id)), m = memorized(s.id).reduce((x, y) => x + y, 0);
    return `<div class="item" data-act="open-student" data-id="${s.id}"><div class="avatar">${initial(s.name)}</div>
      <div class="t"><b>${esc(s.name)}</b><small>${s.group ? esc(s.group) + ' • ' : ''}محفوظ ${m} آية</small></div>
      <div class="side"><b>${w.h + w.r}</b><small>آية/أسبوع</small></div></div>`;
  }).join('')}</div>` : `<div class="card">${empty('👥', db.students.length ? 'لا توجد نتائج' : 'لا يوجد طلاب بعد')}</div>`}`;
}
function studentForm(s) {
  modal(`<h2>${s ? 'تعديل بيانات الطالب' : 'إضافة طالب'}</h2>
  <form id="stform" class="gap" data-id="${s ? s.id : ''}">
    <div><label class="f">اسم الطالب</label><input name="name" required value="${esc(s?.name)}"></div>
    <div><label class="f">المجموعة / الحلقة <span class="hint">(اختياري)</span></label><input name="group" value="${esc(s?.group)}" placeholder="مثال: حلقة الفجر"></div>
    <div><label class="f">جوال ولي الأمر <span class="hint">(اختياري - لإرسال التقرير بالواتساب)</span></label><input name="phone" type="tel" inputmode="tel" value="${esc(s?.phone)}" placeholder="966501234567"></div>
    <button class="btn block">حفظ</button><button type="button" class="btn light block" data-act="close">إلغاء</button>
  </form>`);
}
function viewStudent() {
  const s = student(st.sid); if (!s) return viewStudents();
  const m = memorized(s.id), total = m.reduce((x, y) => x + y, 0);
  const ws = weekStart(new Date()), w = agg(inRange(ymd(ws), ymd(addDays(ws, 6))).filter(r => r.studentId === s.id));
  const recs = db.records.filter(r => r.studentId === s.id).sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  const juz = Array.from({ length: 30 }, (_, i) => {
    const a = Q.juzAbs[i], e = (Q.juzAbs[i + 1] || Q.TOTAL + 1) - 1; let c = 0;
    for (let k = a; k <= e; k++) c += m[k - 1]; return Math.round(c * 100 / (e - a + 1));
  });
  const lastH = lastOf(s.id, 'hifz');
  return `
  <div class="card">
    <div class="row" style="margin-bottom:12px"><button class="btn light sm auto" data-act="nav" data-id="students">→ رجوع</button><span></span>
      <button class="btn light sm auto" data-act="edit-student" data-id="${s.id}">✏️ تعديل</button><button class="btn red sm auto" data-act="del-student" data-id="${s.id}">🗑</button></div>
    <div class="item" style="border:0;padding:0;cursor:default"><div class="avatar">${initial(s.name)}</div><div class="t"><b style="font-size:19px">${esc(s.name)}</b><small>${esc(s.group || '')}</small></div></div>
  </div>
  <div class="stats">
    <div class="stat"><b>${total}</b><span>آية محفوظة</span></div>
    <div class="stat gold"><b>${(total * 100 / Q.TOTAL).toFixed(1)}%</b><span>من القرآن</span></div>
    <div class="stat blue"><b>${w.h + w.r}</b><span>آيات الأسبوع</span></div>
  </div>
  <div class="card"><h3>🗺 خريطة الأجزاء</h3>
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">${juz.map((p, i) => `<div style="text-align:center;font-size:12px;border:1.5px solid ${p ? 'var(--g2)' : 'var(--line)'};border-radius:12px;padding:6px 0;background:linear-gradient(to top,${p === 100 ? 'var(--g2)' : 'var(--g3)'} ${p}%,#fff ${p}%);color:${p === 100 ? '#fff' : 'var(--ink)'}"><b>${i + 1}</b><br><small>${p}%</small></div>`).join('')}</div>
    <p class="hint">اللون الممتلئ = الجزء محفوظ بالكامل</p></div>
  <div class="row" style="margin-bottom:14px"><button class="btn gold" data-act="quick" data-id="${s.id}">＋ تسميع جديد</button><button class="btn ghost" data-act="report" data-id="${s.id}">📤 تقرير الأسبوع</button></div>
  ${lastH ? `<div class="card"><h3>📍 آخر موضع حفظ</h3><div class="sn" style="font-family:Amiri,serif;font-size:21px;color:var(--g1);font-weight:700">${recText(lastH)}</div></div>` : ''}
  <div class="card"><h3>🕘 سجل التسميع (${recs.length})</h3>${recs.length ? `<div class="list">${recs.slice(0, 40).map(r => recCard(r, { noName: true })).join('')}</div>` : empty('📖', 'لا يوجد تسميع مسجل')}</div>`;
}
function weekReport(s) {
  const ws = weekStart(new Date()), a = ymd(ws), b = ymd(addDays(ws, 6));
  const recs = inRange(a, b).filter(r => r.studentId === s.id).sort((x, y) => x.date.localeCompare(y.date)), g = agg(recs);
  let t = `📘 *${db.settings.school}*\nتقرير الطالب: *${s.name}*\nالأسبوع: ${fmtS(ws)} – ${fmtS(addDays(ws, 6))}\n\n`;
  t += recs.length ? recs.map(r => `• ${fmtDay(parse(r.date))}: ${r.type === 'hifz' ? 'حفظ' : 'مراجعة'} ${recText(r)}${r.grade ? ' — ' + r.grade : ''}`).join('\n') : 'لا يوجد تسميع هذا الأسبوع';
  t += `\n\n📖 حفظ: ${g.h} آية\n🔁 مراجعة: ${g.r} آية\n📅 أيام التسميع: ${g.days.size}\n\nالمدرس: ${db.settings.teacher}`;
  return t;
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
  <div class="card"><h3>👥 ترتيب الطلاب</h3>${rows.length ? `<div class="tw"><table><tr><th>الطالب</th><th>حفظ</th><th>مراجعة</th><th>أيام</th></tr>
    ${rows.map(({ s, a }) => `<tr data-act="open-student" data-id="${s.id}" style="cursor:pointer"><td><b>${esc(s.name)}</b></td><td>${a.h}</td><td>${a.r}</td><td>${a.days.size}</td></tr>`).join('')}</table></div>` : empty('👥', 'لا يوجد طلاب')}</div>`;
}

/* ---------- الإعدادات ---------- */
function viewSettings() {
  const s = db.settings;
  return `
  <div class="card"><h3>🏫 بيانات المدرسة</h3>
    <form id="schform" class="gap">
      <div class="logo-pick">${logoImg()}<div style="flex:1"><label class="f">شعار المدرسة</label>
        <input type="file" id="logofile" accept="image/*" style="padding:8px">${s.logo ? '<button type="button" class="btn red sm" style="margin-top:6px" data-act="rm-logo">إزالة الشعار</button>' : ''}</div></div>
      <div><label class="f">اسم المدرسة / الحلقة</label><input name="school" required value="${esc(s.school)}"></div>
      <div><label class="f">اسم المدرس</label><input name="teacher" required value="${esc(s.teacher)}"></div>
      <button class="btn block">حفظ</button></form></div>
  <div class="card"><h3>🔑 تغيير كلمة المرور</h3>
    <form id="pwform" class="gap"><input name="old" type="password" placeholder="كلمة المرور الحالية" required autocomplete="current-password">
      <input name="new" type="password" placeholder="كلمة المرور الجديدة" minlength="4" required autocomplete="new-password"><button class="btn block">تغيير</button></form></div>
  <div class="card"><h3>💾 النسخ الاحتياطي</h3>
    <p class="hint">البيانات محفوظة على هذا الجهاز فقط. خذ نسخة احتياطية بشكل دوري، وعند تغيير الجوال استوردها من الملف.</p>
    <div class="row"><button class="btn light" data-act="export">⬇ تصدير نسخة</button><button class="btn light" data-act="import">⬆ استيراد نسخة</button></div>
    <input type="file" id="impfile" accept="application/json" hidden></div>
  <div class="card"><button class="btn block ghost" data-act="logout">🚪 تسجيل الخروج</button></div>
  <p class="hint" style="text-align:center">متابعة التحفيظ • ${db.students.length} طالب • ${db.records.length} تسميع</p>`;
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
  if (!st.authed) return renderAuth();
  const views = { home: viewHome, add: viewAdd, students: viewStudents, student: viewStudent, stats: viewStats, settings: viewSettings };
  shell(views[st.view]());
  if (st.view === 'add') updateInfo();
}

/* ---------- الأحداث ---------- */
const acts = {
  nav: id => { if (id === 'add' && (!st.form || st.form.id)) st.form = newForm(''); go(id); },
  showpw: () => { const p = $('#pw'); p.type = p.type === 'password' ? 'text' : 'password'; },
  forgot: () => { if (confirm('نسيت كلمة المرور؟\nلا توجد وسيلة لاستعادتها، والخيار الوحيد حذف كل البيانات والبدء من جديد.\n\nهل تريد حذف كل البيانات؟') && confirm('تأكيد أخير: سيتم حذف جميع الطلاب والتسميعات نهائياً.')) { db = fresh(); save(); logout(); } },
  close: closeModal,
  type: id => { st.form.type = id; if (!st.form.id && st.form.sid) Object.assign(st.form, nextPos(st.form.sid, id)); render(); },
  grade: id => { st.form.grade = st.form.grade === id ? '' : id; document.querySelectorAll('#grades .chip').forEach(c => c.classList.toggle('on', c.dataset.id === st.form.grade)); },
  'save-rec': saveRec,
  'cancel-edit': () => { st.form = newForm(''); go('home'); },
  'edit-rec': id => { const r = db.records.find(x => x.id === id); st.form = { id: r.id, sid: r.studentId, type: r.type, date: r.date, surah: r.surah, from: r.from, to: r.to, grade: r.grade || '', note: r.note || '' }; go('add'); },
  'del-rec': id => { if (confirm('حذف هذا التسميع؟')) { db.records = db.records.filter(r => r.id !== id); save(); render(); toast('تم الحذف'); } },
  quick: id => { st.form = newForm(id); go('add'); },
  'add-student': () => studentForm(),
  'edit-student': id => studentForm(student(id)),
  'del-student': id => { const s = student(id); if (confirm(`حذف الطالب "${s.name}" وكل تسميعاته؟`)) { db.students = db.students.filter(x => x.id !== id); db.records = db.records.filter(r => r.studentId !== id); save(); go('students'); toast('تم حذف الطالب'); } },
  'open-student': id => go('student', { sid: id }),
  report: id => {
    const s = student(id), t = encodeURIComponent(weekReport(s)), ph = (s.phone || '').replace(/\D/g, '');
    window.open(`https://wa.me/${ph}?text=${t}`, '_blank');
  },
  mode: id => { st.mode = id; st.off = 0; render(); },
  prev: () => { st.off--; render(); },
  next: () => { if (st.off < 0) { st.off++; render(); } },
  'rm-logo': () => { db.settings.logo = ''; save(); render(); },
  export: () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(db)], { type: 'application/json' }));
    a.download = `tahfidh-backup-${today()}.json`; a.click(); toast('تم تصدير النسخة');
  },
  import: () => $('#impfile').click(),
  logout
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = acts[el.dataset.act]; if (fn) fn(el.dataset.id);
});

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'q') { st.q = t.value; const p = t.selectionStart; render(); const q = $('#q'); q.focus(); q.setSelectionRange(p, p); return; }
  if (!t.dataset.f || !st.form) return;
  st.form[t.dataset.f] = t.value;
  if (t.dataset.f === 'sid' && !st.form.id) { Object.assign(st.form, nextPos(t.value, st.form.type)); render(); return; }
  if (t.dataset.f === 'surah') { st.form.from = 1; st.form.to = ''; document.querySelector('[data-f=from]').value = 1; document.querySelector('[data-f=to]').value = ''; }
  updateInfo();
});

document.addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target;
  if (f.id === 'setup') return doSetup(f);
  if (f.id === 'login') return doLogin(f);
  if (f.id === 'stform') {
    const id = f.dataset.id, d = { name: f.name.value.trim(), group: f.group.value.trim(), phone: f.phone.value.trim() };
    if (id) Object.assign(student(id), d); else db.students.push({ id: uid(), ...d });
    save(); closeModal(); render(); toast(id ? 'تم تعديل الطالب ✔' : 'تمت إضافة الطالب ✔');
  }
  if (f.id === 'schform') { db.settings.school = f.school.value.trim(); db.settings.teacher = f.teacher.value.trim(); save(); render(); toast('تم الحفظ ✔'); }
  if (f.id === 'pwform') {
    if (await hashPw(f.old.value, db.settings.salt) !== db.settings.hash) return toast('كلمة المرور الحالية غير صحيحة');
    db.settings.salt = uid(); db.settings.hash = await hashPw(f.new.value, db.settings.salt); save(); f.reset(); toast('تم تغيير كلمة المرور ✔');
  }
});

document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'logofile' && t.files[0]) {
    try { db.settings.logo = await resizeLogo(t.files[0]); save(); render(); toast('تم تحديث الشعار ✔'); } catch { toast('تعذر قراءة الصورة'); }
  }
  if (t.id === 'impfile' && t.files[0]) {
    try {
      const d = JSON.parse(await t.files[0].text());
      if (!d.settings || !Array.isArray(d.students) || !Array.isArray(d.records)) throw 0;
      if (!confirm(`استيراد النسخة؟ سيتم استبدال البيانات الحالية بـ ${d.students.length} طالب و ${d.records.length} تسميع.`)) return;
      db = d; save(); logout(); toast('تم الاستيراد، سجّل الدخول بكلمة مرور النسخة');
    } catch { toast('ملف النسخة غير صالح'); }
  }
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
render();
