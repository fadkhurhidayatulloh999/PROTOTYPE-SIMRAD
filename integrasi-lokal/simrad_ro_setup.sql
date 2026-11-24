-- ============================================================================
-- SIMRAD — User MariaDB read-only untuk integrasi RIS dengan Khanza (SIMRS)
-- Dibuat: 21 Nov 2026, untuk UAS Sistem Informasi Radiologi (RSUD Bina Sehat)
-- ============================================================================
-- CARA PAKAI (pilih salah satu):
--   A. Command Prompt (paling mudah, tanpa ketik baris demi baris):
--        1. Edit file ini dulu: ganti SEMUA 'password_pilihanmu' dengan
--           password buatanmu sendiri, dan ganti 'sik' bila nama database
--           Khanza di laptopmu berbeda (cek dengan: SHOW DATABASES;).
--        2. Di CMD, masuk ke folder berisi file ini, lalu jalankan:
--             mysql -u root -p < simrad_ro_setup.sql
--        3. Ketik password root MariaDB saat diminta, lalu Enter.
--   B. HeidiSQL (bawaan Khanza): buka file ini, lalu jalankan (F9).
--
-- PENTING: password 'simrad_ro' ini JANGAN diketik di chat. Setelah file ini
-- berhasil dijalankan, cukup bilang "user sudah dibuat" — Muse akan menyiapkan
-- jalur aman untuk memasukkan passwordnya, lalu menguji baca tabel radiologi.
-- User ini hanya punya hak SELECT (baca saja), bukan root, dan hanya boleh
-- konek dari perangkat Muse (100.x.x.x / perangkat-agen.tailnet.ts.net).
-- ============================================================================

-- 1. Buat user khusus RIS (read-only) yang diizinkan dari host Muse.
--    Jika muncul ERROR 1396 (user sudah ada), lewati baris CREATE USER dan
--    jalankan baris ALTER USER di bawah yang masih dikomentari itu.
CREATE USER 'simrad_ro'@'100.x.x.x' IDENTIFIED BY 'password_pilihanmu';
CREATE USER 'simrad_ro'@'perangkat-agen.tailnet.ts.net' IDENTIFIED BY 'password_pilihanmu';
-- ALTER USER 'simrad_ro'@'100.x.x.x' IDENTIFIED BY 'password_pilihanmu';
-- ALTER USER 'simrad_ro'@'perangkat-agen.tailnet.ts.net' IDENTIFIED BY 'password_pilihanmu';

-- 2. Beri hak baca (SELECT) pada database Khanza.
--    Ganti 'sik' dengan nama database Khanza-mu bila berbeda.
GRANT SELECT ON sik.* TO 'simrad_ro'@'100.x.x.x';
GRANT SELECT ON sik.* TO 'simrad_ro'@'perangkat-agen.tailnet.ts.net';
FLUSH PRIVILEGES;

-- 3. Verifikasi — hasilnya harus menampilkan 2 baris user dan hak SELECT.
SELECT user, host FROM mysql.user WHERE user = 'simrad_ro';
SHOW GRANTS FOR 'simrad_ro'@'100.x.x.x';
SHOW GRANTS FOR 'simrad_ro'@'perangkat-agen.tailnet.ts.net';

-- 4. (Opsional, untuk memastikan nama database) — jalankan bila belum yakin:
-- SHOW DATABASES;
-- USE sik;
-- SHOW TABLES LIKE '%radiologi%';
-- SHOW TABLES LIKE '%periksa%';
