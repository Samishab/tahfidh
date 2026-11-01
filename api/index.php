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

function user(): ?array {
    static $u = false;
    if ($u === false) {
        $u = null;
        if (!empty($_SESSION['uid'])) $u = q('SELECT * FROM users WHERE id=? AND active=1', [$_SESSION['uid']])->fetch() ?: null;
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
        'teacher' => ["$col IN (SELECT id FROM students WHERE teacher_id=?)", [$u['id']]],
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
    $rows = $enr ? q("SELECT surah,ayah_from,ayah_to FROM records WHERE student_id=? AND type='qiraa' AND enrollment_id=?", [$sid, $enr])->fetchAll()
        : q("SELECT surah,ayah_from,ayah_to FROM records WHERE student_id=? AND type='hifz' AND enrollment_id IS NULL", [$sid])->fetchAll();
    foreach ($rows as $r)
        for ($i = $off[$r['surah'] - 1] + $r['ayah_from']; $i <= $off[$r['surah'] - 1] + $r['ayah_to']; $i++) $m[$i - 1] = true;
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
        'surah' => (int)$r['surah'], 'from' => (int)$r['ayah_from'], 'to' => (int)$r['ayah_to'], 'grade' => $r['grade'],
        'note' => $r['note'] ?? '', 'by' => $r['by_name'] ?? '', 'riwaya' => $r['riwaya'] ?? 'hafs', 'enrollmentId' => !empty($r['enrollment_id']) ? (int)$r['enrollment_id'] : null];
}
function msgOut(array $m): array {
    return ['id' => (int)$m['id'], 'studentId' => (int)$m['student_id'], 'senderId' => (int)$m['sender_id'],
        'senderName' => $m['sname'] ?? 'محذوف', 'senderRole' => $m['srole'] ?? '', 'body' => $m['body'], 'at' => iso($m['created_at'])];
}
function userOut(array $u): array {
    return ['id' => (int)$u['id'], 'username' => $u['username'], 'name' => $u['name'], 'role' => $u['role'],
        'school_id' => $u['school_id'] ? (int)$u['school_id'] : null, 'phone' => $u['phone'] ?? '', 'active' => (bool)$u['active'], 'qiraat' => (bool)($u['qiraat'] ?? 0),
        'last_login' => $u['last_login'] ?? null];
}
const MSG_SQL = 'SELECT m.*, u.name sname, u.role srole FROM messages m LEFT JOIN users u ON u.id=m.sender_id';

function bootstrap(array $u): array {
    [$w, $p] = scope($u);
    $students = q("SELECT id,name,grp,riwaya,program,hafiz,hafiz_where,hafiz_note,school_id,teacher_id,user_id FROM students WHERE $w ORDER BY name", $p)->fetchAll();
    $ids = array_map(fn($s) => (int)$s['id'], $students);
    $in = $ids ? implode(',', $ids) : '0';
    $par = [];
    foreach (q("SELECT student_id,parent_id FROM parent_student WHERE student_id IN ($in)")->fetchAll() as $r) $par[(int)$r['student_id']][] = (int)$r['parent_id'];
    $stOut = array_map(fn($s) => ['id' => (int)$s['id'], 'name' => $s['name'], 'group' => $s['grp'] ?? '', 'riwaya' => $s['riwaya'] ?? 'hafs', 'program' => $s['program'] ?? 'hifz', 'hafiz' => (bool)($s['hafiz'] ?? 0),
        'hafizWhere' => $s['hafiz_where'] ?? '', 'hafizNote' => $s['hafiz_note'] ?? '', 'school_id' => $s['school_id'] ? (int)$s['school_id'] : null,
        'teacher_id' => $s['teacher_id'] ? (int)$s['teacher_id'] : null, 'user_id' => $s['user_id'] ? (int)$s['user_id'] : null,
        'parents' => $par[(int)$s['id']] ?? []], $students);
    $recs = array_map('recOut', q("SELECT r.*, u.name by_name FROM records r LEFT JOIN users u ON u.id=r.teacher_id WHERE r.student_id IN ($in) ORDER BY r.rec_date DESC, r.id DESC")->fetchAll());
    $msgs = array_reverse(array_map('msgOut', q(MSG_SQL . " WHERE m.student_id IN ($in) ORDER BY m.id DESC LIMIT 600")->fetchAll()));
    $reads = [];
    foreach (q('SELECT student_id,last_id FROM message_reads WHERE user_id=?', [$u['id']])->fetchAll() as $r) $reads[(int)$r['student_id']] = (int)$r['last_id'];

    $sid = $u['school_id'] ?: ($students[0]['school_id'] ?? null);
    if ($u['role'] === 'admin') $schools = q('SELECT id,name,logo FROM schools ORDER BY name')->fetchAll();
    else {
        $sids = array_values(array_unique(array_filter(array_merge(array_column($students, 'school_id'), [$u['school_id']]))));
        $schools = $sids ? q('SELECT id,name,logo FROM schools WHERE id IN (' . implode(',', array_map('intval', $sids)) . ')')->fetchAll() : [];
    }
    $schools = array_map(fn($s) => ['id' => (int)$s['id'], 'name' => $s['name'], 'logo' => $s['logo'] ?? ''], $schools);
    $school = null;
    foreach ($schools as $s) if ($s['id'] === (int)$sid) $school = $s;

    $res = ['me' => userOut($u) + ['must_change' => (bool)$u['must_change']], 'school' => $school, 'schools' => $schools,
        'students' => $stOut, 'records' => $recs, 'messages' => $msgs, 'reads' => (object)$reads, 'users' => [],
        'certs' => array_map('certOut', q("SELECT * FROM certificates WHERE student_id IN ($in) ORDER BY id DESC")->fetchAll()),
        'enrollments' => array_map('enrOut', q("SELECT * FROM enrollments WHERE student_id IN ($in) ORDER BY id")->fetchAll())];
    $reqOut = fn($r) => ['id' => (int)$r['id'], 'role' => $r['role'], 'name' => $r['name'], 'username' => $r['username'],
        'school_id' => $r['school_id'] ? (int)$r['school_id'] : null, 'school_name' => $r['school_name'] ?? '', 'children' => $r['children'] ?? '', 'at' => iso($r['created_at'])];
    if ($u['role'] === 'admin') {
        $res['users'] = array_map('userOut', q('SELECT * FROM users ORDER BY role, name')->fetchAll());
        $res['requests'] = array_map($reqOut, q('SELECT * FROM signup_requests ORDER BY id')->fetchAll());
    } elseif ($u['role'] === 'school_admin') {
        $res['users'] = array_map('userOut', q("SELECT * FROM users WHERE school_id=? AND role IN ('teacher','parent','student') ORDER BY role, name", [$u['school_id']])->fetchAll());
        $res['requests'] = array_map($reqOut, q("SELECT * FROM signup_requests WHERE school_id=? AND role IN ('parent','teacher') ORDER BY id", [$u['school_id']])->fetchAll());
    } elseif ($u['role'] === 'parent' || $u['role'] === 'student') {
        // أسماء المعلمين لعرضها فقط
        $res['users'] = array_map(fn($t) => ['id' => (int)$t['id'], 'name' => $t['name'], 'role' => 'teacher'],
            q("SELECT id,name FROM users WHERE role='teacher' AND id IN (SELECT teacher_id FROM students WHERE id IN ($in))")->fetchAll());
    }
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
    if ($f < 1 || $t < $f || $t > $AYAHS[$s - 1]) fail('أرقام الآيات غير صحيحة (عدد آيات السورة ' . $AYAHS[$s - 1] . ')');
    $g = (string)($b['grade'] ?? '');
    if ($g !== '' && !in_array($g, GRADES, true)) fail('تقدير غير صحيح');
    return [$d, $type, $s, $f, $t, $g, str('note', 500), (int)($b['enrollmentId'] ?? 0)];
}
function uniqueUsername(string $name, int $exceptId = 0): void {
    if (!preg_match('/^[\p{L}\p{N}_.@+-]{3,60}$/u', $name)) fail('اسم المستخدم من 3 إلى 60 حرفاً (حروف وأرقام فقط)');
    if (q('SELECT 1 FROM users WHERE username=? AND id<>?', [$name, $exceptId])->fetchColumn()) fail('اسم المستخدم مستخدم من قبل');
}
function normUser(string $s): string { return mb_strtolower(trim($s)); }

/* ---------- الراوتر ---------- */
$r = $_GET['r'] ?? '';
try {
    switch ($r) {
    case 'bootstrap':
        $u = user();
        out($u ? bootstrap($u) : ['me' => null]);

    case 'login': {
        $name = normUser(str('username', 60)); $pw = (string)(body()['password'] ?? '');
        q('DELETE FROM login_attempts WHERE at < NOW() - INTERVAL 1 DAY');
        $n = (int)q('SELECT COUNT(*) FROM login_attempts WHERE at > NOW() - INTERVAL 15 MINUTE AND (ip=? OR username=?)', [ip(), $name])->fetchColumn();
        if ($n >= 8) fail('محاولات كثيرة، حاول بعد 15 دقيقة', 429);
        $u = q('SELECT * FROM users WHERE username=?', [$name])->fetch();
        $ok = password_verify($pw, $u['pass_hash'] ?? '$2y$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234');
        if (!$u) {
            $rq = q('SELECT pass_hash FROM signup_requests WHERE username=?', [$name])->fetch();
            if ($rq && password_verify($pw, $rq['pass_hash'])) fail('طلب تسجيلك قيد المراجعة من الإدارة، سيُفعَّل حسابك بعد الموافقة', 403);
        }
        if (!$u || !$ok || !$u['active']) { q('INSERT INTO login_attempts (ip,username) VALUES (?,?)', [ip(), $name]); fail('اسم المستخدم أو كلمة المرور غير صحيحة', 401); }
        session_regenerate_id(true);
        $_SESSION['uid'] = (int)$u['id'];
        if (!empty(body()['remember']))
            setcookie(session_name(), session_id(), ['expires' => time() + 2592000, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
        q('UPDATE users SET last_login=NOW() WHERE id=?', [$u['id']]);
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
        [$d, $type, $s, $f, $t, $g, $note, $enr] = validRecord();
        $sid = (int)(body()['studentId'] ?? 0); $id = (int)(body()['id'] ?? 0);
        $stu = q('SELECT * FROM students WHERE id=?', [$sid])->fetch();
        if (!$stu || !canSee($u, $sid)) fail('الطالب غير موجود', 404);
        if ($type === 'qiraa') {
            $e = $enr ? q('SELECT * FROM enrollments WHERE id=? AND student_id=?', [$enr, $sid])->fetch() : null;
            if (!$e) fail('اختر برنامج القراءة');
            if (!qiraatAllowed($u, $stu['teacher_id'] ? (int)$stu['teacher_id'] : null)) fail('القراءات غير مفعّلة في حسابك');
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
            q('UPDATE records SET student_id=?, rec_date=?, type=?, surah=?, ayah_from=?, ayah_to=?, grade=?, note=?, enrollment_id=? WHERE id=?', [$sid, $d, $type, $s, $f, $t, $g, $note, $enr ?: null, $id]);
        } else {
            q('INSERT INTO records (student_id,teacher_id,rec_date,type,surah,ayah_from,ayah_to,grade,note,enrollment_id) VALUES (?,?,?,?,?,?,?,?,?,?)', [$sid, $u['id'], $d, $type, $s, $f, $t, $g, $note, $enr ?: null]);
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
        out(['messages' => array_map('msgOut', q(MSG_SQL . " WHERE m.id>? AND $w ORDER BY m.id LIMIT 200", [$since, ...$p])->fetchAll()),
            'pending' => $u['role'] === 'admin' ? (int)q('SELECT COUNT(*) FROM signup_requests')->fetchColumn()
                : ($u['role'] === 'school_admin' ? (int)q("SELECT COUNT(*) FROM signup_requests WHERE school_id=? AND role IN ('parent','teacher')", [$u['school_id']])->fetchColumn() : 0)]);
    }

    /* ----- الإدارة: مدير النظام ومدير المدرسة ----- */
    case 'school_save': {
        $me = need('admin', 'school_admin'); $b = body(); $id = (int)($b['id'] ?? 0); $name = str('name', 120); $logo = (string)($b['logo'] ?? '');
        if ($me['role'] === 'school_admin') $id = (int)$me['school_id'];      // مدير المدرسة يعدّل مدرسته فقط
        if ($name === '') fail('اسم المدرسة مطلوب');
        if ($logo !== '' && (!str_starts_with($logo, 'data:image/') || strlen($logo) > 400000)) fail('الشعار غير صالح');
        if ($id) q('UPDATE schools SET name=?, logo=? WHERE id=?', [$name, $logo, $id]);
        else q('INSERT INTO schools (name,logo) VALUES (?,?)', [$name, $logo]);
        out(['ok' => true]);
    }
    case 'school_delete': {
        need('admin'); $id = (int)(body()['id'] ?? 0);
        if (q('SELECT 1 FROM students WHERE school_id=? UNION SELECT 1 FROM users WHERE school_id=?', [$id, $id])->fetchColumn()) fail('لا يمكن حذف مدرسة فيها معلمون أو طلاب');
        q('DELETE FROM schools WHERE id=?', [$id]);
        out(['ok' => true]);
    }

    case 'user_save': {
        $me = need('admin', 'school_admin'); $b = body(); $id = (int)($b['id'] ?? 0); $sa = $me['role'] === 'school_admin';
        $name = str('name', 120); $un = normUser(str('username', 60)); $phone = preg_replace('/[^\d+]/', '', str('phone', 30));
        $role = $b['role'] ?? ''; $school = (int)($b['school_id'] ?? 0) ?: null; $active = !isset($b['active']) || $b['active'] ? 1 : 0;
        $qi = !empty($b['qiraat']) ? 1 : 0; $keepQ = 0;
        if ($name === '') fail('الاسم مطلوب');
        uniqueUsername($un, $id);
        $allowed = $sa ? ['teacher', 'parent'] : ['admin', 'school_admin', 'teacher', 'parent'];
        if ($id) {
            $old = q('SELECT * FROM users WHERE id=?', [$id])->fetch();
            if (!$old || $old['role'] === 'student') fail('مستخدم غير موجود', 404);
            if ($sa && (!in_array($old['role'], $allowed, true) || !mgrOwns($me, $old['school_id']))) fail('غير مصرح', 403);
            if ($id === (int)$me['id'] && !$active) fail('لا يمكنك تعطيل حسابك');
            $role = $old['role']; $keepQ = (int)$old['qiraat'];
        } elseif (!in_array($role, $allowed, true)) fail('نوع الحساب غير صحيح');
        if ($sa) $school = (int)$me['school_id'];
        if ($role === 'admin') $school = null; elseif (!$school) fail('اختر المدرسة');
        if ($school && !q('SELECT 1 FROM schools WHERE id=?', [$school])->fetchColumn()) fail('مدرسة غير صحيحة');
        if ($role === 'school_admin' && q("SELECT 1 FROM users WHERE role='school_admin' AND school_id=? AND id<>?", [$school, $id])->fetchColumn())
            fail('لهذه المدرسة مدير بالفعل (مدير واحد لكل مدرسة)');
        $qv = $role === 'teacher' ? $qi : $keepQ;
        $pw = null;
        if ($id) {
            q('UPDATE users SET name=?, username=?, phone=?, school_id=?, active=?, qiraat=? WHERE id=?', [$name, $un, $phone, $school, $active, $qv, $id]);
        } else {
            $pw = genPass();
            q('INSERT INTO users (username,name,role,school_id,phone,pass_hash,qiraat,must_change) VALUES (?,?,?,?,?,?,?,1)', [$un, $name, $role, $school, $phone, password_hash($pw, PASSWORD_DEFAULT), $qv]);
            $id = (int)db()->lastInsertId();
        }
        out(['id' => $id, 'username' => $un, 'password' => $pw]);
    }
    case 'reset_password': {
        $me = need('admin', 'school_admin'); $id = (int)(body()['id'] ?? 0);
        $u = q('SELECT username,role,school_id FROM users WHERE id=?', [$id])->fetch();
        if (!$u) fail('مستخدم غير موجود', 404);
        if ($me['role'] === 'school_admin' && (!in_array($u['role'], ['teacher', 'parent', 'student'], true) || !mgrOwns($me, $u['school_id']))) fail('غير مصرح', 403);
        $pw = genPass();
        q('UPDATE users SET pass_hash=?, must_change=1 WHERE id=?', [password_hash($pw, PASSWORD_DEFAULT), $id]);
        out(['username' => $u['username'], 'password' => $pw]);
    }
    case 'user_delete': {
        $me = need('admin', 'school_admin'); $id = (int)(body()['id'] ?? 0);
        $u = q('SELECT role,school_id FROM users WHERE id=?', [$id])->fetch();
        if (!$u || $u['role'] === 'student') fail('مستخدم غير موجود', 404);
        if ($me['role'] === 'school_admin' && (!in_array($u['role'], ['teacher', 'parent'], true) || !mgrOwns($me, $u['school_id']))) fail('غير مصرح', 403);
        if ($id === (int)$me['id']) fail('لا يمكنك حذف حسابك');
        q('UPDATE students SET teacher_id=NULL WHERE teacher_id=?', [$id]);
        q('DELETE FROM parent_student WHERE parent_id=?', [$id]);
        q('DELETE FROM message_reads WHERE user_id=?', [$id]);
        q('DELETE FROM users WHERE id=?', [$id]);
        out(['ok' => true]);
    }

    case 'student_save': {
        $me = need('admin', 'school_admin'); $sa = $me['role'] === 'school_admin'; $b = body(); $id = (int)($b['id'] ?? 0);
        $name = str('name', 120); $grp = str('group', 80); $school = (int)($b['school_id'] ?? 0) ?: null; $teacher = (int)($b['teacher_id'] ?? 0) ?: null;
        if ($sa) $school = (int)$me['school_id'];
        $parents = array_values(array_unique(array_map('intval', is_array($b['parent_ids'] ?? null) ? $b['parent_ids'] : [])));
        $login = normUser(str('login_username', 60));
        $program = ($b['program'] ?? 'hifz') === 'qiraat' ? 'qiraat' : 'hifz'; $hafiz = !empty($b['hafiz']) ? 1 : 0;
        $hw = str('hafiz_where', 160); $hn = str('hafiz_note', 300);
        $priors = is_array($b['prior_list'] ?? null) ? array_slice($b['prior_list'], 0, 30) : [];
        if ($program === 'qiraat') {
            if (!qiraatAllowed($me, $teacher)) fail('فعّل القراءات في حساب المعلم أو حسابك أولاً');
            if (!$hafiz && !($id && memorizedAll($id))) fail('برنامج القراءات للحافظين فقط: علّم «أتمّ حفظ المصحف»');
        }
        if ($name === '') fail('اسم الطالب مطلوب');
        if (!$school || !q('SELECT 1 FROM schools WHERE id=?', [$school])->fetchColumn()) fail('اختر المدرسة');
        if ($teacher) {
            $t = q("SELECT school_id FROM users WHERE id=? AND role='teacher'", [$teacher])->fetch();
            if (!$t) fail('المعلم غير صحيح');
            if ((int)$t['school_id'] !== (int)$school) fail('المعلم من مدرسة أخرى');
        }
        foreach ($parents as $pid) {
            $pr = q("SELECT school_id FROM users WHERE id=? AND role='parent'", [$pid])->fetch();
            if (!$pr) fail('ولي أمر غير صحيح');
            if ($sa && (int)$pr['school_id'] !== (int)$school) fail('ولي أمر من مدرسة أخرى');
        }
        $old = $id ? q('SELECT * FROM students WHERE id=?', [$id])->fetch() : null;
        if ($id && !$old) fail('الطالب غير موجود', 404);
        if ($old && !mgrOwns($me, $old['school_id'])) fail('غير مصرح', 403);
        if ($id) q('UPDATE students SET name=?, school_id=?, teacher_id=?, grp=?, program=?, hafiz=?, hafiz_where=?, hafiz_note=? WHERE id=?', [$name, $school, $teacher, $grp, $program, $hafiz, $hw, $hn, $id]);
        else { q('INSERT INTO students (name,school_id,teacher_id,grp,program,hafiz,hafiz_where,hafiz_note) VALUES (?,?,?,?,?,?,?,?)', [$name, $school, $teacher, $grp, $program, $hafiz, $hw, $hn]); $id = (int)db()->lastInsertId(); }
        q('DELETE FROM parent_student WHERE student_id=?', [$id]);
        foreach ($parents as $pid) q('INSERT INTO parent_student (parent_id,student_id) VALUES (?,?)', [$pid, $id]);
        if (!$old) foreach ($priors as $pl) {            // قراءات / روايات أتمّها قبل الالتحاق
            $k = array_values(array_filter(array_map('strval', is_array($pl['riwayat'] ?? null) ? $pl['riwayat'] : []), fn($x) => in_array($x, RIWAYAT, true)));
            $kd = $pl['kind'] ?? ''; $lb = mb_substr(trim((string)($pl['label'] ?? '')), 0, 200);
            if (!$k || $lb === '' || !in_array($kd, ['riwaya', 'qiraa', 'jam'], true)) continue;
            q("INSERT INTO enrollments (student_id,kind,riwayat,label,status,prior,shaykh,created_by) VALUES (?,?,?,?,'completed',1,?,?)", [$id, $kd, implode(',', $k), $lb, str('prior_where', 160), $me['id']]);
        }
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
        foreach (['records', 'messages', 'message_reads', 'parent_student', 'certificates', 'enrollments'] as $t) q("DELETE FROM $t WHERE student_id=?", [$id]);
        if ($s['user_id']) q('DELETE FROM users WHERE id=?', [$s['user_id']]);
        q('DELETE FROM students WHERE id=?', [$id]);
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
        if (!qiraatAllowed($u, $s['teacher_id'] ? (int)$s['teacher_id'] : null)) fail('فعّل القراءات من «إعدادات القراءات» أولاً');
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
    case 'public_schools':
        out(['tk' => time(), 'schools' => array_map(fn($s) => ['id' => (int)$s['id'], 'name' => $s['name']], q('SELECT id,name FROM schools ORDER BY name')->fetchAll())]);

    case 'signup_request': {
        $b = body();
        if (!empty($b['website'])) out(['ok' => true]);                       // فخ للروبوتات (حقل مخفي)
        $tk = (int)($b['tk'] ?? 0);
        if ($tk <= 0 || time() - $tk < 3 || time() - $tk > 172800) fail('أعد المحاولة');
        if ((int)q('SELECT COUNT(*) FROM signup_requests WHERE ip=? AND created_at > NOW() - INTERVAL 1 HOUR', [ip()])->fetchColumn() >= 3)
            fail('وصلتنا طلباتك، انتظر الموافقة', 429);
        if ((int)q('SELECT COUNT(*) FROM signup_requests')->fetchColumn() >= 300) fail('الطلبات ممتلئة حالياً، تواصل مع الإدارة', 429);
        $role = $b['role'] ?? ''; if (!in_array($role, ['parent', 'teacher', 'school'], true)) fail('نوع الحساب غير صحيح');
        $name = str('name', 120); $un = normUser(str('username', 60)); $pw = (string)($b['password'] ?? '');
        $school = (int)($b['school_id'] ?? 0) ?: null; $children = str('children', 300); $sname = str('school_name', 120);
        if ($name === '') fail('الاسم مطلوب');
        if (mb_strlen($pw) < 6) fail('كلمة المرور 6 أحرف على الأقل');
        uniqueUsername($un);
        if (q('SELECT 1 FROM signup_requests WHERE username=?', [$un])->fetchColumn()) fail('يوجد طلب بهذا الرقم قيد المراجعة');
        if ($role === 'school') {
            if ($sname === '') fail('اكتب اسم المدرسة');
            $school = null; $children = '';
        } else {
            $sname = '';
            if (!$school || !q('SELECT 1 FROM schools WHERE id=?', [$school])->fetchColumn()) fail('اختر المدرسة');
            if ($role === 'parent' && $children === '') fail('اكتب اسم ابنك أو أبنائك');
        }
        q('INSERT INTO signup_requests (role,name,username,pass_hash,school_id,school_name,children,ip) VALUES (?,?,?,?,?,?,?,?)',
            [$role, $name, $un, password_hash($pw, PASSWORD_DEFAULT), $school, $sname, $children, ip()]);
        out(['ok' => true]);
    }
    case 'request_approve': {
        $me = need('admin', 'school_admin'); $id = (int)(body()['id'] ?? 0);
        $rq = q('SELECT * FROM signup_requests WHERE id=?', [$id])->fetch();
        if (!$rq) fail('الطلب غير موجود', 404);
        if ($me['role'] === 'school_admin' && ($rq['role'] === 'school' || !mgrOwns($me, $rq['school_id']))) fail('غير مصرح', 403);
        uniqueUsername($rq['username']);
        $role = $rq['role']; $school = $rq['school_id'];
        if ($role === 'school') {                    // مدرسة جديدة + مديرها (يوافق عليها مدير النظام فقط)
            q('INSERT INTO schools (name) VALUES (?)', [$rq['school_name']]);
            $school = (int)db()->lastInsertId(); $role = 'school_admin';
        }
        q('INSERT INTO users (username,name,role,school_id,pass_hash,must_change) VALUES (?,?,?,?,?,0)', [$rq['username'], $rq['name'], $role, $school, $rq['pass_hash']]);
        $uid = (int)db()->lastInsertId();
        if ($role === 'parent') {
            $sids = array_map('intval', is_array(body()['student_ids'] ?? null) ? body()['student_ids'] : []);
            foreach ($sids as $sid) if (q('SELECT 1 FROM students WHERE id=? AND school_id=?', [$sid, $school])->fetchColumn()) q('INSERT IGNORE INTO parent_student (parent_id,student_id) VALUES (?,?)', [$uid, $sid]);
        }
        q('DELETE FROM signup_requests WHERE id=?', [$id]);
        out(['id' => $uid]);
    }
    case 'request_reject': {
        $me = need('admin', 'school_admin'); $id = (int)(body()['id'] ?? 0);
        $rq = q('SELECT role,school_id FROM signup_requests WHERE id=?', [$id])->fetch();
        if ($rq && $me['role'] === 'school_admin' && ($rq['role'] === 'school' || !mgrOwns($me, $rq['school_id']))) fail('غير مصرح', 403);
        q('DELETE FROM signup_requests WHERE id=?', [$id]);
        out(['ok' => true]);
    }

    default: fail('مسار غير معروف', 404);
    }
} catch (PDOException $e) {
    error_log('tahfidh db: ' . $e->getMessage());
    fail('خطأ في الخادم', 500);
}
