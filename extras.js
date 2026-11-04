/* الشهادات + الكشف الشهري للحلقة + صفحة التحقق من الشهادة */

/* ---------- الشهادة (A4 أفقي) ---------- */
function certSheet(c) {
  const d = parse(c.date), url = appUrl() + '?verify=' + c.serial;
  const grade = c.grade ? ` بتقدير <b>${esc(c.grade)}</b>` : '';
  let body;
  if (c.kind === 'khatm') body = `قد أتمّ حفظ القرآن الكريم كاملاً${grade}، نسأل الله أن ينفعه بما حفظ ويجعله من أهل القرآن.`;
  else if (c.kind === 'qiraat') body = `قد أتمّ قراءة القرآن الكريم ختمةً كاملةً بـ <b>${esc(c.label)}</b>${grade}، نسأل الله أن ينفعه بما قرأ ويجعله من أهل القرآن.`;
  else if (c.kind === 'period') body = `وذلك عن الفترة من <b>${fmtG(parse(c.from))}</b> إلى <b>${fmtG(parse(c.to))}</b>${grade}، تقديراً لجهده واجتهاده في الحفظ والمراجعة.`;
  else body = esc(c.note) || `تقديراً لجهده واجتهاده${grade}.`;
  const extra = c.kind !== 'custom' && c.note ? `<p class="ct-extra">${esc(c.note)}</p>` : '';
  return `
  <div class="ct-frame"><div class="ct-in"><div class="ct-pat"></div>
    <div class="ct-top"><img class="ct-logo" src="${esc(brandFor((student(c.studentId) || {}).school_id).logo) || 'icon.svg'}" alt=""><div><small>بسم الله الرحمن الرحيم</small><h2>${esc(c.school || brand().name)}</h2></div></div>
    <div class="ct-orn">❖ ✦ ❖</div>
    <h1 class="ct-title">${esc(c.title)}</h1>
    <p class="ct-l">تشهد إدارة <b>${esc(c.school || brand().name)}</b> بأن الطالب</p>
    <div class="ct-name">${esc(c.student)}</div>
    <p class="ct-body">${body}</p>${extra}
    <p class="ct-verse">﴿ إِنَّ الَّذِينَ يَتْلُونَ كِتَابَ اللَّهِ وَأَقَامُوا الصَّلَاةَ ﴾</p>
    <div class="ct-ft"><div><span></span>المعلم / ${esc(c.issuer || '')}</div>
      <div class="ct-seal"><b>${fmtG(d)}</b><small>${fmtH(d)}</small></div>
      <div><span></span>إدارة المدرسة</div></div>
    <div class="ct-serial">رقم الشهادة: <b dir="ltr">${esc(c.serial)}</b> &nbsp;•&nbsp; للتحقق من صحتها: <span dir="ltr">${esc(url)}</span></div>
  </div></div>`;
}
function viewCert() {
  const c = db.certs.find(x => x.id === st.cid);
  if (!c) return staff() ? viewStudents() : viewKids();
  return `
  <div class="card noprint"><div class="row"><button class="btn gold" data-act="print">🖨 طباعة / حفظ PDF</button><button class="btn light auto" data-act="rback">رجوع</button>
    ${isMgr() ? `<button class="btn red auto" data-act="del-cert" data-id="${c.id}">🗑</button>` : ''}</div>
    <p class="hint" style="margin:8px 0 0">الشهادة بحجم A4 أفقي. اختر «حفظ بتنسيق PDF» من نافذة الطباعة.</p></div>
  <div class="rptwrap" id="rptwrap"><div class="rpt cert" id="rpt" data-w="1123" data-h="794">${certSheet(c)}</div></div>`;
}
function certForm(sid, enrId) {
  const s = student(sid), doneE = enrOf(s.id).filter(e => e.status === 'completed');
  modal(`<h2>🏆 إصدار شهادة — ${esc(s.name)}</h2>
  <form id="certform" class="gap" data-sid="${s.id}">
    <div><label class="f">نوع الشهادة</label><select name="kind" id="cf_kind"><option value="khatm">ختم حفظ المصحف كاملاً</option><option value="qiraat">إتمام ختمة قراءات</option><option value="period">شهادة فترة (تفوق / إنجاز)</option><option value="custom">شهادة مخصصة</option></select></div>
    <div><label class="f">عنوان الشهادة <span class="hint">(اتركه فارغاً للعنوان الافتراضي)</span></label><input name="title" id="cf_title" maxlength="160" placeholder="شهادة ختم حفظ القرآن الكريم"></div>
    <div id="cf_enr" style="display:none"><label class="f">الختمة المنجزة</label>${doneE.length ? `<select name="enr">${doneE.map(e => `<option value="${e.id}" ${+enrId === e.id ? 'selected' : ''}>${esc(e.label)}</option>`).join('')}</select>` : '<p class="hint">لا توجد ختمة منجزة بعد.</p>'}</div>
    <div id="cf_period" class="row" style="display:none"><div><label class="f">من</label><input type="date" name="pf"></div><div><label class="f">إلى</label><input type="date" name="pt"></div></div>
    <div><label class="f">التقدير <span class="hint">(اختياري)</span></label><select name="grade"><option value="">—</option>${GRADES.map(g => `<option>${g}</option>`).join('')}</select></div>
    <div><label class="f">نص إضافي <span class="hint">(اختياري)</span></label><textarea name="note" maxlength="300" placeholder="عبارة تقدير أو ملاحظة تظهر في الشهادة"></textarea></div>
    <div><label class="f">تاريخ الإصدار</label><input type="date" name="date" value="${today()}" max="${today()}"></div>
    <button class="btn block gold">إصدار الشهادة</button><button type="button" class="btn light block" data-act="close">إلغاء</button>
  </form>`);
  if (enrId) { $('#cf_kind').value = 'qiraat'; $('#cf_enr').style.display = ''; $('#cf_title').placeholder = certDefaultTitle('qiraat'); }
}
const certDefaultTitle = k => k === 'qiraat' ? 'شهادة إتمام قراءة ختمة كاملة' : k === 'khatm' ? 'شهادة ختم حفظ القرآن الكريم' : k === 'period' ? 'شهادة تفوق وإنجاز' : 'شهادة تقدير';

/* ---------- الكشف الشهري للحلقة ---------- */
function monthlyData(off, school) {
  const m = monthRange(off), a = ymd(m.s), b = ymd(m.e);
  const studs = db.students.filter(s => !school || s.school_id === +school), ids = new Set(studs.map(s => s.id));
  const recs = db.records.filter(r => ids.has(r.studentId) && r.date >= a && r.date <= b), g = agg(recs);
  const per = Array.from({ length: m.days }, (_, i) => { const dt = ymd(addDays(m.s, i)), y = agg(recs.filter(r => r.date === dt)); return { h: y.h, r: y.r, q: y.q }; });
  const rows = studs.map(s => {
    const rs = recs.filter(r => r.studentId === s.id), y = agg(rs), gs = rs.filter(r => r.grade);
    const avg = gs.length ? gs.reduce((t, r) => t + GP[r.grade], 0) / gs.length : 0;
    return { s, x: y, avg: gs.length ? GRADES[Math.max(0, Math.min(4, Math.round(5 - avg)))] : '—', last: lastOf(s.id, 'hifz', null, b) };
  }).sort((p, q) => (q.x.h + q.x.r) - (p.x.h + p.x.r));
  return { m, studs, g, per, rows, inactive: rows.filter(r => !r.x.n).length, top: rows.filter(r => r.x.n).slice(0, 3) };
}
function monthlyCsv() {
  const { m, rows } = monthlyData(st.mo, st.mschool);
  downloadCsv(`كشف-${m.label}`, [['الطالب', 'آيات الحفظ', 'آيات المراجعة', 'آيات القراءة', 'عدد التسميعات', 'أيام التسميع', 'متوسط التقدير', 'آخر موضع حفظ']]
    .concat(rows.map(r => [r.s.name, r.x.h, r.x.r, r.x.q, r.x.n, r.x.days.size, r.avg, r.last ? `${Q.name(rEnd(r.last))} ${r.last.to}` : ''])));
}
function monthlySheet(off, school) {
  const { m, studs, g, per, rows, inactive, top } = monthlyData(off, school);
  const BR = brandFor(school ? +school : (studs[0] || {}).school_id), grp = BR.name;
  const kpi = (ic, v, l, c) => `<div class="rp-k" style="--c:${c}"><i>${ic}</i><b>${v}</b><span>${l}</span></div>`;
  return `
  <div class="rp-hd"><div class="rp-pat"></div>
    <img src="${esc(BR.logo) || 'icon.svg'}" class="rp-logo" alt="">
    <div class="rp-hd-t"><div class="rp-hv">﴿ وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا ﴾</div><small>الكشف الشهري لمتابعة الحفظ والمراجعة</small><h1>${esc(grp)}</h1></div>
    <div class="rp-month"><b>${m.label}</b><small>${fmtH(m.s)} – ${fmtH(m.e)}</small></div></div>
  <div class="rp-kpis">
    ${kpi('📖', g.h, 'آيات الحفظ', '#14956b')}${kpi('🔁', g.r, 'آيات المراجعة', '#d4a437')}${kpi('🎙', g.n, 'عدد التسميعات', '#6b73d6')}
    ${kpi('👥', `${g.students.size}<small>/${studs.length}</small>`, 'الطلاب النشطون', '#3b7ddd')}${kpi('⚠️', inactive, 'بلا تسميع', '#d9534f')}</div>
  <div class="rp-row">
    <div class="rp-box rp-w2"><h3>📈 نشاط الحلقة اليومي <span><i style="background:#14956b"></i>حفظ <i style="background:#d4a437"></i>مراجعة</span></h3><div class="rp-chart">${svgBars(per)}</div></div>
    <div class="rp-box"><h3>🌟 المتميزون</h3>${top.length ? top.map((t, i) => `<div class="rp-top"><span>${['🥇', '🥈', '🥉'][i]}</span><b>${esc(t.s.name)}</b><small>${t.x.h + t.x.r} آية</small></div>`).join('') : '<p class="rp-cap">لا يوجد تسميع</p>'}</div>
  </div>
  <div class="rp-box rp-tbl"><h3>📋 كشف الطلاب <span>${studs.length} طالب</span></h3>
    ${rows.length ? `<table><tr><th>#</th><th style="text-align:start">الطالب</th><th>حفظ</th><th>مراجعة</th><th>قراءة</th><th>تسميعات</th><th>أيام</th><th>التقدير</th><th style="text-align:start">آخر موضع حفظ</th></tr>
    ${rows.map((r, i) => `<tr><td>${i + 1}</td><td style="text-align:start"><b>${esc(r.s.name)}</b></td><td>${r.x.h}</td><td>${r.x.r}</td><td>${r.x.q || '—'}</td><td>${r.x.n}</td><td>${r.x.days.size}</td><td>${r.avg}</td>
      <td style="text-align:start"><small>${r.last ? Q.name(rEnd(r.last)) + ' ' + r.last.to : '—'}</small></td></tr>`).join('')}</table>` : '<p class="rp-cap">لا يوجد طلاب</p>'}</div>
  <div class="rp-ft"><div><span></span>المعلم</div><div><span></span>إدارة المدرسة</div></div>
  <div class="rp-foot">أُصدر بتاريخ ${fmtG(new Date())} • ${esc(BR.name)}${platformBrand().waqf ? ' • ' + esc(platformBrand().waqf) : ''}</div>`;
}
function viewMonthly() {
  const m = monthRange(st.mo);
  return `
  <div class="card noprint">
    <div class="nav-period"><button data-act="mprev">›</button><div>${m.label}<small>${st.mo === -1 ? 'الشهر الماضي' : st.mo === 0 ? 'الشهر الحالي' : 'كشف سابق'}</small></div><button data-act="mnext" ${st.mo >= 0 ? 'disabled' : ''}>‹</button></div>
    ${isAdmin() && db.schools.length > 1 ? `<div style="margin-bottom:10px"><select id="mschool"><option value="">كل المدارس</option>${db.schools.map(x => `<option value="${x.id}" ${+st.mschool === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>` : ''}
    <div class="row"><button class="btn gold" data-act="print">🖨 طباعة / PDF</button><button class="btn ghost" data-act="csv-monthly">⬇ Excel</button><button class="btn light auto" data-act="nav" data-id="home">رجوع</button></div>
    <p class="hint" style="margin:8px 0 0">يُعرض افتراضياً كشف الشهر الماضي (يظهر تنبيهه في الرئيسية أول الشهر).</p>
  </div>
  <div class="rptwrap" id="rptwrap"><div class="rpt flow" id="rpt">${monthlySheet(st.mo, st.mschool)}</div></div>`;
}

/* ---------- التحقق من شهادة (صفحة عامة) ---------- */
function renderVerify() {
  const v = st.verify || {}, c = v.res && v.res.valid ? v.res.cert : null;
  $('#app').innerHTML = `
  <div class="auth"><div class="brand">${logoImg()}<h1>التحقق من الشهادة</h1><p>رقم الشهادة: <span dir="ltr">${esc(v.code || '')}</span></p></div>
    <div class="card">${!v.res ? '<div class="empty"><span class="ico">⏳</span>جارٍ التحقق...</div>' : c ? `
      <div class="info">✅ شهادة صحيحة</div>
      <div class="creds" style="margin-top:12px"><div><small>الطالب</small><b>${esc(c.student)}</b></div><div><small>الشهادة</small><b>${esc(c.title)}</b></div>
        <div><small>الجهة</small><b>${esc(c.school)}</b></div>${c.kind === 'qiraat' ? `<div><small>القراءة</small><b>${esc(c.label)}</b></div>` : ''}
        <div><small>تاريخ الإصدار</small><b>${fmtG(parse(c.date))}</b></div><div><small>المصدر</small><b>${esc(c.issuer)}</b></div></div>`
      : '<div class="info err">❌ لا توجد شهادة بهذا الرقم، تأكد من الرقم وحاول مجدداً.</div>'}
      <button class="btn block ghost" style="margin-top:12px" data-act="to-login">دخول النظام</button></div></div>`;
}

/* ---------- تنزيل ملف Excel (CSV بترميز عربي صحيح) ---------- */
function downloadCsv(name, rows) {
  const csv = '\ufeff' + rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = name + '.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

/* ---------- كشف تسميع الطالب لفترة مختارة (لكل الأدوار) ---------- */
function stmtRange() {
  const n = new Date(), p = st.sp || 'month', Y = n.getFullYear(), M = n.getMonth();
  if (p.startsWith('m:')) { const [yy, mm] = p.slice(2).split('-').map(Number), s0 = new Date(yy, mm - 1, 1), e0 = new Date(yy, mm, 0); return { a: ymd(s0), b: ymd(e0), label: s0.toLocaleDateString(L, { month: 'long', year: 'numeric' }) }; }
  if (p === 'custom') { let a = st.sfrom || ymd(new Date(Y, M, 1)), b = st.sto || today(); if (a > b) [a, b] = [b, a]; return { a, b, label: `${fmtG(parse(a))} – ${fmtG(parse(b))}` }; }
  if (p === 'last') { const s = new Date(Y, M - 1, 1), e = new Date(Y, M, 0); return { a: ymd(s), b: ymd(e), label: s.toLocaleDateString(L, { month: 'long', year: 'numeric' }) }; }
  if (p === '3m') { const s = new Date(Y, M - 2, 1); return { a: ymd(s), b: today(), label: `آخر 3 أشهر (من ${fmtG(s)})` }; }
  if (p === 'all') return { a: '0000-01-01', b: '9999-12-31', label: 'كل الفترات' };
  const s = new Date(Y, M, 1); return { a: ymd(s), b: today(), label: `${s.toLocaleDateString(L, { month: 'long', year: 'numeric' })} (حتى اليوم)` };
}
function stmtData(s) {
  const r = stmtRange();
  return { r, recs: db.records.filter(x => x.studentId === s.id && x.date >= r.a && x.date <= r.b).sort((p, q) => p.date.localeCompare(q.date) || p.id - q.id) };
}
function stmtCsv() {
  const s = student(st.sid), { r, recs } = stmtData(s);
  downloadCsv(`كشف-تسميع-${s.name}`, [['التاريخ', 'اليوم', 'النوع', 'من سورة', 'من آية', 'إلى سورة', 'إلى آية', 'عدد الآيات', 'الجزء', 'التقدير', 'البرنامج / القراءة', 'ملاحظة']]
    .concat(recs.map(x => [x.date, fmtDay(parse(x.date)), typeAr(x), Q.name(x.surah), x.from, Q.name(rEnd(x)), x.to, ayahs(x), Q.juz(x.surah, x.from, x.to, rEnd(x)).join('-'), x.grade || '', (x.enrollmentId && enrById(x.enrollmentId) ? enrById(x.enrollmentId).label : ''), x.note || ''])));
}
const stmtTables = recs => rptTables(recs);
function statementSheet(s) {
  const { r, recs } = stmtData(s);
  let a = r.a, b = r.b;
  if (a < '1000') { a = recs.length ? recs[0].date : today(); b = recs.length ? recs[recs.length - 1].date : today(); }
  return reportSheet(s, 0, { a, b, label: r.label });
}
function viewStatement() {
  const s = student(st.sid); if (!s) return staff() ? viewStudents() : viewKids();
  const p = st.sp || 'month', r = stmtRange();
  const prev = (() => { const n = new Date(), a = ymd(new Date(n.getFullYear(), n.getMonth() - 1, 1)), b = ymd(new Date(n.getFullYear(), n.getMonth(), 0)); return db.records.filter(x => x.studentId === s.id && x.date >= a && x.date <= b).length; })();
  const emptyHint = p === 'month' && !stmtData(s).recs.length && prev ? `<div class="info" style="text-align:start;margin-bottom:10px">لا يوجد تسميع في هذا الشهر بعد، وفي الشهر الماضي <b>${prev}</b> تسميع. <button class="btn gold sm" data-act="sp" data-id="last" style="margin-top:6px">عرض الشهر الماضي</button></div>` : '';
  const chip = (k, l) => `<button class="chip ${p === k ? 'on' : ''}" data-act="sp" data-id="${k}">${l}</button>`;
  return `
  <div class="card noprint">
    <h3>📑 ${esc(s.name)}</h3>
    <div class="hscroll" style="margin-bottom:10px">${chip('month', 'هذا الشهر')}${chip('last', 'الشهر الماضي')}${chip('3m', 'آخر 3 أشهر')}${chip('all', 'الكل')}${chip('custom', 'فترة محددة')}</div>
    <div style="margin-bottom:10px"><select id="smonth" title="اختر شهراً"><option value="">📅 اختر شهراً محدداً...</option>${Array.from({ length: 18 }, (_, i) => { const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1), v = `m:${d.getFullYear()}-${pad(d.getMonth() + 1)}`; return `<option value="${v}" ${p === v ? 'selected' : ''}>${d.toLocaleDateString(L, { month: 'long', year: 'numeric' })}</option>`; }).join('')}</select></div>
    ${p === 'custom' ? `<div class="row" style="margin-bottom:10px"><div><label class="f">من</label><input type="date" id="sfrom" value="${r.a}" max="${today()}"></div><div><label class="f">إلى</label><input type="date" id="sto" value="${r.b}" max="${today()}"></div></div>` : ''}
    ${emptyHint}
    <div class="row"><button class="btn gold" data-act="print">🖨 طباعة / PDF</button><button class="btn ghost" data-act="csv-stmt">⬇ Excel</button><button class="btn light auto" data-act="rback">رجوع</button></div>
  </div>
  <div class="rptwrap" id="rptwrap"><div class="rpt flow" id="rpt">${statementSheet(s)}</div></div>`;
}

/* ---------- البرامج: حفظ ومراجعة / قراءات ---------- */
const canQiraat = s => staff() && (!!db.me.qiraat || (isMgr() && (s.teachers || []).some(id => (userById(id) || {}).qiraat)));
function readingsDone(sid) {
  const done = new Set();
  enrOf(sid).filter(e => e.status === 'completed').forEach(e => e.riwayat.forEach(k => done.add(k)));
  const rows = QURRA.map(([k, qn, rs]) => { const own = rs.filter(r => r[0] !== 'hafs_qasr').map(r => r[0]); return { k, qn, n: own.filter(x => done.has(x)).length, tot: own.length }; });
  return { rows, qurra: rows.filter(r => r.n === r.tot).length, riwayat: ALL20.filter(k => done.has(k)).length };
}
function progCard(s) {
  const es = enrOf(s.id), act = es.filter(e => e.status === 'active' && !e.prior), dn = es.filter(e => e.status === 'completed'), can = canQiraat(s);
  if (!(s.hafiz || es.length || s.program === 'qiraat' || (staff() && can))) return '';
  const rd = readingsDone(s.id);
  const row = e => `<div class="item" style="cursor:default"><div class="avatar">${e.status === 'completed' ? '✅' : '📚'}</div>
    <div class="t"><b>${esc(e.label)}</b><small>${e.status === 'completed' ? 'أتمّها' + (e.completedAt ? ' ' + fmtG(parse(e.completedAt)) : '') + (e.prior ? ' • قبل الالتحاق' : '') + (e.shaykh ? ' • ' + esc(e.shaykh) : '') : 'جارية' + (e.startedAt ? ' منذ ' + fmtG(parse(e.startedAt)) : '')}${e.note ? ' • ' + esc(e.note) : ''}</small></div>
    ${staff() ? `<div class="side">${e.status === 'active' ? `<button class="btn light sm" data-act="enr-done" data-id="${e.id}">أتمّها</button>` : `<button class="btn light sm" data-act="enr-reopen" data-id="${e.id}">إعادة فتح</button>`}<button class="btn red sm" data-act="enr-del" data-id="${e.id}" style="margin-top:4px">حذف</button></div>` : ''}</div>`;
  return `<div class="card"><h3>🎓 البرنامج والقراءات ${staff() ? `<button class="more" data-act="edit-hafiz" data-id="${s.id}">✏️ بيانات الحفظ</button>` : ''}</h3>
    <p class="hint" style="margin:0 0 8px">البرنامج: <b>${s.program === 'qiraat' ? '📚 قراءات' : '📖 حفظ ومراجعة'}</b></p>
    ${s.hafiz ? `<div class="info" style="text-align:start;margin-bottom:10px">✅ حافظ للمصحف${s.hafizWhere ? ' — أتمّه: ' + esc(s.hafizWhere) : ''}${s.hafizNote ? `<br><small>${esc(s.hafizNote)}</small>` : ''}</div>` : ''}
    ${staff() && can ? `<div class="row" style="margin-bottom:10px"><button class="btn gold sm" data-act="enr-new" data-id="${s.id}">＋ برنامج قراءة</button><button class="btn ghost sm" data-act="enr-prior" data-id="${s.id}">＋ قراءة سابقة</button></div>` : (staff() ? '<p class="hint">لإضافة برنامج قراءات يفعّل المعلم «إعدادات القراءات» من حسابه.</p>' : '')}
    ${act.length ? `<h3 style="font-size:14px;margin:6px 0">البرامج الجارية</h3><div class="list" style="margin-bottom:10px">${act.map(row).join('')}</div>` : ''}
    ${dn.length ? `<h3 style="font-size:14px;margin:6px 0">✅ القراءات المنجزة (${dn.length})</h3><div class="list" style="margin-bottom:10px">${dn.map(row).join('')}</div>
      <div class="info" style="text-align:start"><b>🏅 أتمّ ${rd.qurra} من 10 قراء • ${rd.riwayat} من 20 رواية</b>
      <div class="chips" style="margin-top:8px">${rd.rows.map(r => `<span class="chip static ${r.n === r.tot ? 'on' : ''}" style="${r.n && r.n < r.tot ? 'border-color:var(--gold)' : ''}">${r.qn}${r.n && r.n < r.tot ? ' ½' : ''}</span>`).join('')}</div></div>` : ''}
  </div>`;
}
function enrollForm(sid, prior) {
  const s = student(sid);
  modal(`<h2>${prior ? '＋ قراءة سابقة منجزة' : '＋ برنامج قراءة'} — ${esc(s.name)}</h2>
  <form id="enrform" class="gap" data-sid="${s.id}" data-prior="${prior ? 1 : 0}">
    <div><label class="f">نوع القراءة</label><select name="kind" id="en_kind">
      <option value="riwaya">رواية واحدة (مثل: ورش عن نافع، حفص بقصر المنفصل)</option>
      <option value="qiraa">قراءة كاملة لقارئ (برواتيه)</option>
      <option value="jam">جمع بين عدة قراءات / روايات</option></select></div>
    <div id="en_riwaya"><label class="f">الرواية</label><select name="riwaya">${rwOptions('warsh')}</select></div>
    <div id="en_qiraa" style="display:none"><label class="f">القارئ</label><select name="qari">${QURRA.map(([k, qn]) => `<option value="${k}">${qn}</option>`).join('')}</select></div>
    <div id="en_jam" style="display:none"><label class="f">اختر ما جُمع</label>
      <div class="row" style="margin-bottom:8px"><button type="button" class="btn ghost sm" data-act="jam-all">⭐ الجمع بين العشر (كلها)</button><button type="button" class="btn light sm" data-act="jam-none">مسح</button></div>
      <div class="jamgrid">${QURRA.map(([, qn, rs]) => `<div style="padding:3px 0"><b style="color:var(--g1);font-size:13px">${qn}</b> ${rs.map(([k, n]) => `<label><input type="checkbox" name="jam" value="${k}"> ${n}</label>`).join('')}</div>`).join('')}</div></div>
    ${!prior && !s.hafiz ? `<div style="border:1.5px solid var(--gold);border-radius:14px;padding:10px;background:var(--gold2)"><label class="row" style="gap:8px"><input type="checkbox" name="hafnow" style="width:auto;flex:none"> <b>هذا الطالب أتمّ حفظ المصحف</b> <small class="hint">(مطلوب لبرنامج القراءات)</small></label><input name="hafw" maxlength="160" style="margin-top:8px" placeholder="أين أتمّه؟ (اختياري)"></div>` : ''}
    ${!prior ? `<div><label class="f">وصل في هذه الختمة إلى <span class="hint">(اختياري — يُسجَّل له تسميع سابق من أول المصحف)</span></label>
      <div class="row"><select name="cs"><option value="">— لم يبدأ بعد —</option>${SURAHS.map((x, i) => `<option value="${i + 1}">${i + 1} - ${x[0]} (${x[1]} آية)</option>`).join('')}</select><input name="ca" type="number" inputmode="numeric" min="1" placeholder="رقم الآية"></div></div>` : ''}
    ${prior ? `<div><label class="f">تاريخ الإتمام <span class="hint">(اختياري)</span></label><input type="date" name="cd" max="${today()}"></div>
      <div><label class="f">أين / عند من أتمّها <span class="hint">(اختياري)</span></label><input name="shaykh" maxlength="160" placeholder="اسم الشيخ أو الجهة"></div>`
      : `<div><label class="f">تاريخ البدء</label><input type="date" name="sd" value="${today()}" max="${today()}"></div>`}
    <div><label class="f">ملاحظات <span class="hint">(اختياري)</span></label><textarea name="note" maxlength="300" placeholder="سند، إجازة، تفاصيل..."></textarea></div>
    <button class="btn block gold">حفظ</button><button type="button" class="btn light block" data-act="close">إلغاء</button></form>`);
}
function hafizForm(s) {
  modal(`<h2>✅ بيانات حفظ المصحف — ${esc(s.name)}</h2>
  <form id="hafform" class="gap" data-sid="${s.id}">
    <label class="row" style="gap:8px"><input type="checkbox" name="hafiz" style="width:auto;flex:none" ${s.hafiz ? 'checked' : ''}> أتمّ حفظ المصحف كاملاً</label>
    <div><label class="f">أين أتمّه؟ <span class="hint">(اختياري)</span></label><input name="where" maxlength="160" value="${esc(s.hafizWhere)}" placeholder="الحلقة / المدرسة / السنة"></div>
    <div><label class="f">ملاحظات <span class="hint">(اختياري)</span></label><textarea name="note" maxlength="300">${esc(s.hafizNote)}</textarea></div>
    <button class="btn block">حفظ</button><button type="button" class="btn light block" data-act="close">إلغاء</button></form>`);
}
