/* الشهادات + الكشف الشهري للحلقة + صفحة التحقق من الشهادة */

/* ---------- الشهادة (A4 أفقي) ---------- */
function certSheet(c) {
  const d = parse(c.date), url = appUrl() + '?verify=' + c.serial;
  const rwTxt = c.riwaya && RW[c.riwaya] ? RW[c.riwaya].label : 'حفص عن عاصم';
  const grade = c.grade ? ` بتقدير <b>${esc(c.grade)}</b>` : '';
  let body;
  if (c.kind === 'khatm') body = `قد أتمّ حفظ القرآن الكريم كاملاً برواية <b>${esc(rwTxt)}</b>${grade}، نسأل الله أن ينفعه بما حفظ ويجعله من أهل القرآن.`;
  else if (c.kind === 'period') body = `وذلك عن الفترة من <b>${fmtG(parse(c.from))}</b> إلى <b>${fmtG(parse(c.to))}</b>${grade}، تقديراً لجهده واجتهاده في الحفظ والمراجعة.`;
  else body = esc(c.note) || `تقديراً لجهده واجتهاده${grade}.`;
  const extra = c.kind !== 'custom' && c.note ? `<p class="ct-extra">${esc(c.note)}</p>` : '';
  return `
  <div class="ct-frame"><div class="ct-in"><div class="ct-pat"></div>
    <div class="ct-top"><img class="ct-logo" src="${esc(brand().logo) || 'icon.svg'}" alt=""><div><small>بسم الله الرحمن الرحيم</small><h2>${esc(c.school || brand().name)}</h2></div></div>
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
    ${isAdmin() ? `<button class="btn red auto" data-act="del-cert" data-id="${c.id}">🗑</button>` : ''}</div>
    <p class="hint" style="margin:8px 0 0">الشهادة بحجم A4 أفقي. اختر «حفظ بتنسيق PDF» من نافذة الطباعة.</p></div>
  <div class="rptwrap" id="rptwrap"><div class="rpt cert" id="rpt" data-w="1123" data-h="794">${certSheet(c)}</div></div>`;
}
function certForm(sid) {
  const s = student(sid);
  modal(`<h2>🏆 إصدار شهادة — ${esc(s.name)}</h2>
  <form id="certform" class="gap" data-sid="${s.id}">
    <div><label class="f">نوع الشهادة</label><select name="kind" id="cf_kind"><option value="khatm">ختم حفظ المصحف كاملاً</option><option value="period">شهادة فترة (تفوق / إنجاز)</option><option value="custom">شهادة مخصصة</option></select></div>
    <div><label class="f">عنوان الشهادة <span class="hint">(اتركه فارغاً للعنوان الافتراضي)</span></label><input name="title" id="cf_title" maxlength="160" placeholder="شهادة ختم حفظ القرآن الكريم"></div>
    ${qiraatOn() || s.riwaya !== 'hafs' ? `<div><label class="f">الرواية</label><select name="riwaya">${rwOptions(s.riwaya || 'hafs')}</select></div>` : ''}
    <div id="cf_period" class="row" style="display:none"><div><label class="f">من</label><input type="date" name="pf"></div><div><label class="f">إلى</label><input type="date" name="pt"></div></div>
    <div><label class="f">التقدير <span class="hint">(اختياري)</span></label><select name="grade"><option value="">—</option>${GRADES.map(g => `<option>${g}</option>`).join('')}</select></div>
    <div><label class="f">نص إضافي <span class="hint">(اختياري)</span></label><textarea name="note" maxlength="300" placeholder="عبارة تقدير أو ملاحظة تظهر في الشهادة"></textarea></div>
    <div><label class="f">تاريخ الإصدار</label><input type="date" name="date" value="${today()}" max="${today()}"></div>
    <button class="btn block gold">إصدار الشهادة</button><button type="button" class="btn light block" data-act="close">إلغاء</button>
  </form>`);
}
const certDefaultTitle = k => k === 'khatm' ? 'شهادة ختم حفظ القرآن الكريم' : k === 'period' ? 'شهادة تفوق وإنجاز' : 'شهادة تقدير';

/* ---------- الكشف الشهري للحلقة ---------- */
function monthlySheet(off, school) {
  const m = monthRange(off), a = ymd(m.s), b = ymd(m.e);
  const studs = db.students.filter(s => !school || s.school_id === +school), ids = new Set(studs.map(s => s.id));
  const recs = db.records.filter(r => ids.has(r.studentId) && r.date >= a && r.date <= b), g = agg(recs);
  const per = Array.from({ length: m.days }, (_, i) => { const dt = ymd(addDays(m.s, i)), x = agg(recs.filter(r => r.date === dt)); return { h: x.h, r: x.r }; });
  const rows = studs.map(s => {
    const rs = recs.filter(r => r.studentId === s.id), x = agg(rs), gs = rs.filter(r => r.grade);
    const avg = gs.length ? gs.reduce((t, r) => t + GP[r.grade], 0) / gs.length : 0;
    return { s, x, avg: gs.length ? GRADES[Math.max(0, Math.min(4, Math.round(5 - avg)))] : '—', last: lastOf(s.id, 'hifz', s.riwaya || 'hafs') };
  }).sort((p, q) => (q.x.h + q.x.r) - (p.x.h + p.x.r));
  const inactive = rows.filter(r => !r.x.n).length, top = rows.filter(r => r.x.n).slice(0, 3);
  const grp = (db.schools.find(x => x.id === +school) || brand()).name;
  const kpi = (ic, v, l, c) => `<div class="rp-k" style="--c:${c}"><i>${ic}</i><b>${v}</b><span>${l}</span></div>`;
  return `
  <div class="rp-hd"><div class="rp-pat"></div>
    <img src="${esc(brand().logo) || 'icon.svg'}" class="rp-logo" alt="">
    <div class="rp-hd-t"><small>الكشف الشهري لمتابعة الحفظ والمراجعة</small><h1>${esc(grp)}</h1></div>
    <div class="rp-month"><b>${m.label}</b><small>${fmtH(m.s)} – ${fmtH(m.e)}</small></div></div>
  <div class="rp-kpis">
    ${kpi('📖', g.h, 'آيات الحفظ', '#14956b')}${kpi('🔁', g.r, 'آيات المراجعة', '#d4a437')}${kpi('🎙', g.n, 'عدد التسميعات', '#6b73d6')}
    ${kpi('👥', `${g.students.size}<small>/${studs.length}</small>`, 'الطلاب النشطون', '#3b7ddd')}${kpi('⚠️', inactive, 'بلا تسميع', '#d9534f')}</div>
  <div class="rp-row">
    <div class="rp-box rp-w2"><h3>📈 نشاط الحلقة اليومي <span><i style="background:#14956b"></i>حفظ <i style="background:#d4a437"></i>مراجعة</span></h3><div class="rp-chart">${svgBars(per)}</div></div>
    <div class="rp-box"><h3>🌟 المتميزون</h3>${top.length ? top.map((t, i) => `<div class="rp-top"><span>${['🥇', '🥈', '🥉'][i]}</span><b>${esc(t.s.name)}</b><small>${t.x.h + t.x.r} آية</small></div>`).join('') : '<p class="rp-cap">لا يوجد تسميع</p>'}</div>
  </div>
  <div class="rp-box rp-tbl"><h3>📋 كشف الطلاب <span>${studs.length} طالب</span></h3>
    ${rows.length ? `<table><tr><th>#</th><th style="text-align:start">الطالب</th><th>حفظ</th><th>مراجعة</th><th>تسميعات</th><th>أيام</th><th>التقدير</th><th style="text-align:start">آخر موضع حفظ</th></tr>
    ${rows.map((r, i) => `<tr><td>${i + 1}</td><td style="text-align:start"><b>${esc(r.s.name)}</b></td><td>${r.x.h}</td><td>${r.x.r}</td><td>${r.x.n}</td><td>${r.x.days.size}</td><td>${r.avg}</td>
      <td style="text-align:start"><small>${r.last ? Q.name(r.last.surah) + ' ' + r.last.to : '—'}</small></td></tr>`).join('')}</table>` : '<p class="rp-cap">لا يوجد طلاب</p>'}</div>
  <div class="rp-ft"><div><span></span>المعلم</div><div class="rp-verse">﴿ وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا ﴾</div><div><span></span>إدارة المدرسة</div></div>
  <div class="rp-foot">أُصدر بتاريخ ${fmtG(new Date())} • ${esc(brand().name)}</div>`;
}
function viewMonthly() {
  const m = monthRange(st.mo);
  return `
  <div class="card noprint">
    <div class="nav-period"><button data-act="mprev">›</button><div>${m.label}<small>${st.mo === -1 ? 'الشهر الماضي' : st.mo === 0 ? 'الشهر الحالي' : 'كشف سابق'}</small></div><button data-act="mnext" ${st.mo >= 0 ? 'disabled' : ''}>‹</button></div>
    ${isAdmin() && db.schools.length > 1 ? `<div style="margin-bottom:10px"><select id="mschool"><option value="">كل المدارس</option>${db.schools.map(x => `<option value="${x.id}" ${+st.mschool === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>` : ''}
    <div class="row"><button class="btn gold" data-act="print">🖨 طباعة / حفظ PDF</button><button class="btn light auto" data-act="nav" data-id="home">رجوع</button></div>
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
        <div><small>الجهة</small><b>${esc(c.school)}</b></div>${c.kind === 'khatm' ? `<div><small>الرواية</small><b>${esc((RW[c.riwaya] || { label: 'حفص عن عاصم' }).label)}</b></div>` : ''}
        <div><small>تاريخ الإصدار</small><b>${fmtG(parse(c.date))}</b></div><div><small>المصدر</small><b>${esc(c.issuer)}</b></div></div>`
      : '<div class="info err">❌ لا توجد شهادة بهذا الرقم، تأكد من الرقم وحاول مجدداً.</div>'}
      <button class="btn block ghost" style="margin-top:12px" data-act="to-login">دخول النظام</button></div></div>`;
}
