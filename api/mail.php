<?php
/* البريد الإلكتروني: إعدادات (من لوحة المدير) + عميل SMTP + قوالب HTML منسقة + رموز الدخول OTP.
 * يعتمد على دوال index.php: q(), db(), str(), ip() والمتغير $cfg. */

function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

/* ---------- الإعدادات (جدول settings) ---------- */
function settingsAll(bool $refresh = false): array {
    static $all = null;
    if ($all === null || $refresh) { $all = []; foreach (q('SELECT k,v FROM settings')->fetchAll() as $r) $all[$r['k']] = $r['v']; }
    return $all;
}
function setting(string $k, string $def = ''): string { $a = settingsAll(); return array_key_exists($k, $a) ? (string)$a[$k] : $def; }
function setSetting(string $k, string $v): void {
    q('INSERT INTO settings (k,v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)', [$k, $v]);
    settingsAll(true);
}
/** تشفير كلمة مرور SMTP في قاعدة البيانات (AES-256-GCM بمفتاح مشتق من إعدادات الخادم خارج مجلد الموقع) */
function encKey(): string { global $cfg; return hash('sha256', 'tahfidh-secret|' . $cfg['db_pass'], true); }
function encSecret(string $plain): string {
    $iv = random_bytes(12); $tag = '';
    $ct = openssl_encrypt($plain, 'aes-256-gcm', encKey(), OPENSSL_RAW_DATA, $iv, $tag);
    return base64_encode($iv . $tag . $ct);
}
function decSecret(string $b64): string {
    $d = base64_decode($b64, true);
    if ($d === false || strlen($d) < 29) return '';
    $p = openssl_decrypt(substr($d, 28), 'aes-256-gcm', encKey(), OPENSSL_RAW_DATA, substr($d, 0, 12), substr($d, 12, 16));
    return $p === false ? '' : $p;
}
function mailCfg(): array {
    return [
        'enabled' => setting('smtp_enabled', '1') === '1',
        'host' => setting('smtp_host'), 'port' => (int)(setting('smtp_port', '465') ?: 465), 'secure' => setting('smtp_secure', 'ssl'),
        'user' => setting('smtp_user'), 'pass' => decSecret(setting('smtp_pass')),
        'from_email' => setting('mail_from_email') ?: setting('smtp_user'), 'from_name' => setting('mail_from_name', 'سَنَد'),
        'site_url' => rtrim(setting('site_url', 'https://tahfidh.ipickhost.com'), '/'),
    ];
}

/* ---------- عميل SMTP ---------- */
function mimeEnc(string $s): string { return mb_encode_mimeheader($s, 'UTF-8', 'B', "\r\n", 0); }

function smtpSend(string $to, string $subject, string $html, string $text, string $kind = 'mail'): array {
    $c = mailCfg(); $err = '';
    $pnm = cfgv('platform_name'); $subject = str_replace('@@PN@@', $pnm, $subject); $text = str_replace('@@PN@@', $pnm, $text); $html = str_replace('@@PN@@', h($pnm), $html);
    $c['from_name'] = str_replace('@@PN@@', $pnm, $c['from_name']);
    try {
        if (!$c['enabled']) throw new RuntimeException('البريد معطّل من الإعدادات');
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) throw new RuntimeException('بريد المستلم غير صحيح');
        if ($c['host'] === '' || $c['user'] === '' || $c['pass'] === '' || !filter_var($c['from_email'], FILTER_VALIDATE_EMAIL)) throw new RuntimeException('إعدادات SMTP ناقصة');
        $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);
        $f = @stream_socket_client(($c['secure'] === 'ssl' ? 'ssl://' : 'tcp://') . $c['host'] . ':' . $c['port'], $en, $es, 12, STREAM_CLIENT_CONNECT, $ctx);
        if (!$f) throw new RuntimeException('تعذر الاتصال بخادم البريد: ' . ($es ?: 'لا استجابة'));
        stream_set_timeout($f, 20);
        $read = function () use ($f) { $o = ''; while (($l = fgets($f, 1024)) !== false) { $o .= $l; if (strlen($l) < 4 || $l[3] !== '-') break; } return $o; };
        $cmd = function (string $line, array $ok) use ($f, $read) {
            fwrite($f, $line . "\r\n"); $r = $read();
            if (!in_array((int)substr($r, 0, 3), $ok, true)) throw new RuntimeException('رد الخادم: ' . trim(mb_substr($r, 0, 160)));
            return $r;
        };
        $r = $read(); if ((int)substr($r, 0, 3) !== 220) throw new RuntimeException('رد غير متوقع من الخادم');
        $dom = substr(strrchr($c['from_email'], '@'), 1);
        $cmd('EHLO ' . $dom, [250]);
        if ($c['secure'] === 'tls') {
            $cmd('STARTTLS', [220]);
            if (!stream_socket_enable_crypto($f, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) throw new RuntimeException('فشل تشفير الاتصال (TLS)');
            $cmd('EHLO ' . $dom, [250]);
        }
        $cmd('AUTH LOGIN', [334]); $cmd(base64_encode($c['user']), [334]);
        fwrite($f, base64_encode($c['pass']) . "\r\n"); $r = $read();
        if ((int)substr($r, 0, 3) !== 235) throw new RuntimeException('فشل تسجيل الدخول لحساب البريد (تحقق من اسم المستخدم وكلمة المرور)');
        $cmd('MAIL FROM:<' . $c['from_email'] . '>', [250]);
        $cmd('RCPT TO:<' . $to . '>', [250, 251]);
        $cmd('DATA', [354]);
        $b = 'b' . bin2hex(random_bytes(8));
        $msg = 'From: ' . mimeEnc($c['from_name']) . ' <' . $c['from_email'] . ">\r\n"
            . 'To: <' . $to . ">\r\n"
            . 'Subject: ' . mimeEnc($subject) . "\r\n"
            . 'Date: ' . date('r') . "\r\n"
            . 'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . $dom . ">\r\n"
            . "MIME-Version: 1.0\r\nAuto-Submitted: auto-generated\r\nX-Auto-Response-Suppress: All\r\n"
            . "Content-Type: multipart/alternative; boundary=\"$b\"\r\n\r\n"
            . "--$b\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text), 76, "\r\n")
            . "--$b\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html), 76, "\r\n")
            . "--$b--\r\n";
        fwrite($f, $msg . ".\r\n");
        $r = $read(); if ((int)substr($r, 0, 3) !== 250) throw new RuntimeException('رفض الخادم الرسالة: ' . trim(mb_substr($r, 0, 160)));
        @fwrite($f, "QUIT\r\n"); @fclose($f);
    } catch (Throwable $e) { $err = $e->getMessage(); if (!empty($f) && is_resource($f)) @fclose($f); }
    try { q('INSERT INTO mail_log (to_email,subject,kind,status,error) VALUES (?,?,?,?,?)', [mb_substr($to, 0, 190), mb_substr($subject, 0, 190), $kind, $err === '' ? 'sent' : 'failed', mb_substr($err, 0, 300)]); } catch (Throwable $e) { }
    return ['ok' => $err === '', 'error' => $err];
}

/* ---------- قوالب الرسائل (HTML منسق + نص عادي) ---------- */
function mailLayout(string $title, string $inner, string $pre = ''): string {
    $site = h(mailCfg()['site_url']);
    $font = "font-family:Tahoma,'Segoe UI',Arial,sans-serif";
    return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . h($title) . '</title></head>'
        . '<body style="margin:0;padding:0;background:#f3efe3;">'
        . '<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;color:transparent;">' . h($pre) . '</span>'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3efe3;padding:24px 12px;"><tr><td align="center">'
        . '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;">'
        . '<tr><td align="center" bgcolor="#0b5d45" style="background:#0b5d45;background-image:linear-gradient(135deg,#0b5d45,#14956b);padding:26px 24px;">'
        . '<div style="font-size:30px;line-height:1;">📖</div>'
        . '<div style="' . $font . ';font-size:23px;font-weight:bold;color:#ffffff;margin-top:8px;">@@PN@@</div>'
        . '<div style="' . $font . ';font-size:14px;color:#ffe08a;margin-top:6px;">﴿ وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ ﴾</div></td></tr>'
        . '<tr><td dir="rtl" style="padding:28px 28px 24px;' . $font . ';font-size:15px;line-height:1.9;color:#1d2b26;text-align:right;">' . $inner . '</td></tr>'
        . '<tr><td align="center" bgcolor="#faf7ee" style="background:#faf7ee;border-top:1px solid #e8e2d3;padding:16px 24px;' . $font . ';font-size:12px;line-height:1.8;color:#6b7d75;">'
        . 'هذه رسالة آلية من <a href="' . $site . '" style="color:#0b5d45;text-decoration:none;">' . $site . '</a><br>يرجى عدم الرد عليها.</td></tr>'
        . '</table></td></tr></table></body></html>';
}
function mailBtn(string $url, string $label): string {
    return '<div style="text-align:center;margin:24px 0 6px;"><a href="' . h($url) . '" style="display:inline-block;background:#0b5d45;color:#ffffff;text-decoration:none;padding:13px 34px;border-radius:12px;font-weight:bold;font-size:15px;">' . h($label) . '</a></div>';
}
function mailPlainFoot(): string { return "\n\n— @@PN@@\n" . mailCfg()['site_url'] . "\nهذه رسالة آلية، يرجى عدم الرد عليها."; }

function sendOtpMail(string $to, string $name, string $code, int $minutes = 10): array {
    $name = $name !== '' ? $name : 'عزيزي المستخدم';
    $inner = '<p style="margin:0 0 6px;font-size:17px;font-weight:bold;color:#0b5d45;">مرحباً ' . h($name) . ' 👋</p>'
        . '<p style="margin:0;">استخدم الرمز التالي لتسجيل الدخول إلى منصة @@PN@@:</p>'
        . '<div style="direction:ltr;text-align:center;margin:22px 0;"><span style="display:inline-block;background:#e3f4ec;border:2px dashed #14956b;border-radius:14px;padding:14px 26px;font-family:Consolas,Menlo,monospace;font-size:34px;letter-spacing:10px;font-weight:bold;color:#0b5d45;">' . h($code) . '</span></div>'
        . '<p style="margin:0 0 8px;">⏱ الرمز صالح لمدة <b>' . $minutes . ' دقائق</b> ويُستخدم مرة واحدة.</p>'
        . '<p style="margin:0;padding:12px 14px;background:#fff6e0;border-radius:10px;color:#8a6200;font-size:13.5px;">🔒 لا تشارك هذا الرمز مع أحد، ولن يطلبه منك أي موظف. وإن لم تطلب تسجيل الدخول فتجاهل هذه الرسالة.</p>';
    $text = "مرحباً $name\n\nرمز الدخول إلى @@PN@@: $code\nصالح لمدة $minutes دقائق ويُستخدم مرة واحدة.\nلا تشارك الرمز مع أحد. وإن لم تطلبه فتجاهل الرسالة." . mailPlainFoot();
    return smtpSend($to, "رمز الدخول إلى @@PN@@: $code", mailLayout('رمز الدخول', $inner, "رمز الدخول: $code — صالح $minutes دقائق"), $text, 'otp');
}
function sendInviteMail(string $to, string $name, string $role, string $school, array $students = []): array {
    $site = mailCfg()['site_url'];
    $roleAr = ['parent' => 'ولي أمر', 'teacher' => 'معلم', 'school_admin' => 'مدير', 'solo' => 'معلم مستقل', 'student' => 'طالب'][$role] ?? 'مستخدم';
    $kids = '';
    if ($students) $kids = '<p style="margin:14px 0 6px;font-weight:bold;color:#0b5d45;">' . ($role === 'parent' ? 'الأبناء المرتبطون بحسابك:' : 'الطلاب:') . '</p><ul style="margin:0;padding:0 22px 0 0;">'
        . implode('', array_map(fn($s) => '<li style="margin:2px 0;">' . h($s) . '</li>', $students)) . '</ul>';
    $inner = '<p style="margin:0 0 6px;font-size:17px;font-weight:bold;color:#0b5d45;">مرحباً ' . h($name) . ' 🌿</p>'
        . '<p style="margin:0;">تمت إضافتك بصفة <b>' . h($roleAr) . '</b>' . ($school !== '' ? ' في <b>' . h($school) . '</b>' : '') . ' على منصة @@PN@@، لمتابعة الحفظ والمراجعة والتسميع.</p>'
        . $kids
        . '<div style="margin:20px 0 4px;padding:14px 16px;background:#f4fbf7;border-right:4px solid #14956b;border-radius:10px;">'
        . '<b style="color:#0b5d45;">كيف تدخل؟</b><br>1) افتح المنصة من الزر أدناه.<br>2) اختر «الدخول بالبريد» واكتب بريدك هذا.<br>3) سيصلك رمز من 6 أرقام، أدخله لتدخل مباشرة — دون كلمة مرور.</div>'
        . mailBtn($site, 'الدخول إلى المنصة');
    $text = "مرحباً $name\n\nتمت إضافتك بصفة $roleAr" . ($school !== '' ? " في $school" : '') . " على منصة @@PN@@.\n"
        . ($students ? "الطلاب: " . implode('، ', $students) . "\n" : '') . "\nللدخول: افتح $site واختر «الدخول بالبريد»، ثم أدخل الرمز الذي يصلك على هذا البريد." . mailPlainFoot();
    return smtpSend($to, 'دعوة للانضمام إلى @@PN@@' . ($school !== '' ? " — $school" : ''), mailLayout('دعوة', $inner, 'تمت إضافتك إلى منصة @@PN@@'), $text, 'invite');
}
function sendApprovedMail(string $to, string $name, string $what): array {
    $site = mailCfg()['site_url'];
    $inner = '<p style="margin:0 0 6px;font-size:17px;font-weight:bold;color:#0b5d45;">مرحباً ' . h($name) . ' 🎉</p>'
        . '<p style="margin:0;">تمت الموافقة على طلب تسجيلك (' . h($what) . ') في منصة @@PN@@، وأصبح حسابك مفعّلاً.</p>'
        . '<p style="margin:14px 0 0;">يمكنك الدخول الآن ببريدك الإلكتروني برمز يصلك، أو بكلمة المرور التي اخترتها.</p>' . mailBtn($site, 'الدخول إلى المنصة');
    $text = "مرحباً $name\n\nتمت الموافقة على طلب تسجيلك ($what) وأصبح حسابك مفعّلاً.\nللدخول: $site" . mailPlainFoot();
    return smtpSend($to, 'تمت الموافقة على طلب تسجيلك', mailLayout('تمت الموافقة', $inner, 'تمت الموافقة على طلب تسجيلك'), $text, 'approved');
}
function sendTestMail(string $to): array {
    $c = mailCfg();
    $inner = '<p style="margin:0 0 6px;font-size:17px;font-weight:bold;color:#0b5d45;">رسالة تجربة ✅</p>'
        . '<p style="margin:0;">إذا وصلتك هذه الرسالة منسقة بشكل سليم فإعدادات البريد تعمل بنجاح.</p>'
        . '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%;border:1px solid #e8e2d3;border-radius:10px;font-size:14px;">'
        . '<tr><td style="padding:8px 12px;color:#6b7d75;width:36%;">المرسِل</td><td style="padding:8px 12px;" dir="ltr">' . h($c['from_email']) . '</td></tr>'
        . '<tr><td style="padding:8px 12px;color:#6b7d75;border-top:1px solid #f0ece0;">الخادم</td><td style="padding:8px 12px;border-top:1px solid #f0ece0;" dir="ltr">' . h($c['host'] . ':' . $c['port'] . ' (' . $c['secure'] . ')') . '</td></tr>'
        . '<tr><td style="padding:8px 12px;color:#6b7d75;border-top:1px solid #f0ece0;">الوقت</td><td style="padding:8px 12px;border-top:1px solid #f0ece0;">' . h(date('Y-m-d H:i')) . '</td></tr></table>'
        . '<div style="direction:ltr;text-align:center;margin:10px 0;"><span style="display:inline-block;background:#e3f4ec;border:2px dashed #14956b;border-radius:14px;padding:10px 22px;font-family:Consolas,Menlo,monospace;font-size:26px;letter-spacing:8px;font-weight:bold;color:#0b5d45;">123456</span></div>'
        . '<p style="margin:0;font-size:13px;color:#6b7d75;">(الرمز أعلاه للعرض فقط)</p>';
    $text = "رسالة تجربة من @@PN@@\nالمرسِل: {$c['from_email']}\nالخادم: {$c['host']}:{$c['port']} ({$c['secure']})\nإذا وصلتك فالإعدادات سليمة." . mailPlainFoot();
    return smtpSend($to, 'رسالة تجربة — @@PN@@', mailLayout('رسالة تجربة', $inner, 'رسالة تجربة لإعدادات البريد'), $text, 'test');
}

/* ---------- رموز الدخول (OTP) ---------- */
function otpHash(string $code): string { return hash_hmac('sha256', $code, encKey()); }

/* ================= إعدادات افتراضية + لوحة التحكم ================= */
const SETTING_DEFAULTS = [
    'reg_open' => '1', 'login_password' => '1', 'login_otp_email' => '1', 'login_otp_wa' => '0', 'login_otp_sms' => '0',
    'otp_ttl' => '10', 'otp_max_attempts' => '5', 'otp_cooldown' => '60', 'otp_hour_limit' => '6',
    'otp_message' => 'رمز الدخول إلى {platform}: {code} (صالح {minutes} دقائق). لا تشاركه مع أحد.',
    'beta_badge' => '🧪 نسخة تجريبية • مجانية حالياً', 'platform_name' => 'سَنَد', 'platform_tagline' => 'منصة متابعة الحفظ والقراءات والإجازات', 'platform_logo' => '',
    'beta_note' => 'المنصة في مرحلة التجربة والتطوير، والاستخدام مجاني خلال هذه الفترة. قد تُضاف ميزات جديدة وقد يتغير بعضها، وملاحظاتك تساعدنا على تحسينها.',
    'week_start' => '6', 'announce_on' => '0', 'announce_title' => '', 'announce_text' => '', 'announce_audience' => 'all',
    'phone_cc' => '966',
    'gw_wa_on' => '0', 'gw_wa_url' => '', 'gw_wa_method' => 'POST', 'gw_wa_body' => '', 'gw_wa_headers' => '',
    'gw_sms_on' => '0', 'gw_sms_url' => '', 'gw_sms_method' => 'POST', 'gw_sms_body' => '', 'gw_sms_headers' => '',
];
function cfgv(string $k): string { return setting($k, SETTING_DEFAULTS[$k] ?? ''); }

/** سجل النشاط */
function audit(string $action, string $detail = '', string $target = ''): void {
    try {
        $uid = $_SESSION['uid'] ?? null; $row = $uid ? q('SELECT username,role FROM users WHERE id=?', [$uid])->fetch() : null;
        q('INSERT INTO audit_log (user_id,username,role,action,target,detail,ip) VALUES (?,?,?,?,?,?,?)',
            [$uid, $row['username'] ?? '', $row['role'] ?? '', mb_substr($action, 0, 40), mb_substr($target, 0, 60), mb_substr($detail, 0, 250), ip()]);
    } catch (Throwable $e) { }
}

/** رقم الجوال بالصيغة الدولية (بدون +) */
function phoneIntl(string $p): string {
    $d = preg_replace('/\D/', '', $p);
    if (str_starts_with($d, '00')) return substr($d, 2);
    if (str_starts_with($p, '+')) return $d;
    $cc = preg_replace('/\D/', '', cfgv('phone_cc')) ?: '966';
    if (str_starts_with($d, '0')) return $cc . substr($d, 1);
    return strlen($d) <= 9 ? $cc . $d : $d;
}
function userByPhone(string $phone): ?array {
    $tail = substr(preg_replace('/\D/', '', $phone), -9);
    if (strlen($tail) < 8) return null;
    foreach (q("SELECT * FROM users WHERE active=1 AND phone IS NOT NULL AND phone<>''")->fetchAll() as $u)
        if (substr(preg_replace('/\D/', '', $u['phone']), -9) === $tail) return $u;
    return null;
}
function otpText(string $code, int $minutes): string { return strtr(cfgv('otp_message'), ['{code}' => $code, '{minutes}' => (string)$minutes, '{platform}' => cfgv('platform_name')]); }

/** بوابة عامة للرسائل (واتساب / SMS): قالب رابط + ترويسات + نص، تُملأ فيه {to} {message} {code} */
function gatewaySend(string $ch, string $to, string $message): array {
    $err = ''; $info = '';
    try {
        if (!in_array($ch, ['wa', 'sms'], true)) throw new RuntimeException('قناة غير معروفة');
        if (cfgv("gw_{$ch}_on") !== '1') throw new RuntimeException('القناة غير مفعّلة');
        $url = cfgv("gw_{$ch}_url"); if ($url === '') throw new RuntimeException('رابط البوابة غير مضبوط');
        $headers = decSecret(cfgv("gw_{$ch}_headers")); $method = strtoupper(cfgv("gw_{$ch}_method")) === 'GET' ? 'GET' : 'POST';
        $json = stripos($headers, 'application/json') !== false;
        $vars = ['to' => phoneIntl($to), 'message' => $message];
        $fill = function (string $tpl, string $mode) use ($vars) {
            return preg_replace_callback('/\{(to|message)\}/', function ($m) use ($vars, $mode) {
                $v = $vars[$m[1]];
                return $mode === 'url' ? rawurlencode($v) : ($mode === 'json' ? substr(json_encode($v, JSON_UNESCAPED_UNICODE), 1, -1) : rawurlencode($v));
            }, $tpl);
        };
        $u = $fill($url, 'url');
        $host = parse_url($u, PHP_URL_HOST); if (!$host || !preg_match('#^https?://#i', $u)) throw new RuntimeException('رابط البوابة غير صحيح');
        $ip = gethostbyname($host);                                         // حماية: لا نسمح بالعناوين الداخلية
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) throw new RuntimeException('عنوان البوابة غير مسموح');
        $h = array_values(array_filter(array_map('trim', preg_split('/\r?\n/', $headers))));
        $ch2 = curl_init($u);
        curl_setopt_array($ch2, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_FOLLOWLOCATION => false, CURLOPT_SSL_VERIFYPEER => true, CURLOPT_HTTPHEADER => $h]);
        if ($method === 'POST') {
            $body = $fill(cfgv("gw_{$ch}_body"), $json ? 'json' : 'form');
            curl_setopt($ch2, CURLOPT_POST, true); curl_setopt($ch2, CURLOPT_POSTFIELDS, $body);
        }
        $resp = curl_exec($ch2); $code = (int)curl_getinfo($ch2, CURLINFO_RESPONSE_CODE); $ce = curl_error($ch2); curl_close($ch2);
        $info = 'HTTP ' . $code . ($resp ? ' — ' . mb_substr(preg_replace('/\s+/', ' ', (string)$resp), 0, 160) : '');
        if ($resp === false) throw new RuntimeException('تعذر الاتصال: ' . $ce);
        if ($code < 200 || $code >= 300) throw new RuntimeException($info);
    } catch (Throwable $e) { $err = $e->getMessage(); }
    try { q('INSERT INTO mail_log (to_email,subject,kind,status,error) VALUES (?,?,?,?,?)', [mb_substr($to, 0, 190), $ch === 'wa' ? 'واتساب' : 'رسالة نصية', $ch, $err === '' ? 'sent' : 'failed', mb_substr($err ?: $info, 0, 300)]); } catch (Throwable $e) { }
    return ['ok' => $err === '', 'error' => $err, 'info' => $info];
}
