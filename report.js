/* التقرير الشهري للطالب — صفحة A4 واحدة قابلة للطباعة / الحفظ PDF */
const GP = { 'ممتاز': 5, 'جيد جداً': 4, 'جيد': 3, 'مقبول': 2, 'إعادة': 1 };

function monthRange(off) {
  const n = new Date(), s = new Date(n.getFullYear(), n.getMonth() + off, 1), e = new Date(s.getFullYear(), s.getMonth() + 1, 0);
  return { s, e, days: e.getDate(), label: s.toLocaleDateString(L, { month: 'long', year: 'numeric' }) };
}

/* حلقة نسبة (دائرية) */
function svgRing(pct, color, label, sub) {
  const r = 40, c = 2 * Math.PI * r, d = c * Math.min(100, pct) / 100;
  return `<svg viewBox="0 0 110 110" width="100%" height="100%"><circle cx="55" cy="55" r="${r}" fill="none" stroke="#e6efe9" stroke-width="12"/>
    <circle cx="55" cy="55" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${d} ${c - d}" transform="rotate(-90 55 55)"/>
    <text x="55" y="58" text-anchor="middle" font-size="19" font-weight="800" fill="#0b5d45">${label}</text>
    <text x="55" y="74" text-anchor="middle" font-size="9" fill="#6b7d75">${sub}</text></svg>`;
}
/* دونات: حفظ مقابل مراجعة */
function svgDonut(h, r) {
  const tot = h + r, R = 38, c = 2 * Math.PI * R, dh = tot ? c * h / tot : 0;
  return `<svg viewBox="0 0 110 110" width="100%" height="100%"><circle cx="55" cy="55" r="${R}" fill="none" stroke="${tot ? '#d4a437' : '#e6efe9'}" stroke-width="18"/>
    ${tot ? `<circle cx="55" cy="55" r="${R}" fill="none" stroke="#14956b" stroke-width="18" stroke-dasharray="${dh} ${c - dh}" transform="rotate(-90 55 55)"/>` : ''}
    <text x="55" y="53" text-anchor="middle" font-size="20" font-weight="800" fill="#0b5d45">${tot}</text>
    <text x="55" y="68" text-anchor="middle" font-size="9" fill="#6b7d75">آية</text></svg>`;
}
/* أعمدة يومية (اليوم 1 على اليمين) */
function svgBars(per) {
  const W = 470, H = 150, pad = 20, ph = H - pad - 16, bw = (W - 8) / per.length, mx = Math.max(1, ...per.map(x => x.h + x.r + x.q));
  let g = '';
  [0, .5, 1].forEach(f => { const y = H - pad - ph * f; g += `<line x1="4" x2="${W - 4}" y1="${y}" y2="${y}" stroke="#e6efe9" stroke-width="1" ${f ? 'stroke-dasharray="3 3"' : ''}/>`; });
  g += `<text x="6" y="${H - pad - ph - 3}" font-size="8" fill="#6b7d75">${mx}</text>`;
  per.forEach((x, i) => {
    const cx = W - 4 - (i + .5) * bw, w = Math.max(3, bw * .62), hh = ph * x.h / mx, rh = ph * x.r / mx, qh = ph * (x.q || 0) / mx, base = H - pad;
    if (x.r) g += `<rect x="${cx - w / 2}" y="${base - hh - rh}" width="${w}" height="${rh}" rx="2.5" fill="#d4a437"/>`;
    if (x.q) g += `<rect x="${cx - w / 2}" y="${base - hh - rh - qh}" width="${w}" height="${qh}" rx="2.5" fill="#6b73d6"/>`;
    if (x.h) g += `<rect x="${cx - w / 2}" y="${base - hh}" width="${w}" height="${hh}" rx="2.5" fill="#14956b"/>`;
    if (x.h + x.r + (x.q || 0)) g += `<text x="${cx}" y="${base - hh - rh - qh - 3}" text-anchor="middle" font-size="7.5" font-weight="700" fill="#0b5d45">${x.h + x.r + (x.q || 0)}</text>`;
    if (per.length <= 16 || i % 2 === 0) g += `<text x="${cx}" y="${H - 6}" text-anchor="middle" font-size="8.5" fill="${x.h + x.r ? '#0b5d45' : '#9aa9a2'}">${i + 1}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="none">${g}</svg>`;
}

function reportSheet(s, off, rg) {
  const m = rg ? (() => { const s0 = parse(rg.a), e0 = parse(rg.b); return { s: s0, e: e0, days: Math.round((e0 - s0) / 864e5) + 1, label: rg.label }; })() : monthRange(off), a = ymd(m.s), b = ymd(m.e);
  const recs = db.records.filter(r => r.studentId === s.id && r.date >= a && r.date <= b).sort((x, y) => x.date.localeCompare(y.date) || x.id - y.id);
  const g = agg(recs);
  const wk = m.days > 45, per = Array.from({ length: wk ? Math.ceil(m.days / 7) : m.days }, (_, i) => { const d0 = ymd(addDays(m.s, wk ? i * 7 : i)), d1 = wk ? ymd(addDays(m.s, i * 7 + 6)) : d0, x = agg(recs.filter(r => r.date >= d0 && r.date <= d1)); return { h: x.h, r: x.r, q: x.q }; });
  const mem = memorized(s.id), total = mem.reduce((x, y) => x + y, 0), pct = total * 100 / Q.TOTAL;
  const juz = Array.from({ length: 30 }, (_, i) => {
    const st0 = Q.juzAbs[i], e = (Q.juzAbs[i + 1] || Q.TOTAL + 1) - 1; let c = 0;
    for (let k = st0; k <= e; k++) c += mem[k - 1]; return Math.round(c * 100 / (e - st0 + 1));
  });
  const full = juz.filter(p => p === 100).length;
  const gr = GRADES.map(n => [n, recs.filter(r => r.grade === n).length]), graded = gr.reduce((x, y) => x + y[1], 0);
  const avg = graded ? gr.reduce((x, [n, c]) => x + GP[n] * c, 0) / graded : 0;
  const avgLbl = graded ? GRADES[Math.max(0, Math.min(4, Math.round(5 - avg)))] : '—';
  const days = g.days.size, att = Math.round(days * 100 / m.days);
  const t = tObj(s), lastH = lastOf(s.id, 'hifz');
  const notes = recs.filter(r => r.note).slice(-2);
  const kpi = (ic, v, l, c) => `<div class="rp-k" style="--c:${c}"><i>${ic}</i><b>${v}</b><span>${l}</span></div>`;
  const mx = Math.max(1, ...gr.map(x => x[1]));
  const gcol = { 'ممتاز': '#12a150', 'جيد جداً': '#3b7ddd', 'جيد': '#6b73d6', 'مقبول': '#e0a02a', 'إعادة': '#d9534f' };

  return `
  <div class="rp-hd"><div class="rp-pat"></div>
    <img src="${esc(brandFor(s.school_id).logo) || 'icon.svg'}" class="rp-logo" alt="">
    <div class="rp-hd-t"><div class="rp-hv">﴿ وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا ﴾</div><small>${rg ? 'كشف التسميع' : 'التقرير الشهري للحفظ والمراجعة'}</small><h1>${esc(brandFor(s.school_id).name)}</h1></div>
    <div class="rp-month"><b>${m.label}</b><small>${fmtH(m.s)} – ${fmtH(m.e)}</small></div></div>

  <div class="rp-st">
    <div class="rp-av">${initial(s.name)}</div>
    <div class="rp-st-t"><h2>${esc(s.name)}</h2><p>${[schoolName(s.school_id), s.group, t ? 'المعلم: ' + t.name : '', s.program === 'qiraat' ? 'برنامج قراءات' : ''].filter(Boolean).map(esc).join(' • ')}</p>
      ${lastH ? `<p class="rp-last">📍 آخر موضع حفظ: <b>${recText(lastH)}</b></p>` : ''}</div>
    <div class="rp-ring">${svgRing(pct, '#d4a437', pct.toFixed(1) + '%', `${total} آية من القرآن`)}</div></div>

  <div class="rp-kpis">
    ${kpi('📖', g.h, 'آيات الحفظ', '#14956b')}${kpi('🔁', g.r, 'آيات المراجعة', '#d4a437')}${kpi('🗓', `${days}<small>/${m.days}</small>`, 'أيام التسميع', '#3b7ddd')}
    ${g.q ? kpi('📚', g.q, 'آيات القراءة', '#6b73d6') : kpi('🎙', g.n, 'عدد التسميعات', '#6b73d6')}${kpi('🏅', avgLbl, 'متوسط التقدير', '#12a150')}</div>

  <div class="rp-row">
    <div class="rp-box rp-w2"><h3>📈 ${wk ? 'النشاط الأسبوعي' : 'النشاط اليومي'} <span><i style="background:#14956b"></i>حفظ <i style="background:#d4a437"></i>مراجعة</span></h3><div class="rp-chart">${svgBars(per)}</div></div>
    <div class="rp-box"><h3>⚖️ توزيع الجهد</h3><div class="rp-donut">${svgDonut(g.h, g.r)}</div>
      <p class="rp-cap"><i style="background:#14956b"></i>حفظ ${g.h} &nbsp; <i style="background:#d4a437"></i>مراجعة ${g.r}</p></div>
  </div>

  <div class="rp-row">
    <div class="rp-box rp-w2"><h3>🗺 خريطة الأجزاء <span>${full} جزء مكتمل</span></h3>
      <div class="rp-juz">${juz.map((p, i) => `<div style="background:linear-gradient(to top,${p === 100 ? '#14956b' : '#bfe6d5'} ${p}%,#fff ${p}%);color:${p === 100 ? '#fff' : '#1d2b26'};border-color:${p ? '#14956b' : '#e2e8e4'}"><b>${i + 1}</b></div>`).join('')}</div></div>
    <div class="rp-box"><h3>🏅 التقديرات</h3>
      ${graded ? gr.map(([n, c]) => `<div class="rp-gb"><span>${n}</span><div><i style="width:${c * 100 / mx}%;background:${gcol[n]}"></i></div><b>${c}</b></div>`).join('') : '<p class="rp-cap">لا توجد تقديرات هذا الشهر</p>'}</div>
  </div>

  ${recs.length ? rptTables(recs) : '<div class="rp-box rp-tbl"><h3>📋 سجل التسميع</h3><p class="rp-cap" style="padding:14px 0">لا يوجد تسميع مسجل في هذا الشهر</p></div>'}

  ${notes.length ? `<div class="rp-box rp-notes"><h3>📝 ملاحظات المعلم</h3>${notes.map(r => { const d = parse(r.date); return `<p>• <b>${d.getDate()}/${d.getMonth() + 1}</b> — ${esc(r.note)}</p>`; }).join('')}</div>` : ''}

  <div class="rp-ft"><div><span></span>المعلم${t ? ': ' + esc(t.name) : ''}</div><div><span></span>ولي الأمر</div></div>
  <div class="rp-foot">أُصدر بتاريخ ${fmtG(new Date())} • ${esc(brandFor(s.school_id).name)}</div>`;
}

function rptTables(recs) {
  const cnt = (f, l) => { const x = recs.filter(f); return x.length ? `${l} ${x.length}` : ''; };
  const sm = [cnt(r => r.type === 'hifz', 'حفظ'), cnt(r => r.type === 'review', 'مراجعة'), cnt(r => r.type === 'qiraa', 'قراءة')].filter(Boolean).join(' • ');
  return `<div class="rp-box rp-tbl"><h3>📋 سجل التسميع <span>${recs.length} تسميع${sm ? ' — ' + sm : ''}</span></h3>
    <table><tr><th>اليوم</th><th>النوع</th><th>السورة والآيات</th><th>الجزء</th><th>التقدير</th></tr>
    ${recs.map(r => { const d = parse(r.date); return `<tr><td>${fmtDay(d)} ${d.getDate()}/${d.getMonth() + 1}</td><td><em class="${typeCls(r)}">${typeAr(r)}</em></td>
      <td><b>${rngName(r)}</b> ${r.from}–${r.to} <small>(${ayahs(r)})${r.enrollmentId && enrById(r.enrollmentId) ? ' • ' + esc(enrById(r.enrollmentId).label) : ''}</small></td><td>${Q.juz(r.surah, r.from, r.to, rEnd(r)).join('–')}</td><td>${r.grade || '—'}</td></tr>`; }).join('')}</table></div>`;
}
function viewReport() {
  const s = student(st.sid); if (!s) return staff() ? viewStudents() : viewKids();
  const off = st.ro || 0, m = monthRange(off);
  return `
  <div class="card noprint">
    <div class="nav-period"><button data-act="rprev">›</button><div>${m.label}<small>التقرير الشهري — ${esc(s.name)}</small></div><button data-act="rnext" ${off >= 0 ? 'disabled' : ''}>‹</button></div>
    <div class="row"><button class="btn gold" data-act="print">🖨 طباعة / حفظ PDF</button><button class="btn light auto" data-act="rback">رجوع</button></div>
    <p class="hint" style="margin:8px 0 0">في نافذة الطباعة اختر «حفظ بتنسيق PDF». يمتد التقرير لأكثر من صفحة إذا كثرت التسميعات.</p>
  </div>
  <div class="rptwrap" id="rptwrap"><div class="rpt flow" id="rpt">${reportSheet(s, off)}</div></div>`;
}
function fitReport() {
  const w = $('#rptwrap'), r = $('#rpt'); if (!w || !r) return;
  const bw = +r.dataset.w || 794, bh = r.classList.contains('flow') ? r.scrollHeight : (+r.dataset.h || 1123);
  const k = Math.min(1, w.clientWidth / bw);
  r.style.transform = `scale(${k})`; w.style.height = Math.round(bh * k) + 'px';
}
addEventListener('resize', fitReport);
