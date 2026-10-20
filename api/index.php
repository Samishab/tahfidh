<?php
declare(strict_types=1);
date_default_timezone_set('Asia/Riyadh');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$cfg = require dirname(__DIR__, 2) . '/tahfidh_config.php';
$AYAHS = require __DIR__ . '/quran.php';
const GRADES = ['ممتاز', 'جيد جداً', 'جيد', 'مقبول', 'إعادة'];

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
        'teacher' => ["$col IN (SELECT id FROM students WHERE teacher_id=?)", [$u['id']]],
        'parent' => ["$col IN (SELECT student_id FROM parent_student WHERE parent_id=?)", [$u['id']]],
        default => ["$col IN (SELECT id FROM students WHERE user_id=?)", [$u['id']]],
    };
}
function canSee(array $u, int $sid): bool {
    [$w, $p] = scope($u);
    return (bool)q("SELECT 1 FROM students WHERE id=? AND $w", [$sid, ...$p])->fetchColumn();
}
function iso(string $d): string { return date('c', strtotime($d)); }

/* ---------- تحويل الصفوف ---------- */
function recOut(array $r): array {
    return ['id' => (int)$r['id'], 'studentId' => (int)$r['student_id'], 'date' => $r['rec_date'], 'type' => $r['type'],
        'surah' => (int)$r['surah'], 'from' => (int)$r['ayah_from'], 'to' => (int)$r['ayah_to'], 'grade' => $r['grade'],
        'note' => $r['note'] ?? '', 'by' => $r['by_name'] ?? ''];
}
function msgOut(array $m): array {
    return ['id' => (int)$m['id'], 'studentId' => (int)$m['student_id'], 'senderId' => (int)$m['sender_id'],
        'senderName' => $m['sname'] ?? 'محذوف', 'senderRole' => $m['srole'] ?? '', 'body' => $m['body'], 'at' => iso($m['created_at'])];
}
function userOut(array $u): array {
    return ['id' => (int)$u['id'], 'username' => $u['username'], 'name' => $u['name'], 'role' => $u['role'],
        'school_id' => $u['school_id'] ? (int)$u['school_id'] : null, 'phone' => $u['phone'] ?? '', 'active' => (bool)$u['active'],
        'last_login' => $u['last_login'] ?? null];
}
const MSG_SQL = 'SELECT m.*, u.name sname, u.role srole FROM messages m LEFT JOIN users u ON u.id=m.sender_id';

function bootstrap(array $u): array {
    [$w, $p] = scope($u);
    $students = q("SELECT id,name,grp,school_id,teacher_id,user_id FROM students WHERE $w ORDER BY name", $p)->fetchAll();
    $ids = array_map(fn($s) => (int)$s['id'], $students);
    $in = $ids ? implode(',', $ids) : '0';
    $par = [];
    foreach (q("SELECT student_id,parent_id FROM parent_student WHERE student_id IN ($in)")->fetchAll() as $r) $par[(int)$r['student_id']][] = (int)$r['parent_id'];
    $stOut = array_map(fn($s) => ['id' => (int)$s['id'], 'name' => $s['name'], 'group' => $s['grp'] ?? '', 'school_id' => $s['school_id'] ? (int)$s['school_id'] : null,
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
        'students' => $stOut, 'records' => $recs, 'messages' => $msgs, 'reads' => (object)$reads, 'users' => []];
    if ($u['role'] === 'admin') {
        $res['users'] = array_map('userOut', q('SELECT * FROM users ORDER BY role, name')->fetchAll());
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
    if (!in_array($type, ['hifz', 'review'], true)) fail('نوع التسميع غير صحيح');
    $s = (int)($b['surah'] ?? 0); $f = (int)($b['from'] ?? 0); $t = (int)($b['to'] ?? 0);
    if ($s < 1 || $s > 114) fail('سورة غير صحيحة');
    if ($f < 1 || $t < $f || $t > $AYAHS[$s - 1]) fail('أرقام الآيات غير صحيحة (عدد آيات السورة ' . $AYAHS[$s - 1] . ')');
    $g = (string)($b['grade'] ?? '');
    if ($g !== '' && !in_array($g, GRADES, true)) fail('تقدير غير صحيح');
    return [$d, $type, $s, $f, $t, $g, str('note', 500)];
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
        $u = need('admin', 'teacher');
        [$d, $type, $s, $f, $t, $g, $note] = validRecord();
        $sid = (int)(body()['studentId'] ?? 0); $id = (int)(body()['id'] ?? 0);
        if (!canSee($u, $sid)) fail('الطالب غير موجود', 404);
        if ($id) {
            $old = q('SELECT student_id FROM records WHERE id=?', [$id])->fetch();
            if (!$old || !canSee($u, (int)$old['student_id'])) fail('غير مصرح', 403);
            q('UPDATE records SET student_id=?, rec_date=?, type=?, surah=?, ayah_from=?, ayah_to=?, grade=?, note=? WHERE id=?', [$sid, $d, $type, $s, $f, $t, $g, $note, $id]);
        } else {
            q('INSERT INTO records (student_id,teacher_id,rec_date,type,surah,ayah_from,ayah_to,grade,note) VALUES (?,?,?,?,?,?,?,?,?)', [$sid, $u['id'], $d, $type, $s, $f, $t, $g, $note]);
            $id = (int)db()->lastInsertId();
        }
        out(['record' => recOut(q('SELECT r.*, u.name by_name FROM records r LEFT JOIN users u ON u.id=r.teacher_id WHERE r.id=?', [$id])->fetch())]);
    }
    case 'record_delete': {
        $u = need('admin', 'teacher'); $id = (int)(body()['id'] ?? 0);
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
        out(['messages' => array_map('msgOut', q(MSG_SQL . " WHERE m.id>? AND $w ORDER BY m.id LIMIT 200", [$since, ...$p])->fetchAll())]);
    }

    /* ----- الإدارة (للمدير فقط) ----- */
    case 'school_save': {
        need('admin'); $id = (int)(body()['id'] ?? 0); $name = str('name', 120); $logo = (string)(body()['logo'] ?? '');
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
        $me = need('admin'); $b = body(); $id = (int)($b['id'] ?? 0);
        $name = str('name', 120); $un = normUser(str('username', 60)); $phone = preg_replace('/[^\d+]/', '', str('phone', 30));
        $role = $b['role'] ?? ''; $school = (int)($b['school_id'] ?? 0) ?: null; $active = !isset($b['active']) || $b['active'] ? 1 : 0;
        if ($name === '') fail('الاسم مطلوب');
        uniqueUsername($un, $id);
        if ($id) {
            $old = q('SELECT * FROM users WHERE id=?', [$id])->fetch();
            if (!$old || $old['role'] === 'student') fail('مستخدم غير موجود', 404);
            if ($id === (int)$me['id'] && !$active) fail('لا يمكنك تعطيل حسابك');
            $role = $old['role'];
        } elseif (!in_array($role, ['admin', 'teacher', 'parent'], true)) fail('نوع الحساب غير صحيح');
        if ($role === 'teacher' && !$school) fail('اختر مدرسة المعلم');
        if ($role !== 'teacher') $school = null;
        $pw = null;
        if ($id) {
            q('UPDATE users SET name=?, username=?, phone=?, school_id=?, active=? WHERE id=?', [$name, $un, $phone, $school, $active, $id]);
        } else {
            $pw = genPass();
            q('INSERT INTO users (username,name,role,school_id,phone,pass_hash,must_change) VALUES (?,?,?,?,?,?,1)', [$un, $name, $role, $school, $phone, password_hash($pw, PASSWORD_DEFAULT)]);
            $id = (int)db()->lastInsertId();
        }
        out(['id' => $id, 'username' => $un, 'password' => $pw]);
    }
    case 'reset_password': {
        $me = need('admin'); $id = (int)(body()['id'] ?? 0);
        $u = q('SELECT username FROM users WHERE id=?', [$id])->fetch();
        if (!$u) fail('مستخدم غير موجود', 404);
        $pw = genPass();
        q('UPDATE users SET pass_hash=?, must_change=1 WHERE id=?', [password_hash($pw, PASSWORD_DEFAULT), $id]);
        out(['username' => $u['username'], 'password' => $pw]);
    }
    case 'user_delete': {
        $me = need('admin'); $id = (int)(body()['id'] ?? 0);
        $u = q('SELECT role FROM users WHERE id=?', [$id])->fetch();
        if (!$u || $u['role'] === 'student') fail('مستخدم غير موجود', 404);
        if ($id === (int)$me['id']) fail('لا يمكنك حذف حسابك');
        q('UPDATE students SET teacher_id=NULL WHERE teacher_id=?', [$id]);
        q('DELETE FROM parent_student WHERE parent_id=?', [$id]);
        q('DELETE FROM message_reads WHERE user_id=?', [$id]);
        q('DELETE FROM users WHERE id=?', [$id]);
        out(['ok' => true]);
    }

    case 'student_save': {
        need('admin'); $b = body(); $id = (int)($b['id'] ?? 0);
        $name = str('name', 120); $grp = str('group', 80); $school = (int)($b['school_id'] ?? 0) ?: null; $teacher = (int)($b['teacher_id'] ?? 0) ?: null;
        $parents = array_values(array_unique(array_map('intval', is_array($b['parent_ids'] ?? null) ? $b['parent_ids'] : [])));
        $login = normUser(str('login_username', 60));
        if ($name === '') fail('اسم الطالب مطلوب');
        if (!$school) fail('اختر المدرسة');
        if ($teacher && !q("SELECT 1 FROM users WHERE id=? AND role='teacher'", [$teacher])->fetchColumn()) fail('المعلم غير صحيح');
        foreach ($parents as $pid) if (!q("SELECT 1 FROM users WHERE id=? AND role='parent'", [$pid])->fetchColumn()) fail('ولي أمر غير صحيح');
        $old = $id ? q('SELECT * FROM students WHERE id=?', [$id])->fetch() : null;
        if ($id && !$old) fail('الطالب غير موجود', 404);
        if ($id) q('UPDATE students SET name=?, school_id=?, teacher_id=?, grp=? WHERE id=?', [$name, $school, $teacher, $grp, $id]);
        else { q('INSERT INTO students (name,school_id,teacher_id,grp) VALUES (?,?,?,?)', [$name, $school, $teacher, $grp]); $id = (int)db()->lastInsertId(); }
        q('DELETE FROM parent_student WHERE student_id=?', [$id]);
        foreach ($parents as $pid) q('INSERT INTO parent_student (parent_id,student_id) VALUES (?,?)', [$pid, $id]);
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
        need('admin'); $id = (int)(body()['id'] ?? 0);
        $s = q('SELECT user_id FROM students WHERE id=?', [$id])->fetch();
        if (!$s) fail('الطالب غير موجود', 404);
        foreach (['records', 'messages', 'message_reads', 'parent_student'] as $t) q("DELETE FROM $t WHERE student_id=?", [$id]);
        if ($s['user_id']) q('DELETE FROM users WHERE id=?', [$s['user_id']]);
        q('DELETE FROM students WHERE id=?', [$id]);
        out(['ok' => true]);
    }

    default: fail('مسار غير معروف', 404);
    }
} catch (PDOException $e) {
    error_log('tahfidh db: ' . $e->getMessage());
    fail('خطأ في الخادم', 500);
}
