<?php
declare(strict_types=1);
date_default_timezone_set('Asia/Riyadh');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$cfg = require dirname(__DIR__, 2) . '/tahfidh_config.php';
$AYAHS = require __DIR__ . '/quran.php';
const GRADES = ['ممتاز', 'جيد جداً', 'جيد', 'مقبول', 'إعادة'];
const RIWAYAT = ['hafs', 'hafs_qasr', 'shuba', 'qalun', 'warsh', 'bazzi', 'qunbul', 'duri_a', 'susi', 'hisham', 'zakwan', 'khalaf_h', 'khallad', 'abulharith', 'duri_k', 'wardan', 'jammaz', 'ruways', 'rawh', 'ishaq', 'idris'];

/* ---------- أدوات ---------- */
function out($d, int $c = 200): never { http_response_code($c); echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
function fail(string $m, int $c = 400): never { out(['error' => $m], $c); }
function body(): array {
    static $b = null;
    if ($b === null) { $b = json_decode(file_get_contents('php://input') ?: '[]', true); if (!is_array($b)) $b = []; }
    return $b;
}
function db(): PDO {
    static $p = null; global $cfg;
    if (!$p) $p = new PDO("mysql:host={$cfg['db_host']};dbname={$cfg['db_name']};charset=utf8mb4", $cfg['db_user'], $cfg['db_pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]);
    return $p;
}
function q(string $sql, array $p = []): PDOStatement { $s = db()->prepare($sql); $s->execute($p); return $s; }
function str(string $k, int $max = 255): string { $v = body()[$k] ?? ''; return mb_substr(trim(is_string($v) ? $v : ''), 0, $max); }
function genPass(): string {
    $a = 'abcdefghjkmnpqrstuvwxyz23456789'; $p = '';
    for ($i = 0; $i < 8; $i++) $p .= $a[random_int(0, strlen($a) - 1)];
    return $p;
}
function ip(): string { return substr($_SERVER['REMOTE_ADDR'] ?? '0', 0, 45); }

/* ---------- الجلسة ---------- */
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
$sp = dirname(__DIR__, 2) . '/tahfidh_sessions';
if (is_dir($sp)) session_save_path($sp);
ini_set('session.gc_maxlifetime', '2592000');
ini_set('session.use_strict_mode', '1');
session_name('tahfidh_sid');
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
session_start();

// حماية CSRF: الطلبات المعدِّلة تتطلب ترويسة مخصصة لا يمكن لموقع آخر إرسالها
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_SERVER['HTTP_X_TAHFIDH'] ?? '') !== '1') fail('طلب غير مصرح', 403);

function schoolBlocked(?int $sid): ?string {
    if (!$sid) return null;
    static $c = [];
    if (!array_key_exists($sid, $c)) $c[$sid] = q('SELECT active,expires_at FROM schools WHERE id=?', [$sid])->fetch() ?: null;
    $r = $c[$sid]; if (!$r) return null;
    if (!(int)$r['active']) return 'هذه الحلقة موقوفة حالياً، تواصل مع الإدارة';
    if ($r['expires_at'] && $r['expires_at'] < date('Y-m-d')) return 'انتهت مدة اشتراك هذه الحلقة، تواصل مع الإدارة';
    return null;
}
function user(): ?array {
    static $u = false;
    if ($u === false) {
        $u = null;
        if (!empty($_SESSION['uid'])) $u = q('SELECT * FROM users WHERE id=? AND active=1', [$_SESSION['uid']])->fetch() ?: null;
        if ($u && $u['role'] !== 'admin' && schoolBlocked($u['school_id'] ? (int)$u['school_id'] : null)) $u = null;
    }
    return $u;
}
function need(string ...$roles): array {
    $u = user();
    if (!$u) fail('يلزم تسجيل الدخول', 401);
    if ($roles && !in_array($u['role'], $roles, true)) fail('غير مصرح', 403);
    return $u;
}
/** شرط SQL يحدد الطلاب المسموح للمستخدم برؤيتهم */
function scope(array $u, string $col = 'id'): array {
    return match ($u['role']) {
        'admin' => ['1=1', []],
        'school_admin' => ["$col IN (SELECT id FROM students WHERE school_id=?)", [$u['school_id']]],
        'teacher' => ["$col IN (SELECT st.student_id FROM student_teacher st JOIN students sx ON sx.id=st.student_id WHERE st.teacher_id=? AND sx.school_id=?)", [$u['id'], $u['school_id']]],
        'parent' => ["$col IN (SELECT student_id FROM parent_student WHERE parent_id=?)", [$u['id']]],
        default => ["$col IN (SELECT id FROM students WHERE user_id=?)", [$u['id']]],
    };
}
function canSee(array $u, int $sid): bool {
    [$w, $p] = scope($u);
    return (bool)q("SELECT 1 FROM students WHERE id=? AND $w", [$sid, ...$p])->fetchColumn();
}
/** هل يحق لهذا المستخدم استعمال رواية غير حفص؟ (المعلم يفعّلها بنفسه من حسابه) */
function qiraatAllowed(array $u, ?int $teacherId): bool {
    if (!empty($u['qiraat'])) return true;
    if (in_array($u['role'], ['admin', 'school_admin'], true) && $teacherId) return (bool)q('SELECT qiraat FROM users WHERE id=?', [$teacherId])->fetchColumn();
    return false;
}
/** مدير النظام يملك كل شيء، ومدير المدرسة يملك مدرسته فقط */
function mgrOwns(array $me, $schoolId): bool { return $me['role'] === 'admin' || (int)$schoolId === (int)$me['school_id']; }
/** هل يحق للمستخدم استعمال القراءات لهذا الطالب؟ (هو أو أحد معلمي الطالب فعّلها) */
function qiraatAllowedFor(array $u, int $sid): bool {
    if (!empty($u['qiraat'])) return true;
    if (in_array($u['role'], ['admin', 'school_admin'], true))
        return (bool)q('SELECT 1 FROM student_teacher st JOIN users t ON t.id=st.teacher_id WHERE st.student_id=? AND t.qiraat=1 LIMIT 1', [$sid])->fetchColumn();
    return false;
}
function qiraatAllowedAny(array $u, array $teacherIds): bool {
    if (!empty($u['qiraat'])) return true;
    if (!in_array($u['role'], ['admin', 'school_admin'], true) || !$teacherIds) return false;
    return (bool)q('SELECT 1 FROM users WHERE qiraat=1 AND id IN (' . implode(',', array_map('intval', $teacherIds)) . ') LIMIT 1')->fetchColumn();
}
function certOut(array $c): array {
    return ['id' => (int)$c['id'], 'serial' => $c['serial'], 'studentId' => (int)$c['student_id'], 'student' => $c['student_name'], 'school' => $c['school_name'],
        'kind' => $c['kind'], 'title' => $c['title'], 'riwaya' => $c['riwaya'], 'from' => $c['period_from'], 'to' => $c['period_to'],
        'grade' => $c['grade'], 'note' => $c['note'] ?? '', 'date' => $c['issued_at'], 'issuer' => $c['issuer_name'],
        'label' => $c['riwaya_label'] ?? '', 'enrollmentId' => !empty($c['enrollment_id']) ? (int)$c['enrollment_id'] : null];
}
/** هل أتمّ الطالب حفظ المصحف كاملاً في هذه الرواية؟ */
function memorizedAll(int $sid, ?int $enr = null): bool {
    global $AYAHS;
    $off = [0]; foreach ($AYAHS as $i => $n) $off[] = $off[$i] + $n;
    $m = array_fill(0, 6236, false);
    $rows = $enr ? q("SELECT surah,surah_to,ayah_from,ayah_to FROM records WHERE student_id=? AND type='qiraa' AND enrollment_id=?", [$sid, $enr])->fetchAll()
        : q("SELECT surah,surah_to,ayah_from,ayah_to FROM records WHERE student_id=? AND type='hifz' AND enrollment_id IS NULL", [$sid])->fetchAll();
    foreach ($rows as $r)
        for ($i = $off[$r['surah'] - 1] + $r['ayah_from']; $i <= $off[($r['surah_to'] ?: $r['surah']) - 1] + $r['ayah_to']; $i++) $m[$i - 1] = true;
    return !in_array(false, $m, true);
}
function enrOut(array $e): array {
    return ['id' => (int)$e['id'], 'studentId' => (int)$e['student_id'], 'kind' => $e['kind'], 'riwayat' => array_values(array_filter(explode(',', $e['riwayat']))),
        'label' => $e['label'], 'status' => $e['status'], 'prior' => (bool)$e['prior'], 'startedAt' => $e['started_at'], 'completedAt' => $e['completed_at'],
        'shaykh' => $e['shaykh'] ?? '', 'note' => $e['note'] ?? ''];
}
/** إتمام الختمة تلقائياً عند تغطية كل آيات المصحف */
function syncEnrollment(int $enr): ?array {
    $e = q('SELECT * FROM enrollments WHERE id=?', [$enr])->fetch();
    if (!$e) return null;
    if (!$e['prior'] && $e['status'] === 'active' && memorizedAll((int)$e['student_id'], $enr))
        q("UPDATE enrollments SET status='completed', completed_at=? WHERE id=?", [date('Y-m-d'), $enr]);
    return q('SELECT * FROM enrollments WHERE id=?', [$enr])->fetch();
}
function validDate(?string $d): ?string { return $d && preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) && checkdate((int)substr($d, 5, 2), (int)substr($d, 8, 2), (int)substr($d, 0, 4)) ? $d : null; }
function iso(string $d): string { return date('c', strtotime($d)); }

/* ---------- تحويل الصفوف ---------- */
function recOut(array $r): array {
    return ['id' => (int)$r['id'], 'studentId' => (int)$r['student_id'], 'date' => $r['rec_date'], 'type' => $r['type'],
        'surah' => (int)$r['surah'], 'from' => (int)$r['ayah_from'], 'surahTo' => !empty($r['surah_to']) ? (int)$r['surah_to'] : (int)$r['surah'], 'to' => (int)$r['ayah_to'], 'grade' => $r['grade'],
        'note' => $r['note'] ?? '', 'by' => $r['by_name'] ?? '', 'riwaya' => $r['riwaya'] ?? 'hafs', 'enrollmentId' => !empty($r['enrollment_id']) ? (int)$r['enrollment_id'] : null];
}
function msgOut(array $m): array {
    return ['id' => (int)$m['id'], 'studentId' => (int)$m['student_id'], 'senderId' => (int)$m['sender_id'],
        'senderName' => $m['sname'] ?? 'محذوف', 'senderRole' => $m['srole'] ?? '', 'body' => $m['body'], 'at' => iso($m['created_at'])];
}
function userOut(array $u): array {
    return ['id' => (int)$u['id'], 'username' => $u['username'], 'name' => $u['name'], 'role' => $u['role'],
        'school_id' => $u['school_id'] ? (int)$u['school_id'] : null, 'phone' => $u['phone'] ?? '', 'email' => $u['email'] ?? '', 'active' => (bool)$u['active'], 'qiraat' => (bool)($u['qiraat'] ?? 0), 'solo' => (bool)($u['solo'] ?? 0),
        'last_login' => $u['last_login'] ?? null];
}
const MSG_SQL = 'SELECT m.*, u.name sname, u.role srole FROM messages m LEFT JOIN users u ON u.id=m.sender_id';

function bootstrap(array $u): array {
    [$w, $p] = scope($u);
    $fs = $u['role'] === 'admin' ? (int)($_GET['school'] ?? 0) : 0;              // فلتر مدرسة للمدير: يُطبَّق في الخادم
    if ($fs) { $w = 'school_id=?'; $p = [$fs]; }
    $students = q("SELECT id,name,grp,riwaya,program,hafiz,hafiz_where,hafiz_note,school_id,teacher_id,user_id FROM students WHERE $w ORDER BY name", $p)->fetchAll();
    $ids = array_map(fn($s) => (int)$s['id'], $students);
    $in = $ids ? implode(',', $ids) : '0';
    $par = [];
    foreach (q("SELECT student_id,parent_id FROM parent_student WHERE student_id IN ($in)")->fetchAll() as $r) $par[(int)$r['student_id']][] = (int)$r['parent_id'];
    $tch = [];
    foreach (q("SELECT student_id,teacher_id FROM student_teacher WHERE student_id IN ($in) ORDER BY teacher_id")->fetchAll() as $r) $tch[(int)$r['student_id']][] = (int)$r['teacher_id'];
    $stOut = array_map(fn($s) => ['id' => (int)$s['id'], 'name' => $s['name'], 'group' => $s['grp'] ?? '', 'riwaya' => $s['riwaya'] ?? 'hafs', 'program' => $s['program'] ?? 'hifz', 'hafiz' => (bool)($s['hafiz'] ?? 0),
        'hafizWhere' => $s['hafiz_where'] ?? '', 'hafizNote' => $s['hafiz_note'] ?? '', 'school_id' => $s['school_id'] ? (int)$s['school_id'] : null,
        'teacher_id' => $s['teacher_id'] ? (int)$s['teacher_id'] : null, 'user_id' => $s['user_id'] ? (int)$s['user_id'] : null,
        'parents' => $par[(int)$s['id']] ?? [], 'teachers' => $tch[(int)$s['id']] ?? []], $students);
    $recs = array_map('recOut', q("SELECT r.*, u.name by_name FROM records r LEFT JOIN users u ON u.id=r.teacher_id WHERE r.student_id IN ($in) ORDER BY r.rec_date DESC, r.id DESC")->fetchAll());
    $msgs = array_reverse(array_map('msgOut', q(MSG_SQL . " WHERE m.student_id IN ($in) ORDER BY m.id DESC LIMIT 600")->fetchAll()));
    $reads = [];
    foreach (q('SELECT student_id,last_id FROM message_reads WHERE user_id=?', [$u['id']])->fetchAll() as $r) $reads[(int)$r['student_id']] = (int)$r['last_id'];

    $sid = $u['school_id'] ?: ($students[0]['school_id'] ?? null);
    if ($u['role'] === 'admin') $schools = q("SELECT s.id,s.name,s.logo,s.plan,s.expires_at,s.max_students,s.active,s.notes,(SELECT COUNT(*) FROM users z WHERE z.school_id=s.id AND z.solo=1) AS is_solo,(SELECT m.id FROM users m WHERE m.school_id=s.id AND m.role='school_admin' LIMIT 1) AS mgr_id,(SELECT m2.name FROM users m2 WHERE m2.school_id=s.id AND m2.role='school_admin' LIMIT 1) AS mgr_name,(SELECT COUNT(*) FROM students x WHERE x.school_id=s.id) AS ns,(SELECT COUNT(*) FROM users y WHERE y.school_id=s.id AND y.role='teacher') AS nt FROM schools s ORDER BY s.name")->fetchAll();
    else {
        $sids = array_values(array_unique(array_filter(array_merge(array_column($students, 'school_id'), [$u['school_id']]))));
        $schools = $sids ? q('SELECT id,name,logo FROM schools WHERE id IN (' . implode(',', array_map('intval', $sids)) . ')')->fetchAll() : [];
    }
    $schools = array_map(fn($s) => ['id' => (int)$s['id'], 'name' => $s['name'], 'logo' => $s['logo'] ?? '', 'ns' => isset($s['ns']) ? (int)$s['ns'] : null, 'nt' => isset($s['nt']) ? (int)$s['nt'] : null,
        'plan' => $s['plan'] ?? null, 'expires_at' => $s['expires_at'] ?? null, 'max_students' => isset($s['max_students']) ? (int)$s['max_students'] : null,
        'active' => isset($s['active']) ? (bool)$s['active'] : true, 'notes' => $s['notes'] ?? '',
        'is_solo' => !empty($s['is_solo']), 'mgr_id' => !empty($s['mgr_id']) ? (int)$s['mgr_id'] : null, 'mgr_name' => $s['mgr_name'] ?? null], $schools);
    $school = null;
    foreach ($schools as $s) if ($s['id'] === (int)$sid) $school = $s;
    if ($u['role'] === 'admin') $school = null;                                  // مدير النظام يرى هوية المنصة

    $res = ['me' => userOut($u) + ['must_change' => (bool)$u['must_change']], 'school' => $school, 'schools' => $schools,
        'students' => $stOut, 'records' => $recs, 'messages' => $msgs, 'reads' => (object)$reads, 'users' => [],
        'certs' => array_map('certOut', q("SELECT * FROM certificates WHERE student_id IN ($in) ORDER BY id DESC")->fetchAll()),
        'enrollments' => array_map('enrOut', q("SELECT * FROM enrollments WHERE student_id IN ($in) ORDER BY id")->fetchAll())];
    $reqOut = fn($r) => ['id' => (int)$r['id'], 'role' => $r['role'], 'name' => $r['name'], 'username' => $r['username'],
        'school_id' => $r['school_id'] ? (int)$r['school_id'] : null, 'school_name' => $r['school_name'] ?? '', 'children' => $r['children'] ?? '', 'at' => iso($r['created_at'])];
    if ($u['role'] === 'admin') {
        $res['users'] = array_map('userOut', $fs ? q("SELECT * FROM users WHERE school_id=? OR role='admin' ORDER BY role, name", [$fs])->fetchAll() : q('SELECT * FROM users ORDER BY role, name')->fetchAll());
        $res['requests'] = array_map($reqOut, q('SELECT * FROM signup_requests ORDER BY id')->fetchAll());
    } elseif ($u['role'] === 'school_admin') {
        $res['users'] = array_map('userOut', q("SELECT * FROM users WHERE school_id=? AND (role IN ('teacher','parent','student') OR id=?) ORDER BY role, name", [$u['school_id'], $u['id']])->fetchAll());
        $res['requests'] = array_map($reqOut, q("SELECT * FROM signup_requests WHERE school_id=? AND role IN ('parent','teacher') ORDER BY id", [$u['school_id']])->fetchAll());
    } elseif ($u['role'] === 'parent' || $u['role'] === 'student') {
        // أسماء المعلمين لعرضها فقط
        $res['users'] = array_map(fn($t) => ['id' => (int)$t['id'], 'name' => $t['name'], 'role' => 'teacher'],
            q("SELECT id,name FROM users WHERE role IN ('teacher','school_admin') AND id IN (SELECT teacher_id FROM student_teacher WHERE student_id IN ($in))")->fetchAll());
    }
    $ann = null;
    if (cfgv('announce_on') === '1' && trim(cfgv('announce_text')) !== '') {
        $aud = cfgv('announce_audience'); $isStaff = in_array($u['role'], ['admin', 'school_admin', 'teacher'], true);
        if ($aud === 'all' || ($aud === 'staff' && $isStaff) || ($aud === 'parents' && $u['role'] === 'parent')) $ann = ['title' => cfgv('announce_title'), 'text' => cfgv('announce_text')];
    }
    $res['app'] = ['week_start' => max(0, min(6, (int)cfgv('week_start'))), 'announce' => $ann, 'brand' => ['name' => cfgv('platform_name'), 'tagline' => cfgv('platform_tagline'), 'logo' => cfgv('platform_logo')]];
    return $res;
}

/* ---------- التحقق ---------- */
function validRecord(): array {
    global $AYAHS;
    $b = body();
    $d = (string)($b['date'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) || !checkdate((int)substr($d, 5, 2), (int)substr($d, 8, 2), (int)substr($d, 0, 4))) fail('تاريخ غير صحيح');
    if ($d > date('Y-m-d', strtotime('+1 day'))) fail('لا يمكن تسجيل تاريخ مستقبلي');
    $type = $b['type'] ?? '';
    if (!in_array($type, ['hifz', 'review', 'qiraa'], true)) fail('نوع التسميع غير صحيح');
    $s = (int)($b['surah'] ?? 0); $f = (int)($b['from'] ?? 0); $t = (int)($b['to'] ?? 0);
    if ($s < 1 || $s > 114) fail('سورة غير صحيحة');
    $s2 = (int)($b['surahTo'] ?? $s) ?: $s;
    if ($s2 < $s || $s2 > 114) fail('سورة النهاية غير صحيحة');
    if ($f < 1 || $f > $AYAHS[$s - 1]) fail('آية البداية غير صحيحة (عدد آيات السورة ' . $AYAHS[$s - 1] . ')');
    if ($t < 1 || $t > $AYAHS[$s2 - 1] || ($s2 === $s && $t < $f)) fail('آية النهاية غير صحيحة (عدد آيات السورة ' . $AYAHS[$s2 - 1] . ')');
    $g = (string)($b['grade'] ?? '');
    if ($g !== '' && !in_array($g, GRADES, true)) fail('تقدير غير صحيح');
    return [$d, $type, $s, $f, $t, $g, str('note', 500), (int)($b['enrollmentId'] ?? 0), $s2];
}
function uniqueUsername(string $name, int $exceptId = 0): void {
    if (!preg_match('/^[\p{L}\p{N}_.@+-]{3,190}$/u', $name)) fail('اسم المستخدم من 3 أحرف فأكثر (حروف وأرقام فقط)');
    if (q('SELECT 1 FROM users WHERE username=? AND id<>?', [$name, $exceptId])->fetchColumn()) fail('اسم المستخدم مستخدم من قبل');
}
function normUser(string $s): string { return mb_strtolower(trim($s)); }
require __DIR__ . '/mail.php';

/* ---------- الراوتر ---------- */
$r = $_GET['r'] ?? '';
try {
    switch ($r) {
    case 'bootstrap':
        $u = user();
        out($u ? bootstrap($u) : ['me' => null]);

    case 'login': {
        $name = normUser(str('username', 190)); $pw = (string)(body()['password'] ?? '');
        q('DELETE FROM login_attempts WHERE at < NOW() - INTERVAL 1 DAY');
        $n = (int)q("SELECT COUNT(*) FROM login_attempts WHERE at > NOW() - INTERVAL 15 MINUTE AND (ip=? OR username=?) AND username NOT IN ('otp','verify')", [ip(), $name])->fetchColumn();
        if ($n >= 8) fail('محاولات كثيرة، حاول بعد 15 دقيقة', 429);
        $u = q('SELECT * FROM users WHERE username=? OR email=?', [$name, $name])->fetch();
        $ok = password_verify($pw, $u['pass_hash'] ?? '$2y$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234');
        if (!$u) {
            $rq = q('SELECT pass_hash FROM signup_requests WHERE username=?', [$name])->fetch();
            if ($rq && password_verify($pw, $rq['pass_hash'])) fail('طلب تسجيلك قيد المراجعة من الإدارة، سيُفعَّل حسابك بعد الموافقة', 403);
        }
        if (!$u || !$ok || !$u['active']) { q('INSERT INTO login_attempts (ip,username) VALUES (?,?)', [ip(), $name]); fail('اسم المستخدم أو كلمة المرور غير صحيحة', 401); }
        if ($u['role'] !== 'admin' && cfgv('login_password') !== '1') fail('الدخول بكلمة المرور متوقف حالياً، استخدم الدخول برمز البريد', 403);
        if ($u['role'] !== 'admin' && ($why = schoolBlocked($u['school_id'] ? (int)$u['school_id'] : null))) fail($why, 403);
        session_regenerate_id(true);
        $_SESSION['uid'] = (int)$u['id'];
        if (!empty(body()['remember']))
            setcookie(session_name(), session_id(), ['expires' => time() + 2592000, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
        q('UPDATE users SET last_login=NOW() WHERE id=?', [$u['id']]);
        if (in_array($u['role'], ['admin', 'school_admin'], true)) audit('login', $u['username'], 'user:' . $u['id']);
        out(['ok' => true]);
    }

    case 'logout':
        $_SESSION = []; session_destroy();
        setcookie(session_name(), '', ['expires' => 1, 'path' => '/']);
        out(['ok' => true]);

    case 'change_password': {
        $u = need();
        $old = (string)(body()['old'] ?? ''); $new = (string)(body()['new'] ?? '');
        if (!password_verify($old, $u['pass_hash'])) fail('كلمة المرور الحالية غير صحيحة');
        if (mb_strlen($new) < 6) fail('كلمة المرور الجديدة 6 أحرف على الأقل');
        q('UPDATE users SET pass_hash=?, must_change=0 WHERE id=?', [password_hash($new, PASSWORD_DEFAULT), $u['id']]);
        out(['ok' => true]);
    }

    /* ----- التسميع ----- */
    case 'record_save': {
        $u = need('admin', 'school_admin', 'teacher');
        [$d, $type, $s, $f, $t, $g, $note, $enr, $s2] = validRecord();
        $sid = (int)(body()['studentId'] ?? 0); $id = (int)(body()['id'] ?? 0);
        $stu = q('SELECT * FROM students WHERE id=?', [$sid])->fetch();
        if (!$stu || !canSee($u, $sid)) fail('الطالب غير موجود', 404);
        if ($type === 'qiraa') {
            $e = $enr ? q('SELECT * FROM enrollments WHERE id=? AND student_id=?', [$enr, $sid])->fetch() : null;
            if (!$e) fail('اختر برنامج القراءة');
            if (!qiraatAllowedFor($u, $sid)) fail('القراءات غير مفعّلة في حسابك');
            if ($e['prior']) fail('قراءة سابقة منجزة لا يُسجَّل لها تسميع');
            if ($e['status'] !== 'active' && !$id) fail('هذه الختمة مكتملة');
        } else {
            $enr = 0;
            if ($stu['program'] === 'qiraat') fail('طالب القراءات لا يُسجَّل له حفظ ومراجعة');
        }
        $oldEnr = 0;
        if ($id) {
            $old = q('SELECT student_id, enrollment_id FROM records WHERE id=?', [$id])->fetch();
            if (!$old || !canSee($u, (int)$old['student_id'])) fail('غير مصرح', 403);
            $oldEnr = (int)$old['enrollment_id'];
            q('UPDATE records SET student_id=?, rec_date=?, type=?, surah=?, surah_to=?, ayah_from=?, ayah_to=?, grade=?, note=?, enrollment_id=? WHERE id=?', [$sid, $d, $type, $s, $s2 === $s ? null : $s2, $f, $t, $g, $note, $enr ?: null, $id]);
        } else {
            q('INSERT INTO records (student_id,teacher_id,rec_date,type,surah,surah_to,ayah_from,ayah_to,grade,note,enrollment_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [$sid, $u['id'], $d, $type, $s, $s2 === $s ? null : $s2, $f, $t, $g, $note, $enr ?: null]);
            $id = (int)db()->lastInsertId();
        }
        $en = $enr ? syncEnrollment($enr) : null;
        out(['record' => recOut(q('SELECT r.*, u.name by_name FROM records r LEFT JOIN users u ON u.id=r.teacher_id WHERE r.id=?', [$id])->fetch()), 'enrollment' => $en ? enrOut($en) : null]);
    }
    case 'record_delete': {
        $u = need('admin', 'school_admin', 'teacher'); $id = (int)(body()['id'] ?? 0);
        $old = q('SELECT student_id FROM records WHERE id=?', [$id])->fetch();
        if (!$old || !canSee($u, (int)$old['student_id'])) fail('غير مصرح', 403);
        q('DELETE FROM records WHERE id=?', [$id]);
        out(['ok' => true]);
    }

    /* ----- الرسائل ----- */
    case 'message_send': {
        $u = need(); $sid = (int)(body()['studentId'] ?? 0); $text = str('body', 1000);
        if ($text === '') fail('اكتب الرسالة');
        if (!canSee($u, $sid)) fail('غير مصرح', 403);
        q('INSERT INTO messages (student_id,sender_id,body) VALUES (?,?,?)', [$sid, $u['id'], $text]);
        $id = (int)db()->lastInsertId();
        out(['message' => msgOut(q(MSG_SQL . ' WHERE m.id=?', [$id])->fetch())]);
    }
    case 'messages_read': {
        $u = need(); $sid = (int)(body()['studentId'] ?? 0); $last = (int)(body()['lastId'] ?? 0);
        if (canSee($u, $sid))
            q('INSERT INTO message_reads (user_id,student_id,last_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE last_id=GREATEST(last_id,VALUES(last_id))', [$u['id'], $sid, $last]);
        out(['ok' => true]);
    }
    case 'poll': {
        $u = need(); [$w, $p] = scope($u, 'm.student_id'); $since = (int)($_GET['since'] ?? 0);
        out(['role' => $u['role'], 'solo' => (bool)($u['solo'] ?? 0), 'messages' => array_map('msgOut', q(MSG_SQL . " WHERE m.id>? AND $w ORDER BY m.id LIMIT 200", [$since, ...$p])->fetchAll()),
            'pending' => $u['role'] === 'admin' ? (int)q('SELECT COUNT(*) FROM signup_requests')->fetchColumn()
                : ($u['role'] === 'school_admin' ? (int)q("SELECT COUNT(*) FROM signup_requests WHERE school_id=? AND role IN ('parent','teacher')", [$u['school_id']])->fetchColumn() : 0)]);
    }

    /* ----- الإدارة: مدير النظام ومدير المدرسة ----- */
    case 'school_save': {
        $me = need('admin', 'school_admin'); $b = body(); $id = (int)($b['id'] ?? 0); $name = str('name', 120); $logo = (string)($b['logo'] ?? '');
        if ($me['role'] === 'school_admin') $id = (int)$me['school_id'];      // مدير المدرسة يعدّل مدرسته فقط
        if ($name === '') fail('اسم المدرسة مطلوب');
        if ($logo !== '' && (!str_starts_with($logo, 'data:image/') || strlen($logo) > 400000)) fail('الشعار غير صالح');
        if ($me['role'] === 'admin') {                                          // الباقة والتفعيل: لمدير النظام وحده
            $plan = in_array($b['plan'] ?? '', ['free', 'trial', 'paid'], true) ? $b['plan'] : 'free'; $exp = validDate($b['expires_at'] ?? null);
            $maxs = (int)($b['max_students'] ?? 0) ?: null; $act = !isset($b['active']) || $b['active'] ? 1 : 0; $notes = str('notes', 300);
            if ($id) q('UPDATE schools SET name=?, logo=?, plan=?, expires_at=?, max_students=?, active=?, notes=? WHERE id=?', [$name, $logo, $plan, $exp, $maxs, $act, $notes, $id]);
            else q('INSERT INTO schools (name,logo,plan,expires_at,max_students,active,notes) VALUES (?,?,?,?,?,?,?)', [$name, $logo, $plan, $exp, $maxs, $act, $notes]);
        } else q('UPDATE schools SET name=?, logo=? WHERE id=?', [$name, $logo, $id]);
        audit('school_save', $name, 'school:' . $id);
        out(['ok' => true]);
    }
    case 'school_delete': {
        need('admin'); $id = (int)(body()['id'] ?? 0);
        if (q('SELECT 1 FROM students WHERE school_id=? UNION SELECT 1 FROM users WHERE school_id=?', [$id, $id])->fetchColumn()) fail('لا يمكن حذف مدرسة فيها معلمون أو طلاب');
        audit('school_delete', '', 'school:' . $id);
        q('DELETE FROM schools WHERE id=?', [$id]);
        out(['ok' => true]);
    }

    case 'user_save': {
        $me = need('admin', 'school_admin'); $b = body(); $id = (int)($b['id'] ?? 0); $sa = $me['role'] === 'school_admin';
        $name = str('name', 120); $un = normUser(str('username', 190)); $phone = preg_replace('/[^\d+]/', '', str('phone', 30)); $email = strtolower(str('email', 190));
        $role = $b['role'] ?? ''; $school = (int)($b['school_id'] ?? 0) ?: null; $active = !isset($b['active']) || $b['active'] ? 1 : 0;
        $qi = !empty($b['qiraat']) ? 1 : 0; $keepQ = 0; $isSolo = false; $newSolo = false;
        $sids = array_values(array_unique(array_map('intval', is_array($b['student_ids'] ?? null) ? $b['student_ids'] : [])));
        if ($name === '') fail('الاسم مطلوب');
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) fail('البريد الإلكتروني غير صحيح');
        $allowed = $sa ? ['teacher', 'parent'] : ['admin', 'school_admin', 'solo', 'teacher', 'parent'];
        $old = null;
        if ($id) {
            $old = q('SELECT * FROM users WHERE id=?', [$id])->fetch();
            if (!$old || $old['role'] === 'student') fail('مستخدم غير موجود', 404);
            if ($sa && (!in_array($old['role'], $allowed, true) || !mgrOwns($me, $old['school_id']))) fail('غير مصرح', 403);
            if ($id === (int)$me['id'] && !$active) fail('لا يمكنك تعطيل حسابك');
            $role = $old['role']; $keepQ = (int)$old['qiraat']; $isSolo = !empty($old['solo']);
            if ($un === '') $un = $old['username'];
        } elseif (!in_array($role, $allowed, true)) fail('نوع الحساب غير صحيح');
        if ($role === 'solo') { $newSolo = true; $role = 'school_admin'; }       // معلم مستقل جديد: تُنشأ له حلقته (مدرسة قائمة بذاتها)
        if ($role === 'parent') {
            if (!$id && $email === '') fail('بريد ولي الأمر مطلوب');
            if (!$id) $un = $email;                                              // اسم دخول ولي الأمر هو بريده
        } elseif ($un === '' && $email !== '') $un = $email;
        if ($un === '') fail('اسم المستخدم مطلوب');
        uniqueUsername($un, $id);
        if ($email !== '' && q('SELECT 1 FROM users WHERE email=? AND id<>?', [$email, $id])->fetchColumn()) fail('البريد مستخدم لحساب آخر');
        if ($role === 'parent' && (!$id || $sids)) {                              // لا ولي أمر بلا طالب
            if (!$sids) fail('يجب ربط ولي الأمر بطالب واحد على الأقل');
            [$w, $pp] = scope($me, 'id');
            if ((int)q('SELECT COUNT(*) FROM students WHERE id IN (' . implode(',', $sids) . ") AND $w", $pp)->fetchColumn() !== count($sids)) fail('طالب غير صحيح');
            $school = (int)q('SELECT school_id FROM students WHERE id=?', [$sids[0]])->fetchColumn();
        }
        if ($sa) $school = (int)$me['school_id'];
        if ($role === 'admin' || $newSolo) { if ($role === 'admin') $school = null; }
        elseif (!$school) fail('اختر المدرسة');
        if ($school && !q('SELECT 1 FROM schools WHERE id=?', [$school])->fetchColumn()) fail('مدرسة غير صحيحة');
        if ($role === 'school_admin' && !$newSolo && q("SELECT 1 FROM users WHERE role='school_admin' AND school_id=? AND id<>?", [$school, $id])->fetchColumn())
            fail('لهذه المدرسة مدير بالفعل (مدير واحد لكل مدرسة)');
        $qv = ($role === 'teacher' || $isSolo || $newSolo) ? $qi : $keepQ;
        $pw = null; $mail = null;
        if ($id) {
            q('UPDATE users SET name=?, username=?, email=?, phone=?, school_id=?, active=?, qiraat=? WHERE id=?', [$name, $un, $email ?: null, $phone, $school, $active, $qv, $id]);
            if ($school !== null && (int)$old['school_id'] !== (int)$school) {          // نُقل لمدرسة أخرى: تنقطع صلته بطلاب المدرسة السابقة
                q('DELETE FROM student_teacher WHERE teacher_id=? AND student_id IN (SELECT id FROM students WHERE school_id<>?)', [$id, $school]);
                q('UPDATE students s SET s.teacher_id=(SELECT MIN(st.teacher_id) FROM student_teacher st WHERE st.student_id=s.id) WHERE s.teacher_id=?', [$id]);
            }
        } else {
            if ($newSolo) { q('INSERT INTO schools (name) VALUES (?)', [str('school_name', 120) ?: ('حلقة ' . $name)]); $school = (int)db()->lastInsertId(); }
            $pw = genPass(); $isParent = $role === 'parent';
            q('INSERT INTO users (username,name,role,school_id,email,phone,pass_hash,qiraat,solo,must_change) VALUES (?,?,?,?,?,?,?,?,?,?)',
                [$un, $name, $role, $school, $email ?: null, $phone, password_hash($pw, PASSWORD_DEFAULT), $qv, $newSolo ? 1 : 0, $isParent ? 0 : 1]);
            $id = (int)db()->lastInsertId();
            if ($isParent) $pw = null;                                           // ولي الأمر يدخل بالرمز على بريده
        }
        if ($role === 'parent' && $sids) {
            [$w, $pp] = scope($me, 'id');
            q("DELETE FROM parent_student WHERE parent_id=? AND student_id IN (SELECT id FROM students WHERE $w)", [$id, ...$pp]);
            foreach ($sids as $sd) q('INSERT IGNORE INTO parent_student (parent_id,student_id) VALUES (?,?)', [$id, $sd]);
        }
        if (!$old && $email !== '') {                                            // دعوة بالبريد عند الإنشاء
            $sn = $role === 'parent' ? array_column(q('SELECT name FROM students WHERE id IN (' . implode(',', $sids) . ')')->fetchAll(), 'name') : [];
            $scn = $school ? (string)q('SELECT name FROM schools WHERE id=?', [$school])->fetchColumn() : '';
            $mail = sendInviteMail($email, $name, $newSolo ? 'solo' : $role, $scn, $sn);
        }
        out(['id' => $id, 'username' => $un, 'password' => $pw, 'mail' => $mail]);
    }
    case 'reset_password': {
        $me = need('admin', 'school_admin'); $id = (int)(body()['id'] ?? 0);
        $u = q('SELECT username,role,school_id FROM users WHERE id=?', [$id])->fetch();
        if (!$u) fail('مستخدم غير موجود', 404);
        if ($me['role'] === 'school_admin' && (!in_array($u['role'], ['teacher', 'parent', 'student'], true) || !mgrOwns($me, $u['school_id']))) fail('غير مصرح', 403);
        $pw = genPass();
        q('UPDATE users SET pass_hash=?, must_change=1 WHERE id=?', [password_hash($pw, PASSWORD_DEFAULT), $id]);
        audit('reset_password', $u['username'], 'user:' . $id);
        out(['username' => $u['username'], 'password' => $pw]);
    }
    case 'user_delete': {
        $me = need('admin', 'school_admin'); $id = (int)(body()['id'] ?? 0);
        $u = q('SELECT role,school_id FROM users WHERE id=?', [$id])->fetch();
        if (!$u || $u['role'] === 'student') fail('مستخدم غير موجود', 404);
        if ($me['role'] === 'school_admin' && (!in_array($u['role'], ['teacher', 'parent'], true) || !mgrOwns($me, $u['school_id']))) fail('غير مصرح', 403);
        if ($id === (int)$me['id']) fail('لا يمكنك حذف حسابك');
        q('DELETE FROM student_teacher WHERE teacher_id=?', [$id]);
        q('UPDATE students s SET s.teacher_id=(SELECT MIN(st.teacher_id) FROM student_teacher st WHERE st.student_id=s.id) WHERE s.teacher_id=?', [$id]);
        q('DELETE FROM parent_student WHERE parent_id=?', [$id]);
        q('DELETE FROM message_reads WHERE user_id=?', [$id]);
        q('DELETE FROM users WHERE id=?', [$id]);
        audit('user_delete', '', 'user:' . $id);
        out(['ok' => true]);
    }

    case 'student_save': {
        $me = need('admin', 'school_admin'); $sa = $me['role'] === 'school_admin'; $b = body(); $id = (int)($b['id'] ?? 0);
        $name = str('name', 120); $grp = str('group', 80); $school = (int)($b['school_id'] ?? 0) ?: null;
        $tids = array_values(array_unique(array_filter(array_map('intval', is_array($b['teacher_ids'] ?? null) ? $b['teacher_ids'] : (!empty($b['teacher_id']) ? [(int)$b['teacher_id']] : [])))));
        if ($sa) $school = (int)$me['school_id'];
        if ($sa && !$tids && !empty($me['solo'])) $tids = [(int)$me['id']];
        $parents = array_values(array_unique(array_map('intval', is_array($b['parent_ids'] ?? null) ? $b['parent_ids'] : [])));
        $login = normUser(str('login_username', 60));
        $program = ($b['program'] ?? 'hifz') === 'qiraat' ? 'qiraat' : 'hifz'; $hafiz = !empty($b['hafiz']) ? 1 : 0;
        $hw = str('hafiz_where', 160); $hn = str('hafiz_note', 300);
        $priors = is_array($b['prior_list'] ?? null) ? array_slice($b['prior_list'], 0, 30) : [];
        $newPar = [];                                                      // أولياء أمور جدد: اسم + بريد (والجوال اختياري)
        foreach (array_slice(is_array($b['new_parents'] ?? null) ? $b['new_parents'] : [], 0, 5) as $np) {
            $pn = mb_substr(trim((string)($np['name'] ?? '')), 0, 120); $pe = strtolower(trim((string)($np['email'] ?? '')));
            if ($pn === '' && $pe === '') continue;
            if ($pn === '' || !filter_var($pe, FILTER_VALIDATE_EMAIL)) fail('أدخل اسم ولي الأمر وبريده الإلكتروني الصحيح');
            $newPar[] = [$pn, $pe, preg_replace('/[^\d+]/', '', (string)($np['phone'] ?? ''))];
        }
        if ($program === 'qiraat') {
            if (!qiraatAllowedAny($me, $tids)) fail('فعّل القراءات في حساب المعلم أو حسابك أولاً');
            if (!$hafiz && !($id && memorizedAll($id))) fail('برنامج القراءات للحافظين فقط: علّم «أتمّ حفظ المصحف»');
        }
        if ($name === '') fail('اسم الطالب مطلوب');
        if (!$school || !q('SELECT 1 FROM schools WHERE id=?', [$school])->fetchColumn()) fail('اختر المدرسة');
        foreach ($tids as $tid) {
            $t = q("SELECT school_id FROM users WHERE id=? AND (role='teacher' OR (role='school_admin' AND solo=1))", [$tid])->fetch();
            if (!$t) fail('المعلم غير صحيح');
            if ((int)$t['school_id'] !== (int)$school) fail('المعلم من مدرسة أخرى');
        }
        $teacher = $tids[0] ?? null;                                          // المعلم الأساسي (للتوافق)
        foreach ($parents as $pid) {
            $pr = q("SELECT school_id FROM users WHERE id=? AND role='parent'", [$pid])->fetch();
            if (!$pr) fail('ولي أمر غير صحيح');
            if ($sa && (int)$pr['school_id'] !== (int)$school) fail('ولي أمر من مدرسة أخرى');
        }
        $old = $id ? q('SELECT * FROM students WHERE id=?', [$id])->fetch() : null;
        if ($id && !$old) fail('الطالب غير موجود', 404);
        if ($old && !mgrOwns($me, $old['school_id'])) fail('غير مصرح', 403);
        if (!$old) {                                                          // حدّ الطلاب في باقة الحلقة
            $mx = (int)q('SELECT max_students FROM schools WHERE id=?', [$school])->fetchColumn();
            if ($mx && (int)q('SELECT COUNT(*) FROM students WHERE school_id=?', [$school])->fetchColumn() >= $mx) fail('بلغت الحلقة الحد الأقصى المسموح من الطلاب (' . $mx . ')');
        }
        if ($id) q('UPDATE students SET name=?, school_id=?, teacher_id=?, grp=?, program=?, hafiz=?, hafiz_where=?, hafiz_note=? WHERE id=?', [$name, $school, $teacher, $grp, $program, $hafiz, $hw, $hn, $id]);
        else { q('INSERT INTO students (name,school_id,teacher_id,grp,program,hafiz,hafiz_where,hafiz_note) VALUES (?,?,?,?,?,?,?,?)', [$name, $school, $teacher, $grp, $program, $hafiz, $hw, $hn]); $id = (int)db()->lastInsertId(); }
        q('DELETE FROM student_teacher WHERE student_id=?', [$id]);
        foreach ($tids as $tid) q('INSERT INTO student_teacher (student_id,teacher_id) VALUES (?,?)', [$id, $tid]);
        q('DELETE FROM parent_student WHERE student_id=?', [$id]);
        foreach ($parents as $pid) q('INSERT INTO parent_student (parent_id,student_id) VALUES (?,?)', [$pid, $id]);
        if (!$old) foreach ($priors as $pl) {            // قراءات / روايات أتمّها قبل الالتحاق
            $k = array_values(array_filter(array_map('strval', is_array($pl['riwayat'] ?? null) ? $pl['riwayat'] : []), fn($x) => in_array($x, RIWAYAT, true)));
            $kd = $pl['kind'] ?? ''; $lb = mb_substr(trim((string)($pl['label'] ?? '')), 0, 200);
            if (!$k || $lb === '' || !in_array($kd, ['riwaya', 'qiraa', 'jam'], true)) continue;
            q("INSERT INTO enrollments (student_id,kind,riwayat,label,status,prior,shaykh,created_by) VALUES (?,?,?,?,'completed',1,?,?)", [$id, $kd, implode(',', $k), $lb, str('prior_where', 160), $me['id']]);
        }
        $schoolNm = (string)q('SELECT name FROM schools WHERE id=?', [$school])->fetchColumn(); $invites = [];
        foreach ($newPar as [$pn, $pe, $pph]) {
            $ex = q('SELECT id,role,school_id FROM users WHERE email=? OR username=?', [$pe, $pe])->fetch();
            if ($ex) { if ($ex['role'] !== 'parent' || (int)$ex['school_id'] !== (int)$school) fail('البريد ' . $pe . ' مستخدم لحساب آخر'); $pidn = (int)$ex['id']; }
            else {
                q("INSERT INTO users (username,name,role,school_id,email,phone,pass_hash,must_change) VALUES (?,?,'parent',?,?,?,?,0)", [$pe, $pn, $school, $pe, $pph, password_hash(genPass(), PASSWORD_DEFAULT)]);
                $pidn = (int)db()->lastInsertId(); $invites[] = [$pe, $pn];
            }
            q('INSERT IGNORE INTO parent_student (parent_id,student_id) VALUES (?,?)', [$pidn, $id]);
        }
        foreach ($invites as [$pe, $pn]) sendInviteMail($pe, $pn, 'parent', $schoolNm, [$name]);
        // حساب الطالب (اختياري)
        $uid = $old ? (int)$old['user_id'] : 0; $cred = null;
        if ($login !== '') {
            uniqueUsername($login, $uid);
            if ($uid) q('UPDATE users SET username=?, name=?, school_id=? WHERE id=?', [$login, $name, $school, $uid]);
            else {
                $pw = genPass();
                q("INSERT INTO users (username,name,role,school_id,pass_hash,must_change) VALUES (?,?,'student',?,?,1)", [$login, $name, $school, password_hash($pw, PASSWORD_DEFAULT)]);
                $uid = (int)db()->lastInsertId();
                $cred = ['username' => $login, 'password' => $pw];
            }
            q('UPDATE students SET user_id=? WHERE id=?', [$uid, $id]);
        } elseif ($uid) {
            q('DELETE FROM users WHERE id=?', [$uid]); q('UPDATE students SET user_id=NULL WHERE id=?', [$id]);
        }
        out(['id' => $id, 'login' => $cred]);
    }
    case 'student_delete': {
        $me = need('admin', 'school_admin'); $id = (int)(body()['id'] ?? 0);
        $s = q('SELECT user_id,school_id FROM students WHERE id=?', [$id])->fetch();
        if (!$s) fail('الطالب غير موجود', 404);
        if (!mgrOwns($me, $s['school_id'])) fail('غير مصرح', 403);
        foreach (['records', 'messages', 'message_reads', 'parent_student', 'certificates', 'enrollments', 'student_teacher'] as $t) q("DELETE FROM $t WHERE student_id=?", [$id]);
        if ($s['user_id']) q('DELETE FROM users WHERE id=?', [$s['user_id']]);
        q('DELETE FROM students WHERE id=?', [$id]);
        audit('student_delete', '', 'student:' . $id);
        out(['ok' => true]);
    }

    /* ----- الشهادات ----- */
    case 'cert_issue': {
        $u = need('admin', 'school_admin', 'teacher'); $b = body(); $sid = (int)($b['studentId'] ?? 0);
        $s = q('SELECT s.*, sc.name AS school FROM students s LEFT JOIN schools sc ON sc.id=s.school_id WHERE s.id=?', [$sid])->fetch();
        if (!$s || !canSee($u, $sid)) fail('الطالب غير موجود', 404);
        $kind = $b['kind'] ?? ''; if (!in_array($kind, ['khatm', 'period', 'custom', 'qiraat'], true)) fail('نوع الشهادة غير صحيح');
        $title = str('title', 160); $enrId = null; $label = '';
        if ($kind === 'khatm') {
            if (!memorizedAll($sid)) fail('لم يُتمّ الطالب حفظ المصحف كاملاً بعد');
            if ($title === '') $title = 'شهادة ختم حفظ القرآن الكريم';
        } elseif ($kind === 'qiraat') {
            $e = q('SELECT * FROM enrollments WHERE id=? AND student_id=?', [(int)($b['enrollmentId'] ?? 0), $sid])->fetch();
            if (!$e) fail('اختر الختمة');
            if ($e['status'] !== 'completed') fail('لم تكتمل هذه الختمة بعد');
            $enrId = (int)$e['id']; $label = $e['label'];
            if ($title === '') $title = 'شهادة إتمام قراءة ختمة كاملة';
        } elseif ($title === '') $title = $kind === 'period' ? 'شهادة تفوق وإنجاز' : 'شهادة تقدير';
        $pf = validDate($b['period_from'] ?? null); $pt = validDate($b['period_to'] ?? null);
        if ($kind === 'period' && (!$pf || !$pt || $pf > $pt)) fail('حدد فترة صحيحة (من / إلى)');
        $grade = (string)($b['grade'] ?? ''); if ($grade !== '' && !in_array($grade, GRADES, true)) fail('تقدير غير صحيح');
        $date = validDate($b['date'] ?? null) ?: date('Y-m-d');
        $al = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        do { $serial = 'TH-' . date('Y') . '-'; for ($i = 0; $i < 6; $i++) $serial .= $al[random_int(0, strlen($al) - 1)]; }
        while (q('SELECT 1 FROM certificates WHERE serial=?', [$serial])->fetchColumn());
        q('INSERT INTO certificates (serial,student_id,student_name,school_name,kind,title,enrollment_id,riwaya_label,period_from,period_to,grade,note,issued_by,issuer_name,issued_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [$serial, $sid, $s['name'], $s['school'] ?? '', $kind, $title, $enrId, $label, $kind === 'period' ? $pf : null, $kind === 'period' ? $pt : null, $grade, str('note', 300), $u['id'], $u['name'], $date]);
        out(['cert' => certOut(q('SELECT * FROM certificates WHERE id=?', [(int)db()->lastInsertId()])->fetch())]);
    }
    case 'cert_delete': {
        $u = need('admin', 'school_admin'); $cid = (int)(body()['id'] ?? 0);
        $sid = (int)q('SELECT student_id FROM certificates WHERE id=?', [$cid])->fetchColumn();
        if (!$sid || !canSee($u, $sid)) fail('غير مصرح', 403);
        q('DELETE FROM certificates WHERE id=?', [$cid]);
        out(['ok' => true]);
    }
    case 'cert_verify': {   // عام: يتطلب رقم الشهادة فقط
        if ((int)q("SELECT COUNT(*) FROM login_attempts WHERE ip=? AND username='verify' AND at > NOW() - INTERVAL 15 MINUTE", [ip()])->fetchColumn() >= 40) fail('محاولات كثيرة، حاول لاحقاً', 429);
        q("INSERT INTO login_attempts (ip,username) VALUES (?, 'verify')", [ip()]);
        $c = q('SELECT * FROM certificates WHERE serial=?', [strtoupper(trim((string)($_GET['code'] ?? '')))])->fetch();
        out($c ? ['valid' => true, 'cert' => certOut($c)] : ['valid' => false]);
    }

    case 'set_qiraat': {
        $u = need('admin', 'school_admin', 'teacher');
        q('UPDATE users SET qiraat=? WHERE id=?', [!empty(body()['on']) ? 1 : 0, $u['id']]);
        out(['ok' => true]);
    }
    case 'student_hafiz': {          // تعليم الطالب «أتمّ حفظ المصحف» وأين أتمّه
        $u = need('admin', 'school_admin', 'teacher'); $b = body(); $sid = (int)($b['id'] ?? 0);
        $stu = q('SELECT * FROM students WHERE id=?', [$sid])->fetch();
        if (!$stu || !canSee($u, $sid)) fail('غير مصرح', 403);
        $h = !empty($b['hafiz']) ? 1 : 0;
        if (!$h && $stu['program'] === 'qiraat') fail('طالب برنامج القراءات يجب أن يبقى حافظاً');
        q('UPDATE students SET hafiz=?, hafiz_where=?, hafiz_note=? WHERE id=?', [$h, str('where', 160), str('note', 300), $sid]);
        out(['ok' => true]);
    }
    case 'enrollment_save': {
        $u = need('admin', 'school_admin', 'teacher'); $b = body(); $id = (int)($b['id'] ?? 0); $sid = (int)($b['studentId'] ?? 0);
        $s = q('SELECT * FROM students WHERE id=?', [$sid])->fetch();
        if (!$s || !canSee($u, $sid)) fail('الطالب غير موجود', 404);
        if (!qiraatAllowedFor($u, $sid)) fail('فعّل القراءات من «إعدادات القراءات» أولاً');
        $sd = validDate($b['started_at'] ?? null); $cd = validDate($b['completed_at'] ?? null); $shaykh = str('shaykh', 160); $note = str('note', 300);
        if ($id) {                                    // تعديل بيانات برنامج قائم
            $e = q('SELECT * FROM enrollments WHERE id=? AND student_id=?', [$id, $sid])->fetch();
            if (!$e) fail('البرنامج غير موجود', 404);
            $status = in_array($b['status'] ?? '', ['active', 'completed'], true) ? $b['status'] : $e['status'];
            $done = $status === 'completed' ? ($cd ?: $e['completed_at'] ?: date('Y-m-d')) : null;
            q('UPDATE enrollments SET status=?, started_at=?, completed_at=?, shaykh=?, note=? WHERE id=?', [$status, $sd, $done, $shaykh, $note, $id]);
        } else {
            $prior = !empty($b['prior']) ? 1 : 0;
            $kind = $b['kind'] ?? ''; if (!in_array($kind, ['riwaya', 'qiraa', 'jam'], true)) fail('نوع البرنامج غير صحيح');
            $keys = array_values(array_unique(array_map('strval', is_array($b['riwayat'] ?? null) ? $b['riwayat'] : [])));
            foreach ($keys as $k) if (!in_array($k, RIWAYAT, true)) fail('رواية غير صحيحة');
            if ($kind === 'riwaya' && count($keys) !== 1) fail('اختر رواية واحدة');
            if ($kind === 'qiraa' && (count($keys) < 1 || count($keys) > 2)) fail('اختر قراءة صحيحة');
            if ($kind === 'jam' && count($keys) < 2) fail('اختر روايتين على الأقل للجمع');
            $label = str('label', 200); if ($label === '') fail('اسم البرنامج مطلوب');
            if (!$prior && !$s['hafiz'] && !memorizedAll($sid)) fail('لا يُسجَّل في برنامج القراءات إلا من أتمّ حفظ المصحف — علّم الطالب «أتمّ حفظ المصحف» أولاً');
            q('INSERT INTO enrollments (student_id,kind,riwayat,label,status,prior,started_at,completed_at,shaykh,note,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                [$sid, $kind, implode(',', $keys), $label, $prior ? 'completed' : 'active', $prior, $sd, $prior ? $cd : null, $shaykh, $note, $u['id']]);
            $id = (int)db()->lastInsertId();
        }
        out(['enrollment' => enrOut(q('SELECT * FROM enrollments WHERE id=?', [$id])->fetch())]);
    }
    case 'enrollment_delete': {
        $u = need('admin', 'school_admin', 'teacher'); $id = (int)(body()['id'] ?? 0);
        $e = q('SELECT * FROM enrollments WHERE id=?', [$id])->fetch();
        if (!$e || !canSee($u, (int)$e['student_id'])) fail('غير مصرح', 403);
        $n = (int)q("SELECT COUNT(*) FROM records WHERE enrollment_id=?", [$id])->fetchColumn();
        if ($n && $u['role'] === 'teacher') fail('لا يحذف البرنامج الذي له تسميع إلا مدير المدرسة');
        q('DELETE FROM records WHERE enrollment_id=?', [$id]);
        q('DELETE FROM enrollments WHERE id=?', [$id]);
        out(['ok' => true]);
    }

    /* ----- طلبات التسجيل ----- */
    case 'signup_token':
        if (cfgv('reg_open') !== '1') fail('التسجيل الجديد متوقف حالياً', 403);
        out(['tk' => time()]);

    case 'signup_request': {
        $b = body();
        if (!empty($b['website'])) out(['ok' => true]);                       // فخ للروبوتات (حقل مخفي)
        if (cfgv('reg_open') !== '1') fail('التسجيل الجديد متوقف حالياً', 403);
        $tk = (int)($b['tk'] ?? 0);
        if ($tk <= 0 || time() - $tk < 3 || time() - $tk > 172800) fail('أعد المحاولة');
        if ((int)q('SELECT COUNT(*) FROM signup_requests WHERE ip=? AND created_at > NOW() - INTERVAL 1 HOUR', [ip()])->fetchColumn() >= 3)
            fail('وصلتنا طلباتك، انتظر الموافقة', 429);
        if ((int)q('SELECT COUNT(*) FROM signup_requests')->fetchColumn() >= 300) fail('الطلبات ممتلئة حالياً، تواصل مع الإدارة', 429);
        $role = $b['role'] ?? ''; if (!in_array($role, ['solo', 'school'], true)) fail('نوع التسجيل غير صحيح');
        $name = str('name', 120); $email = strtolower(str('email', 190)); $un = $email; $phone = preg_replace('/[^\d+]/', '', str('phone', 30));
        $pw = (string)($b['password'] ?? ''); $sname = str('school_name', 120); $school = null; $children = '';
        if ($name === '') fail('الاسم مطلوب');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('اكتب بريداً إلكترونياً صحيحاً');
        if (mb_strlen($pw) < 6) fail('كلمة المرور 6 أحرف على الأقل');
        uniqueUsername($un);
        if (q('SELECT 1 FROM users WHERE email=?', [$email])->fetchColumn()) fail('هذا البريد مسجّل من قبل');
        if (q('SELECT 1 FROM signup_requests WHERE username=? OR email=?', [$un, $email])->fetchColumn()) fail('يوجد طلب بهذا البريد قيد المراجعة');
        if ($role === 'school' && $sname === '') fail('اكتب اسم المدرسة');
        q('INSERT INTO signup_requests (role,name,username,email,phone,pass_hash,school_id,school_name,children,ip) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [$role, $name, $un, $email, $phone, password_hash($pw, PASSWORD_DEFAULT), $school, $sname, $children, ip()]);
        out(['ok' => true]);
    }
    case 'request_approve': {
        $me = need('admin', 'school_admin'); $id = (int)(body()['id'] ?? 0);
        $rq = q('SELECT * FROM signup_requests WHERE id=?', [$id])->fetch();
        if (!$rq) fail('الطلب غير موجود', 404);
        if ($me['role'] === 'school_admin' && (in_array($rq['role'], ['school', 'solo'], true) || !mgrOwns($me, $rq['school_id']))) fail('غير مصرح', 403);
        uniqueUsername($rq['username']);
        if (!empty($rq['email']) && q('SELECT 1 FROM users WHERE email=?', [$rq['email']])->fetchColumn()) fail('البريد مسجّل لحساب آخر');
        if ($rq['role'] === 'parent' && !array_filter(array_map('intval', is_array(body()['student_ids'] ?? null) ? body()['student_ids'] : []))) fail('اربط ولي الأمر بطالب واحد على الأقل قبل الموافقة');
        $role = $rq['role']; $school = $rq['school_id'];
        $solo = 0;
        if ($role === 'school' || $role === 'solo') {   // مدرسة جديدة أو معلم مستقل (حلقته مدرسة قائمة بذاتها) — يوافق عليها مدير النظام فقط
            q('INSERT INTO schools (name) VALUES (?)', [$rq['school_name'] ?: ('حلقة ' . $rq['name'])]);
            $school = (int)db()->lastInsertId(); $solo = $role === 'solo' ? 1 : 0; $role = 'school_admin';
        }
        q('INSERT INTO users (username,name,role,school_id,email,phone,pass_hash,solo,must_change) VALUES (?,?,?,?,?,?,?,?,0)', [$rq['username'], $rq['name'], $role, $school, $rq['email'] ?: null, $rq['phone'] ?: null, $rq['pass_hash'], $solo]);
        $uid = (int)db()->lastInsertId();
        if ($role === 'parent') {
            $sids = array_map('intval', is_array(body()['student_ids'] ?? null) ? body()['student_ids'] : []);
            foreach ($sids as $sid) if (q('SELECT 1 FROM students WHERE id=? AND school_id=?', [$sid, $school])->fetchColumn()) q('INSERT IGNORE INTO parent_student (parent_id,student_id) VALUES (?,?)', [$uid, $sid]);
        }
        q('DELETE FROM signup_requests WHERE id=?', [$id]);
        audit('request_approve', $rq['username'], 'request:' . $id);
        if (!empty($rq['email'])) sendApprovedMail($rq['email'], $rq['name'], $rq['role'] === 'solo' ? 'معلم مستقل' : ($rq['role'] === 'school' ? 'مدرسة' : 'حساب جديد'));
        out(['id' => $uid]);
    }
    case 'request_reject': {
        $me = need('admin', 'school_admin'); $id = (int)(body()['id'] ?? 0);
        $rq = q('SELECT role,school_id FROM signup_requests WHERE id=?', [$id])->fetch();
        if ($rq && $me['role'] === 'school_admin' && (in_array($rq['role'], ['school', 'solo'], true) || !mgrOwns($me, $rq['school_id']))) fail('غير مصرح', 403);
        q('DELETE FROM signup_requests WHERE id=?', [$id]);
        audit('request_reject', '', 'request:' . $id);
        out(['ok' => true]);
    }

    /* ----- الدخول برمز على البريد (OTP) ----- */
    case 'otp_send': {
        $b = body(); $ch = (string)($b['channel'] ?? 'email'); $email = strtolower(str('email', 190)); $phone = preg_replace('/\D/', '', str('phone', 30));
        $ttl = max(3, min(30, (int)cfgv('otp_ttl'))); $cool = max(20, min(600, (int)cfgv('otp_cooldown'))); $hl = max(2, min(30, (int)cfgv('otp_hour_limit')));
        if ($ch === 'email') {
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('اكتب بريداً إلكترونياً صحيحاً');
            if (cfgv('login_otp_email') !== '1' || cfgv('smtp_enabled') !== '1') fail('الدخول برمز البريد غير متاح حالياً', 503);
            $ident = $email;
        } elseif ($ch === 'wa' || $ch === 'sms') {
            if (strlen($phone) < 8) fail('اكتب رقم جوال صحيحاً');
            if (cfgv("login_otp_$ch") !== '1' || cfgv("gw_{$ch}_on") !== '1') fail('هذه الطريقة غير متاحة حالياً', 503);
            $ident = 'tel:' . substr($phone, -9);
        } else fail('طريقة غير صحيحة');
        q('DELETE FROM otp_codes WHERE created_at < NOW() - INTERVAL 1 DAY');
        if ((int)q('SELECT COUNT(*) FROM otp_codes WHERE ip=? AND created_at > NOW() - INTERVAL 1 HOUR', [ip()])->fetchColumn() >= 15) fail('محاولات كثيرة، حاول لاحقاً', 429);
        $last = q('SELECT created_at FROM otp_codes WHERE email=? ORDER BY id DESC LIMIT 1', [$ident])->fetch();
        if ($last && time() - strtotime($last['created_at']) < $cool) out(['ok' => true, 'wait' => $cool - (time() - strtotime($last['created_at']))]);
        if ((int)q('SELECT COUNT(*) FROM otp_codes WHERE email=? AND created_at > NOW() - INTERVAL 1 HOUR', [$ident])->fetchColumn() >= $hl) fail('تجاوزت عدد الرموز المسموح به في الساعة', 429);
        $u = $ch === 'email' ? (q('SELECT * FROM users WHERE email=? AND active=1', [$email])->fetch() ?: null) : userByPhone($phone);
        $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        // نسجّل المحاولة حتى لو الحساب غير موجود (تحديد المعدل) ولا نكشف وجوده من عدمه
        q('INSERT INTO otp_codes (email,code_hash,expires_at,ip) VALUES (?,?, NOW() + INTERVAL ' . $ttl . ' MINUTE, ?)', [$ident, otpHash($code), ip()]);
        if ($u) { if ($ch === 'email') sendOtpMail($email, $u['name'], $code, $ttl); else gatewaySend($ch, $u['phone'], otpText($code, $ttl)); }
        else usleep(random_int(500000, 1100000));
        out(['ok' => true, 'wait' => $cool]);
    }
    case 'otp_verify': {
        $b = body(); $ch = (string)($b['channel'] ?? 'email'); $email = strtolower(str('email', 190)); $phone = preg_replace('/\D/', '', str('phone', 30));
        $code = preg_replace('/\D/', '', (string)($b['code'] ?? '')); $maxA = max(3, min(10, (int)cfgv('otp_max_attempts')));
        if (strlen($code) !== 6) fail('الرمز غير صحيح');
        if ($ch === 'email') { if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('الرمز غير صحيح'); $ident = $email; }
        elseif ($ch === 'wa' || $ch === 'sms') { if (strlen($phone) < 8) fail('الرمز غير صحيح'); $ident = 'tel:' . substr($phone, -9); }
        else fail('طريقة غير صحيحة');
        if ((int)q("SELECT COUNT(*) FROM login_attempts WHERE ip=? AND username='otp' AND at > NOW() - INTERVAL 15 MINUTE", [ip()])->fetchColumn() >= 30) fail('محاولات كثيرة، حاول بعد 15 دقيقة', 429);
        $row = q('SELECT * FROM otp_codes WHERE email=? AND used=0 AND expires_at > NOW() ORDER BY id DESC LIMIT 1', [$ident])->fetch();
        $bad = function () use ($row) {
            q("INSERT INTO login_attempts (ip,username) VALUES (?, 'otp')", [ip()]);
            if ($row) q('UPDATE otp_codes SET attempts=attempts+1 WHERE id=?', [$row['id']]);
            fail('الرمز غير صحيح أو منتهي', 401);
        };
        if (!$row || (int)$row['attempts'] >= $maxA || !hash_equals($row['code_hash'], otpHash($code))) $bad();
        $u = $ch === 'email' ? (q('SELECT * FROM users WHERE email=? AND active=1', [$email])->fetch() ?: null) : userByPhone($phone);
        if (!$u) $bad();
        if ($u['role'] !== 'admin' && ($why = schoolBlocked($u['school_id'] ? (int)$u['school_id'] : null))) fail($why, 403);
        q('UPDATE otp_codes SET used=1 WHERE id=?', [$row['id']]);
        session_regenerate_id(true);
        $_SESSION['uid'] = (int)$u['id'];
        if (!empty($b['remember']))
            setcookie(session_name(), session_id(), ['expires' => time() + 2592000, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
        q('UPDATE users SET last_login=NOW() WHERE id=?', [$u['id']]);
        if (in_array($u['role'], ['admin', 'school_admin'], true)) audit('login_otp', $u['username'], 'user:' . $u['id']);
        out(['ok' => true]);
    }

    /* ----- إعدادات البريد (مدير النظام فقط) ----- */
    case 'mail_get': {
        need('admin'); $c = mailCfg();
        out(['cfg' => ['enabled' => $c['enabled'], 'host' => $c['host'], 'port' => $c['port'], 'secure' => $c['secure'], 'user' => $c['user'], 'has_pass' => $c['pass'] !== '',
                'from_email' => $c['from_email'], 'from_name' => $c['from_name'], 'site_url' => $c['site_url']],
            'log' => array_map(fn($r) => ['id' => (int)$r['id'], 'to' => $r['to_email'], 'subject' => $r['subject'], 'kind' => $r['kind'], 'status' => $r['status'], 'error' => $r['error'] ?? '', 'at' => iso($r['created_at'])],
                q('SELECT * FROM mail_log ORDER BY id DESC LIMIT 25')->fetchAll())]);
    }
    case 'mail_save': {
        need('admin'); $b = body();
        $host = str('host', 190); $port = (int)($b['port'] ?? 465); $sec = in_array($b['secure'] ?? '', ['ssl', 'tls', 'none'], true) ? $b['secure'] : 'ssl';
        $user = str('user', 190); $from = strtolower(str('from_email', 190)); $fname = str('from_name', 80) ?: 'متابعة التحفيظ'; $site = rtrim(str('site_url', 190), '/');
        if ($host === '' || $port < 1 || $port > 65535) fail('عنوان الخادم أو المنفذ غير صحيح');
        if ($user === '') fail('اسم مستخدم SMTP مطلوب');
        if (!filter_var($from, FILTER_VALIDATE_EMAIL)) fail('بريد المرسِل غير صحيح');
        if ($site !== '' && !preg_match('#^https?://[^\s]+$#i', $site)) fail('رابط الموقع غير صحيح');
        foreach (['smtp_enabled' => !empty($b['enabled']) ? '1' : '0', 'smtp_host' => $host, 'smtp_port' => (string)$port, 'smtp_secure' => $sec, 'smtp_user' => $user,
                  'mail_from_email' => $from, 'mail_from_name' => $fname, 'site_url' => $site ?: 'https://tahfidh.ipickhost.com'] as $k => $v) setSetting($k, $v);
        $pass = (string)($b['pass'] ?? ''); if ($pass !== '') setSetting('smtp_pass', encSecret($pass));
        audit('mail_save', $host . ':' . $port . ' ' . $user . ($pass !== '' ? ' (password changed)' : ''));
        out(['ok' => true]);
    }
    case 'mail_test': {
        need('admin'); $to = strtolower(str('to', 190));
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) fail('اكتب بريداً صحيحاً للتجربة');
        out(sendTestMail($to));
    }

    /* ----- معلومات عامة قبل الدخول (الشارة، طرق الدخول، التسجيل) ----- */
    case 'site_info':
        out(['brand' => ['name' => cfgv('platform_name'), 'tagline' => cfgv('platform_tagline'), 'logo' => cfgv('platform_logo')], 'beta' => ['badge' => cfgv('beta_badge'), 'note' => cfgv('beta_note')], 'reg_open' => cfgv('reg_open') === '1',
            'methods' => ['password' => cfgv('login_password') === '1', 'email' => cfgv('login_otp_email') === '1' && cfgv('smtp_enabled') === '1',
                'wa' => cfgv('login_otp_wa') === '1' && cfgv('gw_wa_on') === '1', 'sms' => cfgv('login_otp_sms') === '1' && cfgv('gw_sms_on') === '1']]);

    /* ----- لوحة تحكم مدير النظام ----- */
    case 'admin_overview': {
        need('admin'); $n = fn($sql, $p = []) => (int)q($sql, $p)->fetchColumn();
        out(['counts' => [
            'schools' => $n("SELECT COUNT(*) FROM schools s WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.school_id=s.id AND u.solo=1)"),
            'solo' => $n('SELECT COUNT(*) FROM users WHERE solo=1'), 'teachers' => $n("SELECT COUNT(*) FROM users WHERE role='teacher'"),
            'parents' => $n("SELECT COUNT(*) FROM users WHERE role='parent'"), 'students' => $n('SELECT COUNT(*) FROM students'),
            'hafiz' => $n('SELECT COUNT(*) FROM students WHERE hafiz=1'), 'qiraat' => $n("SELECT COUNT(*) FROM enrollments WHERE status='active' AND prior=0"),
            'rec_today' => $n('SELECT COUNT(*) FROM records WHERE rec_date=CURDATE()'), 'rec_week' => $n('SELECT COUNT(*) FROM records WHERE rec_date >= CURDATE() - INTERVAL 6 DAY'),
            'rec_month' => $n('SELECT COUNT(*) FROM records WHERE rec_date >= CURDATE() - INTERVAL 29 DAY'),
            'active7' => $n('SELECT COUNT(*) FROM users WHERE last_login >= NOW() - INTERVAL 7 DAY'), 'pending' => $n('SELECT COUNT(*) FROM signup_requests'),
            'certs' => $n('SELECT COUNT(*) FROM certificates'), 'msgs7' => $n('SELECT COUNT(*) FROM messages WHERE created_at >= NOW() - INTERVAL 7 DAY'),
        ], 'mail24' => ['sent' => $n("SELECT COUNT(*) FROM mail_log WHERE status='sent' AND created_at >= NOW() - INTERVAL 1 DAY"), 'failed' => $n("SELECT COUNT(*) FROM mail_log WHERE status='failed' AND created_at >= NOW() - INTERVAL 1 DAY")],
        'top' => q("SELECT s.id,s.name,COUNT(r.id) n FROM schools s JOIN students st ON st.school_id=s.id JOIN records r ON r.student_id=st.id AND r.rec_date >= CURDATE() - INTERVAL 29 DAY GROUP BY s.id,s.name ORDER BY n DESC LIMIT 5")->fetchAll(),
        'expiring' => q("SELECT id,name,expires_at FROM schools WHERE expires_at IS NOT NULL AND expires_at <= CURDATE() + INTERVAL 14 DAY ORDER BY expires_at LIMIT 10")->fetchAll(),
        'suspended' => $n('SELECT COUNT(*) FROM schools WHERE active=0')]);
    }
    case 'settings_get': {
        need('admin'); $g = fn(array $ks) => array_combine($ks, array_map('cfgv', $ks));
        $gw = fn($c) => ['on' => cfgv("gw_{$c}_on") === '1', 'url' => cfgv("gw_{$c}_url"), 'method' => cfgv("gw_{$c}_method"), 'body' => cfgv("gw_{$c}_body"), 'has_headers' => decSecret(cfgv("gw_{$c}_headers")) !== ''];
        out(['auth' => $g(['reg_open', 'login_password', 'login_otp_email', 'login_otp_wa', 'login_otp_sms', 'otp_ttl', 'otp_max_attempts', 'otp_cooldown', 'otp_hour_limit', 'otp_message', 'phone_cc']),
            'platform' => $g(['platform_name', 'platform_tagline', 'platform_logo', 'beta_badge', 'beta_note', 'week_start', 'announce_on', 'announce_title', 'announce_text', 'announce_audience']), 'wa' => $gw('wa'), 'sms' => $gw('sms')]);
    }
    case 'settings_save': {
        need('admin'); $b = body(); $grp = (string)($b['group'] ?? ''); $v = is_array($b['values'] ?? null) ? $b['values'] : [];
        $bool = fn($k) => !empty($v[$k]) ? '1' : '0'; $int = fn($k, $lo, $hi, $d) => (string)max($lo, min($hi, (int)($v[$k] ?? $d)));
        $txt = fn($k, $n) => mb_substr(trim((string)($v[$k] ?? '')), 0, $n);
        if ($grp === 'auth') {
            $set = ['reg_open' => $bool('reg_open'), 'login_password' => $bool('login_password'), 'login_otp_email' => $bool('login_otp_email'), 'login_otp_wa' => $bool('login_otp_wa'), 'login_otp_sms' => $bool('login_otp_sms'),
                'otp_ttl' => $int('otp_ttl', 3, 30, 10), 'otp_max_attempts' => $int('otp_max_attempts', 3, 10, 5), 'otp_cooldown' => $int('otp_cooldown', 20, 600, 60), 'otp_hour_limit' => $int('otp_hour_limit', 2, 30, 6),
                'otp_message' => $txt('otp_message', 300) ?: SETTING_DEFAULTS['otp_message'], 'phone_cc' => preg_replace('/\D/', '', $txt('phone_cc', 5)) ?: '966'];
            if (strpos($set['otp_message'], '{code}') === false) fail('نص الرسالة يجب أن يحتوي {code}');
        } elseif ($grp === 'platform') {
            $aud = in_array($v['announce_audience'] ?? '', ['all', 'staff', 'parents'], true) ? $v['announce_audience'] : 'all';
            $logo = (string)($v['platform_logo'] ?? 'keep');
            if ($logo !== 'keep' && $logo !== '' && (!str_starts_with($logo, 'data:image/') || strlen($logo) > 400000)) fail('الشعار غير صالح');
            $set = ['platform_name' => $txt('platform_name', 40) ?: 'سَنَد', 'platform_tagline' => $txt('platform_tagline', 90)];
            if ($logo !== 'keep') $set['platform_logo'] = $logo;
            $set += ['beta_badge' => $txt('beta_badge', 80), 'beta_note' => $txt('beta_note', 400), 'week_start' => $int('week_start', 0, 6, 6),
                'announce_on' => $bool('announce_on'), 'announce_title' => $txt('announce_title', 100), 'announce_text' => $txt('announce_text', 600), 'announce_audience' => $aud];
        } elseif ($grp === 'wa' || $grp === 'sms') {
            $m = strtoupper($v['method'] ?? 'POST') === 'GET' ? 'GET' : 'POST'; $url = $txt('url', 500);
            if ($url !== '' && !preg_match('#^https?://[^\s]+$#i', $url)) fail('رابط البوابة غير صحيح');
            $set = ["gw_{$grp}_on" => $bool('on'), "gw_{$grp}_url" => $url, "gw_{$grp}_method" => $m, "gw_{$grp}_body" => mb_substr((string)($v['body'] ?? ''), 0, 2000)];
            $hd = (string)($v['headers'] ?? ''); if (!empty($v['clear_headers'])) $set["gw_{$grp}_headers"] = ''; elseif (trim($hd) !== '') $set["gw_{$grp}_headers"] = encSecret(mb_substr($hd, 0, 2000));
        } else fail('مجموعة غير معروفة');
        foreach ($set as $k => $val) setSetting($k, (string)$val);
        audit('settings_save', $grp);
        out(['ok' => true]);
    }
    case 'gateway_test': {
        need('admin'); $ch = (string)(body()['channel'] ?? ''); $to = str('to', 30);
        if (strlen(preg_replace('/\D/', '', $to)) < 8) fail('اكتب رقم جوال صحيحاً للتجربة');
        out(gatewaySend($ch, $to, 'رسالة تجربة من ' . cfgv('platform_name') . ' ✅'));
    }
    case 'audit_list': {
        need('admin');
        out(['log' => array_map(fn($r) => ['id' => (int)$r['id'], 'user' => $r['username'], 'role' => $r['role'], 'action' => $r['action'], 'target' => $r['target'], 'detail' => $r['detail'], 'ip' => $r['ip'], 'at' => iso($r['created_at'])],
            q('SELECT * FROM audit_log ORDER BY id DESC LIMIT 100')->fetchAll())]);
    }
    case 'backup_export': {
        need('admin'); audit('backup_export');
        $t = fn($sql) => q($sql)->fetchAll(); $strip = fn($rows, $drop) => array_map(function ($r) use ($drop) { foreach ($drop as $d) unset($r[$d]); return $r; }, $rows);
        out(['app' => 'tahfidh', 'exported_at' => date('c'), 'tables' => [
            'schools' => $t('SELECT * FROM schools'), 'users' => $strip($t('SELECT * FROM users'), ['pass_hash']), 'students' => $t('SELECT * FROM students'),
            'student_teacher' => $t('SELECT * FROM student_teacher'), 'parent_student' => $t('SELECT * FROM parent_student'), 'enrollments' => $t('SELECT * FROM enrollments'),
            'records' => $t('SELECT * FROM records'), 'certificates' => $t('SELECT * FROM certificates'), 'messages' => $t('SELECT * FROM messages')]]);
    }

    default: fail('مسار غير معروف', 404);
    }
} catch (PDOException $e) {
    error_log('tahfidh db: ' . $e->getMessage());
    fail('خطأ في الخادم', 500);
}
