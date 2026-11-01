<?php
// يُشغَّل مرة واحدة من سطر الأوامر فقط:  php api/install.php
// ينشئ الجداول، وإن لم يوجد مدير ينشئ حساب admin بكلمة مرور مؤقتة تُطبع هنا مرة واحدة.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$cfg = require dirname(__DIR__, 2) . '/tahfidh_config.php';
$pdo = new PDO("mysql:host={$cfg['db_host']};dbname={$cfg['db_name']};charset=utf8mb4", $cfg['db_user'], $cfg['db_pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
foreach (array_filter(array_map('trim', explode(';', file_get_contents(__DIR__ . '/schema.sql')))) as $sql) $pdo->exec($sql);
// ترقية قواعد قائمة: عمود الرواية + خيار القراءات للمعلم
foreach ([['records', 'riwaya', "VARCHAR(20) NOT NULL DEFAULT 'hafs'"], ['students', 'riwaya', "VARCHAR(20) NOT NULL DEFAULT 'hafs'"], ['users', 'qiraat', 'TINYINT(1) NOT NULL DEFAULT 0'], ['signup_requests', 'school_name', 'VARCHAR(120) NULL'],
    ['students', 'program', "VARCHAR(10) NOT NULL DEFAULT 'hifz'"], ['students', 'hafiz', 'TINYINT(1) NOT NULL DEFAULT 0'], ['students', 'hafiz_where', 'VARCHAR(160) NULL'], ['students', 'hafiz_note', 'VARCHAR(300) NULL'],
    ['records', 'enrollment_id', 'INT UNSIGNED NULL'], ['records', 'surah_to', 'TINYINT UNSIGNED NULL'], ['users', 'solo', 'TINYINT(1) NOT NULL DEFAULT 0'], ['users', 'email', 'VARCHAR(190) NULL'], ['schools', 'plan', "VARCHAR(12) NOT NULL DEFAULT 'free'"], ['schools', 'expires_at', 'DATE NULL'], ['schools', 'max_students', 'INT UNSIGNED NULL'], ['schools', 'active', 'TINYINT(1) NOT NULL DEFAULT 1'], ['schools', 'notes', 'VARCHAR(300) NULL'], ['signup_requests', 'email', 'VARCHAR(190) NULL'], ['signup_requests', 'phone', 'VARCHAR(30) NULL'], ['certificates', 'enrollment_id', 'INT UNSIGNED NULL'], ['certificates', 'riwaya_label', "VARCHAR(200) NOT NULL DEFAULT ''"]] as [$t, $c, $def])
    if (!$pdo->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='$t' AND COLUMN_NAME='$c'")->fetchColumn())
        $pdo->exec("ALTER TABLE $t ADD COLUMN $c $def");
// أدوار جديدة: مدير مدرسة / طلب تسجيل مدرسة، وربط أولياء الأمور القدامى بمدارس أبنائهم
$pdo->exec("ALTER TABLE users MODIFY role ENUM('admin','school_admin','teacher','parent','student') NOT NULL");
$pdo->exec("ALTER TABLE signup_requests MODIFY role ENUM('parent','teacher','school','solo') NOT NULL");
$pdo->exec("UPDATE users u SET school_id = (SELECT s.school_id FROM parent_student ps JOIN students s ON s.id=ps.student_id WHERE ps.parent_id=u.id LIMIT 1) WHERE u.role='parent' AND u.school_id IS NULL");
$pdo->exec("ALTER TABLE records MODIFY type ENUM('hifz','review','qiraa') NOT NULL");
$pdo->exec("ALTER TABLE certificates MODIFY kind ENUM('khatm','period','custom','qiraat') NOT NULL");
// البريد: اسم الدخول بطول أكبر (البريد)، وفهرس فريد للبريد، وقيم افتراضية للإعدادات
$pdo->exec("ALTER TABLE users MODIFY username VARCHAR(190) NOT NULL");
$pdo->exec("ALTER TABLE signup_requests MODIFY username VARCHAR(190) NOT NULL");
$pdo->exec("ALTER TABLE login_attempts MODIFY username VARCHAR(190) NOT NULL");
if (!$pdo->query("SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND INDEX_NAME='uq_email'")->fetchColumn())
    $pdo->exec("ALTER TABLE users ADD UNIQUE KEY uq_email (email)");
foreach (['smtp_enabled' => '1', 'smtp_host' => 's12079.fra1.stableserver.net', 'smtp_port' => '465', 'smtp_secure' => 'ssl', 'smtp_user' => 'noreplay@tahfidh.ipickhost.com',
          'mail_from_email' => 'noreplay@tahfidh.ipickhost.com', 'mail_from_name' => 'متابعة التحفيظ', 'site_url' => 'https://tahfidh.ipickhost.com'] as $k => $v)
    $pdo->prepare("INSERT IGNORE INTO settings (k,v) VALUES (?,?)")->execute([$k, $v]);
$pdo->exec("INSERT IGNORE INTO student_teacher (student_id, teacher_id) SELECT id, teacher_id FROM students WHERE teacher_id IS NOT NULL");   // ترحيل المعلم الواحد القديم
echo "الجداول جاهزة\n";
if (!$pdo->query("SELECT COUNT(*) FROM users WHERE role='admin'")->fetchColumn()) {
    $a = 'abcdefghjkmnpqrstuvwxyz23456789'; $pw = '';
    for ($i = 0; $i < 10; $i++) $pw .= $a[random_int(0, strlen($a) - 1)];
    $pdo->prepare("INSERT INTO users (username,name,role,pass_hash,must_change) VALUES ('admin','مدير النظام','admin',?,1)")
        ->execute([password_hash($pw, PASSWORD_DEFAULT)]);
    echo "تم إنشاء المدير:\nusername: admin\npassword: $pw\n(سيُطلب تغييرها عند أول دخول)\n";
}
