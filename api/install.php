<?php
// يُشغَّل مرة واحدة من سطر الأوامر فقط:  php api/install.php
// ينشئ الجداول، وإن لم يوجد مدير ينشئ حساب admin بكلمة مرور مؤقتة تُطبع هنا مرة واحدة.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$cfg = require dirname(__DIR__, 2) . '/tahfidh_config.php';
$pdo = new PDO("mysql:host={$cfg['db_host']};dbname={$cfg['db_name']};charset=utf8mb4", $cfg['db_user'], $cfg['db_pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
foreach (array_filter(array_map('trim', explode(';', file_get_contents(__DIR__ . '/schema.sql')))) as $sql) $pdo->exec($sql);
echo "الجداول جاهزة\n";
if (!$pdo->query("SELECT COUNT(*) FROM users WHERE role='admin'")->fetchColumn()) {
    $a = 'abcdefghjkmnpqrstuvwxyz23456789'; $pw = '';
    for ($i = 0; $i < 10; $i++) $pw .= $a[random_int(0, strlen($a) - 1)];
    $pdo->prepare("INSERT INTO users (username,name,role,pass_hash,must_change) VALUES ('admin','مدير النظام','admin',?,1)")
        ->execute([password_hash($pw, PASSWORD_DEFAULT)]);
    echo "تم إنشاء المدير:\nusername: admin\npassword: $pw\n(سيُطلب تغييرها عند أول دخول)\n";
}
