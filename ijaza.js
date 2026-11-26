/* الإجازات: نماذج قابلة للتعديل + إجازة كاملة بزخارف (غلاف/بسملة/مقدمة/نص/مشايخ/أسانيد/شجرة/وصية/منح) + نموذج مختصر من ورقة واحدة */

const IJ = { uid: 0, loaded: false, loading: false, tpls: [], list: [] };
async function ijLoad(force) {
  if (!db.me) return;
  if (IJ.uid !== db.me.id) { IJ.uid = db.me.id; IJ.loaded = false; IJ.tpls = []; IJ.list = []; }
  if ((IJ.loaded && !force) || IJ.loading) return;
  IJ.loading = true;
  try { const r = await api('ijaza_get'); IJ.tpls = r.tpls || []; IJ.list = r.list || []; IJ.loaded = true; } catch { IJ.loaded = true; }
  IJ.loading = false; render();
}

const IJ_THEMES = {
  crimson: { n: 'قرمزي وذهبي', p: '#8e1b12', s: '#b5362a', a: '#d9a441', l: '#fbe9c4', ink: '#7a1710' },
  green: { n: 'أخضر وذهبي', p: '#0b5d45', s: '#1b8a68', a: '#d4a437', l: '#f6ecc9', ink: '#0b4a37' },
  navy: { n: 'أزرق وذهبي', p: '#17306b', s: '#2b4c9b', a: '#d9b44a', l: '#f8efd0', ink: '#14295c' }
};
const IJ_SECTIONS = [['cover', 'الغلاف'], ['bism', 'صفحة البسملة'], ['title', 'صفحة العنوان (الكفر)'], ['muq', 'المقدمة'], ['body', 'نص الإجازة'], ['bio', 'مشايخ المجيز (تعريف)'], ['summ', 'مختصر أسانيد المشايخ'], ['detail', 'أسانيد المشايخ مفصلة'], ['qurra', 'أسانيد القراء العشرة'], ['tree', 'شجرة الإسناد'], ['wasiyya', 'الوصية'], ['grant', 'منح الإجازة']];

const IJ_MUQ = `## مقدمة

إنَّ الحمدَ لله نحمده، ونستعينه ونستغفره، ونعوذ بالله من شرور أنفسنا ومن سيئات أعمالنا من يهْدِهِ اللهُ فلا مُضِلَّ له ومن يُضلِلْ فلا هاديَ له، وأشهدُ أن لا إله إلا اللهُ وحده لا شريكَ له، وأشهد أنّ مُحمداً عبدُه ورسولُه [[ﷺ]].

⟦BSML:ﮋ ⟧⟦063:ﭤ ﭥ ﭦ ﭧ ﭨ ﭩ ﭪ ﭫ ﭬ ﭭ ﭮ ﭯ ﭰ ⟧

⟦BSML:ﮋ ⟧⟦077:ﭑ ﭒ ﭓ ﭔ ﭕ ﭖ ﭘ ﭙ ﭚ ﭛ ﭜ ﭝ ﭞ ﭟ ﭠ ﭡﭢ ﭣ ﭤ ﭥ ﭦ ﭧ ﭨﭩ ﭪ ﭫ ﭬ ﭭ ﭮ ﭯ ⟧⟦BSML:ﮊ⟧

[[وقال تعالى:]] ⟦BSML:ﮋ ⟧⟦427:ﮥ ﮦ ﮧ ﮨ ﮩ ﮪ ﮫ ﮬ ﮭ ﮮ ﮯ ﮰ ﮱ ﯓ ﯔﯕ ﯖ ﯗ ﯘ ﯙ ﯚ ﯛ ﯜ ﯝ ﯞ ⟧⟦BSML:ﮊ⟧.

[[أما بعدُ:]]

فإن أصدقَ الحديث كتابُ الله تعالى، وأحسنَ الهَدي هديُ محمدٍ [[ﷺ]]، وشرَّ الأمور محدثاتُها، وكلَّ محدثة بدعةٌ، وكلَّ بدعة ضلالةٌ، وكلَّ ضلالة في النار.

الحمدُ لله الذي جعلنا من وَرَثَة كتابه المبين، ويسَّر لنا معرفة طُرقه ورواياته عن الأئمة المتقِنين، ومَنَّ علينا بالسَّند المتصل بخاتم الأنبياء والمرسلين [[ﷺ]]، الذي تلقّى القرآنَ من لَدُنْ حكيم عليم، ونزل عليه قولُ ربه العظيم: ⟦BSML:ﮋ ⟧⟦375:ﮓ ﮔ ﮕ ﮖ ﮗ ﮘ ﮙ ﮚ ﮛ ﮜ ﮝ ﮞ ﮟ ﮠ ﮡ ﮢ ﮣ ﮤ ﮥ ﮦ⟧ ⟦BSML:ﮊ ⟧[[الشعراء: ١٩٢ - ١٩٥]] وأشهد أن لّا إله إلا الله وحده لا شريك له القائل في كتابه الكريم: ⟦BSML:ﮋ⟧⟦262:ﮗ ﮘ ﮙ ﮚ ﮛ ﮜ ﮝ ﮞ ⟧⟦BSML:ﮊ⟧ [[الحجر:9]] وأشهد أن محمداً عبده ورسوله[[ﷺ]]، القائل: "[[خيركم من تعلَّم القرآن وعلَّمَه]]" أخرجه البخاريُّ في كتاب فضائل القرآن.

ورَوى أنسُ بن مالك أنَّ النّبيَّ [[ﷺ]] قال: {إنَّ لله أهلِينَ مِنَ الناس، قيل: مَن هُم يا رسول الله؟ قال: أهلُ القرآن هُم أهلُ الله وخاصَّتُه} .. النَّسائيّ.

وقال عمر بن الخطَّاب : أمَا إنَّ نبيكم [[ﷺ]] قد قال: {إن الله يرفع بهذا الكتاب أقواماً ويضع به آخرين}. مسلم.

وقال عليُّ بن أبي طالب : {إِنَّ رَسُوُلَ اللهِ ﷺ يأْمرُكُمْ أَنْ تَقْرَأوا القرآن كَمَا عُلِّمْتُمْ}.

ورضي الله عن صحابته الذين تلقّوُاْ القرآنَ من فَمِهِ الشريف فحفِظوه ونقَلوه إلينا مُتَواتراً كما تَلَقَّوْهُ عن رسول الله [[.]]

وإنَّ أَوْلَى العلوم ذِكراً وفِكراً، وأشرفَها منزلةً وقدراً، وأعظمَها ذُخراً وفخراً... عِلْمُ كتابِ الله سبحانه وتعالى، وإن أَولى ما قُدِّمَ من علومه معرفةُ تجويده وإقامةُ ألفاظه، لذا فإن ترتيلَه وتجويدَه من أجَلِّ العبادات ومِن أعظم القرُبات، ومما يُوصّل صاحبَه إلى أرفع الدّرجات، حيث قال النبيُّ [[ﷺ]]: {[[الماهرُ بالقرآن مع السَّفَرة الكِرام البَرَرة، والذي يقرأ القرآنَ ويتَتَعْتعُ فيه وهو عليه شاقٌّ له أجران-وفي رواية- والذي يقرؤهُ وهو يشتدُّ عليه له أجران]]} رواه البخاري ومسلم واللفظ له.

ثم إنَّ الإسنادَ المُوَصِّلَ إلى كتاب الله سبحانه مِن مُهِمات الدين، وطلبُ العُلُوِّ فيه قُرْبةٌ لربِّ العالمين، وقد قال زيدُ بن ثابت : " [[القراءةُ سُنَّة مُتَّبعة يأخذها الآخِرُ عن الأوَّل]]".

وقال عبد الله بن المبارَك رحمهُ الله: " [[الإسناد من الدين، ولولا الإسناد لقال مَن شاء ما شاء]]".

وقد تنافس علماء السَّلف في طلب العُلُوّ في السَّند فقطعوا الفيافيَ والقِفارَ، ووصلوا الليلَ سَيراً بالنهار كي يرتفعوا درجةً في السَّنَد، وما ذاك إلا لأنه أقربُ إلى الصحة وقلة الخطأ، لأن العلوَّ يُبعِدُ الإسنادَ من الخَلل؛ لأن كلَّ رجاله يحتمل أن يقعَ الخَللُ من جِهتهِ سَهوًا أو عَمدًا، ففي قِلَّتهم قلة جهات الخَلل، وفي كثرتهم كثرة جهات الخَلل، فهو مَطلَبٌ عزيزُ المنال شريفُ الخِصال، فهو قُربٌ إلى خير العِباد[[ﷺ]]، بل هو قُربةٌ إلى الله سبحانهُ وتعالى، ولذا قال إمام أهلِ السُّنة أحمدُ بنُ حنبل رحمهُ الله: "[[طلبُ الإسناد العالي سنةٌ عَمَّن سَلف]]".

لذا كان أخْذُ القرآن عن أهله دليلاً على نجابة المرء وفضله، وسلامة قراءته واتصال سنده بخاتم النبيين الذي سمِعهُ وعرَضهُ على الرُّوح الأمين جبريل عليه السلام، الذي تلقّاهُ عن ربّ العالمين جلّ وعَلا، ولهذا رَغَّبَ فيه أهلُ العلم الأخيار، واعتنى به أهلُ الفضل الأماجد الأبرار.`;

const IJ_BODY = `[[ثُمَّ أَمَّا بَعْدُ:]] فيقول خادم القرآن الكريم، الفقير إلى عفو ربه: {{shaykh}} — نفع الله به وبعلمه، وعفا عنه وعن والديه ومشايخه والمسلمين.

الحمد لله رافع الذين آمنوا والذين أوتوا العلم درجات، والصلاة والسلام على من أرسله الله بالهدى ودين الحق ليظهره على الدين كله ولو كره الكافرون، وعلى آله الأطهار وصحابته الأبرار.

[[أما بعد:]] فلما كان الإسناد مزيةً عالية وخصوصيةً لهذه الأمة غالية دون الأمم الخالية، اعتنى بطلبه الهداة النبلاء ناظرين إلى قول الصادق المصدوق ﷺ: [[«بلِّغوا عني ولو آية»]]، فكفى بالمرء شرفًا أن يكون اسمه أدنى سلسلة أعلاها رب العزة جلَّ في علائه، ثم جبريل الأمين عليه السلام، ثم الرسول الكريم ﷺ.

ولما كان الله تبارك وتعالى قد منَّ عليَّ بعدد من الإجازات الخطية من الأكابر الفضلاء من أهل العلم المسندين، رغب إليَّ إخواني أن أجيزهم فيما أرويه وتلقيته عن مشايخي بناءً على حسن ظنهم بي، وإلا فلست أهلًا أن أُجاز فكيف أن أُستجاز، فالله المستعان.

[[وكان ممن جدَّ في تحصيل ذلك الأخ الفاضل:]]

**{{honor}}: {{name}}**

{{job}}
{{res}}

سدَّده الله ووفَّقه، وبارك فيه ونفع به.

فقد شمَّر عن ساعد الجد والاجتهاد، وبحث عن الدقائق فأجاد، وقرأ عليَّ القرآن الكريم كاملًا من أوله إلى آخره

**{{reading}}**

{{sessions}}

[[وقد طلب مني الإجازة]] بالسند المتصل للرسول ﷺ، وبعد أن آنست منه الضبط والإتقان ووثقت بأهليته للقراءة والإقراء، أجزتُه - وأنا العبد الفقير إلى الله - إجازةً صحيحةً بشرطها المعتبر عند علمائنا من أهل الفن، أن يقرأ ويُقرئ القرآن الكريم في أي مكان حلَّ وفي أي قطر نزل، [[بشرط التثبت والمراجعة والإتقان]]؛ وفقَ ما تلقيته عن شيوخي وعلى الصفة التي تلقاها مني.

وإني لأرجو من الأخ المجاز أن لا ينساني من الدعاء الصالح في الحياة وبعد الممات، وأن لا يقع في أحد من أهل العلم الفضلاء بأذى، وأن يلزم الدعاء لي بخاتمة السعادة، وأن يكون آخر كلامي في الدنيا الشهادة، وصلَّى اللهم على عبده ورسوله محمد ﷺ.`;

const IJ_WASIYYA = `هذا وأوصي الأخ المجاز: بأن يعرف قدر ما وصل إليه، ومنَّ الله به عليه، من هذه النعمة العظيمة والمنة الجسيمة، وليعلم كتاب الله راغبًا، وليخفض جناحه طالبًا، ولا يقتصر على ما عنده ويترك الازدياد، فقد أمر الله تعالى بذلك سيد العباد، فقال: ﴿ وَقُل رَّبِّ زِدْنِي عِلْمًا ﴾ سورة طه.

وأوصيه: بما أوصاني به مشايخي مدى الدهر من تقوى الله في السر والجهر، وأن يكثر من الاطلاع على كتب أهل هذا الفن ومراجعة أهل العلم، وأن يتحرى الصواب فيما يرويه، وأعهد إليه ألا يستنكف عن الرجوع إلى الصواب متى بدا له، وألا يتبع نفسه هواها، وأن يكون متبعًا لأثر من مضى من شيوخنا الأعلام في قراءته وإقرائه، وأن يحذر من المحدثات والبدع المخترعات في قراءته للقرآن الكريم، وألا ينقل عني إلا ما يعلم يقينًا أني أقول به.

وأسأل الله تعالى أن يوفقنا وإياه في القول والعمل، وأن يجنبنا الخطأ والزلل، والحمد لله أولًا وآخرًا، وظاهرًا وباطنًا، وصلى الله على سيدنا محمد الأمين، وعلى آله وصحبه وسلم تسليمًا كثيرًا، والحمد لله رب العالمين.`;

const IJ_HELP = 'ضع الفقرات بينها سطر فارغ. «## عنوان» = عنوان بارز، «[[نص]]» = نص أحمر، «**نص**» = نص عريض. المتغيرات: {{name}} اسم المجاز • {{honor}} اللقب • {{job}} العمل • {{res}} الإقامة • {{reading}} القراءة • {{shaykh}} اسم المجيز • {{date}} {{hijri}} {{day}} {{place}} {{sessions}}';

const ijDefault = () => ({
  theme: 'crimson', shName: '', shTitle: 'خادم القرآن الكريم', shDesc: 'معلم القرآن ومقرئ القراءات العشر والمتون', hdr: '', sealImg: '', photo: '', place: '',
  coverTitle: 'إجازة بقراءة القرآن الكريم وإقرائه', verse: '﴿ ثُمَّ أَوْرَثْنَا الْكِتَابَ الَّذِينَ اصْطَفَيْنَا مِنْ عِبَادِنَا ﴾',
  reading: 'قراءة: الإمام يعقوب بن إسحاق الحضرمي البصري\nبرواييه: محمد بن المتوكل اللؤلؤي البصري (رويس)\nوروح بن عبد المؤمن الهذلي البصري\nمن طريق الدرة (ختمة كاملة)',
  muq: IJ_MUQ, body: IJ_BODY,
  bio: '## مشايخي الأفاضل الذين حفظت عليهم القرآن الكريم\n\n[[فضيلة الشيخ: (الاسم)]]\nنبذة تعريفية عن الشيخ.',
  summ: '## المشايخ الذين قرأت عليهم وأخذت عنهم هذه الأسانيد\n\n[[فضيلة الشيخ: (الاسم)]]\nأجازني بالقراءات العشر الصغرى من طريق الشاطبية والدرة (ختمة كاملة).',
  detail: '## إسناد شيخي الأول\n\n[[فضيلة الشيخ: (الاسم)]]\nاكتب هنا الإسناد المفصل: قرأ على الشيخ (…) وهو على (…) إلى النبي ﷺ.',
  qurra: '## إسناد القراء العشرة\n\n## إسناد قراءة الإمام (…)\n\nاكتب هنا إسناد القراء (أو ألصقه).',
  tree: 'رب العزة جل جلاله\nجبريل عليه السلام\nالنبي محمد ﷺ', treeAuto: 1,
  wasiyya: IJ_WASIYYA, wit1: '', wit2: '', grantNote: 'ما أجيز به',
  shortText: 'الحمد لله رب العالمين، والصلاة والسلام على أشرف المرسلين. أما بعد: فقد قرأ عليّ {{honor}} {{name}} القرآن الكريم كاملًا {{reading}}، فأجزته أن يقرأ ويُقرئ به بالسند المتصل إلى رسول الله ﷺ، وأوصيه بتقوى الله وإتقان التلاوة والمراجعة، ولا ينساني من صالح دعائه.',
  shortChain: 'رب العزة جل جلاله\nجبريل عليه السلام\nالنبي محمد ﷺ',
  inc: { cover: 1, bism: 1, title: 1, muq: 1, body: 1, bio: 0, summ: 1, detail: 1, qurra: 0, tree: 1, wasiyya: 1, grant: 1 }
});

/* ---------- تحويل نص المعلم إلى كتل HTML ---------- */
function ijVars(V, T) {
  const d = V.date ? parse(V.date) : new Date();
  const reading = (V.reading || T.reading || '').split('\n').map(x => x.trim()).filter(Boolean).join(' — ');
  return { name: V.name || '', honor: V.honor || 'الشيخ الفاضل', job: V.job || '', res: V.res || '', _imgs: T.imgs || {}, reading, shaykh: T.shName || '', shtitle: T.shTitle || '',
    day: fmtDay(d), date: d.toLocaleDateString('ar-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }), hijri: fmtH(d), place: V.place || T.place || '', sessions: V.sessions || '' };
}
const ijInline = (s, vars) => esc(String(s).replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')).replace(/ﷺ/g, '<span class="sal">ﷺ</span>').replace(/⟦img:(\w+)⟧/g, (_, k) => (vars._imgs || {})[k] ? `<img class="ij-pi" src="${esc(vars._imgs[k])}" alt="">` : '').replace(/⟦(\d{3}|BSML):([^⟧]*)⟧/g, (_, f, t) => `<span class="qcf" style="font-family:'QCF_${f === 'BSML' ? 'BSML' : 'P' + f}'">${t}</span>`).replace(/\[\[(.+?)\]\]/g, '<span class="r">$1</span>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
function ijBlocks(text, vars) {
  return String(text || '').replace(/\r/g, '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p => {
    if (/^##\s/.test(p)) return `<h4 class="ij-h">${ijInline(p.replace(/^##\s*/, ''), vars)}</h4>`;
    const lines = p.split('\n').map(x => ijInline(x, vars)).filter(x => x.trim());
    if (!lines.join('').trim()) return '';
    return `<p${/⟦\d{3}:/.test(p) ? ' class="qv"' : ''}>${lines.join('<br>')}</p>`;
  }).filter(Boolean);
}

/* ---------- الإطار الزخرفي ---------- */
function ijTile(th) {
  const t = IJ_THEMES[th] || IJ_THEMES.crimson;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" preserveAspectRatio="none"><rect width="40" height="40" fill="${t.p}"/><rect x="2" y="2" width="36" height="36" fill="none" stroke="${t.a}" stroke-width=".8"/><g transform="translate(20 20)"><rect x="-10" y="-10" width="20" height="20" fill="${t.a}"/><rect x="-10" y="-10" width="20" height="20" fill="${t.a}" transform="rotate(45)"/><rect x="-7" y="-7" width="14" height="14" fill="${t.s}"/><rect x="-7" y="-7" width="14" height="14" fill="${t.s}" transform="rotate(45)"/><circle r="4.2" fill="${t.l}"/><circle r="2" fill="${t.p}"/></g><circle cx="0" cy="0" r="3.2" fill="${t.l}"/><circle cx="40" cy="0" r="3.2" fill="${t.l}"/><circle cx="0" cy="40" r="3.2" fill="${t.l}"/><circle cx="40" cy="40" r="3.2" fill="${t.l}"/></svg>`;
  return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
}
const ijRose = th => { const t = IJ_THEMES[th] || IJ_THEMES.crimson; return `<svg viewBox="-20 -20 40 40" class="ij-rose"><circle r="19" fill="${t.p}" stroke="${t.a}" stroke-width="1.4"/><g fill="${t.a}"><rect x="-11" y="-11" width="22" height="22"/><rect x="-11" y="-11" width="22" height="22" transform="rotate(45)"/></g><g fill="${t.s}"><rect x="-8" y="-8" width="16" height="16"/><rect x="-8" y="-8" width="16" height="16" transform="rotate(45)"/></g><circle r="5" fill="${t.l}"/><circle r="2.2" fill="${t.p}"/></svg>`; };
let IJ_CUR = {};
const ijOrn = th => { if (IJ_CUR.ornImg) return `<img class="ij-orn ij-ornimg" src="${esc(IJ_CUR.ornImg)}" alt="">`; const t = IJ_THEMES[th] || IJ_THEMES.crimson; return `<svg viewBox="0 0 220 24" class="ij-orn"><g fill="none" stroke="${t.a}" stroke-width="1.6"><path d="M4 12h78M138 12h78"/><path d="M82 12c8-12 16-12 28 0c12-12 20-12 28 0c-8 12-16 12-28 0c-12 12-20 12-28 0z" fill="${t.p}" stroke="${t.a}"/></g><circle cx="110" cy="12" r="3.4" fill="${t.a}"/></svg>`; };

/** صفحة بإطار: opts.nonum بلا رقم، opts.hdr يظهر شريط الاسم أعلاها */
function ijPage(book, T, inner, o = {}) {
  const t = IJ_THEMES[T.theme] || IJ_THEMES.crimson, p = document.createElement('section');
  p.className = 'ijp' + (o.cls ? ' ' + o.cls : '');
  p.style.cssText = `--ip:${t.p};--is:${t.s};--ia:${t.a};--il:${t.l};--ik:${t.ink};background-image:${ijTile(T.theme)}`;
  p.innerHTML = `<div class="ij-in"><div class="ij-wm">${T.sealImg ? `<img src="${esc(T.sealImg)}" alt="">` : ''}</div>
    ${o.hdr === false ? '' : `<div class="ij-hd"><span>${esc(T.hdr || T.shName || '')}</span></div>`}
    <div class="ij-bx ${o.bxcls || ''}">${inner || ''}</div></div>
    <span class="ij-c c1">${ijRose(T.theme)}</span><span class="ij-c c2">${ijRose(T.theme)}</span><span class="ij-c c3">${ijRose(T.theme)}</span><span class="ij-c c4">${ijRose(T.theme)}</span>
    ${o.nonum ? '' : '<div class="ij-no"><b></b></div>'}`;
  book.appendChild(p); return p;
}
const ijEl = html => { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; };

/** تدفق نص طويل على صفحات متعددة (يقسم الفقرات الطويلة عند الحاجة) */
function ijFlow(book, T, blocks, o = {}) {
  let page = ijPage(book, T, '', o), bx = page.querySelector('.ij-bx');
  const fit = () => bx.scrollHeight <= bx.clientHeight + 1;
  const next = () => { page = ijPage(book, T, '', { ...o, hdr: o.hdr }); bx = page.querySelector('.ij-bx'); };
  if (!blocks.length) return;
  blocks.forEach((html, bi) => {
    const el = ijEl(html); bx.appendChild(el);
    if (fit()) { if (el.classList.contains('ij-h') && bx.children.length > 1 && bi < blocks.length - 1) { /* لا عنوان يتيم */ const nx = ijEl(blocks[bi + 1]); bx.appendChild(nx); const ok = fit(); bx.removeChild(nx); if (!ok) { bx.removeChild(el); next(); bx.appendChild(el); } } return; }
    bx.removeChild(el);
    if (el.tagName !== 'P') { if (bx.children.length) next(); bx.appendChild(el); return; }
    // تقسيم الفقرة إلى كلمات مع الحفاظ على الوسوم المفتوحة
    const tokens = el.innerHTML.match(/<[^>]+>|[^\s<]+|\s+/g) || [], stack = [[]];
    tokens.forEach(tk => { const cur = stack[stack.length - 1].slice(); if (/^<\//.test(tk)) cur.pop(); else if (/^<(span|b)\b/.test(tk)) cur.push(tk); stack.push(cur); });
    const close = s => s.slice().reverse().map(x => x.startsWith('<b') ? '</b>' : '</span>').join('');
    const build = (i, j) => `<p>${stack[i].join('')}${tokens.slice(i, j).join('')}${close(stack[j])}</p>`;
    let i = 0;
    while (i < tokens.length) {
      let lo = i, hi = tokens.length;
      const tryFit = j => { const e = ijEl(build(i, j)); bx.appendChild(e); const ok = fit(); bx.removeChild(e); return ok; };
      if (tryFit(hi)) lo = hi; else { while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tryFit(m)) lo = m; else hi = m; } }
      if (lo === i) { if (!bx.children.length) lo = Math.min(tokens.length, i + 1); else { next(); continue; } }
      bx.appendChild(ijEl(build(i, lo))); i = lo;
      if (i < tokens.length) next();
    }
  });
}

/* ---------- الصفحات الخاصة ---------- */
function ijCover(book, T, vars) {
  const t = IJ_THEMES[T.theme] || IJ_THEMES.crimson, p = document.createElement('section');
  p.className = 'ijp ijcover'; p.style.cssText = `--ip:${t.p};--is:${t.s};--ia:${t.a};--il:${t.l};--ik:${t.ink};background-image:${ijTile(T.theme)}`;
  p.innerHTML = `<div class="ij-in cv"><div class="cv-med"><div class="cv-ring"><span>${esc(T.coverTitle || 'إجازة')}</span></div></div>
    <div class="cv-rd">${esc((vars.reading || '').split(' — ')[0] || '')}</div>
    <div class="cv-sh">${T.nameImg ? `<img class="ij-nmimg cv" src="${esc(T.nameImg)}" alt="">` : `${ijOrn(T.theme)}<small>${esc(T.shTitle)}</small><h2>${esc(T.shName)}</h2><em>${esc(T.shDesc)}</em>`}</div>
    <div class="cv-nm"><small>المجاز</small><b>${esc(vars.honor)}: ${esc(vars.name)}</b></div></div>
    <span class="ij-c c1">${ijRose(T.theme)}</span><span class="ij-c c2">${ijRose(T.theme)}</span><span class="ij-c c3">${ijRose(T.theme)}</span><span class="ij-c c4">${ijRose(T.theme)}</span>`;
  book.appendChild(p);
}
const ijReadLines = (T, V) => (V.reading || T.reading || '').split('\n').map(x => x.trim()).filter(Boolean).map((l, i) => `<div class="${i === 0 ? 'ij-rd0' : 'ij-rd'}">${esc(l)}</div>`).join('');
const ijSealHtml = (T, cls = '') => T.sealImg ? `<img class="ij-seal ${cls}" src="${esc(T.sealImg)}" alt="">` : `<div class="ij-seal ij-seal0 ${cls}"><span>${esc(T.shName || '')}</span></div>`;
function ijTitlePage(book, T, V, vars) {
  ijPage(book, T, `<div class="ij-tp">${T.bismImg ? `<img class="ij-bsimg" src="${esc(T.bismImg)}" alt="">` : '<div class="ij-bism">بسم الله الرحمن الرحيم</div>'}${T.verseImg ? `<img class="ij-vsimg" src="${esc(T.verseImg)}" alt="">` : `<div class="ij-verse">${esc(T.verse)}</div>`}
    ${T.titleImg ? `<img class="ij-ttimg" src="${esc(T.titleImg)}" alt="">` : `<h1 class="ij-big">${esc(T.coverTitle)}</h1>`}${ijReadLines(T, V)}
    <div class="ij-lab">${esc('الشيخ المقرئ المجيز')}</div>${T.photo ? `<img class="ij-ph" src="${esc(T.photo)}" alt="">` : ''}
    <div class="ij-sh">${T.nameImg ? `<img class="ij-nmimg" src="${esc(T.nameImg)}" alt="">` : `${ijOrn(T.theme)}<small>${esc(T.shTitle)}</small><h2>${esc(T.shName)}</h2><em>${esc(T.shDesc)}</em>`}</div>
    <div class="ij-lab">المجاز</div><div class="ij-nm">${esc(vars.honor)}: ${esc(vars.name)}</div>${ijSealHtml(T)}</div>`);
}
function ijGrant(book, T, V, vars) {
  const wit = (s, n) => { const [a, b, c] = String(s || '').split('|').map(x => x.trim()); return `<div class="ij-w"><b>${n}</b><div>${esc(a || '................')}</div><div>${esc(b || '')}</div><div>${esc(c || '')}</div></div>`; };
  ijPage(book, T, `<div class="ij-gp"><h3 class="ij-h">منح الإجازة</h3><div class="ij-lab">الشيخ المجيز</div>
    <div class="ij-sigs"><div class="ij-sig"><small>ختم السند</small>${ijSealHtml(T, 'sm')}</div><div class="ij-sig"><small>التوقيع</small><div class="ij-signame">${esc(T.shName)}</div><em>${esc(T.shDesc)}</em></div></div>
    <div class="ij-lab">المجاز</div><div class="ij-nm">${esc(vars.honor)}: ${esc(vars.name)}</div>
    <div class="ij-lab">${esc(T.grantNote || 'ما أجيز به')}</div>${ijReadLines(T, V)}
    <div class="ij-wits">${wit(T.wit1, 'الشاهد الأول')}${wit(T.wit2, 'الشاهد الثاني')}</div>
    <div class="ij-dt">تم تحرير هذه الإجازة في يوم: ${esc(vars.day)}${vars.place ? ' — ' + esc(vars.place) : ''}<br>بتاريخ: ${esc(vars.date)}م الموافق: ${esc(vars.hijri)}</div></div>`);
}
function ijTree(book, T, V, vars) {
  const rows = String(T.tree || '').split('\n').map(x => x.trim()).filter(Boolean).map(l => l.split('|').map(x => x.trim()).filter(Boolean));
  if (+T.treeAuto) { if (T.shName) rows.push([T.shName + ' (المجيز)']); rows.push([vars.name + ' (المجاز)']); }
  const page = ijPage(book, T, `<h3 class="ij-h">شجرة الإسناد</h3><div class="ij-tr">${rows.map((r, i) => `<div class="ij-trr ${r.length === 1 ? 'one' : ''} ${i < 3 && r.length === 1 ? 'top' : ''}">${r.map(c => `<span>${ijInline(c, vars)}</span>`).join('')}</div>`).join('<i class="ij-ar"></i>')}</div>`);
  ijShrink(page.querySelector('.ij-bx'), page.querySelector('.ij-tr'), 'tr');
}
/** يصغّر الخط والمسافات حتى يتسع المحتوى في صفحة واحدة */
function ijShrink(bx, el, kind, b0) {
  let k = 1;
  const base = kind === 'tr' ? 15 : (b0 || 14);
  const m = kind === 'tr' ? bx : el, pad = kind === 'tr' ? 24 : -1;
  const over = () => kind === 'tr' ? el.offsetHeight > m.clientHeight - 24 : m.scrollHeight > m.clientHeight + 1;
  for (let i = 0; i < 80 && over() && k > .25; i++) { k -= .02; el.style.setProperty('--k', k.toFixed(2)); el.style.fontSize = (base * k).toFixed(1) + 'px'; }
}
function ijShortPage(book, T, V, vars) {
  const rows = String(T.shortChain || '').split('\n').map(x => x.trim()).filter(Boolean).map(l => l.split('|').map(x => x.trim()).filter(Boolean));
  const rd = (vars.reading || '').split(' — ').filter(Boolean);
  const wit = s => String(s || '').split('|')[0].trim();
  const wl = [wit(T.wit1), wit(T.wit2)].filter(Boolean);
  const tree = rows.length ? `<div class="ij-sptree"><div class="ij-lab">شجرة السند</div><div class="ij-tr">${rows.map((r, i) => `<div class="ij-trr ${r.length === 1 ? 'one' : ''} ${i < 3 && r.length === 1 ? 'top' : ''}">${r.map(c => `<span>${ijInline(c, vars)}</span>`).join('')}</div>`).join('<i class="ij-ar"></i>')}</div></div>` : '';
  const page = ijPage(book, T, `<div class="ij-sp land">
    <div class="ij-sphd">${T.bismImg ? `<img class="ij-bsimg" src="${esc(T.bismImg)}" alt="">` : '<div class="ij-bism sm">بسم الله الرحمن الرحيم</div>'}
      ${T.titleImg ? `<img class="ij-ttimg" src="${esc(T.titleImg)}" alt="">` : `<h1 class="ij-big sm">${esc(T.coverTitle || 'إجازة')}</h1>`}</div>
    <div class="ij-spmain"><div class="ij-spl">
      <div class="ij-sptxt">${ijBlocks(T.shortText, vars).join('')}</div>
      <div class="ij-spnm"><span class="ij-lab">للأخ المجاز /</span> <b class="ij-nm">${esc(vars.honor)}: ${esc(vars.name)}</b></div>
      ${rd.length ? `<div class="ij-sprd">${rd.map(x => esc(x)).join(' <i>•</i> ')}</div>` : ''}</div>${tree}</div>
    <div class="ij-spf"><div class="ij-spd"><small>${esc(vars.day)} ${esc(vars.date)}م — ${esc(vars.hijri)}</small>${wl.length ? `<small>الشاهدان: ${wl.map(esc).join(' • ')}</small>` : ''}</div>
      <div class="ij-sps"><small>الشيخ المجيز</small><b>${esc(T.shName)}</b><em>${esc(T.shTitle)}</em></div>${ijSealHtml(T, 'sm')}</div></div>`, { nonum: true, cls: 'ijl' });
  ijShrink(page.querySelector('.ij-bx'), page.querySelector('.ij-sp'), 'sp', 20);
}

/** يبني الكتاب كاملاً داخل #ijbook */
function ijBuild(book, T, V) {
  book.innerHTML = ''; IJ_CUR = T; book.classList.toggle('land', (V.kind || 'full') === 'short');
  const vars = ijVars(V, T), inc = T.inc || {};
  if ((V.kind || 'full') === 'short') { ijShortPage(book, T, V, vars); return; }
  if (inc.cover) ijCover(book, T, vars);
  if (inc.bism) ijPage(book, T, T.bismImg ? `<div class="ij-bigbism"><img src="${esc(T.bismImg)}" alt=""></div>` : '<div class="ij-bigbism">بسم الله الرحمن الرحيم</div>');
  if (inc.title) ijTitlePage(book, T, V, vars);
  const flows = [['muq', T.muq], ['body', T.body], ['bio', T.bio], ['summ', T.summ], ['detail', T.detail], ['qurra', T.qurra]];
  flows.forEach(([k, txt]) => { if (inc[k] && String(txt || '').trim()) ijFlow(book, T, ijBlocks(txt, vars)); });
  if (inc.tree) ijTree(book, T, V, vars);
  if (inc.wasiyya && String(T.wasiyya || '').trim()) ijFlow(book, T, [`<h4 class="ij-h">وصية</h4>`, ...ijBlocks(T.wasiyya, vars)]);
  if (inc.grant) ijGrant(book, T, V, vars);
  let n = 0; book.querySelectorAll('.ij-no b').forEach(b => { b.textContent = ++n; });
}

/* ---------- العرض والطباعة ---------- */
function ijSource() {   // st.ijv: {mode:'saved',id} | {mode:'preview',T,V}
  const v = st.ijv || {};
  if (v.mode === 'saved') { const i = IJ.list.find(x => x.id === v.id); return i ? { T: i.data.T, V: { ...i.data.V, kind: i.kind }, rec: i } : null; }
  return v.T ? { T: v.T, V: v.V } : null;
}
function viewIjaza() {
  if (!IJ.loaded) { ijLoad(); return empty('⏳', 'جارٍ التحميل...'); }
  const src = ijSource(); if (!src) return empty('📜', 'الإجازة غير موجودة') + `<button class="btn light block" data-act="ij-back">رجوع</button>`;
  const rec = src.rec;
  return `<div class="card noprint"><div class="row"><button class="btn gold" data-act="print">🖨 طباعة / حفظ PDF</button><button class="btn light auto" data-act="ij-back">رجوع</button>
    ${rec && staff() ? `<button class="btn light auto" data-act="ij-edit" data-id="${rec.id}">✏️ تعديل</button>` : ''}${rec && staff() ? `<button class="btn red auto" data-act="ij-del" data-id="${rec.id}">🗑</button>` : ''}</div>
    <p class="hint" style="margin:8px 0 0">${src.V.kind === 'short' ? 'ورقة واحدة A4' : 'الكتاب بحجم A4 طولي'} — اختر «حفظ بتنسيق PDF» من نافذة الطباعة${rec ? ` • رقم الإجازة: <b dir="ltr">${esc(rec.serial)}</b>` : ' • (معاينة غير محفوظة)'}</p></div>
  ${rec && rec.status === 'pending' ? `<div class="card" style="border:2px dashed var(--gold);text-align:center"><b>⏳ إجازة غير معتمدة بعد — بانتظار مدير المدرسة</b>${isMgr() ? `<div class="noprint"><button class="btn gold sm" style="margin-top:8px" data-act="ij-approve" data-id="${rec.id}">✔ اعتماد الإجازة</button></div>` : ''}</div>` : ''}
  <div class="rptwrap ijwrap" id="ijwrap"><div id="ijbook" class="ijbook"></div></div>`;
}
const IJ_FONTS = ['KFGQPC', 'IJ Thuluth', 'IJ Mateen', 'IJ Manal', 'IJ Bahij', 'QCF_BSML', 'QCF_P063', 'QCF_P077', 'QCF_P262', 'QCF_P375', 'QCF_P427', 'Amiri', 'Aref Ruqaa'];
let ijFontsP = null;
const ijFontsReady = () => ijFontsP || (ijFontsP = !document.fonts ? Promise.resolve() : Promise.race([Promise.all(IJ_FONTS.map(f => document.fonts.load('18px "' + f + '"').catch(() => 0))), new Promise(r => setTimeout(r, 8000))]).then(() => document.fonts.ready));
function ijPost() {
  const src = ijSource(), book = $('#ijbook'); if (!src || !book) return;
  const go2 = () => { ijBuild(book, src.T, src.V); ijFit(); };
  go2();   // مبدئياً بالخط البديل ثم نُعيد البناء بعد تحميل خطوط الإجازة لتصح القياسات
  ijFontsReady().then(() => { if ($('#ijbook') === book) go2(); });
}
function ijFit() {
  const w = $('#ijwrap'), b = $('#ijbook'); if (!w || !b) return;
  b.style.transform = 'none'; w.style.height = 'auto';
  const W = b.classList.contains('land') ? 1123 : 794, k = Math.min(1, w.clientWidth / W), h = b.scrollHeight;
  b.style.transformOrigin = 'top right'; b.style.transform = `scale(${k})`; w.style.height = Math.ceil(h * k) + 'px';
}
addEventListener('resize', () => { if (st.view === 'ijaza') ijFit(); });

/* ---------- محرر النموذج / نصوص الإجازة ---------- */
const IJ_F = [
  ['👤 بيانات الشيخ المجيز والشكل', [['shName', 'اسم الشيخ المجيز', 'in'], ['shTitle', 'صفة الشيخ (مثل: خادم القرآن الكريم)', 'in'], ['shDesc', 'وصف الشيخ (سطر تحت الاسم)', 'in'], ['hdr', 'نص شريط أعلى الصفحات (الافتراضي: اسم الشيخ)', 'in'], ['place', 'المكان الافتراضي (اختياري)', 'in'], ['theme', 'نمط الألوان', 'theme'], ['sealImg', 'ختم أو شعار الشيخ (صورة)', 'img'], ['photo', 'صورة الشيخ (اختياري)', 'img'], ['nameImg', 'لوحة اسم الشيخ بخط الثلث (صورة شفافة تحل محل اسمه ووصفه في الغلاف وصفحة العنوان)', 'img'], ['titleImg', 'لوحة عنوان الإجازة بخط الثلث (صورة شفافة، اختياري)', 'img'], ['bismImg', 'البسملة بخط الثلث (صورة شفافة)', 'img'], ['verseImg', 'سطر الآية في صفحة العنوان (صورة، اختياري)', 'img'], ['ornImg', 'فاصل زخرفي (صورة، اختياري)', 'img']]],
  ['📖 القراءة المُجاز بها والغلاف', [['coverTitle', 'عنوان الإجازة', 'in'], ['verse', 'الآية أعلى صفحة العنوان', 'in'], ['reading', 'القراءة والرواة والطريق (كل سطر في سطر؛ الأول بالأسود والبقية بالأحمر)', 'ta', 4]]],
  ['✍️ المقدمة', [['muq', 'نص المقدمة', 'ta', 12]]],
  ['📜 نص الإجازة', [['body', 'نص الإجازة (يتعبأ اسم الطالب وقراءته تلقائياً)', 'ta', 16]]],
  ['👥 المشايخ والأسانيد', [['bio', 'تعريف بمشايخ المجيز (ص ٨-٩)', 'ta', 7], ['summ', 'مختصر أسانيد المشايخ (ص ١٠-١١)', 'ta', 7], ['detail', 'أسانيد المشايخ مفصلة (ص ١٢...)', 'ta', 7], ['qurra', 'أسانيد القراء العشرة (ص ٣٨...)', 'ta', 7]]],
  ['🌳 شجرة الإسناد', [['tree', 'كل سطر = صف في الشجرة؛ لوضع أكثر من اسم في صف واحد افصل بينها بـ |', 'ta', 8], ['treeAuto', 'أضف المجيز والمجاز تلقائياً في آخر الشجرة', 'chk']]],
  ['🕊 الوصية ومنح الإجازة', [['wasiyya', 'نص الوصية', 'ta', 8], ['grantNote', 'عنوان فقرة القراءة في صفحة المنح', 'in'], ['wit1', 'الشاهد الأول: الاسم | الوظيفة | الجهة', 'in'], ['wit2', 'الشاهد الثاني: الاسم | الوظيفة | الجهة', 'in']]],
  ['📄 النموذج المختصر (ورقة واحدة)', [['shortText', 'نص الإجازة المختصرة', 'ta', 5], ['shortChain', 'السند المختصر (كل سطر في سطر)', 'ta', 6]]]
];
function ijField(T, [k, label, kind, rows]) {
  const v = T[k] ?? '';
  if (kind === 'theme') return `<div><label class="f">${label}</label><select name="theme">${Object.entries(IJ_THEMES).map(([x, o]) => `<option value="${x}" ${v === x ? 'selected' : ''}>${o.n}</option>`).join('')}</select></div>`;
  if (kind === 'chk') return `<label class="chk"><input type="checkbox" name="${k}" ${+v ? 'checked' : ''}> ${label}</label>`;
  if (kind === 'img') return `<div><label class="f">${label}</label><div class="row" style="align-items:center"><input type="file" accept="image/*" data-ijimg="${k}"><img id="ijimg_${k}" class="ij-thumb" ${v ? `src="${esc(v)}"` : 'hidden'} alt=""><button type="button" class="btn light sm auto" data-act="ij-img-clear" data-id="${k}">حذف</button></div><input type="hidden" name="${k}" value="${esc(v)}"></div>`;
  if (kind === 'ta') return `<div><label class="f">${label}</label><textarea name="${k}" rows="${rows || 6}" class="ij-ta">${esc(v)}</textarea></div>`;
  return `<div><label class="f">${label}</label><input name="${k}" value="${esc(v)}"></div>`;
}
function viewIjTpl() {
  const e = st.ije; if (!e) return viewIjTpls();
  const T = e.T, inc = T.inc || {};
  return `<div class="card"><h3>${e.target === 'ijaza' ? '✏️ تعديل نصوص هذه الإجازة' : '📜 نموذج الإجازة'}</h3>
  <p class="hint">${esc(IJ_HELP)}</p>
  <form id="ijtform" class="gap">
    ${e.target === 'tpl' ? `<div><label class="f">اسم النموذج</label><input name="__name" value="${esc(e.name || '')}" maxlength="120" required placeholder="مثال: إجازة قراءة يعقوب"></div>` : ''}
    <details class="ij-det" open><summary>🧩 الأقسام التي تظهر في الإجازة</summary><div class="chips" style="margin-top:8px">${IJ_SECTIONS.map(([k, l]) => `<label class="chip static ${+inc[k] ? 'on' : ''}" style="cursor:pointer"><input type="checkbox" name="inc_${k}" ${+inc[k] ? 'checked' : ''} style="display:none"> ${l}</label>`).join('')}</div></details>
    ${IJ_F.map(([t, fs]) => `<details class="ij-det"><summary>${t}</summary><div class="gap" style="margin-top:8px">${fs.map(f => ijField(T, f)).join('')}</div></details>`).join('')}
    <div class="row"><button class="btn gold">💾 حفظ</button><button type="button" class="btn light auto" data-act="ij-preview">👁 معاينة</button><button type="button" class="btn light auto" data-act="ij-tpl-back">إلغاء</button></div>
  </form></div>`;
}
function ijCollect(f) {
  const T = { ...(st.ije.T), inc: {} }, g = n => f.elements[n];
  IJ_F.forEach(([, fs]) => fs.forEach(([k, , kind]) => { const el = g(k); if (!el) return; T[k] = kind === 'chk' ? (el.checked ? 1 : 0) : el.value; }));
  IJ_SECTIONS.forEach(([k]) => { const el = g('inc_' + k); T.inc[k] = el && el.checked ? 1 : 0; });
  return T;
}
function viewIjTpls() {
  if (!IJ.loaded) { ijLoad(); return empty('⏳', 'جارٍ التحميل...'); }
  return `<div class="card"><h3>📜 نماذج الإجازة <button class="more" data-act="ij-tpl-new">＋ نموذج جديد</button></h3>
  <p class="hint">النموذج هو نص الإجازة وأسانيدها وشكلها؛ تعدّله مرة واحدة ثم تُصدر منه لكل طالب إجازة بحسب اسمه وبياناته.</p>
  ${IJ.tpls.length ? `<div class="list">${IJ.tpls.map(t => `<div class="item" style="cursor:default"><div class="avatar">📜</div><div class="t"><b>${esc(t.name)}</b><small>${esc((t.data || {}).shName || '')}</small></div>
    <button class="btn light sm auto" data-act="ij-tpl-edit" data-id="${t.id}">✏️ تعديل</button><button class="btn light sm auto" data-act="ij-tpl-copy" data-id="${t.id}">نسخ</button><button class="btn red sm auto" data-act="ij-tpl-del" data-id="${t.id}">🗑</button></div>`).join('')}</div>` : empty('📜', 'لا توجد نماذج بعد — أنشئ أول نموذج')}
  <button class="btn gold block" style="margin-top:10px" data-act="ij-tpl-marghani">📥 إضافة نموذج «إجازة يعقوب — المرغني» جاهزاً</button>
  <button class="btn light block" style="margin-top:10px" data-act="ij-back">رجوع</button></div>`;
}

/* ---------- بطاقة في صفحة الطالب ---------- */
// أهلية الإجازة: حافظ + ختمة مكتملة في المنصة (أو استثناء يؤكده الشيخ)
const ijHafiz = s => s.hafiz || memorized(s.id, '', true).reduce((x, y) => x + y, 0) === Q.TOTAL;
const ijDone = s => enrOf(s.id).some(e => e.status === 'completed' && !e.prior);
function ijCard(s) {
  ijLoad();
  const mine = IJ.list.filter(i => i.studentId === s.id), ext = (db.extIjazat || []).filter(x => x.studentId === s.id);
  if (!staff() && !mine.length && !ext.length) return '';
  const can = staff() && ijHafiz(s);
  return `<div class="card"><h3>📜 الإجازات (${mine.length + ext.length}) ${can ? `<button class="more" data-act="ij-new" data-id="${s.id}">＋ إصدار إجازة</button>` : ''}</h3>
    ${staff() && !ijHafiz(s) ? '<p class="hint" style="margin:0 0 8px">🔒 الإجازة لحافظ القرآن كاملاً فقط. الشهادات متاحة للجميع.</p>' : ''}
    ${mine.length || ext.length ? `<div class="tiles">${mine.map(i => `<div class="tile plat" data-act="ij-open" data-id="${i.id}"><span>📜</span><div><b>${esc(i.title || 'إجازة')}</b><small>من المنصة • ${i.kind === 'short' ? 'ورقة واحدة' : 'كاملة'} • ${esc(i.date)}${i.status === 'pending' ? ' • ⏳ بانتظار الاعتماد' : ''}</small></div></div>`).join('')}
      ${ext.map(x => `<div class="tile ext" data-act="ext-open" data-id="${x.id}"><span>📎</span><div><b>${esc(x.title)}</b><small>من خارج المنصة • ${esc(x.fromWho)}${x.date ? ' • ' + esc(x.date) : ''}${x.hasFile ? ' • مرفق ملف' : ''}</small></div></div>`).join('')}</div>` : '<p class="hint" style="margin:0">لا توجد إجازات مسجلة</p>'}
    ${staff() ? `<button class="btn light sm" style="margin-top:8px" data-act="ext-new" data-id="${s.id}">📎 تسجيل إجازة من خارج المنصة</button>` : ''}</div>`;
}
function extForm(sid, x) {
  modal(`<h2>📎 ${x ? 'إجازة من خارج المنصة' : 'تسجيل إجازة من خارج المنصة'}</h2>
  <form id="extform" class="gap" data-sid="${sid}" data-id="${x ? x.id : ''}">
    <div><label class="f">بمَ أُجيز؟</label><input name="title" required maxlength="200" value="${esc(x?.title || '')}" placeholder="مثال: إجازة برواية ورش عن نافع"></div>
    <div><label class="f">الروايات المشمولة <span class="hint">(اختياري — لتظهر في شبكة القراءات)</span></label><details ${x && x.riwayat.length ? 'open' : ''}><summary class="hint" style="cursor:pointer">اختيار الروايات</summary><div class="jamgrid">${QURRA.map(([, qn, rs]) => `<div style="border:1.5px solid var(--line);border-radius:10px;padding:6px"><b>${qn}</b>${rs.map(r => `<label class="row" style="gap:6px"><input type="checkbox" name="xrw" value="${r[0]}" style="width:auto;flex:none" ${x && x.riwayat.includes(r[0]) ? 'checked' : ''}> ${r[1]}</label>`).join('')}</div>`).join('')}</div></details></div>
    <div><label class="f">الشيخ المجيز</label><input name="fromWho" required maxlength="200" value="${esc(x?.fromWho || '')}"></div>
    <div class="row"><div><label class="f">المكان <span class="hint">(اختياري)</span></label><input name="place" maxlength="160" value="${esc(x?.place || '')}"></div><div><label class="f">التاريخ <span class="hint">(اختياري)</span></label><input type="date" name="date" value="${esc(x?.date || '')}"></div></div>
    <div><label class="f">ملف الإجازة <span class="hint">(اختياري — PDF أو صورة، حتى 4 ميجا)</span></label><input type="file" name="file" accept="application/pdf,image/jpeg,image/png">${x && x.hasFile ? `<a class="btn ghost sm" style="margin-top:6px" target="_blank" rel="noopener" href="api/index.php?r=ext_file&id=${x.id}">📄 فتح الملف المرفق: ${esc(x.fileName)}</a>` : ''}</div>
    ${staff() ? '<button class="btn block gold">حفظ</button>' : ''}
    ${x && staff() ? `<button type="button" class="btn red block" data-act="ext-del" data-id="${x.id}">🗑 حذف</button>` : ''}
    <button type="button" class="btn light block" data-act="close">إغلاق</button>
  </form>`);
}
Object.assign(acts, {
  'ext-new': id => extForm(+id, null),
  'ext-open': id => { const x = (db.extIjazat || []).find(v => v.id === +id); if (!x) return; if (staff()) return extForm(x.studentId, x); if (x.hasFile) window.open('api/index.php?r=ext_file&id=' + x.id, '_blank', 'noopener'); },
  'ext-del': async id => { if (!confirm('حذف هذه الإجازة؟ تبقى محفوظة في المحذوفات.')) return; await api('ext_delete', { id: +id }); db.extIjazat = db.extIjazat.filter(v => v.id !== +id); closeModal(); render(); toast('تم الحذف'); },
});
document.addEventListener('submit', async e => {
  const f = e.target; if (f.id !== 'extform') return;
  e.preventDefault(); e.stopPropagation();
  try {
    const fl = f.elements.file.files[0]; let file = null;
    if (fl) { if (fl.size > 4 * 1024 * 1024) throw new Error('حجم الملف أكبر من 4 ميجا'); const data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error('تعذرت قراءة الملف')); r.readAsDataURL(fl); }); file = { name: fl.name, data }; }
    const r = await api('ext_save', { id: +f.dataset.id || 0, studentId: +f.dataset.sid, title: f.elements.title.value, fromWho: f.elements.fromWho.value, place: f.elements.place.value, date: f.elements.date.value, riwayat: [...f.querySelectorAll('[name=xrw]:checked')].map(i => i.value), file });
    db.extIjazat = (db.extIjazat || []).filter(v => v.id !== r.item.id).concat(r.item); closeModal(); render(); toast('تم الحفظ ✔');
  } catch (err) { toast(err.message || 'تعذر الحفظ'); }
});
function ijIssueForm(sid, editId) {
  const s = student(sid), rec = editId ? IJ.list.find(i => i.id === editId) : null, V = rec ? rec.data.V : {};
  if (!IJ.tpls.length && !rec) { toast('أنشئ نموذج إجازة أولاً من «نماذج الإجازة»'); st.ijBack = 'student'; return acts['ij-tpls'](); }
  const tplOpt = IJ.tpls.map(t => `<option value="${t.id}" ${rec && rec.tplId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  if (!rec && !ijHafiz(s)) return toast('الإجازة لحافظ القرآن كاملاً فقط');
  modal(`<h2>📜 ${rec ? 'تعديل بيانات الإجازة' : 'إصدار إجازة'} — ${esc(s.name)}</h2>
  <form id="ijissue" class="gap" data-sid="${s.id}" data-id="${editId || ''}">
    ${rec ? '' : `<div><label class="f">النموذج</label><select name="tpl">${tplOpt}</select></div>`}
    <div><label class="f">النوع</label><select name="kind"><option value="full" ${rec && rec.kind === 'full' ? 'selected' : ''}>إجازة كاملة (كتاب بزخارف)</option><option value="short" ${rec && rec.kind === 'short' ? 'selected' : ''}>إجازة مختصرة (ورقة واحدة)</option></select></div>
    <div class="row"><div><label class="f">اللقب</label><select name="honor">${['الشيخ الفاضل', 'الأخ الفاضل', 'الأخت الفاضلة', 'الشيخة الفاضلة', 'الأستاذ الفاضل', 'الدكتور'].map(h => `<option ${V.honor === h ? 'selected' : ''}>${h}</option>`).join('')}</select></div>
      <div style="flex:2"><label class="f">اسم المجاز (من بيانات الطالب)</label><input name="name" value="${esc(V.name || s.name)}" required maxlength="160"></div></div>
    <div><label class="f">العمل / الوظيفة</label><input name="job" value="${esc(V.job || '')}" maxlength="160" placeholder="مثال: مهندس شبكات كمبيوتر"></div>
    <div><label class="f">الإقامة</label><input name="res" value="${esc(V.res || '')}" maxlength="160" placeholder="مثال: المقيم: أبها - المملكة العربية السعودية"></div>
    ${enrOf(s.id).some(e => e.status === 'completed') ? `<div><label class="f">الرواية المجاز فيها <span class="hint">(من ختماته المنجزة)</span></label><select name="enr"><option value="">—</option>${enrOf(s.id).filter(e => e.status === 'completed').map(e => `<option value="${e.id}" ${+V.enr === e.id ? 'selected' : ''}>${esc(e.label)}</option>`).join('')}</select></div>` : ''}
    <div><label class="f">تفاصيل أوقات القراءة <span class="hint">(اختياري — تظهر في نص الإجازة)</span></label><textarea name="sessions" rows="3" maxlength="800" placeholder="مثال: وقد قرأ عليّ في الفترة من ... إلى ...">${esc(V.sessions || '')}</textarea></div>
    <div><label class="f">القراءة <span class="hint">(اتركها فارغة لتؤخذ من النموذج)</span></label><textarea name="reading" rows="3" maxlength="600">${esc(V.reading || '')}</textarea></div>
    <div class="row"><div><label class="f">تاريخ الإجازة</label><input type="date" name="date" value="${esc(rec ? rec.date : today())}"></div><div><label class="f">المكان</label><input name="place" value="${esc(V.place || '')}" maxlength="80"></div></div>
    ${!rec && !ijDone(s) ? '<label class="row info" style="gap:8px;text-align:start"><input type="checkbox" name="exception" required style="width:auto;flex:none"> <span>لا توجد له ختمة مكتملة في المنصة. أؤكد أنه قرأ عليّ ختمة كاملة خارجها.</span></label>' : ''}
    ${db.me.role === 'teacher' ? '<p class="hint" style="margin:0">تُرسل الإجازة لمدير المدرسة لاعتمادها، ولا تظهر للطالب قبل ذلك.</p>' : ''}
    <button class="btn block gold">${rec ? 'حفظ' : 'إنشاء الإجازة'}</button><button type="button" class="btn light block" data-act="close">إلغاء</button>
  </form>`);
}

/* ---------- الأحداث ---------- */
Object.assign(acts, {
  'ij-tpls': () => { st.ijBack = st.ijBack || st.view; closeModal(); go('ijtpls'); ijLoad(true); },
  'ij-back': () => go(st.ijBack && st.ijBack !== 'ijtpls' ? st.ijBack : 'students'),
  'ij-new': id => { ijLoad().then(() => ijIssueForm(+id)); if (IJ.loaded) ijIssueForm(+id); },
  'ij-open': id => { st.ijBack = st.view; go('ijaza', { ijv: { mode: 'saved', id: +id } }); },
  'ij-del': async id => { if (!confirm('حذف هذه الإجازة نهائياً؟')) return; await api('ijaza_delete', { id: +id }); IJ.list = IJ.list.filter(i => i.id !== +id); toast('تم الحذف'); go(st.ijBack || 'students'); },
  'ij-approve': async id => { if (!confirm('اعتماد هذه الإجازة؟ ستظهر للطالب وولي أمره.')) return; const r = await api('ijaza_approve', { id: +id }); const ix = IJ.list.findIndex(i => i.id === +id); if (ix >= 0) IJ.list[ix] = r.ijaza; render(); toast('تم الاعتماد ✔'); },
  'ij-edit': id => { const i = IJ.list.find(x => x.id === +id); if (i) ijIssueForm(i.studentId, i.id); },
  'ij-tpl-new': () => { st.ije = { target: 'tpl', id: 0, name: '', T: ijDefault() }; go('ijtpl'); },
  'ij-tpl-edit': id => { const t = IJ.tpls.find(x => x.id === +id); if (!t) return; st.ije = { target: 'tpl', id: t.id, name: t.name, T: { ...ijDefault(), ...t.data, inc: { ...ijDefault().inc, ...(t.data.inc || {}) } } }; go('ijtpl'); },
  'ij-tpl-marghani': async () => {
    if (typeof IJ_MARGHANI === 'undefined') { toast('جارٍ تحميل النموذج...'); await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'ijaza_marghani.js?v=61'; s.onload = ok; s.onerror = () => no(new Error('تعذر تحميل ملف النموذج')); document.head.appendChild(s); }); }
    const old = IJ.tpls.find(t => t.name === IJ_MARGHANI.name);
    if (!confirm(old ? 'النموذج موجود؛ هل تستبدل محتواه بالنسخة الجاهزة (تضيع تعديلاتك عليه)؟' : 'إضافة نموذج «إجازة يعقوب — المرغني» جاهزاً بكل بياناته؟ (يمكنك تعديله بعدها)')) return;
    const d = { ...ijDefault(), ...IJ_MARGHANI.data }; if (d.muqDocx) d.muq = d.muqDocx; delete d.muqDocx; delete d.muqExtra;
    const r = await api('ijaza_tpl_save', { id: old ? old.id : 0, name: IJ_MARGHANI.name, data: d }); if (old) Object.assign(old, r.tpl); else IJ.tpls.push(r.tpl); toast('تمت إضافة النموذج ✔'); render();
  },
  'ij-tpl-copy': async id => { const t = IJ.tpls.find(x => x.id === +id); if (!t) return; const r = await api('ijaza_tpl_save', { id: 0, name: t.name + ' (نسخة)', data: t.data }); IJ.tpls.push(r.tpl); toast('تم النسخ'); render(); },
  'ij-tpl-del': async id => { if (!confirm('حذف هذا النموذج؟ الإجازات الصادرة منه تبقى كما هي.')) return; await api('ijaza_tpl_delete', { id: +id }); IJ.tpls = IJ.tpls.filter(t => t.id !== +id); render(); },
  'ij-tpl-back': () => { const e = st.ije; st.ije = null; go(e && e.target === 'ijaza' ? 'ijaza' : 'ijtpls'); },
  'ij-preview': () => {
    const f = $('#ijtform'), T = ijCollect(f), e = st.ije; e.T = T;
    const V = e.target === 'ijaza' ? e.V : { name: 'اسم الطالب (مثال)', honor: 'الشيخ الفاضل', job: 'العمل', res: 'الإقامة', date: today(), kind: 'full' };
    st.ijPrevBack = 'ijtpl'; go('ijaza', { ijv: { mode: 'preview', T, V }, ijBack: 'ijtpl' });
  },
  'ij-img-clear': (k) => { const f = $('#ijtform'); if (!f) return; f.elements[k].value = ''; const im = $('#ijimg_' + k); if (im) { im.hidden = true; im.removeAttribute('src'); } },
});
{ const old = acts['ij-back']; acts['ij-back'] = () => { if (st.ijBack === 'ijtpl' && st.ije) return go('ijtpl'); return old(); }; }

document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset && t.dataset.ijimg) {   // ضغط الصورة وتحويلها إلى data URL صغير
    const k = t.dataset.ijimg, fl = t.files[0]; if (!fl) return;
    const im = new Image(), rd = new FileReader();
    rd.onload = () => { im.onload = () => { const m = k === 'photo' ? 360 : (k === 'nameImg' || k === 'titleImg' || k === 'bismImg' || k === 'verseImg' || k === 'ornImg') ? 1000 : 420, sc = Math.min(1, m / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * sc); c.height = Math.round(im.height * sc); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); const url = c.toDataURL('image/png'); $('#ijtform').elements[k].value = url; const p = $('#ijimg_' + k); p.src = url; p.hidden = false; }; im.src = rd.result; };
    rd.readAsDataURL(fl);
  }
  if (t.name && t.name.startsWith('inc_')) { const l = t.closest('label'); if (l) l.classList.toggle('on', t.checked); }
});
document.addEventListener('submit', async e => {
  const f = e.target; if (f.id !== 'ijtform' && f.id !== 'ijissue') return;
  e.preventDefault(); e.stopPropagation();
  try {
    if (f.id === 'ijtform') {
      const el = st.ije, T = ijCollect(f);
      if (el.target === 'tpl') {
        const r = await api('ijaza_tpl_save', { id: el.id, name: f.elements.__name.value, data: T });
        const ix = IJ.tpls.findIndex(t => t.id === r.tpl.id); if (ix >= 0) IJ.tpls[ix] = r.tpl; else IJ.tpls.push(r.tpl);
        st.ije = null; toast('تم حفظ النموذج ✔'); go('ijtpls');
      } else {
        const rec = IJ.list.find(i => i.id === el.id), r = await api('ijaza_save', { id: rec.id, kind: rec.kind, title: rec.title, date: rec.date, tplId: rec.tplId, data: { T, V: rec.data.V } });
        const ix = IJ.list.findIndex(i => i.id === r.ijaza.id); IJ.list[ix] = r.ijaza; st.ije = null; toast('تم الحفظ ✔'); go('ijaza', { ijv: { mode: 'saved', id: rec.id } });
      }
    } else {
      const sid = +f.dataset.sid, id = +f.dataset.id || 0, g = n => f.elements[n] && f.elements[n].value.trim();
      const V = { enr: g('enr') || '', name: g('name'), honor: g('honor'), job: g('job'), res: g('res'), sessions: g('sessions'), reading: g('reading'), place: g('place'), date: g('date') };
      let T, tplId = null;
      if (id) { const rec = IJ.list.find(i => i.id === id); T = rec.data.T; tplId = rec.tplId; } else { const tp = IJ.tpls.find(t => t.id === +g('tpl')); if (!tp) throw new Error('اختر النموذج'); T = { ...ijDefault(), ...tp.data, inc: { ...ijDefault().inc, ...(tp.data.inc || {}) } }; tplId = tp.id; }
      const kind = g('kind'), title = kind === 'short' ? 'إجازة مختصرة' : 'إجازة بقراءة القرآن الكريم';
      const r = await api('ijaza_save', { id, studentId: sid, tplId, kind, title, student: V.name, date: V.date, data: { T, V }, exception: !!(f.elements.exception && f.elements.exception.checked) });
      const ix = IJ.list.findIndex(i => i.id === r.ijaza.id); if (ix >= 0) IJ.list[ix] = r.ijaza; else IJ.list.unshift(r.ijaza);
      closeModal(); st.ijBack = 'student'; go('ijaza', { ijv: { mode: 'saved', id: r.ijaza.id } }); toast('تم ✔');
    }
  } catch (err) { toast(err.message || 'حدث خطأ'); }
}, true);
