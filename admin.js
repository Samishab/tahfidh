/* لوحة تحكم مدير النظام (نظرة عامة، الدخول والرموز، المنصة، السجل والنسخ) + البحث الشامل بحسب الصلاحيات */

/* ---------- تحميل بيانات الأقسام ---------- */
async function loadAdminTab() {
  const k = st.mt, need = { overview: ['overview'], inbox: ['inbox'], auth: ['settings', 'mail'], platform: ['settings'], audit: ['audit', 'mail'] }[k];
  if (!need) return;
  st.adm.busy = st.adm.busy || {};
  const fetchers = { overview: () => api('admin_overview'), settings: () => api('settings_get'), mail: () => api('mail_get'), audit: () => api('audit_list'), inbox: () => api('feedback_list') };
  for (const n of need) {
    if (st.adm[n] || st.adm.busy[n]) continue;
    st.adm.busy[n] = true;
    try { st.adm[n] = await fetchers[n](); } catch (e) { st.adm[n] = { error: e.message || 'تعذر التحميل' }; }
    st.adm.busy[n] = false;
    if (st.view === 'manage' && st.mt === k) render();
  }
}
const admLoading = () => `<div class="card">${empty('⏳', 'جارٍ التحميل...')}</div>`;
const admErr = d => `<div class="card"><div class="info err">${esc(d.error)}</div><button class="btn block light" style="margin-top:10px" data-act="adm-reload">إعادة المحاولة</button></div>`;
const sw = (name, label, on, hint = '') => `<label class="sw"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><input type="checkbox" name="${name}" ${on ? 'checked' : ''}></label>`;

function adminSection(k) {
  if (k === 'overview') return secOverview();
  if (k === 'auth') return secAuth();
  if (k === 'platform') return secPlatform();
  if (k === 'audit') return secAudit();
  if (k === 'inbox') return secInbox();
  return '';
}

/* ---------- نظرة عامة ---------- */
function secOverview() {
  const d = st.adm.overview; if (!d) return admLoading(); if (d.error) return admErr(d);
  const c = d.counts, kp = (ic, n, l, act) => `<div class="kp" ${act ? `data-act="mtab" data-id="${act}" style="cursor:pointer"` : ''}><i>${ic}</i><b>${n}</b><span>${l}</span></div>`;
  return `
  ${c.pending ? `<div class="card" data-act="mtab" data-id="requests" style="cursor:pointer;border:1.5px solid var(--gold);background:var(--gold2)"><h3>📨 ${c.pending} طلب تسجيل بانتظار موافقتك <span class="more">مراجعة ›</span></h3></div>` : ''}
  <div class="card"><h3>🧭 المنصة بالأرقام</h3>
    <div class="kg">${kp('🏫', c.schools, 'مدرسة', 'schools')}${kp('🧑‍🏫', c.solo, 'معلم مستقل', 'solo')}${kp('👨‍🏫', c.teachers, 'معلم', 'teacher')}
      ${kp('👪', c.parents, 'ولي أمر', 'parent')}${kp('🎓', c.students, 'طالب')}${kp('✅', c.hafiz, 'حافظ للمصحف')}
      ${kp('📚', c.qiraat, 'ختمة قراءات جارية')}${kp('🏆', c.certs, 'شهادة صادرة')}${kp('💬', c.msgs7, 'رسالة (7 أيام)')}</div></div>
  <div class="card"><h3>📈 النشاط</h3>
    <div class="kg">${kp('📖', c.rec_today, 'تسميع اليوم')}${kp('🗓', c.rec_week, 'آخر 7 أيام')}${kp('📆', c.rec_month, 'آخر 30 يوماً')}</div>
    <p class="hint" style="margin:10px 0 0">مستخدمون دخلوا خلال 7 أيام: <b>${c.active7}</b></p></div>
  <div class="card"><h3>📧 البريد والرسائل (24 ساعة)</h3>
    <div class="kg" style="grid-template-columns:repeat(2,1fr)">${kp('✅', d.mail24.sent, 'أُرسلت')}${kp(d.mail24.failed ? '⚠️' : '👍', d.mail24.failed, 'فشلت')}</div>
    ${d.mail24.failed ? '<button class="btn light block sm" style="margin-top:10px" data-act="mtab" data-id="audit">عرض سجل الرسائل ›</button>' : ''}</div>
  ${d.expiring.length || d.suspended ? `<div class="card"><h3>⌛ اشتراكات تحتاج متابعة</h3>${d.suspended ? `<p class="hint" style="margin:0 0 8px">حلقات موقوفة: <b>${d.suspended}</b></p>` : ''}
    <div class="list">${d.expiring.map(x => `<div class="item" data-act="edit-school" data-id="${x.id}"><div class="avatar">⌛</div><div class="t"><b>${esc(x.name)}</b><small>تنتهي ${esc(x.expires_at)}</small></div></div>`).join('')}</div></div>` : ''}
  ${d.top.length ? `<div class="card"><h3>🌟 الأنشط (آخر 30 يوماً)</h3><div class="list">${d.top.map((x, i) => `<div class="item" data-act="edit-school" data-id="${x.id}"><div class="avatar">${['🥇', '🥈', '🥉', '4', '5'][i]}</div><div class="t"><b>${esc(x.name)}</b><small>${x.n} تسميع</small></div></div>`).join('')}</div></div>` : ''}`;
}

/* ---------- الدخول والرموز + قنوات الرسائل ---------- */
function gwCard(ch, title, ic, g) {
  const ex = ch === 'wa'
    ? `<b>واتساب (Meta Cloud API)</b><br>الرابط: <code dir="ltr">https://graph.facebook.com/v20.0/PHONE_ID/messages</code><br>الطريقة: POST — الترويسات:<br><code dir="ltr">Authorization: Bearer TOKEN<br>Content-Type: application/json</code><br>النص: <code dir="ltr">{"messaging_product":"whatsapp","to":"{to}","type":"text","text":{"body":"{message}"}}</code><br><small>(قد يشترط واتساب قالب رسالة معتمداً للرموز خارج نافذة 24 ساعة)</small><hr><b>UltraMsg</b><br>الرابط: <code dir="ltr">https://api.ultramsg.com/INSTANCE/messages/chat</code> — POST<br>الترويسة: <code dir="ltr">Content-Type: application/x-www-form-urlencoded</code><br>النص: <code dir="ltr">token=TOKEN&to={to}&body={message}</code>`
    : `<b>Twilio</b><br>الرابط: <code dir="ltr">https://api.twilio.com/2010-04-01/Accounts/SID/Messages.json</code> — POST<br>الترويسات: <code dir="ltr">Authorization: Basic BASE64(SID:TOKEN)<br>Content-Type: application/x-www-form-urlencoded</code><br>النص: <code dir="ltr">To=%2B{to}&From=+1XXXXXXXXXX&Body={message}</code><hr><b>بوابة بطريقة GET</b><br>الرابط: <code dir="ltr">https://provider.example/send?key=KEY&to={to}&text={message}</code> — الطريقة GET`;
  return `<details class="dt"><summary>${ic} ${title} <span class="badge ${g.on ? 'b-hifz' : 'b-rev'}">${g.on ? 'مفعّلة' : 'متوقفة'}</span></summary>
    <form id="adm_${ch}" class="gap" style="margin-top:10px">
      ${sw('on', 'تفعيل القناة', g.on)}
      <div><label class="f">رابط البوابة (URL)</label><input name="url" value="${esc(g.url)}" dir="ltr" placeholder="https://..."></div>
      <div class="row"><div><label class="f">الطريقة</label><select name="method"><option ${g.method === 'POST' ? 'selected' : ''}>POST</option><option ${g.method === 'GET' ? 'selected' : ''}>GET</option></select></div></div>
      <div><label class="f">نص الطلب (POST)</label><textarea name="body" dir="ltr" rows="3" placeholder="token=...&to={to}&body={message}">${esc(g.body)}</textarea></div>
      <div><label class="f">الترويسات (Headers) ${g.has_headers ? '<span class="badge b-hifz">✔ محفوظة (مشفّرة)</span>' : ''}</label><textarea name="headers" dir="ltr" rows="3" placeholder="${g.has_headers ? 'اتركها فارغة للإبقاء على المحفوظة' : 'Authorization: Bearer ...'}"></textarea>
        ${g.has_headers ? '<label class="row" style="gap:8px;font-size:13px;margin-top:6px"><input type="checkbox" name="clear_headers" style="width:auto;flex:none"> حذف الترويسات المحفوظة</label>' : ''}</div>
      <p class="hint" style="margin:0">المتغيرات: <code>{to}</code> رقم المستلم بالصيغة الدولية، <code>{message}</code> نص الرسالة.</p>
      <button class="btn block">حفظ إعدادات القناة</button>
      <div class="row"><input id="gt_${ch}" type="tel" placeholder="رقم للتجربة 05xxxxxxxx"><button type="button" class="btn light auto" data-act="adm-gw-test" data-id="${ch}">إرسال تجربة</button></div>
      <details class="dt2"><summary>أمثلة جاهزة لمزودين</summary><div class="hint" style="line-height:2">${ex}<br><small>راجع توثيق مزوّدك فالصيغ تختلف.</small></div></details>
    </form></details>`;
}
function secAuth() {
  const S = st.adm.settings, M = st.adm.mail;
  if (!S || !M) return admLoading(); if (S.error) return admErr(S); if (M.error) return admErr(M);
  const a = S.auth, c = M.cfg, pn = v => v === '1' || v === true;
  return `
  <div class="card"><h3>🔐 طرق الدخول والتسجيل</h3>
    <form id="adm_auth" class="gap">
      ${sw('reg_open', 'السماح بطلبات التسجيل الجديدة', pn(a.reg_open), 'إيقافه يخفي زر «طلب تسجيل» ويرفض الطلبات الجديدة')}
      ${sw('login_otp_email', '📧 الدخول برمز على البريد', pn(a.login_otp_email), 'يحتاج إعداد البريد أدناه')}
      ${sw('login_otp_wa', '💬 الدخول برمز على واتساب', pn(a.login_otp_wa), 'يحتاج تفعيل وضبط بوابة واتساب أدناه')}
      ${sw('login_otp_sms', '📱 الدخول برمز برسالة نصية', pn(a.login_otp_sms), 'يحتاج تفعيل وضبط بوابة الرسائل أدناه')}
      ${sw('login_password', '🔑 الدخول بكلمة المرور', pn(a.login_password), 'مدير النظام يدخل بكلمة المرور دائماً حتى لو أُوقف')}
      <div class="row"><div><label class="f">صلاحية الرمز (دقائق)</label><input type="number" name="otp_ttl" min="3" max="30" value="${esc(a.otp_ttl)}"></div><div><label class="f">محاولات الرمز</label><input type="number" name="otp_max_attempts" min="3" max="10" value="${esc(a.otp_max_attempts)}"></div></div>
      <div class="row"><div><label class="f">الانتظار قبل إعادة الإرسال (ثانية)</label><input type="number" name="otp_cooldown" min="20" max="600" value="${esc(a.otp_cooldown)}"></div><div><label class="f">أقصى رموز في الساعة</label><input type="number" name="otp_hour_limit" min="2" max="30" value="${esc(a.otp_hour_limit)}"></div></div>
      <div><label class="f">رمز الدولة لأرقام الجوال</label><input name="phone_cc" value="${esc(a.phone_cc)}" inputmode="numeric" maxlength="5" dir="ltr" style="max-width:120px"><div class="hint">يُضاف للأرقام المحلية التي تبدأ بصفر (السعودية 966).</div></div>
      <div><label class="f">نص رسالة الرمز (واتساب / SMS)</label><textarea name="otp_message" rows="2">${esc(a.otp_message)}</textarea><div class="hint">المتغيرات: {code} الرمز، {minutes} الصلاحية، {platform} اسم المنصة.</div></div>
      <button class="btn block">حفظ</button>
    </form></div>
  <div class="card"><h3>📧 البريد الإلكتروني (SMTP)</h3>
    <form id="adm_mail" class="gap">
      ${sw('enabled', 'تفعيل إرسال البريد', c.enabled)}
      <div class="row"><div style="flex:2"><label class="f">خادم البريد</label><input name="host" value="${esc(c.host)}" dir="ltr"></div><div><label class="f">المنفذ</label><input name="port" type="number" value="${esc(c.port)}" dir="ltr"></div></div>
      <div><label class="f">التشفير</label><select name="secure"><option value="ssl" ${c.secure === 'ssl' ? 'selected' : ''}>SSL (منفذ 465)</option><option value="tls" ${c.secure === 'tls' ? 'selected' : ''}>STARTTLS (منفذ 587)</option><option value="none" ${c.secure === 'none' ? 'selected' : ''}>بلا تشفير</option></select></div>
      <div><label class="f">اسم المستخدم</label><input name="user" value="${esc(c.user)}" dir="ltr" autocomplete="off"></div>
      <div><label class="f">كلمة المرور ${c.has_pass ? '<span class="badge b-hifz">✔ محفوظة (مشفّرة)</span>' : '<span class="badge g-إعادة">غير مضبوطة</span>'}</label><input name="pass" type="password" autocomplete="new-password" placeholder="${c.has_pass ? 'اتركها فارغة للإبقاء على الحالية' : 'كلمة مرور صندوق البريد'}"><div class="hint">عند تغيير كلمة مرور الصندوق في الاستضافة اكتب الجديدة هنا ثم احفظ.</div></div>
      <div class="row"><div><label class="f">بريد المرسِل</label><input name="from_email" type="email" value="${esc(c.from_email)}" dir="ltr"></div><div><label class="f">اسم المرسِل</label><input name="from_name" value="${esc(c.from_name)}"></div></div>
      <div><label class="f">رابط الموقع (يظهر في الرسائل)</label><input name="site_url" value="${esc(c.site_url)}" dir="ltr"></div>
      <button class="btn block">حفظ إعدادات البريد</button>
      <div class="row"><input id="mt_to" type="email" placeholder="بريد للتجربة" value="${esc(db.me.email || '')}" dir="ltr"><button type="button" class="btn light auto" data-act="adm-mail-test">إرسال تجربة</button></div>
    </form></div>
  ${gwCard('wa', 'بوابة واتساب', '💬', S.wa)}${gwCard('sms', 'بوابة الرسائل النصية (SMS)', '📱', S.sms)}`;
}

/* ---------- المنصة: الهوية، الشارة، الأسبوع، الإعلان ---------- */
function secPlatform() {
  const S = st.adm.settings; if (!S) return admLoading(); if (S.error) return admErr(S);
  const p = S.platform, logo = st.tmpPlat !== undefined ? st.tmpPlat : p.platform_logo;
  return `
  <div class="card"><h3>🎨 هوية المنصة</h3>
    <form id="adm_platform" class="gap">
      <div class="logo-pick"><img class="logo" id="pprev" src="${esc(logo) || 'icon.svg'}"><div style="flex:1"><label class="f">شعار المنصة</label><input type="file" id="plogo" accept="image/*" style="padding:8px">
        ${logo ? '<button type="button" class="btn red sm" style="margin-top:6px" data-act="adm-rm-logo">إزالة (الشعار الافتراضي)</button>' : ''}</div></div>
      <div><label class="f">اسم المنصة</label><input name="platform_name" value="${esc(p.platform_name)}" maxlength="40" required></div>
      <div><label class="f">الوصف المختصر</label><input name="platform_tagline" value="${esc(p.platform_tagline)}" maxlength="90"></div>
      <div><label class="f">عبارة الوقف <span class="hint">(تظهر أسفل صفحة الدخول وفي الكشوف، فارغة = بلا عبارة)</span></label><input name="platform_waqf" value="${esc(p.platform_waqf)}" maxlength="200"></div>
      <div><label class="f">نص صفحة «عن المنصة» <span class="hint">(سطر فارغ يفصل الفقرات، وسطر يبدأ بـ «- » يصير نقطة، وسطر ينتهي بـ «؟» عنوان فرعي)</span></label><textarea name="about_text" rows="12" maxlength="4000">${esc(p.about_text)}</textarea></div>
      <div><label class="f">بريد استقبال رسائل التواصل <span class="hint">(فارغ = بريد مدير النظام)</span></label><input name="contact_email" type="email" value="${esc(p.contact_email)}" maxlength="190" dir="ltr"></div>
      <p class="hint" style="margin:0">يظهر الاسم والشعار في صفحة الدخول وحساب المدير ورسائل البريد. أما المدارس والمعلمون المستقلون فيظهر لهم اسم وشعار حلقاتهم.</p>
      <h3 style="margin-top:6px">🧪 شارة المرحلة (صفحتا الدخول والتسجيل)</h3>
      <div><label class="f">الشارة <span class="hint">(فارغة = بلا شارة)</span></label><input name="beta_badge" value="${esc(p.beta_badge)}" maxlength="80"></div>
      <div><label class="f">النص التوضيحي</label><textarea name="beta_note" rows="3" maxlength="400">${esc(p.beta_note)}</textarea></div>
      <h3 style="margin-top:6px">🗓 التقويم</h3>
      <div><label class="f">أول يوم في الأسبوع (للإحصائيات والتقارير)</label><select name="week_start">${['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map((d, i) => `<option value="${i}" ${+p.week_start === i ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
      <h3 style="margin-top:6px">📢 إعلان لمستخدمي المنصة</h3>
      ${sw('announce_on', 'إظهار الإعلان في الرئيسية', p.announce_on === '1')}
      <div><label class="f">العنوان</label><input name="announce_title" value="${esc(p.announce_title)}" maxlength="100" placeholder="مثال: صيانة مجدولة"></div>
      <div><label class="f">النص</label><textarea name="announce_text" rows="3" maxlength="600">${esc(p.announce_text)}</textarea></div>
      <div><label class="f">يظهر لـ</label><select name="announce_audience"><option value="all" ${p.announce_audience === 'all' ? 'selected' : ''}>الجميع</option><option value="staff" ${p.announce_audience === 'staff' ? 'selected' : ''}>المعلمين والمدراء</option><option value="parents" ${p.announce_audience === 'parents' ? 'selected' : ''}>أولياء الأمور</option></select></div>
      <button class="btn block">حفظ</button>
    </form></div>`;
}

/* ---------- صندوق الرسائل والاقتراحات ---------- */
const FB_AR = { contact: '✉️ تواصل', suggestion: '💡 اقتراح', issue: '🐞 مشكلة', praise: '🌟 رأي / شكر' };
function secInbox() {
  const I = st.adm.inbox; if (!I) return admLoading(); if (I.error) return admErr(I);
  return `<div class="card"><h3>💬 الرسائل والاقتراحات ${I.unread ? `<span class="more">${I.unread} جديدة</span>` : ''}</h3>
    ${I.items.length ? I.items.map(x => `<div class="fb ${x.status === 'new' ? 'new' : ''}"><div class="fbh"><b>${FB_AR[x.kind] || x.kind}</b> <span>${esc(x.name || 'بدون اسم')}${x.email ? ` • <bdi dir="ltr">${esc(x.email)}</bdi>` : ''}</span><small>${fmtT(x.at)}</small></div>
      <p>${esc(x.message)}</p>
      <div class="row"><button class="btn light sm" data-act="fb-read" data-id="${x.id}" data-st="${x.status === 'new' ? 'read' : 'unread'}">${x.status === 'new' ? '✔ تمّت القراءة' : '↩ غير مقروءة'}</button>${x.email ? `<a class="btn ghost sm" href="mailto:${esc(x.email)}">↩ رد</a>` : ''}<button class="btn red sm" data-act="fb-del" data-id="${x.id}">حذف</button></div></div>`).join('')
      : empty('📭', 'لا توجد رسائل بعد')}</div>`;
}

/* ---------- السجل والنسخة الاحتياطية ---------- */
const AUDIT_AR = { login: 'دخول', login_otp: 'دخول برمز', reset_password: 'إعادة كلمة مرور', user_delete: 'حذف حساب', student_delete: 'حذف طالب', school_save: 'حفظ مدرسة', school_delete: 'حذف مدرسة', request_approve: 'موافقة على طلب', request_reject: 'رفض طلب', mail_save: 'تعديل إعدادات البريد', settings_save: 'تعديل الإعدادات', backup_export: 'تنزيل نسخة احتياطية' };
const KIND_AR = { otp: 'رمز دخول', invite: 'دعوة', approved: 'موافقة', test: 'تجربة', wa: 'واتساب', sms: 'رسالة', mail: 'بريد' };
function secAudit() {
  const A = st.adm.audit, M = st.adm.mail; if (!A || !M) return admLoading(); if (A.error) return admErr(A); if (M.error) return admErr(M);
  return `
  <div class="card"><h3>💾 نسخة احتياطية</h3><p class="hint" style="margin-top:0">ملف JSON بكل المدارس والحسابات (بدون كلمات المرور) والطلاب والتسميع والبرامج والشهادات والرسائل. احفظه في مكان آمن لأنه يحوي بيانات شخصية.</p>
    <button class="btn block gold" data-act="adm-backup">⬇ تنزيل نسخة احتياطية</button></div>
  <div class="card"><h3>📨 سجل الرسائل الصادرة</h3>
    ${M.log.length ? `<div class="tw"><table><tr><th>الوقت</th><th style="text-align:start">إلى</th><th>النوع</th><th>الحالة</th></tr>
      ${M.log.map(x => `<tr><td><small>${fmtT(x.at)}</small></td><td style="text-align:start" dir="ltr"><small>${esc(x.to)}</small></td><td>${KIND_AR[x.kind] || x.kind}</td><td>${x.status === 'sent' ? '✅' : `<span title="${esc(x.error)}">❌</span>`}</td></tr>${x.status === 'failed' && x.error ? `<tr><td colspan="4" style="text-align:start"><small style="color:var(--red)">${esc(x.error)}</small></td></tr>` : ''}`).join('')}</table></div>` : empty('📭', 'لا توجد رسائل بعد')}</div>
  <div class="card"><h3>🧾 سجل النشاط (آخر 100)</h3>
    ${A.log.length ? `<div class="list">${A.log.map(x => `<div class="item" style="cursor:default"><div class="avatar" style="font-size:16px">🧾</div><div class="t"><b>${AUDIT_AR[x.action] || esc(x.action)}</b><small>${esc(x.user || '—')}${x.detail ? ' • ' + esc(x.detail) : ''}${x.target ? ' • ' + esc(x.target) : ''}</small></div><div class="side"><small>${fmtT(x.at)}</small></div></div>`).join('')}</div>` : empty('🧾', 'لا يوجد نشاط مسجّل')}</div>`;
}

/* ---------- أوامر ولوحات الحفظ ---------- */
const settingsRefresh = () => { st.adm.inbox = null; st.adm.settings = null; st.adm.mail = null; st.adm.overview = null; st.adm.audit = null; };
Object.assign(acts, {
  'fb-read': async (id, el) => { await api('feedback_update', { id: +id, action: el.dataset.st }); st.adm.inbox = null; render(); },
  'fb-del': async id => { if (!confirm('حذف هذه الرسالة؟')) return; await api('feedback_update', { id: +id, action: 'delete' }); st.adm.inbox = null; render(); },
  'adm-reload': () => { settingsRefresh(); render(); },
  'adm-rm-logo': () => { st.tmpPlat = ''; render(); },
  'adm-mail-test': async () => {
    const to = $('#mt_to').value.trim(); if (!to) return toast('اكتب بريداً للتجربة');
    toast('جارٍ الإرسال...'); const r = await api('mail_test', { to });
    st.adm.mail = null; render(); toast(r.ok ? '✅ أُرسلت رسالة التجربة — افحص بريدك' : '❌ ' + r.error);
  },
  'adm-gw-test': async id => {
    const to = $('#gt_' + id).value.trim(); if (!to) return toast('اكتب رقماً للتجربة');
    toast('جارٍ الإرسال...'); const r = await api('gateway_test', { channel: id, to });
    modal(`<h2>${r.ok ? '✅ وصل الطلب للبوابة' : '❌ فشل الإرسال'}</h2>${r.ok ? '<p class="hint">استجابة البوابة 2xx. تأكد أن الرسالة وصلت فعلاً للجوال.</p>' : `<div class="info err">${esc(r.error)}</div>`}${r.info ? `<p class="hint" dir="ltr">${esc(r.info)}</p>` : ''}<button class="btn block" data-act="close">إغلاق</button>`);
  },
  'adm-backup': async () => {
    toast('جارٍ التجهيز...'); const d = await api('backup_export');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d)], { type: 'application/json' })); a.download = `tahfidh-backup-${today()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000); st.adm.audit = null; toast('تم تنزيل النسخة ✔'); render();
  }
});
document.addEventListener('submit', async e => {
  const f = e.target; if (!f.id || !f.id.startsWith('adm_')) return;
  e.preventDefault();
  try {
    const v = {}; const ck = n => f.elements[n] ? f.elements[n].checked : false;
    if (f.id === 'adm_auth') {
      ['reg_open', 'login_password', 'login_otp_email', 'login_otp_wa', 'login_otp_sms'].forEach(k => { v[k] = ck(k); });
      ['otp_ttl', 'otp_max_attempts', 'otp_cooldown', 'otp_hour_limit'].forEach(k => { v[k] = +f.elements[k].value; });
      v.otp_message = f.elements.otp_message.value; v.phone_cc = f.elements.phone_cc.value;
      await api('settings_save', { group: 'auth', values: v });
      try { st.site = await api('site_info'); } catch { }
    } else if (f.id === 'adm_mail') {
      await api('mail_save', { enabled: ck('enabled'), host: f.elements.host.value, port: +f.elements.port.value, secure: f.elements.secure.value, user: f.elements.user.value, pass: f.elements.pass.value,
        from_email: f.elements.from_email.value, from_name: f.elements.from_name.value, site_url: f.elements.site_url.value });
    } else if (f.id === 'adm_wa' || f.id === 'adm_sms') {
      await api('settings_save', { group: f.id.slice(4), values: { on: ck('on'), url: f.elements.url.value, method: f.elements.method.value, body: f.elements.body.value, headers: f.elements.headers.value, clear_headers: ck('clear_headers') } });
    } else if (f.id === 'adm_platform') {
      ['platform_name', 'platform_tagline', 'platform_waqf', 'about_text', 'contact_email', 'beta_badge', 'beta_note', 'announce_title', 'announce_text', 'announce_audience'].forEach(k => { v[k] = f.elements[k].value; });
      v.week_start = +f.elements.week_start.value; v.announce_on = ck('announce_on');
      v.platform_logo = st.tmpPlat === undefined ? 'keep' : st.tmpPlat;
      await api('settings_save', { group: 'platform', values: v }); st.tmpPlat = undefined;
      try { st.site = await api('site_info'); } catch { }
      await refresh();
    }
    settingsRefresh(); render(); toast('تم الحفظ ✔');
  } catch (err) { toast(err.message || 'حدث خطأ'); }
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'plogo' && t.files[0]) { try { st.tmpPlat = await resizeLogo(t.files[0]); $('#pprev').src = st.tmpPlat; } catch { toast('تعذر قراءة الصورة'); } }
});

/* ---------- البحث الشامل (يعمل على ما أرسله الخادم للمستخدم فقط، فلا يكشف شيئاً خارج صلاحياته) ---------- */
const normS = s => String(s || '').toLowerCase().replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\s+/g, ' ').trim();
function scopeHint() {
  const r = role();
  return r === 'admin' ? (st.fs ? `البحث ضمن المدرسة المختارة فقط — اختر «كل المدارس» من الأعلى للبحث الشامل.` : 'يشمل المدارس والمعلمين المستقلين والحسابات والطلاب والبرامج والشهادات.')
    : r === 'school_admin' ? 'يشمل معلمي مدرستك وأولياء أمرها وطلابها وبرامجهم وشهاداتهم.'
    : r === 'teacher' ? 'يشمل طلابك فقط.' : 'يشمل أبناءك فقط.';
}
function searchResults(q) {
  const nq = normS(q); if (nq.length < 2) return `<div class="card">${empty('🔍', 'اكتب حرفين على الأقل للبحث')}</div>`;
  const toks = nq.split(' ').filter(Boolean), hit = (...f) => { const h = normS(f.filter(Boolean).join(' ')); return toks.every(t => h.includes(t)); };
  const G = [];
  const add = (title, items) => { if (items.length) G.push([title, items]); };
  if (isAdmin()) add('🏫 المدارس والحلقات', db.schools.filter(s => hit(s.name, s.mgr_name, PLAN_AR[s.plan])).map(s => ({ ic: soloSchool(s) ? '🧑‍🏫' : '🏫', t: s.name, sub: (soloSchool(s) ? 'معلم مستقل' : 'مدرسة') + (s.mgr_name ? ' • ' + s.mgr_name : ''), act: soloSchool(s) && mgrOf(s) ? 'edit-user' : 'edit-school', id: soloSchool(s) && mgrOf(s) ? mgrOf(s).id : s.id })));
  const groups = [['solo', '🧑‍🏫 المعلمون المستقلون'], ['school_admin', '👔 مدراء المدارس'], ['teacher', '👨‍🏫 المعلمون'], ['parent', '👪 أولياء الأمور'], ['admin', '🛡 مدراء النظام']];
  if (isMgr()) groups.forEach(([k, title]) => add(title, db.users.filter(u => (k === 'solo' ? (u.role === 'school_admin' && u.solo) : k === 'school_admin' ? (u.role === 'school_admin' && !u.solo) : u.role === k) && hit(u.name, u.username, u.email, u.phone, schoolName(u.school_id)))
    .map(u => ({ ic: initial(u.name), t: u.name, sub: [u.email || u.username, schoolName(u.school_id)].filter(Boolean).join(' • '), act: 'edit-user', id: u.id }))));
  add('🎓 الطلاب', db.students.filter(s => hit(s.name, s.group, schoolName(s.school_id), teacherNames(s), s.program === 'qiraat' ? 'قراءات' : 'حفظ مراجعة')).map(s => ({ ic: initial(s.name), t: s.name, sub: curLine(s) + (isAdmin() && db.schools.length > 1 ? ' • ' + schoolName(s.school_id) : ''), act: staff() ? 'quick' : 'open-student', id: s.id, extra: staff() ? { act: 'open-student', ic: '📂' } : null })));
  add('📚 برامج القراءة', db.enrollments.filter(e => student(e.studentId) && hit(e.label, student(e.studentId).name)).map(e => ({ ic: '📚', t: e.label, sub: `${student(e.studentId).name} • ${e.status === 'completed' ? 'منجزة' : 'جارية'}`, act: 'open-student', id: e.studentId })));
  add('🏆 الشهادات', db.certs.filter(c => hit(c.serial, c.title, c.student, c.label)).map(c => ({ ic: '🏆', t: c.title, sub: `${c.student} • ${c.serial}`, act: 'open-cert', id: c.id })));
  if (isMgr()) add('📨 طلبات التسجيل', db.requests.filter(r => hit(r.name, r.email, r.username, r.school_name)).map(r => ({ ic: '📨', t: r.name, sub: `${ROLE_AR[r.role]} • ${r.email || r.username}`, act: 'view-request', id: r.id })));
  if (!G.length) return `<div class="card">${empty('🤷', 'لا توجد نتائج مطابقة في حدود صلاحياتك')}</div>`;
  return G.map(([title, items]) => `<div class="card"><h3>${title} <span class="more" style="color:var(--mut)">${items.length}</span></h3><div class="list">${items.slice(0, 8).map(x => `<div class="item" data-act="${x.act}" data-id="${x.id}"><div class="avatar" style="font-size:${x.ic.length > 1 ? 20 : 18}px">${x.ic}</div><div class="t"><b>${esc(x.t)}</b><small>${esc(x.sub)}</small></div>${x.extra ? `<button class="btn light sm auto" data-act="${x.extra.act}" data-id="${x.id}">${x.extra.ic}</button>` : ''}</div>`).join('')}</div>${items.length > 8 ? `<p class="hint" style="margin:8px 0 0">و${items.length - 8} نتيجة أخرى — اكتب كلمة أدق.</p>` : ''}</div>`).join('');
}
function viewSearch() {
  return `<div class="card"><input id="sq" type="search" placeholder="🔍 ابحث بالاسم أو البريد أو الجوال..." value="${esc(st.sq || '')}" autocomplete="off" autocapitalize="off"><p class="hint" style="margin:8px 0 0">${scopeHint()}</p></div><div id="sres">${searchResults(st.sq || '')}</div>`;
}
document.addEventListener('input', e => { if (e.target.id === 'sq') { st.sq = e.target.value; const r = $('#sres'); if (r) r.innerHTML = searchResults(st.sq); } });
