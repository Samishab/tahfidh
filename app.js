/* متابعة التحفيظ — واجهة المدير والمعلم وولي الأمر والطالب. البيانات من الخادم (api/index.php). */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GRADES = ['ممتاز', 'جيد جداً', 'جيد', 'مقبول', 'إعادة'];
const gcls = g => 'g-' + g.replace(' ', '-');
const ROLE_AR = { solo: 'معلم مستقل', admin: 'مدير النظام', school_admin: 'مدير مدرسة', teacher: 'معلم', parent: 'ولي أمر', student: 'طالب' };

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
const blank = () => ({ me: null, app: null, school: null, schools: [], users: [], students: [], records: [], messages: [], reads: {}, requests: [], certs: [], enrollments: [] });
let db = blank();
let WS = 6;                                                                  // أول يوم في الأسبوع (من إعدادات المنصة)
const refresh = async () => { db = Object.assign(blank(), await api('bootstrap', null, st.fs ? '&school=' + encodeURIComponent(st.fs) : '')); if (db.app) WS = db.app.week_start; };
const role = () => db.me.role;
const isAdmin = () => role() === 'admin';                         // مدير النظام (المنصة)
const isMgr = () => role() === 'admin' || role() === 'school_admin'; // مدير النظام أو مدير مدرسة
const staff = () => role() === 'admin' || role() === 'school_admin' || role() === 'teacher';
const roleLabel = u => u.solo ? 'معلم مستقل' : ROLE_AR[u.role];
const platformBrand = () => { const b = (db.app && db.app.brand) || (st.site && st.site.brand) || {}; return { name: b.name || 'سَنَد', tagline: b.tagline || '', logo: b.logo || '' }; };
const brand = () => db.school || platformBrand();                           // مدير النظام: هوية المنصة؛ غيره: هوية مدرسته
const brandFor = id => db.schools.find(x => x.id === +id) || brand();          // هوية مدرسة الطالب في الكشوف المطبوعة
const teacherNames = s => (s.teachers || (s.teacher_id ? [s.teacher_id] : [])).map(id => (userById(id) || (+id === db.me.id ? db.me : null) || {}).name).filter(Boolean).join('، ');
const tObj = s => { const n = teacherNames(s); return n ? { name: n } : null; };
const student = id => db.students.find(s => s.id === +id);
const userById = id => db.users.find(u => u.id === +id);
const schoolName = id => (db.schools.find(s => s.id === id) || {}).name || '';

/* ---------- التاريخ (الأسبوع يبدأ السبت) ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const weekStart = d => addDays(d, -((d.getDay() - WS + 7) % 7));
const L = 'ar-u-nu-latn';
const fmtDay = d => d.toLocaleDateString(L, { weekday: 'long' });
const fmtG = d => d.toLocaleDateString(L, { day: 'numeric', month: 'long', year: 'numeric' });
const fmtS = d => d.toLocaleDateString(L, { day: 'numeric', month: 'short' });
const fmtH = d => d.toLocaleDateString('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtT = s => new Date(s).toLocaleString(L, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const today = () => ymd(new Date());

/* ---------- الحالة ---------- */
const st = { view: 'home', ready: false, sid: null, mode: 'week', off: 0, q: '', form: null, thread: null, draft: '', mt: 'requests', tmpLogo: null, ro: 0, pubSchools: [], tk: 0, signupDone: false, mo: -1, mschool: '', cid: null, verify: null,
  fs: (() => { try { return localStorage.getItem('tahfidh_fs') || ''; } catch { return ''; } })(), site: null, lm: '', otp: null, adm: {}, mtInit: false, cf: '', ct: '', sq: '' };

const rEnd = r => r.surahTo || r.surah;                                    // سورة نهاية التسميع
const ayahs = r => Q.abs(rEnd(r), r.to) - Q.abs(r.surah, r.from) + 1;      // عدد الآيات ولو امتد عدة سور
const rngName = r => rEnd(r) !== r.surah ? `${Q.name(r.surah)} ← ${Q.name(rEnd(r))}` : Q.name(r.surah);
const inRange = (a, b) => db.records.filter(r => r.date >= a && r.date <= b);
function agg(recs) {
  const o = { h: 0, r: 0, q: 0, n: recs.length, days: new Set(), students: new Set() };
  recs.forEach(r => { r.type === 'hifz' ? o.h += ayahs(r) : r.type === 'qiraa' ? o.q += ayahs(r) : o.r += ayahs(r); o.days.add(r.date); o.students.add(r.studentId); });
  return o;
}
const enrOf = sid => db.enrollments.filter(e => e.studentId === +sid);
const enrById = id => db.enrollments.find(e => e.id === +id);
const activeEnr = sid => enrOf(sid).filter(e => e.status === 'active' && !e.prior);
function lastOf(sid, type, enr) {
  return db.records.filter(r => r.studentId === +sid && r.type === type && (enr ? r.enrollmentId === +enr : !r.enrollmentId))
    .sort((a, b) => (a.date + String(a.id).padStart(9, '0')).localeCompare(b.date + String(b.id).padStart(9, '0'))).pop();
}
function nextPos(sid, type, enr) {
  const l = lastOf(sid, type, enr), qr = type === 'qiraa', P = o => ({ ...o, surahTo: o.surah });
  if (!l) return P({ surah: qr ? 1 : (type === 'hifz' ? 78 : 1), from: 1, to: '', hint: qr ? 'بداية الختمة من سورة الفاتحة' : '' });
  const ls = rEnd(l);
  if (l.to < Q.count(ls)) return P({ surah: ls, from: l.to + 1, to: '', hint: `آخر موضع: ${Q.name(ls)} آية ${l.to} — يبدأ من الآية ${l.to + 1}` });
  if (ls === 114) return P({ surah: 114, from: 1, to: '', hint: qr ? 'ما شاء الله! أتمّ الختمة 🎉' : 'ما شاء الله! أتمّ المصحف 🎉' });
  return P({ surah: ls + 1, from: 1, to: '', hint: `أنهى سورة ${Q.name(ls)} — اقتراح: ${Q.name(ls + 1)} من أولها` });
}
// البرنامج الحالي للطالب: آخر ما سُمِّع له، وإلا ختمته الجارية إن كان حافظاً أو في برنامج القراءات
function currentEnr(sid) {
  const act = activeEnr(sid), s = student(sid);
  const last = db.records.filter(r => r.studentId === +sid).sort((a, b) => (b.date + String(b.id).padStart(9, '0')).localeCompare(a.date + String(a.id).padStart(9, '0')))[0];
  if (last) return last.type === 'qiraa' ? (act.some(e => e.id === last.enrollmentId) ? last.enrollmentId : (act[0] ? act[0].id : '')) : (s && s.program === 'qiraat' && act[0] ? act[0].id : '');
  return s && act.length && (s.program === 'qiraat' || s.hafiz) ? act[act.length - 1].id : '';
}
function curLine(s) {
  const e = currentEnr(s.id), l = lastOf(s.id, e ? 'qiraa' : 'hifz', e), en = e ? enrById(e) : null;
  return `${en ? '📚 ' + en.label : (s.program === 'qiraat' ? '📚 قراءات' : '📖 حفظ ومراجعة')}${l ? ' • وصل: ' + Q.name(rEnd(l)) + ' آية ' + l.to : ''}`;
}
const newForm = (sid, type = 'hifz', enr = null) => {
  const s = student(sid);
  if (enr === null) enr = s ? currentEnr(s.id) : '';
  if (enr) type = 'qiraa';
  return { id: null, sid: sid || '', type, enr: enr ? String(enr) : '', date: today(), grade: '', note: '', ...nextPos(sid, type, enr) };
};
// خريطة الحفظ: enr فارغ = حفظ المصحف، وإلا ختمة القراءة المحددة. raw = تجاهل علامة «حافظ» اليدوية
function memorized(sid, enr, raw) {
  const m = new Uint8Array(Q.TOTAL), s = student(sid);
  if (!enr && !raw && s && s.hafiz) { m.fill(1); return m; }
  db.records.filter(r => r.studentId === +sid && (enr ? r.type === 'qiraa' && r.enrollmentId === +enr : r.type === 'hifz' && !r.enrollmentId)).forEach(r => {
    for (let i = Q.abs(r.surah, r.from); i <= Q.abs(rEnd(r), r.to); i++) m[i - 1] = 1;
  });
  return m;
}
const typeAr = r => ({ hifz: 'حفظ', review: 'مراجعة', qiraa: 'قراءة' }[r.type]);
const typeCls = r => ({ hifz: 'h', review: 'r', qiraa: 'q' }[r.type]);
const qiraatOn = () => staff() && !!db.me.qiraat;
const qiraatAny = () => !!db.me.qiraat || db.users.some(u => u.role === 'teacher' && u.qiraat);
const rwOptions = sel => QURRA.map(([, qn, rs]) => `<optgroup label="${qn}">${rs.map(([k, n]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${n} عن ${qn}</option>`).join('')}</optgroup>`).join('');
const enrTag = r => r.enrollmentId && enrById(r.enrollmentId) ? `<span class="badge b-rw">${esc(enrById(r.enrollmentId).label)}</span>` : '';
const recText = r => rEnd(r) !== r.surah ? `من سورة ${Q.name(r.surah)} آية ${r.from} إلى سورة ${Q.name(rEnd(r))} آية ${r.to}`
  : `سورة ${Q.name(r.surah)} (${r.from === r.to ? 'آية ' + r.from : 'من آية ' + r.from + ' إلى ' + r.to})`;

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

/* ---------- حالة المنصة (تظهر في صفحتي الدخول والتسجيل؛ اجعلها null لإخفائها) ---------- */
const PLATFORM_STATUS = {
  badge: '🧪 نسخة تجريبية • مجانية حالياً',
  note: 'المنصة في مرحلة التجربة والتطوير، والاستخدام مجاني خلال هذه الفترة. قد تُضاف ميزات جديدة وقد يتغير بعضها، وملاحظاتك تساعدنا على تحسينها.'
};
const beta = () => (st.site && st.site.beta) || PLATFORM_STATUS;
const betaPill = () => beta() && beta().badge ? `<span class="beta">${esc(beta().badge)}</span>` : '';
const betaNote = () => beta() && beta().note ? `<div class="betanote">ℹ️ ${esc(beta().note)}</div>` : '';

/* ---------- الدخول ---------- */
const LM = { email: ['📧 بالبريد', 'email'], wa: ['💬 واتساب', 'wa'], sms: ['📱 رسالة', 'sms'], pw: ['🔑 كلمة المرور', 'pw'] };
function loginMethods() {
  const m = (st.site && st.site.methods) || { password: true, email: true };
  return ['email', 'wa', 'sms'].filter(k => m[k]).concat(m.password !== false ? ['pw'] : []);
}
function renderLogin() {
  const ms = loginMethods(), cur = ms.includes(st.lm) ? st.lm : (ms[0] || 'pw'), br = platformBrand(), o = st.otp && st.otp.ch === cur ? st.otp : null;
  const otpBlock = !o || !o.sent ? `
      <form id="otpsend" class="gap">
        <div><label class="f">${cur === 'email' ? 'بريدك الإلكتروني' : 'رقم جوالك'}</label>
          <input name="ident" required value="${esc(o ? o.ident : '')}" ${cur === 'email' ? 'type="email" inputmode="email" autocomplete="email" placeholder="name@example.com"' : 'type="tel" inputmode="tel" autocomplete="tel" placeholder="05xxxxxxxx"'} autocapitalize="off" autofocus></div>
        <button class="btn block">إرسال رمز الدخول</button>
        <p class="hint" style="text-align:center;margin:0">سيصلك رمز من 6 أرقام ${cur === 'email' ? 'على بريدك' : cur === 'wa' ? 'على واتساب' : 'برسالة نصية'} — دون كلمة مرور.</p>
      </form>` : `
      <form id="otpform" class="gap">
        <div class="info" style="text-align:start">✅ أرسلنا رمزاً إلى <b dir="ltr">${esc(o.ident)}</b><br><small>أدخل الرمز المكوّن من 6 أرقام (صالح لفترة قصيرة).</small></div>
        <input name="code" required inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="\d{6}" placeholder="••••••" style="text-align:center;font-size:26px;letter-spacing:10px;font-weight:800" autofocus>
        <label class="row" style="gap:8px;font-size:14px"><input type="checkbox" name="rem" style="width:auto;flex:none" checked> تذكّر دخولي على هذا الجهاز</label>
        <button class="btn block">تأكيد ودخول</button>
        <div class="row"><button type="button" class="btn light sm" data-act="otp-resend" id="otp_resend">إعادة إرسال الرمز</button><button type="button" class="btn light sm" data-act="otp-change">تغيير ${cur === 'email' ? 'البريد' : 'الرقم'}</button></div>
      </form>`;
  const pwBlock = `
      <form id="login" class="gap">
        <div><label class="f">البريد الإلكتروني / رقم الجوال / اسم المستخدم</label><input name="username" required autocomplete="username" autocapitalize="off" inputmode="text" autofocus></div>
        <div><label class="f">كلمة المرور</label>
          <div class="pwbox"><input name="pw" id="pw" type="password" required autocomplete="current-password"><button type="button" data-act="showpw">👁</button></div></div>
        <label class="row" style="gap:8px;font-size:14px"><input type="checkbox" name="rem" style="width:auto;flex:none" checked> تذكّر دخولي على هذا الجهاز</label>
        <button class="btn block">دخول</button>
      </form>`;
  $('#app').innerHTML = `
  <div class="auth">
    <div class="verse top">﴿ وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ فَهَلْ مِن مُّدَّكِرٍ ﴾</div>
    <div class="brand">${logoImg()}<h1>${esc(br.name)}</h1><p>${esc(br.tagline || 'سجّل دخولك لمتابعة الحفظ والمراجعة')}</p>${betaPill()}</div>
    <div class="card">
      <h3>👋 تسجيل الدخول</h3>
      ${ms.length > 1 ? `<div class="seg" style="margin-bottom:12px">${ms.map(k => `<button class="${cur === k ? 'on' : ''}" data-act="lm" data-id="${k}" style="font-size:13px">${LM[k][0]}</button>`).join('')}</div>` : ''}
      ${ms.length ? (cur === 'pw' ? pwBlock : otpBlock) : '<div class="info err">الدخول متوقف مؤقتاً، حاول لاحقاً.</div>'}
      ${!st.site || st.site.reg_open !== false ? '<button type="button" class="btn ghost block" style="margin-top:12px" data-act="signup">📝 طلب تسجيل جديد</button><p class="hint" style="text-align:center;margin:8px 0 0">التسجيل الجديد يُفعَّل بعد موافقة الإدارة.</p>' : ''}
    </div>
    ${betaNote()}
  </div>`;
}
function renderSignup() {
  const d = st.signupDone, br = platformBrand();
  $('#app').innerHTML = `
  <div class="auth"><div class="brand">${logoImg()}<h1>تسجيل جديد</h1><p>سيُراجع طلبك ويُفعَّل بعد الموافقة</p>${betaPill()}</div>
    <div class="card">${d ? `<div class="empty"><span class="ico">✅</span><b>تم إرسال طلبك</b><br>ستراجعه الإدارة، وبعد الموافقة تصلك رسالة على بريدك وتدخل ببريدك برمز يصلك.</div><button class="btn block" data-act="to-login">العودة لتسجيل الدخول</button>` : `
    <form id="signupform" class="gap">
      <div><label class="f">نوع التسجيل</label><select name="role" id="su_role"><option value="solo">🧑‍🏫 معلم مستقل (حلقتي الخاصة)</option><option value="school">🏫 مدرسة / مقرأة (لها مدير ومعلمون)</option></select></div>
      <div><label class="f">الاسم الكامل</label><input name="name" required></div>
      <div><label class="f">البريد الإلكتروني <span class="hint">(اسم الدخول، وعليه يصلك رمز الدخول)</span></label><input name="email" type="email" required inputmode="email" autocapitalize="off" autocomplete="email" placeholder="name@example.com"></div>
      <div><label class="f">رقم الجوال <span class="hint">(اختياري)</span></label><input name="phone" type="tel" inputmode="tel" placeholder="05xxxxxxxx"></div>
      <div id="su_sname"><label class="f" id="su_snl">اسم الحلقة <span class="hint">(اختياري)</span></label><input name="sname" maxlength="120" placeholder="مثال: حلقة الشيخ ..."></div>
      <div><label class="f">كلمة المرور (٦ أحرف على الأقل)</label><input name="pw" type="password" minlength="6" required autocomplete="new-password"></div>
      <div><label class="f">تأكيد كلمة المرور</label><input name="pw2" type="password" minlength="6" required autocomplete="new-password"></div>
      <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button class="btn block gold">إرسال الطلب</button><button type="button" class="btn light block" data-act="to-login">رجوع</button>
    </form>`}</div>
    <div class="betanote">المعلمون والطلاب وأولياء الأمور لا يسجّلون بأنفسهم: يضيفهم مدير المدرسة أو المعلم المستقل، ثم يدخلون ببريدهم برمز يصلهم.</div>
    ${betaNote()}</div>`;
}
function suToggle(r) {
  const sn = $('#su_sname input'), lb = $('#su_snl');
  if (sn) sn.required = r === 'school';
  if (lb) lb.innerHTML = r === 'school' ? 'اسم المدرسة / المقرأة' : 'اسم الحلقة <span class="hint">(اختياري)</span>';
}
function renderForce() {
  $('#app').innerHTML = `
  <div class="auth"><div class="brand">${logoImg()}<h1>مرحباً ${esc(db.me.name)}</h1><p>اختر كلمة مرور جديدة لحسابك قبل المتابعة</p></div>
    <div class="card"><form id="pwform" class="gap" data-force="1">
      <div><label class="f">كلمة المرور الحالية (المؤقتة)</label><input name="old" type="password" required autocomplete="current-password"></div>
      <div><label class="f">كلمة المرور الجديدة (٦ أحرف على الأقل)</label><input name="new" type="password" minlength="6" required autocomplete="new-password"></div>
      <button class="btn block gold">حفظ ومتابعة</button><button type="button" class="btn ghost block" data-act="skip-force">لاحقاً — سأغيّرها من «حسابي»</button><button type="button" class="btn light block sm" data-act="logout">تسجيل الخروج</button>
    </form></div></div>`;
}
async function logout() { try { await api('logout', {}); } catch { } db = blank(); st.otp = null; st.view = 'home'; st.thread = null; st.form = null; st.skipForce = false; render(); }

/* ---------- الإطار ---------- */
const TITLES = {
  home: () => staff() ? ['الرئيسية', ''] : [role() === 'parent' ? 'أبنائي' : 'متابعتي', ''],
  add: () => ['تسجيل تسميع', 'حفظ جديد أو مراجعة'], students: () => ['الطلاب', ''], student: () => ['ملف الطالب', ''],
  stats: () => ['الإحصائيات', 'أسبوعية وشهرية'], report: () => ['التقرير الشهري', 'قابل للطباعة PDF'], settings: () => ['الإعدادات', 'القراءات'], monthly: () => ['الكشف الشهري', 'إحصائيات الحلقة'], cert: () => ['الشهادة', 'قابلة للطباعة'], statement: () => ['كشف التسميع', 'للفترة المختارة'], messages: () => ['الرسائل', 'ملاحظات واستفسارات'],
  manage: () => ['الإدارة', 'لوحة التحكم والحسابات'], account: () => ['حسابي', ''], search: () => ['البحث', 'في حدود صلاحياتك']
};
function tabsHtml() {
  const v = st.view, n = totalUnread();
  const on = (...k) => k.includes(v) ? 'on' : '';
  const t = (k, ic, l, key, badge) => `<button class="${on(...key)}" data-act="nav" data-id="${k}"><span>${ic}${badge ? `<em class="bdg">${badge}</em>` : ''}</span>${l}</button>`;
  if (staff()) return `
    ${t('home', '🏠', 'الرئيسية', ['home', 'monthly', 'stats'])}${t('students', '👥', 'الطلاب', ['students', 'student', 'report', 'cert', 'statement'])}
    <button class="fab" data-act="nav" data-id="add"><span>＋</span>تسميع</button>
    ${t('messages', '💬', 'الرسائل', ['messages'], n)}${t(isMgr() ? 'manage' : 'account', '⚙️', isMgr() ? 'الإدارة' : 'حسابي', ['manage', 'account', 'settings'], isMgr() ? db.requests.length : 0)}`;
  return `${t('home', '🏠', role() === 'parent' ? 'أبنائي' : 'متابعتي', ['home', 'student', 'report', 'cert', 'statement'])}${t('stats', '📊', 'إحصائيات', ['stats'])}
    ${t('messages', '💬', 'الرسائل', ['messages'], n)}${t('account', '👤', 'حسابي', ['account'])}`;
}
function updateTabbar() { const t = $('.tabbar'); if (t) t.innerHTML = tabsHtml(); }
function shell(body) {
  const d = new Date(), [t, sub] = TITLES[st.view]();
  $('#app').innerHTML = `
  <header class="hdr">
    <div class="hdr-row">${logoImg()}<div class="grow"><h1>${esc(brand().name)}</h1><small>${esc(db.me.name)} • ${roleLabel(db.me)}</small></div>
      <button class="hbtn" data-act="nav" data-id="search" title="بحث">🔍</button>
      <button class="hbtn" data-act="logout" title="تسجيل الخروج">🚪</button>
      <div style="text-align:end;font-size:12.5px;line-height:1.4"><b>${fmtDay(d)}</b><br>${fmtG(d)}<br>${fmtH(d)}</div></div>
    <div class="pagetitle">${t}${sub ? `<small>${sub}</small>` : ''}</div>
    ${isAdmin() && db.schools.length > 1 ? `<select id="fschool" class="fsel" title="تصفية بحسب المدرسة"><option value="">🏫 كل المدارس</option>${db.schools.map(x => `<option value="${x.id}" ${+st.fs === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>` : ''}
  </header>
  <main>${db.me.must_change ? '<div class="card" data-act="nav" data-id="account" style="border:1.5px solid var(--gold);background:var(--gold2);cursor:pointer"><b>🔑 كلمة مرورك مؤقتة</b><div class="hint">اضغط هنا لتغييرها متى شئت — لا يمنعك شيء من العمل.</div></div>' : ''}${body}</main>
  <nav class="tabbar">${tabsHtml()}</nav>`;
}

/* ---------- عناصر مشتركة ---------- */
function recCard(r, opts = {}) {
  const s = student(r.studentId), d = parse(r.date);
  return `<div class="rec ${r.type === 'review' ? 'review' : ''}">
    <div class="top"><span class="badge ${r.type === 'hifz' ? 'b-hifz' : r.type === 'qiraa' ? 'b-rw' : 'b-rev'}">${{ hifz: '📖 حفظ', review: '🔁 مراجعة', qiraa: '📚 قراءة' }[r.type]}</span>
      ${r.grade ? `<span class="badge ${gcls(r.grade)}">${r.grade}</span>` : ''}${enrTag(r)}
      ${opts.noName || !s ? '' : `<span class="who">${esc(s.name)}</span>`}</div>
    <div class="sn">${recText(r)}</div>
    <div class="meta">${ayahs(r)} آية • ${Q.juzText(r.surah, r.from, r.to, rEnd(r))} • ${fmtDay(d)} ${fmtS(d)}</div>
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
const annCard = () => db.app && db.app.announce ? `<div class="card" style="border:1.5px solid var(--gold);background:var(--gold2)"><h3>📢 ${esc(db.app.announce.title || 'إعلان')}</h3><div style="white-space:pre-wrap">${esc(db.app.announce.text)}</div></div>` : '';
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
  ${annCard()}<div class="stats">
    <div class="stat"><b>${td.n}</b><span>تسميع اليوم</span></div>
    <div class="stat gold"><b>${wk.h}</b><span>آيات حفظ الأسبوع</span></div>
    <div class="stat blue"><b>${wk.r}</b><span>آيات مراجعة الأسبوع</span></div>
  </div>
  <div class="row" style="margin-bottom:14px"><button class="btn ghost" data-act="nav" data-id="stats">📊 الإحصائيات</button><button class="btn ghost" data-act="open-monthly">📑 الكشف الشهري</button></div>
  ${new Date().getDate() <= 7 ? `<div class="card" data-act="open-monthly" style="cursor:pointer;border:1.5px solid var(--gold)"><h3>📑 كشف شهر ${monthRange(-1).label} جاهز <span class="more">عرض ›</span></h3></div>` : ''}
  ${un ? `<div class="card" data-act="nav" data-id="messages" style="cursor:pointer"><h3>💬 لديك ${un} رسالة جديدة <span class="more">عرض ›</span></h3></div>` : ''}
  ${!db.students.length ? `<div class="card">${empty('👥', isMgr() ? 'ابدأ بإنشاء مدرسة ومعلم وطلاب من تبويب الإدارة' : 'لم يُسند إليك طلاب بعد، تواصل مع المدير')}${isMgr() ? '<button class="btn block" data-act="nav" data-id="manage">⚙️ الذهاب للإدارة</button>' : ''}</div>` : `
  <div class="card"><h3>🌟 الأكثر نشاطاً هذا الأسبوع</h3>
    ${top.length ? `<div class="list">${top.map(({ s, a: x }, i) => `<div class="item" data-act="open-student" data-id="${s.id}"><div class="avatar">${['🥇', '🥈', '🥉'][i]}</div>
      <div class="t"><b>${esc(s.name)}</b><small>حفظ ${x.h} • مراجعة ${x.r}${x.q ? ' • قراءة ' + x.q : ''} آية</small></div><div class="side"><b>${x.days.size}</b><small>أيام</small></div></div>`).join('')}</div>` : empty('🌱', 'لا يوجد تسميع هذا الأسبوع بعد')}
  </div>
  ${absent.length ? `<div class="card"><h3>⏳ لم يسمّعوا اليوم (${absent.length})</h3><div class="chips">${absent.map(s => `<button class="chip" data-act="quick" data-id="${s.id}">${esc(s.name)}</button>`).join('')}</div><p class="hint">اضغط على الاسم لتسجيل تسميعه</p></div>` : ''}`}
  <div class="card"><h3>📋 تسميع اليوم</h3>
    ${tod.length ? `<div class="list">${tod.map(r => recCard(r)).join('')}</div>` : empty('📖', 'لا يوجد تسميع اليوم')}
  </div>`;
}

/* ---------- الرئيسية (ولي أمر / طالب) ---------- */
const viewKids = () => annCard() + viewKidsBody();
function viewKidsBody() {
  if (!db.students.length) return `<div class="card">${empty('🔗', 'لم يُربط أي طالب بحسابك بعد.<br>تواصل مع إدارة الحلقة.')}</div>`;
  if (db.students.length === 1) { st.sid = db.students[0].id; return viewStudent(); }
  return `<div class="list">${db.students.map(s => {
    const { total, p, w } = progressCard(s), un = unread(s.id);
    return `<div class="item" data-act="open-student" data-id="${s.id}"><div class="avatar">${initial(s.name)}</div>
      <div class="t"><b>${esc(s.name)}</b><small>${esc(schoolName(s.school_id))}${s.group ? ' • ' + esc(s.group) : ''}</small>
        <div class="pbar"><i style="width:${Math.max(p, 1)}%"></i></div><small>محفوظ ${total} آية (${p.toFixed(1)}%)</small></div>
      <div class="side"><b>${w.h + w.r + w.q}</b><small>آية/أسبوع</small>${un ? `<em class="bdg inl">${un}</em>` : ''}</div></div>`;
  }).join('')}</div>`;
}

/* ---------- تسجيل تسميع ---------- */
function viewAdd() {
  const f = st.form || (st.form = newForm(''));
  if (!db.students.length) return `<div class="card">${empty('👥', 'لا يوجد طلاب لتسجيل التسميع')}</div>`;
  const so = student(f.sid), ac = so ? activeEnr(so.id) : [], s2 = +(f.surahTo || f.surah);
  const progSel = so && (ac.length || so.program === 'qiraat')
    ? `<select data-f="enr" title="البرنامج">${so.program !== 'qiraat' ? `<option value="" ${!f.enr ? 'selected' : ''}>📖 حفظ ومراجعة</option>` : ''}${ac.map(e => `<option value="${e.id}" ${+f.enr === e.id ? 'selected' : ''}>📚 ${esc(e.label)}</option>`).join('')}</select>` : '';
  return `
  <div class="card tight">
    ${st.fixed && f.sid && so ? `<div class="cmp"><button type="button" class="btn light sm" data-act="nav" data-id="students" title="الطلاب">→</button>
        <div class="avatar" style="width:38px;height:38px;font-size:16px;border-radius:12px">${initial(so.name)}</div>
        <div style="flex:1;min-width:0"><b style="font-size:17px">${esc(so.name)}</b><div class="hint" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(curLine(so))}</div></div>
        <button type="button" class="btn light sm" data-act="open-student" data-id="${f.sid}" title="ملف الطالب">📂</button></div>`
      : `<select data-f="sid"><option value="">— اختر الطالب —</option>${db.students.map(x => `<option value="${x.id}" ${+f.sid === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`}
    <div class="cmp">${progSel}<input type="date" data-f="date" value="${f.date}" max="${today()}" style="${progSel ? 'width:150px;flex:none' : 'flex:1'}"><span id="dayname" hidden></span></div>
    ${!f.enr ? `<div class="seg gold sm"><button class="${f.type === 'hifz' ? 'on' : ''}" data-act="type" data-id="hifz">📖 حفظ جديد</button><button class="${f.type === 'review' ? 'on' : ''}" data-act="type" data-id="review">🔁 مراجعة</button></div>` : ''}
    <div class="cmp"><b>من</b><select data-f="surah">${SURAHS.map((x, i) => `<option value="${i + 1}" ${+f.surah === i + 1 ? 'selected' : ''}>${i + 1} - ${x[0]}</option>`).join('')}</select>
      <input type="number" inputmode="numeric" data-f="from" value="${f.from}" min="1" max="${Q.count(+f.surah)}" placeholder="آية 1–${Q.count(+f.surah)}" title="رقم الآية"></div>
    <div class="cmp"><b>إلى</b><select data-f="surahTo">${SURAHS.map((x, i) => i + 1 >= +f.surah ? `<option value="${i + 1}" ${s2 === i + 1 ? 'selected' : ''}>${i + 1} - ${x[0]}</option>` : '').join('')}</select>
      <input type="number" inputmode="numeric" data-f="to" value="${f.to}" min="1" max="${Q.count(s2)}" placeholder="آية 1–${Q.count(s2)}" title="رقم الآية"></div>
    <div class="hscroll">${[5, 10, 15, 20].map(n => `<button type="button" class="chip" data-act="len" data-id="${n}">${n} آيات</button>`).join('')}<button type="button" class="chip" data-act="len" data-id="end">إلى نهاية السورة</button></div>
    ${f.hint ? `<div class="hint" id="poshint" style="margin:-2px 0">💡 ${esc(f.hint)}</div>` : ''}
    <div class="info sm" id="info"></div>
    <div class="hscroll" id="grades"><span class="hint" style="align-self:center">التقدير</span>${GRADES.map(g => `<button type="button" class="chip ${f.grade === g ? 'on' : ''}" data-act="grade" data-id="${g}">${g}</button>`).join('')}</div>
    <input data-f="note" maxlength="500" value="${esc(f.note)}" placeholder="ملاحظة تظهر لولي الأمر (اختياري)">
    <button class="btn block gold" data-act="save-rec">${f.id ? '💾 حفظ التعديل' : '✅ حفظ التسميع'}</button>
    ${f.id ? '<button class="btn light block" data-act="cancel-edit">إلغاء التعديل</button>' : ''}
  </div>
  ${st.fixed && f.sid && !f.id ? (() => { const rc = db.records.filter(r => r.studentId === +f.sid).sort((a, b) => (b.date + String(b.id).padStart(9, '0')).localeCompare(a.date + String(a.id).padStart(9, '0'))).slice(0, 3);
    return rc.length ? `<div class="card"><h3>🕘 آخر تسميعاته</h3><div class="list">${rc.map(r => recCard(r, { noName: true })).join('')}</div></div>` : ''; })() : ''}`;
}
function checkForm() {
  const f = st.form, s = +f.surah, s2 = +(f.surahTo || f.surah), a = +f.from, b = +f.to;
  if (!f.from || !f.to) return { ok: false, msg: `أدخل رقم الآية — سورة ${Q.name(s)} فيها ${Q.count(s)} آية` };
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 1) return { ok: false, msg: 'أرقام الآيات غير صحيحة' };
  if (a > Q.count(s)) return { ok: false, msg: `سورة ${Q.name(s)} عدد آياتها ${Q.count(s)} فقط` };
  if (b > Q.count(s2)) return { ok: false, msg: `سورة ${Q.name(s2)} عدد آياتها ${Q.count(s2)} فقط` };
  if (s2 < s || (s2 === s && a > b)) return { ok: false, msg: 'نهاية التسميع قبل بدايته' };
  const r = { surah: s, from: a, surahTo: s2, to: b };
  return { ok: true, msg: `${recText(r)} • ${ayahs(r)} آية • ${Q.juzText(s, a, b, s2)}` };
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
  const r = await api('record_save', { id: f.id, studentId: +f.sid, date: f.date, type: f.type, enrollmentId: +f.enr || null, surah: +f.surah, from: +f.from, surahTo: +(f.surahTo || f.surah), to: +f.to, grade: f.grade, note: f.note.trim() });
  db.records = db.records.filter(x => x.id !== r.record.id); db.records.push(r.record);
  let done = false;
  if (r.enrollment) { const old = enrById(r.enrollment.id); done = r.enrollment.status === 'completed' && (!old || old.status !== 'completed'); db.enrollments = db.enrollments.filter(e => e.id !== r.enrollment.id); db.enrollments.push(r.enrollment); }
  const was = f.id, sid = f.sid, type = f.type, date = f.date, enr = f.enr;
  st.form = { ...newForm(sid, type, enr), date };
  toast(done ? '🎉 أتمّ الختمة كاملة! أصدر له شهادة من ملفه' : was ? 'تم تعديل التسميع ✔' : 'تم حفظ التسميع ✔'); render();
}

/* ---------- الطلاب ---------- */
function viewStudents() {
  const list = db.students.filter(s => s.name.includes(st.q) || (s.group || '').includes(st.q));
  return `
  <p class="hint" style="margin:0 4px 8px">اضغط الطالب للتسميع على برنامجه الحالي، و📂 لملفه وسيرته.</p>
  <div class="card"><div class="row"><input id="q" placeholder="🔍 بحث عن طالب..." value="${esc(st.q)}">${isMgr() ? '<button class="btn auto" data-act="add-student">＋ طالب</button>' : ''}</div></div>
  ${list.length ? `<div class="list">${list.map(s => {
    const { total, w } = progressCard(s), t = tObj(s), un = unread(s.id);
    return `<div class="item" data-act="quick" data-id="${s.id}"><div class="avatar">${initial(s.name)}</div>
      <div class="t"><b>${esc(s.name)}</b><small>${esc(curLine(s))}${s.group ? ' • ' + esc(s.group) : ''}${isMgr() && t ? ' • ' + esc(t.name) : ''}</small></div>
      <div class="side"><b>${w.h + w.r + w.q}</b><small>آية/أسبوع</small>${un ? `<em class="bdg inl">${un}</em>` : ''}</div>
      <button class="btn light sm auto" data-act="open-student" data-id="${s.id}" title="ملف الطالب" style="margin-inline-start:6px">📂</button></div>`;
  }).join('')}</div>` : `<div class="card">${empty('👥', db.students.length ? 'لا توجد نتائج' : 'لا يوجد طلاب بعد')}</div>`}`;
}
function teacherChecks(school, sel) {
  const ts = db.users.filter(u => (u.role === 'teacher' || (u.role === 'school_admin' && u.solo)) && (!school || u.school_id === +school));
  return ts.length ? ts.map(t => `<label><input type="checkbox" name="tch" value="${t.id}" ${(sel || []).includes(t.id) ? 'checked' : ''}> ${esc(t.name)}${t.solo ? ' <small class="hint">معلم مستقل</small>' : ''}</label>`).join('') : '<p class="hint">لا يوجد معلمون في هذه المدرسة بعد.</p>';
}
function teacherOptions(school, sel) {
  const ts = db.users.filter(u => (u.role === 'teacher' || (u.role === 'school_admin' && u.solo)) && (!school || u.school_id === +school));
  return `<option value="">— بدون معلم —</option>` + ts.map(t => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
}
function studentForm(s) {
  if (!db.schools.length) return toast('أنشئ مدرسة أولاً من تبويب الإدارة');
  const parents = db.users.filter(u => u.role === 'parent'), su = s && s.user_id ? userById(s.user_id) : null;
  const sch = s ? s.school_id : db.schools[0].id;
  modal(`<h2>${s ? 'تعديل بيانات الطالب' : 'إضافة طالب'}</h2>
  <form id="stform" class="gap" data-id="${s ? s.id : ''}">
    <div><label class="f">اسم الطالب</label><input name="name" required value="${esc(s?.name)}"></div>
    ${isAdmin() ? `<div><label class="f">المدرسة</label><select name="school" id="st_school">${db.schools.map(x => `<option value="${x.id}" ${x.id === sch ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>` : `<input type="hidden" name="school" id="st_school" value="${sch}">`}
    <div><label class="f">المعلمون <span class="hint">(يمكن اختيار أكثر من معلم للطالب)</span></label><div class="checks" id="st_teachers">${teacherChecks(sch, s ? (s.teachers || []) : (db.me.solo ? [db.me.id] : []))}</div></div>
    <div><label class="f">البرنامج</label><select name="program" id="st_program"><option value="hifz" ${(s?.program || 'hifz') === 'hifz' ? 'selected' : ''}>📖 حفظ ومراجعة</option>${qiraatAny() || s?.program === 'qiraat' ? `<option value="qiraat" ${s?.program === 'qiraat' ? 'selected' : ''}>📚 قراءات (للحافظين فقط)</option>` : ''}</select></div>
    <div style="border:1.5px solid var(--line);border-radius:14px;padding:12px;background:#fff">
      <label class="row" style="gap:8px"><input type="checkbox" name="hafiz" id="st_hafiz" style="width:auto;flex:none" ${s?.hafiz ? 'checked' : ''}> <b>أتمّ حفظ المصحف كاملاً مسبقاً</b></label>
      <div class="gap" style="margin-top:8px"><input name="hafwhere" maxlength="160" value="${esc(s?.hafizWhere)}" placeholder="أين أتمّه؟ (اختياري)"><textarea name="hafnote" maxlength="300" placeholder="ملاحظات (اختياري)">${esc(s?.hafizNote)}</textarea></div></div>
    ${!s ? `<div><label class="f">قراءات / روايات أتمّها سابقاً <span class="hint">(اختياري)</span></label><div class="jamgrid">${QURRA.map(([, qn, rs]) => `<div style="padding:3px 0"><b style="color:var(--g1);font-size:13px">${qn}</b> ${rs.map(([k, n]) => `<label><input type="checkbox" name="prk" value="${k}"> ${n}</label>`).join('')}</div>`).join('')}</div>
      <input name="prior_where" maxlength="160" style="margin-top:8px" placeholder="عند من / أين أتمّها؟ (اختياري)"></div>` : ''}
    <div><label class="f">المجموعة / الحلقة <span class="hint">(اختياري)</span></label><input name="group" value="${esc(s?.group)}" placeholder="مثال: حلقة الفجر"></div>
    <div><label class="f">أولياء الأمور المرتبطون</label>
      ${parents.length ? `<div class="checks">${parents.map(p => `<label><input type="checkbox" name="par" value="${p.id}" ${s && s.parents.includes(p.id) ? 'checked' : ''}> ${esc(p.name)} <small class="hint">${esc(p.email || p.username)}</small></label>`).join('')}</div>` : '<p class="hint">لا يوجد أولياء أمور مسجّلون بعد — أضف ولي الأمر هنا بالأسفل.</p>'}</div>
    <div id="np_box" class="gap" style="border:1.5px dashed var(--g2);border-radius:14px;padding:12px;background:var(--g3)"><label class="f" style="margin:0">➕ ولي أمر جديد <span class="hint">(يُسجَّل ببريده ويُربط بهذا الطالب، وتصله دعوة ويدخل برمز)</span></label>
      <div class="np_row gap"><input name="np_name" placeholder="اسم ولي الأمر"><input name="np_email" type="email" inputmode="email" autocapitalize="off" placeholder="البريد الإلكتروني (مطلوب)"><input name="np_phone" type="tel" placeholder="الجوال (اختياري)"></div>
      <button type="button" class="btn light sm" data-act="np-add">＋ ولي أمر آخر</button></div>
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
  const act = activeEnr(s.id), tabs = (s.program !== 'qiraat' ? [{ k: '', l: '📖 حفظ ومراجعة' }] : []).concat(act.map(e => ({ k: String(e.id), l: '📚 ' + e.label })));
  const want = st.pe == null ? String(currentEnr(s.id)) : String(st.pe);
  const cur = tabs.some(x => x.k === want) ? want : (tabs[0] ? tabs[0].k : '');
  const m = memorized(s.id, cur), total = m.reduce((x, y) => x + y, 0), { w } = progressCard(s);
  const recs = db.records.filter(r => r.studentId === s.id).sort((a, b) => (b.date + String(b.id).padStart(9, '0')).localeCompare(a.date + String(a.id).padStart(9, '0')));
  const juz = Array.from({ length: 30 }, (_, i) => {
    const a = Q.juzAbs[i], e = (Q.juzAbs[i + 1] || Q.TOTAL + 1) - 1; let c = 0;
    for (let k = a; k <= e; k++) c += m[k - 1]; return Math.round(c * 100 / (e - a + 1));
  });
  const lastH = lastOf(s.id, cur ? 'qiraa' : 'hifz', cur), t = tObj(s), un = unread(s.id);
  const back = staff() ? 'students' : (db.students.length > 1 ? 'home' : '');
  return `
  <div class="card">
    <div class="row" style="margin-bottom:12px">${back ? `<button class="btn light sm auto" data-act="nav" data-id="${back}">→ رجوع</button>` : ''}<span></span>
      ${isMgr() ? `<button class="btn light sm auto" data-act="edit-student" data-id="${s.id}">✏️ تعديل</button>` : ''}</div>
    <div class="item" style="border:0;padding:0;cursor:default"><div class="avatar">${initial(s.name)}</div>
      <div class="t"><b style="font-size:19px">${esc(s.name)}</b><small>${[schoolName(s.school_id), s.group, t ? ((s.teachers || []).length > 1 ? 'المعلمون: ' : 'المعلم: ') + t.name : ''].filter(Boolean).map(esc).join(' • ')}</small></div></div>
  </div>
  ${tabs.length > 1 ? `<div class="card"><h3>📚 البرنامج</h3><div class="chips">${tabs.map(x => `<button class="chip ${x.k === cur ? 'on' : ''}" data-act="pe" data-id="${x.k}">${esc(x.l)}</button>`).join('')}</div></div>` : ''}
  ${progCard(s)}
  <div class="stats">
    <div class="stat"><b>${total}</b><span>${cur ? 'آية قُرئت من الختمة' : 'آية محفوظة'}</span></div>
    <div class="stat gold"><b>${(total * 100 / Q.TOTAL).toFixed(1)}%</b><span>من القرآن</span></div>
    <div class="stat blue"><b>${w.h + w.r + w.q}</b><span>آيات الأسبوع</span></div>
  </div>
  <div class="row" style="margin-bottom:10px"><button class="btn ghost" data-act="open-report" data-id="${s.id}">📄 التقرير الشهري</button><button class="btn ghost" data-act="open-stmt" data-id="${s.id}">📑 كشف التسميع</button></div>
  <div class="row" style="margin-bottom:14px">
    ${staff() ? `<button class="btn gold" data-act="quick" data-id="${s.id}">＋ تسميع جديد</button><button class="btn ghost" data-act="report" data-id="${s.id}">📤 تقرير الأسبوع</button>`
      : `<button class="btn gold" data-act="open-thread" data-id="${s.id}">💬 مراسلة المعلم${un ? ` (${un})` : ''}</button>`}
  </div>
  ${staff() ? `<div class="row" style="margin:-4px 0 14px"><button class="btn light" data-act="open-thread" data-id="${s.id}">💬 الرسائل${un ? ` (${un} جديدة)` : ''}</button></div>` : ''}
  <div class="card"><h3>🗺 خريطة الأجزاء</h3>
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">${juz.map((p, i) => `<div style="text-align:center;font-size:12px;border:1.5px solid ${p ? 'var(--g2)' : 'var(--line)'};border-radius:12px;padding:6px 0;background:linear-gradient(to top,${p === 100 ? 'var(--g2)' : 'var(--g3)'} ${p}%,#fff ${p}%);color:${p === 100 ? '#fff' : 'var(--ink)'}"><b>${i + 1}</b><br><small>${p}%</small></div>`).join('')}</div>
    <p class="hint">اللون الممتلئ = الجزء محفوظ بالكامل</p></div>
  ${lastH ? `<div class="card"><h3>📍 آخر موضع ${cur ? 'قراءة' : 'حفظ'}</h3><div style="font-family:Amiri,serif;font-size:21px;color:var(--g1);font-weight:700">${recText(lastH)}</div></div>` : ''}
  ${(() => { const cs = db.certs.filter(c => c.studentId === s.id), ready = staff() && memorized(s.id, '', true).reduce((x, y) => x + y, 0) === Q.TOTAL && !cs.some(c => c.kind === 'khatm'), doneEnr = staff() ? enrOf(s.id).filter(e => e.status === 'completed' && !cs.some(c => c.enrollmentId === e.id)) : [];
    return `<div class="card"><h3>🏆 الشهادات (${cs.length}) ${staff() ? `<button class="more" data-act="cert-new" data-id="${s.id}">＋ إصدار شهادة</button>` : ''}</h3>
    ${ready ? '<div class="info" style="margin-bottom:10px">🎉 أتمّ حفظ المصحف كاملاً — يمكنك إصدار شهادة الختم</div>' : ''}
    ${doneEnr.map(e => `<div class="info" style="margin-bottom:10px;text-align:start">🎉 أتمّ ${esc(e.label)} <button class="btn gold sm" style="margin-top:6px" data-act="cert-enr" data-id="${e.id}" data-sid="${s.id}">إصدار شهادة</button></div>`).join('')}
    ${cs.length ? `<div class="list">${cs.map(c => `<div class="item" data-act="open-cert" data-id="${c.id}"><div class="avatar">🏆</div><div class="t"><b>${esc(c.title)}</b><small>${fmtG(parse(c.date))} • ${esc(c.serial)}</small></div></div>`).join('')}</div>` : empty('🏅', 'لا توجد شهادات بعد')}</div>`; })()}
  <div class="card"><h3>🕘 جدول التسميع (${recs.length})</h3>${staff()
    ? (recs.length ? `<div class="list">${recs.slice(0, 40).map(r => recCard(r, { noName: true })).join('')}</div>` : empty('📖', 'لا يوجد تسميع مسجل'))
    : recTable(recs)}</div>`;
}
function recTable(recs) {
  const f = st.rf || 'all', rows = recs.filter(r => f === 'all' || r.type === f);
  const seg = [['all', 'الكل'], ['hifz', '📖 حفظ'], ['review', '🔁 مراجعة']].concat(recs.some(r => r.type === 'qiraa') ? [['qiraa', '📚 قراءة']] : []).map(([k, l]) => `<button class="${f === k ? 'on' : ''}" data-act="rfilter" data-id="${k}">${l}</button>`).join('');
  return `<div class="seg" style="margin-bottom:10px">${seg}</div>` + (rows.length ? `<div class="tw"><table class="rt"><tr><th>التاريخ</th><th>النوع</th><th>السورة والآيات</th><th>الجزء</th><th>التقدير</th><th></th></tr>
    ${rows.map(r => { const d = parse(r.date); return `<tr><td><b>${fmtDay(d)}</b><br><small>${fmtS(d)}</small></td>
      <td><span class="badge ${r.type === 'hifz' ? 'b-hifz' : r.type === 'qiraa' ? 'b-rw' : 'b-rev'}">${typeAr(r)}</span></td>
      <td style="text-align:start"><b>${rngName(r)}</b><br><small>${r.from}–${r.to} (${ayahs(r)} آية)</small>${enrTag(r) ? '<br>' + enrTag(r) : ''}${r.note ? `<br><small>📝 ${esc(r.note)}</small>` : ''}</td>
      <td>${Q.juz(r.surah, r.from, r.to, rEnd(r)).join('–')}</td><td>${r.grade ? `<span class="badge ${gcls(r.grade)}">${r.grade}</span>` : '—'}</td>
      <td><button class="btn light sm" data-act="msg-rec" data-id="${r.id}" title="أرسل ملاحظة للمعلم عن هذا التسميع">💬</button></td></tr>`; }).join('')}</table></div>` : empty('📖', 'لا يوجد تسميع مسجل'));
}
function weekReport(s) {
  const ws = weekStart(new Date()), a = ymd(ws), b = ymd(addDays(ws, 6));
  const recs = inRange(a, b).filter(r => r.studentId === s.id).sort((x, y) => x.date.localeCompare(y.date)), g = agg(recs);
  let t = `📘 *${brandFor(s.school_id).name}*\nتقرير الطالب: *${s.name}*\nالأسبوع: ${fmtS(ws)} – ${fmtS(addDays(ws, 6))}\n\n`;
  t += recs.length ? recs.map(r => `• ${fmtDay(parse(r.date))}: ${typeAr(r)} ${recText(r)}${r.grade ? ' — ' + r.grade : ''}`).join('\n') : 'لا يوجد تسميع هذا الأسبوع';
  return t + `\n\n📖 حفظ: ${g.h} آية\n🔁 مراجعة: ${g.r} آية${g.q ? `\n📚 قراءة: ${g.q} آية` : ''}\n📅 أيام التسميع: ${g.days.size}\n\nالمعلم: ${db.me.name}`;
}

/* ---------- الإحصائيات ---------- */
const SMODES = [['week', 'أسبوع'], ['month', 'شهر'], ['quarter', '3 أشهر'], ['year', 'سنة'], ['custom', 'فترة محددة']];
function period() {
  const now = new Date(), m = st.mode, y = now.getFullYear(), mo = now.getMonth();
  if (m === 'week') { const a = addDays(weekStart(now), st.off * 7), e = addDays(a, 6); return { s: a, e, title: `${fmtS(a)} – ${fmtS(e)}`, sub: st.off === 0 ? 'هذا الأسبوع' : `قبل ${-st.off} أسبوع`, unit: 'day', head: 'النشاط اليومي' }; }
  if (m === 'quarter') { const q0 = Math.floor(mo / 3) * 3, a = new Date(y, q0 + st.off * 3, 1), e = new Date(y, q0 + st.off * 3 + 3, 0); return { s: a, e, title: `${a.toLocaleDateString(L, { month: 'short' })} – ${e.toLocaleDateString(L, { month: 'short', year: 'numeric' })}`, sub: st.off === 0 ? 'آخر 3 أشهر من هذا الفصل' : `قبل ${-st.off} فصل`, unit: 'week', head: 'النشاط الأسبوعي' }; }
  if (m === 'year') { const a = new Date(y + st.off, 0, 1), e = new Date(y + st.off, 11, 31); return { s: a, e, title: String(y + st.off), sub: st.off === 0 ? 'هذه السنة' : `قبل ${-st.off} سنة`, unit: 'month', head: 'النشاط الشهري' }; }
  if (m === 'custom') {
    const a = parse(st.cf || ymd(addDays(now, -29))), e = parse(st.ct || today()), n = Math.round((e - a) / 864e5) + 1;
    return { s: a, e, title: `${fmtS(a)} – ${fmtS(e)}`, sub: `${n} يوم`, unit: n > 93 ? 'month' : n > 31 ? 'week' : 'day', head: n > 93 ? 'النشاط الشهري' : n > 31 ? 'النشاط الأسبوعي' : 'النشاط اليومي', custom: true };
  }
  const a = new Date(y, mo + st.off, 1), e = new Date(a.getFullYear(), a.getMonth() + 1, 0);
  return { s: a, e, title: a.toLocaleDateString(L, { month: 'long', year: 'numeric' }), sub: st.off === 0 ? 'هذا الشهر' : `قبل ${-st.off} شهر`, unit: 'day', head: 'النشاط اليومي' };
}
function buckets(p) {
  const out = [];
  if (p.unit === 'day') for (let d = new Date(p.s); d <= p.e; d = addDays(d, 1)) out.push({ a: ymd(d), b: ymd(d), l: (p.e - p.s) / 864e5 < 7 ? fmtDay(d).replace('ال', '') : String(d.getDate()) });
  else if (p.unit === 'week') for (let d = weekStart(p.s); d <= p.e; d = addDays(d, 7)) out.push({ a: ymd(d), b: ymd(addDays(d, 6)), l: fmtS(d) });
  else for (let d = new Date(p.s.getFullYear(), p.s.getMonth(), 1); d <= p.e; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) out.push({ a: ymd(d), b: ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)), l: d.toLocaleDateString(L, { month: 'short' }) });
  return out;
}
function viewStats() {
  const p = period(), a = ymd(p.s), b = ymd(p.e), recs = inRange(a, b), g = agg(recs);
  const per = buckets(p).map(x => { const y = agg(recs.filter(r => r.date >= x.a && r.date <= x.b)); return { l: x.l, h: y.h, r: y.r, q: y.q }; });
  const mx = Math.max(1, ...per.map(x => x.h + x.r + x.q)), dense = per.length > 12;
  const grades = GRADES.map(n => [n, recs.filter(r => r.grade === n).length]).filter(x => x[1]);
  const rows = db.students.map(s => ({ s, a: agg(recs.filter(r => r.studentId === s.id)) })).sort((x, y) => (y.a.h + y.a.r + y.a.q) - (x.a.h + x.a.r + x.a.q));
  return `
  <div class="card">
    <div class="hscroll" style="margin-bottom:12px">${SMODES.map(([k, l]) => `<button class="chip ${st.mode === k ? 'on' : ''}" data-act="mode" data-id="${k}">${l}</button>`).join('')}</div>
    ${p.custom ? `<div class="row" style="margin-bottom:10px"><div><label class="f">من</label><input type="date" id="scf" value="${a}" max="${today()}"></div><div><label class="f">إلى</label><input type="date" id="sct" value="${b}" max="${today()}"></div></div><div class="hint" style="text-align:center;margin-bottom:10px">${p.title} • ${p.sub}</div>`
      : `<div class="nav-period"><button data-act="prev">›</button><div>${p.title}<small>${p.sub}</small></div><button data-act="next" ${st.off >= 0 ? 'disabled' : ''}>‹</button></div>`}
    <div class="stats two" style="margin:0">
      <div class="stat"><b>${g.h}</b><span>آيات الحفظ</span></div><div class="stat gold"><b>${g.r}</b><span>آيات المراجعة</span></div>${g.q ? `<div class="stat" style="grid-column:1/-1"><b style="color:#6b73d6">${g.q}</b><span>آيات القراءة (ختمات القراءات)</span></div>` : ''}
      <div class="stat blue"><b>${g.n}</b><span>عدد التسميعات</span></div><div class="stat"><b>${g.students.size}<small style="font-size:14px;color:var(--mut)">/${db.students.length}</small></b><span>الطلاب النشطون</span></div>
    </div>
  </div>
  <div class="card"><h3>📈 ${p.head}</h3>
    <div class="chart ${dense ? 'dense' : ''}">${per.map(x => `<div class="col"><b>${x.h + x.r + x.q || ''}</b><div class="bars">
      <i class="q" style="height:${x.q * 100 / mx}%"></i><i class="r" style="height:${x.r * 100 / mx}%"></i><i class="h" style="height:${x.h * 100 / mx}%"></i></div><small>${x.l}</small></div>`).join('')}</div>
    <div class="legend"><span><i style="background:var(--g2)"></i>حفظ</span><span><i style="background:var(--gold)"></i>مراجعة</span>${recs.some(r => r.type === 'qiraa') ? '<span><i style="background:#6b73d6"></i>قراءة</span>' : ''}</div></div>
  ${grades.length ? `<div class="card"><h3>🏅 التقديرات</h3><div class="chips">${grades.map(([n, c]) => `<span class="badge ${gcls(n)}" style="font-size:14px;padding:5px 14px">${n}: ${c}</span>`).join('')}</div></div>` : ''}
  <div class="card"><h3>👥 ${staff() ? 'ترتيب الطلاب' : 'الأبناء'}</h3>${rows.length ? `<div class="tw"><table><tr><th>الطالب</th><th>حفظ</th><th>مراجعة</th><th>أيام</th></tr>
    ${rows.map(({ s, a: x }) => `<tr data-act="open-student" data-id="${s.id}" style="cursor:pointer"><td><b>${esc(s.name)}</b></td><td>${x.h}</td><td>${x.r}${x.q ? ` <small style="color:#6b73d6">+${x.q}ق</small>` : ''}</td><td>${x.days.size}</td></tr>`).join('')}</table></div>` : empty('👥', 'لا يوجد طلاب')}</div>`;
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
const soloSchool = s => !!s.is_solo || db.users.some(u => u.school_id === s.id && u.solo);
const mgrOf = s => s.mgr_id ? { id: s.mgr_id, name: s.mgr_name } : (db.users.find(u => u.role === 'school_admin' && u.school_id === s.id) || null);
const PLAN_AR = { free: 'مجاني', trial: 'تجريبي', paid: 'مدفوع' };
const schoolState = s => s.active === false ? '⛔ موقوفة' : (s.expires_at && s.expires_at < today() ? '⌛ منتهية' : '');
const schoolLogoImg = s => s.logo ? `<img class="logo" style="width:44px;height:44px;border-radius:12px" src="${esc(s.logo)}">` : '<div class="avatar">🏫</div>';
function viewManage() {
  const rq = ['requests', `📨 الطلبات${db.requests.length ? ' (' + db.requests.length + ')' : ''}`];
  const T = isAdmin() ? [['overview', '📊 نظرة عامة'], rq, ['schools', '🏫 المدارس'], ['solo', '🧑‍🏫 المعلمون المستقلون'], ['school_admin', '👔 مدراء المدارس'], ['teacher', '👨‍🏫 المعلمون'], ['parent', '👪 أولياء الأمور'], ['admin', '🛡 مدراء النظام'], ['auth', '🔐 الدخول والرموز'], ['platform', '⚙️ المنصة'], ['audit', '🧾 السجل والنسخ']]
    : db.me.solo ? [['parent', 'أولياء الأمور'], ['myschool', 'حلقتي']] : [[rq[0], 'الطلبات' + (db.requests.length ? ' (' + db.requests.length + ')' : '')], ['teacher', 'المعلمون'], ['parent', 'أولياء الأمور'], ['myschool', 'مدرستي']];
  if (isAdmin() && !st.mtInit) { st.mt = 'overview'; st.mtInit = true; }
  if (!T.some(x => x[0] === st.mt)) st.mt = T[0][0];
  const chips = isAdmin() ? `<div class="hscroll" style="margin-bottom:12px">${T.map(([k, l]) => `<button class="chip ${st.mt === k ? 'on' : ''}" data-act="mtab" data-id="${k}">${l}</button>`).join('')}</div>`
    : `<div class="seg" style="margin-bottom:12px;flex-wrap:wrap">${T.map(([k, l]) => `<button class="${st.mt === k ? 'on' : ''}" data-act="mtab" data-id="${k}" style="font-size:13px">${l}</button>`).join('')}</div>`;
  if (['overview', 'auth', 'platform', 'audit'].includes(st.mt)) return `<div class="card">${chips}</div>${adminSection(st.mt)}`;
  let list, addBtn = '';
  if (st.mt === 'requests') {
    list = db.requests.length ? db.requests.map(r => `<div class="item" data-act="view-request" data-id="${r.id}"><div class="avatar">${{ parent: '👪', teacher: '👨‍🏫', school: '🏫', solo: '🧑‍🏫' }[r.role]}</div>
      <div class="t"><b>${esc(r.name)}</b><small>${r.role === 'school' ? 'تسجيل مدرسة: ' + esc(r.school_name) : ROLE_AR[r.role]} • ${esc(r.email || r.username)}${r.children ? ' • الأبناء: ' + esc(r.children) : ''}</small></div><div class="side"><small>${fmtT(r.at)}</small></div></div>`).join('')
      : empty('📭', 'لا توجد طلبات تسجيل جديدة');
    addBtn = '<p class="hint" style="margin:0">اضغط الطلب لمراجعته والموافقة أو الرفض.</p>';
  } else if (st.mt === 'myschool') {
    list = db.school ? `<div class="item" data-act="edit-school" data-id="${db.school.id}">${schoolLogoImg(db.school)}
      <div class="t"><b>${esc(db.school.name)}</b><small>اضغط لتعديل الاسم والشعار • ${db.students.length} طالب</small></div></div>` : empty('🏫', 'لا توجد مدرسة');
    addBtn = '<p class="hint" style="margin:0">مدرستك وكل من فيها تُدار من هنا، ولا يرى غيرك بياناتها.</p>';
  } else if (st.mt === 'schools' || st.mt === 'solo') {
    const solo = st.mt === 'solo', ss = db.schools.filter(x => soloSchool(x) === solo);
    list = ss.length ? ss.map(x => {
      const m = mgrOf(x), stt = schoolState(x), ns = x.ns ?? db.students.filter(y => y.school_id === x.id).length, nt = x.nt ?? 0;
      return `<div class="item" data-act="${solo && m ? 'edit-user' : 'edit-school'}" data-id="${solo && m ? m.id : x.id}">${schoolLogoImg(x)}
        <div class="t"><b>${esc(solo && m ? m.name : x.name)} ${x.plan ? `<span class="badge b-hifz">${PLAN_AR[x.plan] || x.plan}</span>` : ''} ${stt ? `<span class="badge g-إعادة">${stt}</span>` : ''}</b>
          <small>${solo ? '🧑‍🏫 معلم مستقل • ' + esc(x.name) : '👔 ' + (m ? esc(m.name) : 'بلا مدير') + ' • ' + nt + ' معلم'} • ${ns} طالب</small></div>
        ${m ? `<button class="btn light sm auto" data-act="reset-pw" data-id="${m.id}" title="إعادة تعيين كلمة المرور">🔑</button>` : ''}
        ${solo ? `<button class="btn light sm auto" data-act="edit-school" data-id="${x.id}" title="الاشتراك والإعدادات">⚙️</button>` : ''}</div>`;
    }).join('') : empty(solo ? '🧑‍🏫' : '🏫', solo ? 'لا يوجد معلمون مستقلون بعد' : 'لا توجد مدارس — أضف أول مدرسة');
    addBtn = solo ? '<button class="btn block gold" data-act="add-user">＋ إضافة معلم مستقل</button>' : '<button class="btn block gold" data-act="add-school">＋ إضافة مدرسة</button>';
  } else {
    const us = db.users.filter(u => st.mt === 'teacher' ? u.role === 'teacher' : st.mt === 'school_admin' ? (u.role === 'school_admin' && !u.solo) : u.role === st.mt);
    list = us.length ? us.map(u => {
      const kids = u.role === 'parent' ? db.students.filter(s => s.parents.includes(u.id)).map(s => s.name) : [];
      const sub = u.role === 'school_admin' ? schoolName(u.school_id) : u.role === 'teacher' ? `${schoolName(u.school_id)} • ${db.students.filter(s => (s.teachers || []).includes(u.id)).length} طالب` : u.role === 'parent' ? (kids.length ? 'الأبناء: ' + kids.join('، ') : 'غير مرتبط بطالب') : '';
      return `<div class="item" data-act="edit-user" data-id="${u.id}"><div class="avatar">${initial(u.name)}</div>
        <div class="t"><b>${esc(u.name)} ${u.active ? '' : '<span class="badge g-إعادة">معطّل</span>'}</b><small>${esc(u.email || u.username)}${sub ? ' • ' + esc(sub) : ''}</small></div>
        <button class="btn light sm auto" data-act="reset-pw" data-id="${u.id}" title="إعادة تعيين كلمة المرور">🔑</button></div>`;
    }).join('') : empty('👤', 'لا توجد حسابات في هذا القسم');
    addBtn = `<button class="btn block gold" data-act="add-user">＋ إضافة ${{ school_admin: 'مدير مدرسة', teacher: 'معلم', parent: 'ولي أمر', admin: 'مدير نظام' }[st.mt]}</button>`;
  }
  return `
  <div class="card">${chips}${addBtn}</div>
  <div class="list" style="margin-bottom:14px">${list}</div>
  <p class="hint" style="text-align:center">الطلاب تُدار من تبويب «الطلاب». كل شخص يدخل من نفس الرابط ويرى ما يخصه فقط.</p>
  ${accountView()}`;
}
function requestModal(r) {
  if (!r) return;
  const kids = r.role === 'parent' ? db.students.filter(x => x.school_id === r.school_id) : [];
  const ic = { parent: '👪', teacher: '👨‍🏫', school: '🏫', solo: '🧑‍🏫' }[r.role], own = r.role === 'school' || r.role === 'solo';
  modal(`<h2>${ic} طلب تسجيل ${r.role === 'school' ? 'مدرسة' : ROLE_AR[r.role]}</h2>
  <div class="creds"><div><small>الاسم</small><b>${esc(r.name)}</b></div><div><small>${r.email ? 'البريد الإلكتروني (اسم الدخول)' : 'رقم الجوال (اسم الدخول)'}</small><b dir="ltr">${esc(r.email || r.username)}</b></div>${r.phone ? `<div><small>الجوال</small><b dir="ltr">${esc(r.phone)}</b></div>` : ''}
    <div><small>${r.role === 'school' ? 'اسم المدرسة المطلوبة' : own ? 'اسم الحلقة' : 'المدرسة'}</small><b>${esc(own ? (r.school_name || 'حلقة ' + r.name) : schoolName(r.school_id)) || '—'}</b></div>${r.children ? `<div><small>الأبناء حسب كتابته</small><b>${esc(r.children)}</b></div>` : ''}</div>
  ${r.role === 'parent' ? `<label class="f">اربطه بأبنائه (اختر من طلاب المدرسة)</label>${kids.length ? `<div class="checks">${kids.map(x => `<label><input type="checkbox" name="rs" value="${x.id}"> ${esc(x.name)}</label>`).join('')}</div>` : '<p class="hint">لا يوجد طلاب بعد — يمكنك الموافقة وربطه لاحقاً من نموذج الطالب.</p>'}`
    : r.role === 'school' ? '<p class="hint">عند الموافقة تُنشأ المدرسة ويصبح صاحب الطلب مديرها، يدير معلميها وطلابها وأولياء أمرها.</p>'
    : r.role === 'solo' ? '<p class="hint">عند الموافقة تُنشأ له حلقة مستقلة (مدرسة قائمة بذاتها) يديرها بنفسه معلماً ومديراً، ويضيف طلابه وأولياء أمرهم.</p>'
    : '<p class="hint">سيُفعَّل المعلم في مدرسته، ثم أسند إليه الطلاب من نموذج الطالب.</p>'}
  <div class="gap" style="margin-top:12px"><button class="btn block" data-act="req-approve" data-id="${r.id}">✅ موافقة وتفعيل الحساب</button>
  <button class="btn red block" data-act="req-reject" data-id="${r.id}">✖ رفض</button><button class="btn light block" data-act="close">إغلاق</button></div>`);
}
function schoolForm(s) {
  st.tmpLogo = s ? s.logo : '';
  const adm = isAdmin(), m = s ? mgrOf(s) : null;
  modal(`<h2>${s ? 'تعديل المدرسة' : 'إضافة مدرسة'}</h2>
  <form id="schform" class="gap" data-id="${s ? s.id : ''}">
    <div class="logo-pick"><img class="logo" id="schprev" src="${esc(st.tmpLogo) || 'icon.svg'}"><div style="flex:1"><label class="f">شعار المدرسة</label><input type="file" id="schlogo" accept="image/*" style="padding:8px"></div></div>
    <div><label class="f">اسم المدرسة / الحلقة</label><input name="name" required value="${esc(s?.name)}"></div>
    ${adm ? `<div class="row"><div><label class="f">الباقة</label><select name="plan">${Object.entries(PLAN_AR).map(([k, l]) => `<option value="${k}" ${(s?.plan || 'free') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label class="f">تنتهي في <span class="hint">(اختياري)</span></label><input type="date" name="exp" value="${esc(s?.expires_at || '')}"></div></div>
      <div><label class="f">أقصى عدد طلاب <span class="hint">(فارغ = بلا حد)</span></label><input type="number" name="maxs" min="0" inputmode="numeric" value="${s?.max_students || ''}"></div>
      <label class="row" style="gap:8px"><input type="checkbox" name="sactive" style="width:auto;flex:none" ${s && s.active === false ? '' : 'checked'}> الحلقة مفعّلة <small class="hint">(إيقافها يمنع دخول كل من فيها)</small></label>
      <div><label class="f">ملاحظات داخلية <span class="hint">(لا تظهر لأحد غيرك)</span></label><textarea name="snotes" maxlength="300">${esc(s?.notes || '')}</textarea></div>` : ''}
    ${s && m ? `<div class="creds"><div><small>${soloSchool(s) ? 'المعلم المستقل' : 'مدير المدرسة'}</small><b>${esc(m.name)}</b></div></div>
      <div class="row"><button type="button" class="btn ghost sm" data-act="reset-pw" data-id="${m.id}">🔑 إعادة تعيين كلمة المرور</button>${adm ? `<button type="button" class="btn light sm" data-act="edit-user" data-id="${m.id}">✏️ تعديل الحساب</button>` : ''}</div>` : (s && adm ? '<p class="hint">لا يوجد مدير لهذه المدرسة — أضفه من «مدراء المدارس».</p>' : '')}
    <button class="btn block">حفظ</button>
    ${s && adm ? `<button type="button" class="btn red block" data-act="del-school" data-id="${s.id}">🗑 حذف المدرسة</button>` : ''}
    <button type="button" class="btn light block" data-act="close">إلغاء</button>
  </form>`);
}
function userForm(u) {
  const r = u ? (u.role === 'school_admin' && u.solo ? 'solo' : u.role) : st.mt, isParent = r === 'parent', soloNew = r === 'solo' && !u, soloOld = r === 'solo' && u;
  const sch = id => schoolName(id), multi = isAdmin() && db.schools.length > 1;
  modal(`<h2>${u ? 'تعديل' : 'إضافة'} ${r === 'solo' ? 'معلم مستقل' : ROLE_AR[r]}</h2>
  <form id="usform" class="gap" data-id="${u ? u.id : ''}" data-role="${soloNew ? 'solo' : (u ? u.role : r)}">
    <div><label class="f">الاسم</label><input name="name" required value="${esc(u?.name)}"></div>
    <div><label class="f">البريد الإلكتروني ${isParent && !u ? '<span class="hint">(مطلوب — يصله رمز الدخول)</span>' : '<span class="hint">(لتسجيل الدخول برمز)</span>'}</label><input name="email" type="email" inputmode="email" autocapitalize="off" ${isParent && !u ? 'required' : ''} value="${esc(u?.email)}" placeholder="name@example.com"></div>
    <div><label class="f">الجوال <span class="hint">(اختياري)</span></label><input name="phone" type="tel" inputmode="tel" value="${esc(u?.phone)}" placeholder="05xxxxxxxx أو 9665xxxxxxxx"></div>
    ${isParent ? '' : `<div><label class="f">اسم المستخدم <span class="hint">(اختياري إن كان له بريد)</span></label><input name="username" value="${esc(u?.username)}" autocapitalize="off"></div>`}
    ${soloNew ? '<div><label class="f">اسم الحلقة <span class="hint">(اختياري)</span></label><input name="sname" maxlength="120" placeholder="مثال: حلقة الشيخ ..."></div>'
      : soloOld ? `<input type="hidden" name="school" value="${u.school_id}">`
      : isAdmin() && r !== 'admin' && !isParent ? `<div><label class="f">المدرسة</label><select name="school">${db.schools.map(x => `<option value="${x.id}" ${u && u.school_id === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>` : ''}
    ${isParent ? `<div><label class="f">الأبناء المرتبطون <span class="hint">(مطلوب طالب واحد على الأقل)</span></label>
      ${db.students.length ? `<div class="checks">${db.students.map(s => `<label><input type="checkbox" name="ps" value="${s.id}" ${u && s.parents.includes(u.id) ? 'checked' : ''}> ${esc(s.name)}${multi ? ` <small class="hint">${esc(sch(s.school_id))}</small>` : ''}</label>`).join('')}</div>` : '<p class="hint">أضف طلاباً أولاً من تبويب «الطلاب» ثم اربط ولي الأمر بهم.</p>'}</div>` : ''}
    ${isAdmin() && (r === 'teacher' || r === 'solo') ? `<label class="row" style="gap:8px"><input type="checkbox" name="qiraat" style="width:auto;flex:none" ${u && u.qiraat ? 'checked' : ''}> يُقرئ بالقراءات العشر (بالإضافة إلى حفص)</label>` : ''}
    ${u ? `<label class="row" style="gap:8px"><input type="checkbox" name="active" style="width:auto;flex:none" ${u.active ? 'checked' : ''}> الحساب مفعّل</label>` : `<p class="hint">${isParent ? 'ستصله دعوة على بريده، ويدخل ببريده برمز يصله — دون كلمة مرور.' : 'ستُنشأ كلمة مرور مؤقتة تظهر لك بعد الحفظ لترسلها له (ويصله بريد ترحيب إن أدخلت بريده).'}</p>`}
    <button class="btn block">حفظ</button>
    ${u ? `<button type="button" class="btn ghost block" data-act="reset-pw" data-id="${u.id}">🔑 إعادة تعيين كلمة المرور</button>
    <button type="button" class="btn red block" data-act="del-user" data-id="${u.id}">🗑 حذف الحساب</button>` : ''}
    <button type="button" class="btn light block" data-act="close">إلغاء</button>
  </form>`);
}
const mailLine = (mail, email) => mail ? (mail.ok ? `<div class="info" style="margin-bottom:10px">📧 أُرسلت رسالة ترحيب إلى <b dir="ltr">${esc(email)}</b></div>` : `<div class="info err" style="margin-bottom:10px">تعذر إرسال البريد: ${esc(mail.error)}</div>`) : '';
function showCreds(name, username, password, phone, mail, email) {
  const txt = `مرحباً ${name}\nتم إنشاء حسابك في «${brand().name}» لمتابعة الحفظ والمراجعة.\n\nالرابط: ${appUrl()}\nاسم المستخدم: ${username}\nكلمة المرور المؤقتة: ${password}\n\nيرجى تغيير كلمة المرور بعد أول دخول.`;
  modal(`<h2>✅ بيانات الدخول</h2>${mailLine(mail, email)}
  <div class="creds"><div><small>الرابط</small><b>${esc(appUrl())}</b></div><div><small>اسم المستخدم</small><b dir="ltr">${esc(username)}</b></div><div><small>كلمة المرور المؤقتة</small><b dir="ltr">${esc(password)}</b></div></div>
  <p class="hint">احفظها الآن — لن تظهر كلمة المرور مرة أخرى (يمكنك إعادة تعيينها).</p>
  <div class="gap"><button class="btn block" data-act="wa-creds" data-txt="${esc(txt)}" data-phone="${esc(phone || username)}">📲 إرسال بالواتساب</button>
  <button class="btn light block" data-act="copy" data-txt="${esc(txt)}">📋 نسخ الرسالة</button><button class="btn ghost block" data-act="close">إغلاق</button></div>`);
}
function showInvite(name, email, mail) {
  modal(`<h2>${mail && mail.ok ? '✅ تم إنشاء الحساب' : '⚠️ تم إنشاء الحساب'}</h2>${mailLine(mail, email)}
  <p class="hint">${mail && mail.ok ? `ستصل ${esc(name)} دعوة فيها طريقة الدخول: يكتب بريده ثم الرمز الذي يصله.` : 'الحساب جاهز، وسيستطيع الدخول برمز على بريده بعد إصلاح إعدادات البريد من «الإدارة ← الدخول والرموز».'}</p>
  <button class="btn block" data-act="close">حسناً</button>`);
}

/* ---------- حسابي ---------- */
function viewSettings() {
  const back = isMgr() ? 'manage' : 'account';
  return `
  <div class="card"><div class="row" style="margin-bottom:10px"><button class="btn light sm auto" data-act="nav" data-id="${back}">→ رجوع</button><span></span></div>
    <h3>📚 القراءات</h3>
    <label class="row" style="gap:10px;align-items:flex-start"><input type="checkbox" id="qiraatchk" style="width:auto;flex:none;margin-top:5px" ${db.me.qiraat ? 'checked' : ''}>
      <span>أُقرئ بالقراءات العشر (الصغرى) بالإضافة إلى حفص<br><small class="hint">الأساس حفص عن عاصم. عند التفعيل تستطيع إضافة برامج قراءات للطلاب الحافظين من ملفهم. الإلغاء لا يحذف ما سُجّل.</small></span></label>
    <p class="hint" style="margin:10px 0 0">هذا الخيار مستقل تماماً عن كلمة المرور، ولا يتطلب أي إجراء آخر.</p></div>`;
}
function accountView() {
  return `
  <div class="card"><h3>👤 ${esc(db.me.name)}</h3><p class="hint" style="margin:0">${ROLE_AR[role()]} • ${esc(db.me.username)}</p></div>
  ${staff() ? `<div class="card" data-act="nav" data-id="settings" style="cursor:pointer"><h3>📚 إعدادات القراءات <span class="more">فتح ›</span></h3><p class="hint" style="margin:0">الإقراء بالقراءات العشر بالإضافة إلى حفص — في صفحة مستقلة.</p></div>` : ''}
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
  try { document.title = (db.me ? brand() : platformBrand()).name; } catch { }
  if (!st.ready) { $('#app').innerHTML = `<div class="auth"><div class="brand">${logoImg()}<h1>متابعة التحفيظ</h1><p>جارٍ التحميل...</p></div></div>`; return; }
  if (st.view === 'verify') return renderVerify();
  if (!db.me) { if (st.view === 'signup') { renderSignup(); suToggle((($('#su_role') || {}).value) || 'solo'); return; } return renderLogin(); }
  const views = { home: viewHome, add: viewAdd, students: viewStudents, student: viewStudent, stats: viewStats, search: viewSearch, settings: viewSettings, report: viewReport, monthly: viewMonthly, cert: viewCert, statement: viewStatement, messages: viewMessages, manage: viewManage, account: accountView };
  if (!staff() && ['add', 'students', 'manage', 'monthly', 'settings'].includes(st.view)) st.view = 'home';
  if (!isMgr() && st.view === 'manage') st.view = 'account';
  shell(views[st.view]());
  if (st.view === 'add') updateInfo();
  if (['report', 'monthly', 'cert', 'statement'].includes(st.view)) fitReport();
  if (st.view === 'manage' && isAdmin()) loadAdminTab();
  if (st.view === 'search') { const q = $('#sq'); if (q && document.activeElement !== q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
  if (fa === 'msgin' && $('#msgin')) { const m = $('#msgin'); m.focus(); m.setSelectionRange(m.value.length, m.value.length); }
}

/* ---------- الأحداث ---------- */
const run = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message || 'حدث خطأ'); } };
const acts = {
  nav: id => { st.fixed = false; if (id === 'add' && (!st.form || st.form.id)) st.form = newForm(''); go(id, { thread: null }); },
  showpw: () => { const p = $('#pw'); p.type = p.type === 'password' ? 'text' : 'password'; },
  close: closeModal,
  type: id => { st.form.type = id; if (!st.form.id && st.form.sid) Object.assign(st.form, nextPos(st.form.sid, id, '')); render(); },
  grade: id => { st.form.grade = st.form.grade === id ? '' : id; document.querySelectorAll('#grades .chip').forEach(c => c.classList.toggle('on', c.dataset.id === st.form.grade)); },
  len: id => {
    const f = st.form, mx = Q.count(+f.surah); if (!f.from) f.from = 1;
    f.surahTo = f.surah; f.to = id === 'end' ? mx : Math.min(+f.from + +id - 1, mx); render();
  },
  'save-rec': saveRec,
  'cancel-edit': () => { st.form = newForm(''); go('home'); },
  'edit-rec': id => { const r = db.records.find(x => x.id === +id); st.form = { id: r.id, sid: r.studentId, type: r.type, enr: r.enrollmentId || '', date: r.date, surah: r.surah, surahTo: rEnd(r), from: r.from, to: r.to, grade: r.grade || '', note: r.note || '' }; go('add'); },
  'del-rec': async id => { if (!confirm('حذف هذا التسميع؟')) return; await api('record_delete', { id: +id }); db.records = db.records.filter(r => r.id !== +id); render(); toast('تم الحذف'); },
  quick: id => { st.form = newForm(id); st.fixed = true; go('add'); },
  'open-student': id => { st.fixed = false; go('student', { sid: +id, pe: null }); },
  report: id => {
    const s = student(id), p = db.users.find(u => s.parents.includes(u.id) && u.phone);
    window.open(`https://wa.me/${p ? waNum(p.phone) : ''}?text=${encodeURIComponent(weekReport(s))}`, '_blank');
  },
  rfilter: id => { st.rf = id; render(); },
  mode: id => { st.mode = id; st.off = 0; render(); },
  prev: () => { st.off--; render(); },
  next: () => { if (st.off < 0) { st.off++; render(); } },
  pe: id => { st.pe = id; render(); },
  'enr-new': id => enrollForm(id, false),
  'enr-prior': id => enrollForm(id, true),
  'enr-done': async id => { const e = enrById(id); const r = await api('enrollment_save', { id: +id, studentId: e.studentId, status: 'completed', completed_at: today(), started_at: e.startedAt, shaykh: e.shaykh, note: e.note }); Object.assign(e, r.enrollment); render(); toast('🎉 سُجّل إتمام القراءة'); },
  'enr-reopen': async id => { const e = enrById(id); const r = await api('enrollment_save', { id: +id, studentId: e.studentId, status: 'active', started_at: e.startedAt, shaykh: e.shaykh, note: e.note }); Object.assign(e, r.enrollment); render(); },
  'enr-del': async id => { if (!confirm('حذف هذا البرنامج؟ سيُحذف تسميعه أيضاً.')) return; await api('enrollment_delete', { id: +id }); db.enrollments = db.enrollments.filter(e => e.id !== +id); db.records = db.records.filter(r => r.enrollmentId !== +id); render(); toast('تم الحذف'); },
  'edit-hafiz': id => hafizForm(student(id)),
  'cert-enr': (id, el) => certForm(+el.dataset.sid, +id),
  'jam-all': () => document.querySelectorAll('[name=jam]').forEach(c => { c.checked = ALL20.includes(c.value); }),
  'jam-none': () => document.querySelectorAll('[name=jam]').forEach(c => { c.checked = false; }),
  'open-report': id => go('report', { sid: +id, ro: new Date().getDate() <= 7 ? -1 : 0 }),
  rprev: () => { st.ro--; render(); },
  rnext: () => { if (st.ro < 0) { st.ro++; render(); } },
  rback: () => go('student'),
  print: () => {
    const t = document.title, v = st.view, sty = document.createElement('style');
    document.title = v === 'statement' ? `كشف التسميع - ${(student(st.sid) || {}).name}` : v === 'monthly' ? `الكشف الشهري - ${monthRange(st.mo).label}` : v === 'cert' ? `شهادة ${(db.certs.find(c => c.id === st.cid) || {}).student || ''}` : `تقرير ${student(st.sid).name} - ${monthRange(st.ro).label}`;
    if (v === 'cert') { sty.textContent = '@page{size:A4 landscape;margin:0}'; document.head.appendChild(sty); }
    window.print(); setTimeout(() => { document.title = t; sty.remove(); }, 800);
  },
  'msg-rec': id => {
    const r = db.records.find(x => x.id === +id);
    st.draft = `بخصوص تسميع ${recText(r)} بتاريخ ${r.date}: `; go('messages', { thread: r.studentId });
    setTimeout(() => { const m = $('#msgin'); if (m) { m.focus(); m.setSelectionRange(m.value.length, m.value.length); } }, 60);
  },
  'open-stmt': id => go('statement', { sid: +id, sp: new Date().getDate() <= 7 ? 'last' : 'month' }),
  sp: id => { if (id === 'custom') { const r = stmtRange(); if (r.a >= '2000') { st.sfrom = st.sfrom || r.a; st.sto = st.sto || r.b; } } st.sp = id; render(); },
  'csv-stmt': () => stmtCsv(),
  'csv-monthly': () => monthlyCsv(),
  'open-monthly': () => go('monthly', { mo: -1 }),
  mprev: () => { st.mo--; render(); },
  mnext: () => { if (st.mo < 0) { st.mo++; render(); } },
  'open-cert': id => go('cert', { cid: +id }),
  'cert-new': id => certForm(id),
  'del-cert': async id => { if (!confirm('حذف هذه الشهادة نهائياً؟')) return; await api('cert_delete', { id: +id }); db.certs = db.certs.filter(c => c.id !== +id); go('student'); toast('تم حذف الشهادة'); },
  'open-thread': id => go('messages', { thread: +id }),
  'close-thread': () => { st.thread = null; st.draft = ''; render(); },
  logout,
  lm: id => { st.lm = id; render(); },
  'otp-change': () => { st.otp = null; render(); },
  'otp-resend': async () => { const o = st.otp; if (!o) return; await api('otp_send', o.ch === 'email' ? { channel: 'email', email: o.ident } : { channel: o.ch, phone: o.ident }); toast('أُعيد إرسال الرمز ✔'); },
  signup: async () => { const r = await api('signup_token'); st.tk = r.tk; st.signupDone = false; st.view = 'signup'; render(); },
  'to-login': () => { st.view = 'home'; st.signupDone = false; render(); },
  'view-request': id => requestModal(db.requests.find(r => r.id === +id)),
  'req-approve': async id => {
    const ids = [...document.querySelectorAll('[name=rs]:checked')].map(x => +x.value);
    await api('request_approve', { id: +id, student_ids: ids }); await refresh(); closeModal(); render(); toast('تمت الموافقة وتفعيل الحساب ✔');
  },
  'req-reject': async id => { if (!confirm('رفض هذا الطلب وحذفه؟')) return; await api('request_reject', { id: +id }); await refresh(); closeModal(); render(); toast('تم رفض الطلب'); },
  /* الإدارة */
  mtab: id => { st.mt = id; render(); },
  'np-add': () => { const b = $('#np_box'); if (b.querySelectorAll('.np_row').length >= 4) return toast('الحد 4 أولياء أمور في المرة'); const d = document.createElement('div'); d.className = 'np_row gap'; d.innerHTML = '<input name="np_name" placeholder="اسم ولي الأمر"><input name="np_email" type="email" inputmode="email" autocapitalize="off" placeholder="البريد الإلكتروني"><input name="np_phone" type="tel" placeholder="الجوال (اختياري)">'; b.insertBefore(d, b.lastElementChild); },
  'add-school': () => schoolForm(),
  'edit-school': id => schoolForm(db.schools.find(s => s.id === +id)),
  'del-school': async id => { if (!confirm('حذف هذه المدرسة؟')) return; await api('school_delete', { id: +id }); await refresh(); closeModal(); render(); toast('تم الحذف'); },
  'add-user': () => { if (st.mt !== 'admin' && st.mt !== 'solo' && !db.schools.length) return toast('أنشئ مدرسة أولاً'); userForm(); },
  'skip-force': () => { st.skipForce = true; render(); },
  'edit-user': id => { const u = userById(id); if (!u) return toast('الحساب غير ظاهر مع فلتر المدرسة الحالي — اختر «كل المدارس»'); userForm(u); },
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
  if (t.dataset.f === 'sid' && !st.form.id) { const nf = newForm(t.value); Object.assign(st.form, { sid: t.value, type: nf.type, enr: nf.enr, surah: nf.surah, surahTo: nf.surahTo, from: nf.from, to: nf.to, hint: nf.hint }); render(); return; }
  if (t.dataset.f === 'enr') { st.form.type = t.value ? 'qiraa' : 'hifz'; if (!st.form.id) Object.assign(st.form, nextPos(st.form.sid, st.form.type, t.value)); render(); return; }
  if (t.dataset.f === 'surah') { st.form.surahTo = st.form.surah; st.form.from = 1; st.form.to = ''; st.form.hint = ''; render(); return; }
  if (t.dataset.f === 'surahTo') { st.form.to = ''; st.form.hint = ''; render(); return; }
  if ((t.dataset.f === 'from' || t.dataset.f === 'to') && t.value !== '') {
    const sx = t.dataset.f === 'to' ? +(st.form.surahTo || st.form.surah) : +st.form.surah, mx = Q.count(sx);   // لا يتجاوز آخر آية في السورة
    if (+t.value > mx) { t.value = mx; st.form[t.dataset.f] = String(mx); toast(`سورة ${Q.name(sx)} فيها ${mx} آية فقط`); }
    else if (+t.value < 1) { t.value = 1; st.form[t.dataset.f] = '1'; }
  }
  updateInfo();
});

document.addEventListener('submit', run(async e => {
  e.preventDefault(); const f = e.target;
  if (f.id === 'otpsend') {
    const cur = st.lm && loginMethods().includes(st.lm) ? st.lm : loginMethods()[0], ident = f.ident.value.trim();
    await api('otp_send', cur === 'email' ? { channel: 'email', email: ident } : { channel: cur, phone: ident });
    st.otp = { ch: cur, ident, sent: true }; render(); return;
  }
  if (f.id === 'otpform') {
    const o = st.otp;
    await api('otp_verify', { ...(o.ch === 'email' ? { channel: 'email', email: o.ident } : { channel: o.ch, phone: o.ident }), code: f.code.value, remember: f.rem.checked });
    st.otp = null; await refresh(); st.view = 'home'; render(); return;
  }
  if (f.id === 'login') {
    await api('login', { username: f.username.value, password: f.pw.value, remember: f.rem.checked });
    await refresh(); st.view = 'home'; render(); return;
  }
  if (f.id === 'pwform') {
    await api('change_password', { old: f.old.value, new: f.new.value });
    f.reset(); db.me.must_change = false; render();
    toast('تم تغيير كلمة المرور ✔'); return;
  }
  if (f.id === 'msgform') {
    const text = $('#msgin').value.trim(); if (!text) return;
    const r = await api('message_send', { studentId: st.thread, body: text });
    db.messages.push(r.message); st.draft = ''; render(); return;
  }
  if (f.id === 'signupform') {
    if (f.pw.value !== f.pw2.value) return toast('كلمتا المرور غير متطابقتين');
    await api('signup_request', { role: f.role.value, name: f.name.value, email: f.email.value, phone: f.phone.value, password: f.pw.value,
      school_name: f.sname.value, website: f.website.value, tk: st.tk });
    st.signupDone = true; render(); return;
  }
  if (f.id === 'certform') {
    const r = await api('cert_issue', { studentId: +f.dataset.sid, kind: f.kind.value, title: f.title.value, enrollmentId: f.enr ? +f.enr.value : null,
      period_from: f.pf.value || null, period_to: f.pt.value || null, grade: f.grade.value, note: f.note.value, date: f.date.value });
    db.certs.unshift(r.cert); closeModal(); go('cert', { cid: r.cert.id }); toast('تم إصدار الشهادة ✔'); return;
  }
  if (f.id === 'enrform') {
    if (f.hafnow && f.hafnow.checked) { await api('student_hafiz', { id: +f.dataset.sid, hafiz: true, where: f.hafw.value, note: '' }); Object.assign(student(f.dataset.sid), { hafiz: true, hafizWhere: f.hafw.value }); }
    const kind = f.kind.value; let keys;
    if (kind === 'riwaya') keys = [f.riwaya.value]; else if (kind === 'qiraa') keys = qariRawis(f.qari.value); else keys = [...f.querySelectorAll('[name=jam]:checked')].map(x => x.value);
    if (kind === 'jam' && keys.length < 2) return toast('اختر روايتين على الأقل للجمع');
    const r = await api('enrollment_save', { studentId: +f.dataset.sid, kind, riwayat: keys, label: enrLabel(kind, keys), prior: f.dataset.prior === '1',
      started_at: f.sd ? f.sd.value : null, completed_at: f.cd ? f.cd.value : null, shaykh: f.shaykh ? f.shaykh.value : '', note: f.note.value });
    db.enrollments.push(r.enrollment); closeModal();
    if (!r.enrollment.prior && f.cs && f.cs.value && f.ca.value) {          // رصيد سابق: من الفاتحة إلى حيث وصل
      const cs = +f.cs.value, ca = +f.ca.value;
      if (ca < 1 || ca > Q.count(cs)) { toast(`سورة ${Q.name(cs)} عدد آياتها ${Q.count(cs)} فقط`); render(); return; }
      const rr = await api('record_save', { studentId: +f.dataset.sid, date: f.sd.value || today(), type: 'qiraa', enrollmentId: r.enrollment.id, surah: 1, from: 1, surahTo: cs, to: ca, grade: '', note: 'رصيد سابق: ما قُرئ قبل التسجيل في النظام' });
      db.records.push(rr.record); if (rr.enrollment) Object.assign(r.enrollment, rr.enrollment);
    }
    if (r.enrollment.prior) { render(); toast('تمت الإضافة ✔'); return; }
    st.form = newForm(f.dataset.sid, 'qiraa', r.enrollment.id); st.fixed = true; go('add'); toast('تم تسجيل البرنامج — ابدأ التسميع ✔'); return;
  }
  if (f.id === 'hafform') {
    await api('student_hafiz', { id: +f.dataset.sid, hafiz: f.hafiz.checked, where: f.where.value, note: f.note.value });
    Object.assign(student(f.dataset.sid), { hafiz: f.hafiz.checked, hafizWhere: f.where.value, hafizNote: f.note.value }); closeModal(); render(); toast('تم الحفظ ✔'); return;
  }
  if (f.id === 'stform') {
    const r = await api('student_save', {
      id: +f.dataset.id || 0, name: f.name.value, school_id: +f.school.value, teacher_ids: [...f.querySelectorAll('[name=tch]:checked')].map(x => +x.value), group: f.group.value,
      new_parents: [...f.querySelectorAll('.np_row')].map(r => ({ name: r.querySelector('[name=np_name]').value.trim(), email: r.querySelector('[name=np_email]').value.trim(), phone: r.querySelector('[name=np_phone]').value.trim() })).filter(x => x.name || x.email), program: f.program.value, hafiz: f.hafiz.checked || f.program.value === 'qiraat', hafiz_where: f.hafwhere.value, hafiz_note: f.hafnote.value,
      prior_list: [...f.querySelectorAll('[name=prk]:checked')].map(x => ({ kind: 'riwaya', riwayat: [x.value], label: RW[x.value].label })), prior_where: f.prior_where ? f.prior_where.value : '',
      parent_ids: [...f.querySelectorAll('[name=par]:checked')].map(x => +x.value), login_username: f.login.value
    });
    await refresh(); closeModal(); render(); toast('تم الحفظ ✔');
    if (r.login) showCreds(f.name.value, r.login.username, r.login.password, '');
    return;
  }
  if (f.id === 'schform') {
    await api('school_save', { id: +f.dataset.id || 0, name: f.name.value, logo: st.tmpLogo || '',
      ...(f.plan ? { plan: f.plan.value, expires_at: f.exp.value || null, max_students: +f.maxs.value || 0, active: f.sactive.checked, notes: f.snotes.value } : {}) });
    await refresh(); closeModal(); render(); toast('تم الحفظ ✔'); return;
  }
  if (f.id === 'usform') {
    const id = +f.dataset.id || 0, role = f.dataset.role, isParent = role === 'parent';
    const sids = isParent ? [...f.querySelectorAll('[name=ps]:checked')].map(x => +x.value) : [];
    if (isParent && !sids.length) return toast('اربط ولي الأمر بطالب واحد على الأقل');
    const email = f.email.value.trim();
    const r = await api('user_save', { id, role, name: f.name.value, username: f.username ? f.username.value : '', email, phone: f.phone.value,
      school_id: f.school ? +f.school.value : 0, active: f.active ? f.active.checked : true, qiraat: f.qiraat ? f.qiraat.checked : false, student_ids: sids, school_name: f.sname ? f.sname.value : '' });
    await refresh(); closeModal(); render();
    if (r.password) showCreds(f.name.value, r.username, r.password, f.phone.value, r.mail, email);
    else if (r.mail) showInvite(f.name.value, email, r.mail);
    else toast('تم الحفظ ✔');
  }
}));

document.addEventListener('change', run(async e => {
  const t = e.target;
  if (t.id === 'schlogo' && t.files[0]) { st.tmpLogo = await resizeLogo(t.files[0]); $('#schprev').src = st.tmpLogo; }
  if (t.id === 'qiraatchk') { await api('set_qiraat', { on: t.checked }); db.me.qiraat = t.checked; render(); toast(t.checked ? 'تم تفعيل القراءات' : 'تم الرجوع إلى حفص فقط'); }
  if (t.id === 'cf_kind') { $('#cf_period').style.display = t.value === 'period' ? '' : 'none'; $('#cf_enr').style.display = t.value === 'qiraat' ? '' : 'none'; $('#cf_title').placeholder = certDefaultTitle(t.value); }
  if (t.id === 'en_kind') { $('#en_riwaya').style.display = t.value === 'riwaya' ? '' : 'none'; $('#en_qiraa').style.display = t.value === 'qiraa' ? '' : 'none'; $('#en_jam').style.display = t.value === 'jam' ? '' : 'none'; }
  if (t.id === 'st_program' && t.value === 'qiraat') $('#st_hafiz').checked = true;
  if (t.id === 'mschool') { st.mschool = t.value; render(); }
  if (t.id === 'sfrom' || t.id === 'sto') { st[t.id] = t.value; render(); }
  if (t.id === 'smonth' && t.value) { st.sp = t.value; render(); }
  if (t.id === 'scf' || t.id === 'sct') { st[t.id === 'scf' ? 'cf' : 'ct'] = t.value; render(); }
  if (t.id === 'su_role') suToggle(t.value);
  if (t.id === 'st_school') $('#st_teachers').innerHTML = teacherChecks(t.value, []);
  if (t.id === 'fschool') { st.fs = t.value; try { localStorage.setItem('tahfidh_fs', st.fs); } catch { } await refresh(); st.adm = {}; render(); }
}));

/* ---------- تنبيه الرسائل الجديدة ---------- */
async function pollOnce() {
  if (!db.me || document.hidden) return;
  try {
    const since = db.messages.reduce((m, x) => Math.max(m, x.id), 0);
    const r = await api('poll', null, '&since=' + since);
    if (r.role !== db.me.role || !!r.solo !== !!db.me.solo) { await refresh(); st.mt = 'requests'; render(); toast('تم تحديث صلاحياتك'); return; }
    if (isMgr() && r.pending !== db.requests.length) { await refresh(); updateTabbar(); if (st.view === 'manage') render(); else toast('📝 طلب تسجيل جديد'); return; }
    if (!r.messages.length) return;
    db.messages.push(...r.messages);
    const fresh = r.messages.some(m => m.senderId !== db.me.id);
    if (st.view === 'messages') render(); else { updateTabbar(); if (fresh) toast('📩 وصلتك رسالة جديدة'); }
  } catch { }
}
setInterval(pollOnce, 20000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) pollOnce(); });   // عند العودة للتطبيق

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
(async () => {
  try { st.site = await api('site_info'); } catch { }
  const code = new URLSearchParams(location.search).get('verify');
  if (code) {
    st.verify = { code: code.toUpperCase().slice(0, 24) }; st.view = 'verify'; st.ready = true; render();
    try { st.verify.res = await api('cert_verify', null, '&code=' + encodeURIComponent(st.verify.code)); } catch { st.verify.res = { valid: false }; }
    try { await refresh(); } catch { }
    render(); return;
  }
  try { await refresh(); } catch { } st.ready = true; render();
})();
