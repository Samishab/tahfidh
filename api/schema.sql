CREATE TABLE IF NOT EXISTS schools (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  logo MEDIUMTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(60) NOT NULL,
  name VARCHAR(120) NOT NULL,
  role ENUM('admin','school_admin','teacher','parent','student') NOT NULL,
  school_id INT UNSIGNED NULL,
  phone VARCHAR(30) NULL,
  pass_hash VARCHAR(255) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  qiraat TINYINT(1) NOT NULL DEFAULT 0,
  must_change TINYINT(1) NOT NULL DEFAULT 1,
  last_login DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_username (username),
  KEY idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS students (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  school_id INT UNSIGNED NULL,
  teacher_id INT UNSIGNED NULL,
  grp VARCHAR(80) NULL,
  riwaya VARCHAR(20) NOT NULL DEFAULT 'hafs',
  program VARCHAR(10) NOT NULL DEFAULT 'hifz',
  hafiz TINYINT(1) NOT NULL DEFAULT 0,
  hafiz_where VARCHAR(160) NULL,
  hafiz_note VARCHAR(300) NULL,
  user_id INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_teacher (teacher_id),
  KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS parent_student (
  parent_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (parent_id, student_id),
  KEY idx_student (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS records (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  teacher_id INT UNSIGNED NULL,
  rec_date DATE NOT NULL,
  type ENUM('hifz','review','qiraa') NOT NULL,
  surah TINYINT UNSIGNED NOT NULL,
  ayah_from SMALLINT UNSIGNED NOT NULL,
  surah_to TINYINT UNSIGNED NULL,
  ayah_to SMALLINT UNSIGNED NOT NULL,
  grade VARCHAR(20) NOT NULL DEFAULT '',
  riwaya VARCHAR(20) NOT NULL DEFAULT 'hafs',
  enrollment_id INT UNSIGNED NULL,
  note TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_student_date (student_id, rec_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS messages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  sender_id INT UNSIGNED NULL,
  body TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_student (student_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS message_reads (
  user_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  last_id INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS login_attempts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ip VARCHAR(45) NOT NULL,
  username VARCHAR(60) NOT NULL,
  at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ip (ip, at),
  KEY idx_user (username, at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS signup_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role ENUM('parent','teacher','school') NOT NULL,
  school_name VARCHAR(120) NULL,
  name VARCHAR(120) NOT NULL,
  username VARCHAR(60) NOT NULL,
  pass_hash VARCHAR(255) NOT NULL,
  school_id INT UNSIGNED NULL,
  children VARCHAR(300) NULL,
  ip VARCHAR(45) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_req_user (username),
  KEY idx_req_ip (ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS certificates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  serial VARCHAR(24) NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  student_name VARCHAR(120) NOT NULL,
  school_name VARCHAR(120) NOT NULL DEFAULT '',
  kind ENUM('khatm','period','custom','qiraat') NOT NULL,
  title VARCHAR(160) NOT NULL,
  riwaya VARCHAR(20) NOT NULL DEFAULT 'hafs',
  enrollment_id INT UNSIGNED NULL,
  riwaya_label VARCHAR(200) NOT NULL DEFAULT '',
  period_from DATE NULL,
  period_to DATE NULL,
  grade VARCHAR(20) NOT NULL DEFAULT '',
  note VARCHAR(300) NULL,
  issued_by INT UNSIGNED NULL,
  issuer_name VARCHAR(120) NOT NULL DEFAULT '',
  issued_at DATE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_serial (serial),
  KEY idx_cert_student (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS enrollments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  kind ENUM('riwaya','qiraa','jam') NOT NULL,
  riwayat VARCHAR(255) NOT NULL,
  label VARCHAR(200) NOT NULL,
  status ENUM('active','completed') NOT NULL DEFAULT 'active',
  prior TINYINT(1) NOT NULL DEFAULT 0,
  started_at DATE NULL,
  completed_at DATE NULL,
  shaykh VARCHAR(160) NULL,
  note VARCHAR(300) NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_enr_student (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
