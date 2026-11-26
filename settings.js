/* صفحة الإعدادات: بطاقات مجمّعة يفتح كلٌّ منها قسمه — وقسم «رواياتي» ورئيسية المتابعة */

const myUser = () => userById(db.me.id) || db.me;
// الروايات التي يُقرئ بها المستخدم (حفص أساس دائماً). null في القائمة مع تفعيل القراءات القديم = الكل
const userRiwayat = u => u.qiraatList ? ['hafs', ...u.qiraatList.filter(k => k !== 'hafs')] : (u.qiraat ? ALL20.slice() : ['hafs']);

function setTile(act, id, ico, title, sub, badge) {
  return `<button class="stile" data-act="${act}" data-id="${id}"><span class="ic">${ico}${badge ? `<em class="bdg">${badge}</em>` : ''}</span><b>${title}</b><small>${sub}</small></button>`;
}
const setGroup = (title, tiles) => tiles.filter(Boolean).length ? `<h3 class="sg-h">${title}</h3><div class="sgrid">${tiles.filter(Boolean).join('')}</div>` : '';

function settingsHub() {
  const r = role(), sec = (k, ico, t, sub, badge) => setTile('set-open', k, ico, t, sub, badge);
  const cnt = role => db.users.filter(u => u.role === role).length;
  const me = `<div class="card shd"><div class="shd-id"><div class="avatar">${initial(db.me.name)}</div><div class="t"><b>${esc(db.me.name)}</b><small>${ROLE_AR[r]}${db.me.solo ? ' • معلم مستقل' : ''} • <span dir="ltr">${esc(db.me.username)}</span></small></div></div></div>`;
  let groups = '';
  if (isAdmin()) {
    groups += setGroup('📊 المتابعة', [sec('overview', '📊', 'نظرة عامة', 'أرقام المنصة'), sec('requests', '📨', 'طلبات التسجيل', 'مراجعة وموافقة', db.requests.length), sec('inbox', '💬', 'الرسائل الواردة', 'اقتراحات وتواصل')]);
    groups += setGroup('🏫 المدارس والحسابات', [sec('schools', '🏫', 'المدارس', 'إضافة وتعديل'), sec('solo', '🧑‍🏫', 'المعلمون المستقلون', 'حلقاتهم'), sec('school_admin', '👔', 'مدراء المدارس', cnt('school_admin') + ' حساب'), sec('teacher', '👨‍🏫', 'المعلمون', cnt('teacher') + ' معلم'), sec('parent', '👪', 'أولياء الأمور', cnt('parent') + ' حساب'), sec('admin', '🛡', 'مدراء النظام', '')]);
    groups += setGroup('⚙️ المنصة', [sec('auth', '🔐', 'الدخول والرموز', 'البريد والبوابات'), sec('platform', '⚙️', 'إعدادات المنصة', 'الاسم والإعلانات'), sec('audit', '🧾', 'السجل والنسخ', 'والمحذوفات')]);
  } else if (r === 'school_admin') {
    groups += setGroup(db.me.solo ? '🕌 حلقتي' : '🏫 مدرستي', [
      sec('myschool', '🕌', db.me.solo ? 'بيانات الحلقة' : 'بيانات المدرسة', 'الاسم والشعار'),
      !db.me.solo && sec('teacher', '👨‍🏫', 'المعلمون', cnt('teacher') + ' معلم ورواياتهم'),
      sec('parent', '👪', 'أولياء الأمور', cnt('parent') + ' حساب'),
      !db.me.solo && sec('requests', '📨', 'طلبات التسجيل', 'مراجعة وموافقة', db.requests.length),
      setTile('chat-cfg', '', '💬', 'صلاحيات المراسلة', 'من يراسل من')]);
  }
  if (staff()) {
    const n = userRiwayat(myUser()).filter(k => ALL20.includes(k)).length, pend = IJ.list.filter(i => i.status === 'pending').length;
    groups += setGroup('📜 الإقراء والإجازات', [
      sec('riwayat', '📚', 'رواياتي', n + ' رواية أُقرئ بها'),
      setTile('ij-tpls', '', '🖋', 'نماذج الإجازة', 'النصوص والأسانيد والختم'),
      sec('ijlist', '📜', 'الإجازات الصادرة', pend ? pend + ' بانتظار الاعتماد' : IJ.list.length + ' إجازة', pend)]);
  }
  groups += setGroup('👤 حسابي', [sec('profile', '🔑', 'الملف الشخصي', 'البريد وكلمة المرور'), setTile('feedback', '', '💬', 'تواصل واقتراحات', 'رأيك يهمنا'), setTile('logout', '', '🚪', 'تسجيل الخروج', '')]);
  return me + groups;
}

function profileSection() {
  const html = accountView(), box = document.createElement('div'); box.innerHTML = html;
  return [...box.children].filter(c => c.querySelector('#emform,#emcode,#pwform')).map(c => c.outerHTML).join('');
}

/* ---------- رواياتي ---------- */
function riwayatBox(u, editable) {
  const have = new Set(userRiwayat(u));
  return `<form id="rwform" class="gap" data-uid="${u.id}">
    <div class="qgrid">${QURRA.map(([, qn, rs]) => `<div class="qc"><b>${qn}</b><div>${rs.map(r => `<label class="rwchip"><input type="checkbox" name="rw" value="${r[0]}" ${have.has(r[0]) ? 'checked' : ''} ${r[0] === 'hafs' || !editable ? 'disabled' : ''}><span>${r[1]}</span></label>`).join('')}</div></div>`).join('')}</div>
    ${editable ? '<button class="btn gold">💾 حفظ الروايات</button>' : '<p class="hint" style="margin:0">تحديد رواياتك من صلاحية مدير المدرسة.</p>'}</form>`;
}
function riwayatSection() {
  const u = myUser(), can = isMgr();
  return `<div class="card"><h3>📚 الروايات التي أُقرئ بها</h3><p class="hint" style="margin:0 0 10px">حفص عن عاصم هو الأساس. اختر ما أُجزت فيه، ومنه تُسجَّل ختمات طلابك. إزالة رواية توقف التسجيل الجديد فقط، ولا تمس تسميعاً ولا إجازة سابقة، ولا تُزال رواية لطالب فيها ختمة جارية.</p>${riwayatBox(u, can)}</div>`;
}
function ijListSection() {
  const list = IJ.list.slice().sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1));
  return `<div class="card"><h3>📜 الإجازات الصادرة (${list.length})</h3>${list.length ? `<div class="tiles">${list.map(i => `<div class="tile plat" data-act="ij-open" data-id="${i.id}"><span>📜</span><div><b>${esc(i.student)}</b><small>${esc(i.title)} • ${esc(i.date)}${i.status === 'pending' ? ' • ⏳ بانتظار الاعتماد' : ''}</small></div></div>`).join('')}</div>` : empty('📜', 'لا توجد إجازات صادرة. تُصدر من صفحة الطالب الحافظ.')}</div>`;
}

const SEC_TITLES = { riwayat: 'رواياتي', ijlist: 'الإجازات الصادرة', profile: 'الملف الشخصي', myschool: 'بيانات الحلقة', teacher: 'المعلمون', parent: 'أولياء الأمور', requests: 'طلبات التسجيل', overview: 'نظرة عامة', inbox: 'الرسائل الواردة', schools: 'المدارس', solo: 'المعلمون المستقلون', school_admin: 'مدراء المدارس', admin: 'مدراء النظام', auth: 'الدخول والرموز', platform: 'إعدادات المنصة', audit: 'السجل والنسخ' };
const OWN_SECS = ['riwayat', 'ijlist', 'profile'];

function viewSettingsHub() {
  if (staff()) ijLoad();
  const k = st.sec;
  if (!k || (!OWN_SECS.includes(k) && !isMgr())) return settingsHub();
  const body = k === 'riwayat' ? riwayatSection() : k === 'ijlist' ? ijListSection() : k === 'profile' ? profileSection() : manageSection();
  return `<div class="sec-h"><button class="btn light sm auto" data-act="set-open" data-id="">→ الإعدادات</button><b>${SEC_TITLES[k] || ''}</b></div>${body}`;
}

/* ---------- متابعة طلاب اليوم (الرئيسية) ---------- */
function todayCard() {
  if (!db.students.length) return '';
  const t0 = parse(today());
  const rows = db.students.map(s => {
    const last = db.records.filter(r => r.studentId === s.id).map(r => r.date).sort().pop() || '';
    return { s, last, days: last ? Math.round((t0 - parse(last)) / 864e5) : null };
  }).sort((a, b) => (a.days === 0) - (b.days === 0) || (b.days ?? 9999) - (a.days ?? 9999));
  const done = rows.filter(r => r.days === 0).length;
  return `<div class="card"><h3>🗓 طلاب اليوم <span class="hint">سمّع ${done} من ${rows.length}</span></h3><div class="tiles">${rows.slice(0, 60).map(({ s, days }) => `<div class="tile ${days === null || days > 7 ? 'late' : ''}" data-act="open-student" data-id="${s.id}">
    <span>${days === 0 ? '✅' : days === null || days > 7 ? '⚠️' : '⏳'}</span><div><b>${esc(s.name)}</b><small>${days === 0 ? 'سمّع اليوم' : days === null ? 'لم يُسمَّع له بعد' : days > 7 ? 'منقطع منذ ' + days + ' يوماً' : 'آخر تسميع قبل ' + days + ' يوم'}</small></div>
    <button class="btn ${days === 0 ? 'light' : 'gold'} sm auto" data-act="quick" data-id="${s.id}" title="تسميع جديد">＋</button></div>`).join('')}</div></div>`;
}

Object.assign(acts, {
  'set-open': id => {
    st.sec = id || null;
    if (id && !OWN_SECS.includes(id)) st.mt = id;
    if (id === 'riwayat' || id === 'ijlist') ijLoad(true);
    render(); window.scrollTo(0, 0);
  },
  'rw-user': id => { const u = userById(+id); if (u) modal(`<h2>📚 روايات ${esc(u.name)}</h2>${riwayatBox(u, true)}<button type="button" class="btn light block" data-act="close" style="margin-top:8px">إغلاق</button>`); },
});

document.addEventListener('submit', async e => {
  const f = e.target; if (f.id !== 'rwform') return;
  e.preventDefault(); e.stopPropagation();
  try {
    const r = await api('set_riwayat', { userId: +f.dataset.uid, list: [...f.querySelectorAll('[name=rw]:checked')].map(i => i.value) });
    const u = userById(r.user.id); if (u) Object.assign(u, r.user);
    if (r.user.id === db.me.id) Object.assign(db.me, { qiraat: r.user.qiraat, qiraatList: r.user.qiraatList });
    closeModal(); render(); toast('تم حفظ الروايات ✔');
  } catch (err) { toast(err.message || 'تعذر الحفظ'); }
});
