-- ============================================================
-- AKUN TULIS SIMRAD (DUA ARAH) — KHUSUS LINGKUNGAN UJI PRIBADI
-- Jalankan file ini sebagai root MariaDB (sama seperti setup
-- akun baca simrad_ro). Akun ini HANYA boleh MENAMBAH baris
-- (INSERT) pada 3 tabel radiologi — tidak bisa melihat semua
-- data, tidak bisa mengubah, tidak bisa menghapus.
-- Ganti password_pilihanmu dengan password buatanmu sendiri
-- (samakan persis dengan yang nanti diisi di file jembatan).
-- ============================================================

CREATE USER 'simrad_rw'@'127.0.0.1' IDENTIFIED BY 'Kurehidayat09';
CREATE USER 'simrad_rw'@'localhost' IDENTIFIED BY 'Kurehidayat09';

GRANT INSERT ON sik.permintaan_radiologi TO 'simrad_rw'@'127.0.0.1';
GRANT INSERT ON sik.permintaan_pemeriksaan_radiologi TO 'simrad_rw'@'127.0.0.1';
GRANT INSERT ON sik.hasil_radiologi TO 'simrad_rw'@'127.0.0.1';

GRANT INSERT ON sik.permintaan_radiologi TO 'simrad_rw'@'localhost';
GRANT INSERT ON sik.permintaan_pemeriksaan_radiologi TO 'simrad_rw'@'localhost';
GRANT INSERT ON sik.hasil_radiologi TO 'simrad_rw'@'localhost';

-- Cek hasilnya (harus tampil 6 baris GRANT INSERT):
SHOW GRANTS FOR 'simrad_rw'@'127.0.0.1';
SHOW GRANTS FOR 'simrad_rw'@'localhost';
