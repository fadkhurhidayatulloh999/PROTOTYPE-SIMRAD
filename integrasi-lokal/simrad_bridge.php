<?php
// --- Izin jaringan lokal untuk browser (Chrome Private Network Access) ---
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: *');
header('Access-Control-Allow-Private-Network: true');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
// ============================================================
// JEMBATAN SIMRAD -> KHANZA (hanya-baca / read-only)
// File ini tinggal di laptop pemilik Khanza (folder htdocs XAMPP).
// Password database TIDAK pernah keluar dari laptop ini.
// Jembatan hanya menjalankan perintah yang sudah ditentukan
// di bawah ini (tidak menerima perintah bebas dari luar),
// dan akun databasenya sendiri hanya boleh MELIHAT (SELECT).
// ============================================================

// >>> SATU-SATUNYA BARIS YANG PERLU DIISI <<<
$DB_PASS = 'GANTI_DENGAN_PASSWORD_SIMRAD_RO';   // password user simrad_ro (isi di salinan htdocs saja)
$DB_USER = 'simrad_ro';
$DB_HOST = '127.0.0.1';
$DB_NAME = 'sik';

// >>> DUA BARIS INI UNTUK ORTHANC (gudang gambar DICOM) <<<
$ORTHO_USER = 'simrad';   // username Orthanc (misalnya simrad)
$ORTHO_PASS = 'GANTI_DENGAN_PASSWORD_ORTHANC';   // password Orthanc (isi di salinan htdocs saja)

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

function jawab($data) { echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE); exit; }

$conn = @new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);
if ($conn->connect_error) {
    jawab(['ok' => false, 'pesan' => 'Jembatan tidak bisa masuk ke database. Cek password di file ini.']);
}
$conn->set_charset('utf8mb4');

$act = isset($_GET['act']) ? $_GET['act'] : 'ping';

// --- Daftar tabel yang benar-benar ada (untuk validasi nama tabel) ---
$daftarTabel = [];
$res = $conn->query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = '" . $DB_NAME . "'");
while ($row = $res->fetch_row()) { $daftarTabel[] = $row[0]; }

if ($act === 'ping') {
    jawab(['ok' => true, 'pesan' => 'Jembatan tersambung ke database sik sebagai simrad_ro (hanya-baca).']);
}

if ($act === 'tables') {
    $out = [];
    $res = $conn->query("SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA = '" . $DB_NAME . "' ORDER BY TABLE_NAME");
    while ($row = $res->fetch_assoc()) { $out[] = ['tabel' => $row['TABLE_NAME'], 'perkiraan_baris' => $row['TABLE_ROWS']]; }
    jawab(['ok' => true, 'jumlah_tabel' => count($out), 'tabel' => $out]);
}

if ($act === 'describe') {
    $t = isset($_GET['table']) ? $_GET['table'] : '';
    if (!in_array($t, $daftarTabel, true)) { jawab(['ok' => false, 'pesan' => 'Nama tabel tidak dikenal.']); }
    $out = [];
    $res = $conn->query("SHOW COLUMNS FROM `" . $t . "`");
    while ($row = $res->fetch_assoc()) { $out[] = ['kolom' => $row['Field'], 'tipe' => $row['Type'], 'kunci' => $row['Key']]; }
    jawab(['ok' => true, 'tabel' => $t, 'kolom' => $out]);
}

if ($act === 'sample') {
    $t = isset($_GET['table']) ? $_GET['table'] : '';
    if (!in_array($t, $daftarTabel, true)) { jawab(['ok' => false, 'pesan' => 'Nama tabel tidak dikenal.']); }
    $limit = isset($_GET['limit']) ? max(1, min(20, intval($_GET['limit']))) : 5;
    $out = [];
    $res = $conn->query("SELECT * FROM `" . $t . "` LIMIT " . $limit);
    if ($res) { while ($row = $res->fetch_assoc()) { $out[] = $row; } }
    jawab(['ok' => true, 'tabel' => $t, 'contoh' => $out]);
}

if ($act === 'count') {
    $t = isset($_GET['table']) ? $_GET['table'] : '';
    if (!in_array($t, $daftarTabel, true)) { jawab(['ok' => false, 'pesan' => 'Nama tabel tidak dikenal.']); }
    $res = $conn->query("SELECT COUNT(*) AS n FROM `" . $t . "`");
    $row = $res->fetch_assoc();
    jawab(['ok' => true, 'tabel' => $t, 'jumlah_baris' => intval($row['n'])]);
}

if ($act === 'worklist') {
    // Daftar order radiologi terbaru, sudah digabung dengan nama pasien dan nama pemeriksaannya.
    $limit = isset($_GET['limit']) ? max(1, min(50, intval($_GET['limit']))) : 20;
    $sql = "SELECT pr.noorder, pr.no_rawat, pr.tgl_permintaan, pr.jam_permintaan, pr.status, pr.diagnosa_klinis, "
         . "rp.no_rkm_medis, p.nm_pasien, jpr.nm_perawatan "
         . "FROM permintaan_radiologi pr "
         . "JOIN reg_periksa rp ON rp.no_rawat = pr.no_rawat "
         . "JOIN pasien p ON p.no_rkm_medis = rp.no_rkm_medis "
         . "LEFT JOIN permintaan_pemeriksaan_radiologi ppr ON ppr.noorder = pr.noorder "
         . "LEFT JOIN jns_perawatan_radiologi jpr ON jpr.kd_jenis_prw = ppr.kd_jenis_prw "
         . "ORDER BY pr.tgl_permintaan DESC, pr.jam_permintaan DESC LIMIT " . $limit;
    $out = [];
    $res = $conn->query($sql);
    if ($res) { while ($row = $res->fetch_assoc()) { $out[] = $row; } }
    jawab(['ok' => true, 'jumlah' => count($out), 'worklist' => $out]);
}

if ($act === 'hasil') {
    // Laporan radiologi terbaru (teks hasil dipotong 500 huruf).
    $limit = isset($_GET['limit']) ? max(1, min(50, intval($_GET['limit']))) : 10;
    $sql = "SELECT h.no_rawat, h.tgl_periksa, h.jam, LEFT(h.hasil, 500) AS hasil, p.nm_pasien, rp.no_rkm_medis "
         . "FROM hasil_radiologi h "
         . "JOIN reg_periksa rp ON rp.no_rawat = h.no_rawat "
         . "JOIN pasien p ON p.no_rkm_medis = rp.no_rkm_medis "
         . "ORDER BY h.tgl_periksa DESC, h.jam DESC LIMIT " . $limit;
    $out = [];
    $res = $conn->query($sql);
    if ($res) { while ($row = $res->fetch_assoc()) { $out[] = $row; } }
    jawab(['ok' => true, 'jumlah' => count($out), 'hasil' => $out]);
}

if ($act === 'orthanc') {
    // Mengetuk Orthanc di laptop yang sama (localhost) memakai akun yang diisi di atas.
    $ambil = function($path) use ($ORTHO_USER, $ORTHO_PASS) {
        $ch = curl_init('http://127.0.0.1:8042' . $path);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_USERPWD, $ORTHO_USER . ':' . $ORTHO_PASS);
        curl_setopt($ch, CURLOPT_TIMEOUT, 20);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return [$code, json_decode($body, true)];
    };
    list($kodeSys, $sys) = $ambil('/system');
    if ($kodeSys !== 200) {
        jawab(['ok' => false, 'pesan' => 'Orthanc menolak (kode ' . $kodeSys . '). Cek username/password Orthanc di file jembatan ini.']);
    }
    list($kodeStat, $stat) = $ambil('/statistics');
    list($kodeStudies, $studies) = $ambil('/studies');
    jawab([
        'ok' => true,
        'orthanc_nama' => isset($sys['Name']) ? $sys['Name'] : null,
        'orthanc_versi' => isset($sys['Version']) ? $sys['Version'] : null,
        'jumlah_studi' => is_array($studies) ? count($studies) : null,
        'statistik' => $stat
    ]);
}

if ($act === 'bacaan') {
    // Worklist radiolog: pemeriksaan yang sudah dikerjakan, digabung nama pemeriksaan,
    // pasien, dan laporan hasil (bila sudah dibaca/diketik di Khanza).
    $limit = isset($_GET['limit']) ? max(1, min(50, intval($_GET['limit']))) : 20;
    $sql = "SELECT pr.no_rawat, pr.tgl_periksa, pr.jam, pr.kd_jenis_prw, jpr.nm_perawatan, pr.status, pr.proyeksi, pr.dosis, "
         . "rp.no_rkm_medis, p.nm_pasien, h.hasil "
         . "FROM periksa_radiologi pr "
         . "LEFT JOIN jns_perawatan_radiologi jpr ON jpr.kd_jenis_prw = pr.kd_jenis_prw "
         . "JOIN reg_periksa rp ON rp.no_rawat = pr.no_rawat "
         . "JOIN pasien p ON p.no_rkm_medis = rp.no_rkm_medis "
         . "LEFT JOIN hasil_radiologi h ON h.no_rawat = pr.no_rawat AND h.tgl_periksa = pr.tgl_periksa AND h.jam = pr.jam "
         . "ORDER BY pr.tgl_periksa DESC, pr.jam DESC LIMIT " . $limit;
    $out = [];
    $res = $conn->query($sql);
    if ($res) { while ($row = $res->fetch_assoc()) { $row['sudah_dibaca'] = ($row['hasil'] !== null && trim($row['hasil']) !== ''); $out[] = $row; } }
    jawab(['ok' => true, 'jumlah' => count($out), 'bacaan' => $out]);
}

if ($act === 'studi') {
    // Daftar studi DICOM di Orthanc, lengkap dengan seri dan instance-nya (untuk viewer).
    $ambilJ = function($path) use ($ORTHO_USER, $ORTHO_PASS) {
        $ch = curl_init('http://127.0.0.1:8042' . $path);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_USERPWD, $ORTHO_USER . ':' . $ORTHO_PASS);
        curl_setopt($ch, CURLOPT_TIMEOUT, 20);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return [$code, json_decode($body, true)];
    };
    list($kodeIds, $ids) = $ambilJ('/studies');
    if ($kodeIds !== 200 || !is_array($ids)) {
        jawab(['ok' => false, 'pesan' => 'Orthanc tidak menjawab daftar studi (kode ' . $kodeIds . ').']);
    }
    $out = [];
    foreach (array_slice($ids, 0, 20) as $sid) {
        list($kodeS, $s) = $ambilJ('/studies/' . $sid);
        if ($kodeS !== 200 || !is_array($s)) { continue; }
        $tags = isset($s['MainDicomTags']) ? $s['MainDicomTags'] : [];
        $seriOut = [];
        foreach ((isset($s['Series']) ? $s['Series'] : []) as $serid) {
            list($kodeSer, $ser) = $ambilJ('/series/' . $serid);
            if ($kodeSer !== 200 || !is_array($ser)) { continue; }
            $stags = isset($ser['MainDicomTags']) ? $ser['MainDicomTags'] : [];
            $seriOut[] = [
                'id' => $serid,
                'modalitas' => isset($stags['Modality']) ? $stags['Modality'] : null,
                'deskripsi' => isset($stags['SeriesDescription']) ? $stags['SeriesDescription'] : null,
                'instances' => isset($ser['Instances']) ? $ser['Instances'] : []
            ];
        }
        $out[] = [
            'id' => $sid,
            'pasien' => isset($tags['PatientName']) ? $tags['PatientName'] : null,
            'id_pasien' => isset($tags['PatientID']) ? $tags['PatientID'] : null,
            'tanggal' => isset($tags['StudyDate']) ? $tags['StudyDate'] : null,
            'deskripsi' => isset($tags['StudyDescription']) ? $tags['StudyDescription'] : null,
            'seri' => $seriOut
        ];
    }
    jawab(['ok' => true, 'jumlah' => count($out), 'studi' => $out]);
}

if ($act === 'pratinjau') {
    // Gambar pratinjau PNG satu instance DICOM, dirender oleh Orthanc, diteruskan apa adanya.
    $iid = isset($_GET['instance']) ? $_GET['instance'] : '';
    if (!preg_match('/^[a-f0-9\-]{36,}$/', $iid)) {
        jawab(['ok' => false, 'pesan' => 'ID instance tidak sah.']);
    }
    $ch = curl_init('http://127.0.0.1:8042/instances/' . $iid . '/preview');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_USERPWD, $ORTHO_USER . ':' . $ORTHO_PASS);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code !== 200 || $body === false || $body === '') {
        jawab(['ok' => false, 'pesan' => 'Pratinjau tidak tersedia (kode ' . $code . ').']);
    }
    header('Content-Type: image/png');
    header('Content-Length: ' . strlen($body));
    echo $body;
    exit;
}

if ($act === 'kpi') {
    // KPI untuk kepala ruangan: TAT, beban kerja dokter, volume harian, antrean.
    $kpi = ['ok' => true];
    $res = $conn->query("SELECT COUNT(*) AS n, "
        . "AVG(TIMESTAMPDIFF(MINUTE, CONCAT(tgl_permintaan,' ',jam_permintaan), CONCAT(tgl_hasil,' ',jam_hasil))) AS rata_total, "
        . "AVG(TIMESTAMPDIFF(MINUTE, CONCAT(tgl_permintaan,' ',jam_permintaan), CONCAT(tgl_sampel,' ',jam_sampel))) AS rata_tunggu, "
        . "AVG(TIMESTAMPDIFF(MINUTE, CONCAT(tgl_sampel,' ',jam_sampel), CONCAT(tgl_hasil,' ',jam_hasil))) AS rata_proses, "
        . "SUM(CASE WHEN TIMESTAMPDIFF(MINUTE, CONCAT(tgl_permintaan,' ',jam_permintaan), CONCAT(tgl_hasil,' ',jam_hasil)) < 120 THEN 1 ELSE 0 END) AS di_bawah_2jam "
        . "FROM permintaan_radiologi WHERE tgl_hasil > '2000-01-01' AND tgl_sampel > '2000-01-01' "
        . "AND TIMESTAMPDIFF(MINUTE, CONCAT(tgl_permintaan,' ',jam_permintaan), CONCAT(tgl_hasil,' ',jam_hasil)) >= 0");
    $tat = $res ? $res->fetch_assoc() : null;
    if ($tat) {
        $tat['n'] = intval($tat['n']);
        $tat['di_bawah_2jam'] = intval($tat['di_bawah_2jam']);
        $tat['rata_total'] = $tat['rata_total'] !== null ? round(floatval($tat['rata_total']), 1) : null;
        $tat['rata_tunggu'] = $tat['rata_tunggu'] !== null ? round(floatval($tat['rata_tunggu']), 1) : null;
        $tat['rata_proses'] = $tat['rata_proses'] !== null ? round(floatval($tat['rata_proses']), 1) : null;
    }
    $kpi['tat'] = $tat;

    $kpi['beban_dokter'] = [];
    $res = $conn->query("SELECT pr.kd_dokter, COALESCE(d.nm_dokter, pr.kd_dokter) AS nm_dokter, COUNT(*) AS jumlah "
        . "FROM periksa_radiologi pr LEFT JOIN dokter d ON d.kd_dokter = pr.kd_dokter "
        . "GROUP BY pr.kd_dokter, d.nm_dokter ORDER BY jumlah DESC LIMIT 10");
    if ($res) { while ($row = $res->fetch_assoc()) { $row['jumlah'] = intval($row['jumlah']); $kpi['beban_dokter'][] = $row; } }

    $kpi['per_hari'] = [];
    $res = $conn->query("SELECT tgl_periksa AS tanggal, COUNT(*) AS jumlah FROM periksa_radiologi GROUP BY tgl_periksa ORDER BY tgl_periksa DESC LIMIT 14");
    if ($res) { while ($row = $res->fetch_assoc()) { $row['jumlah'] = intval($row['jumlah']); $kpi['per_hari'][] = $row; } }

    $kpi['per_jenis'] = [];
    $res = $conn->query("SELECT pr.kd_jenis_prw, COALESCE(j.nm_perawatan, pr.kd_jenis_prw) AS nm_perawatan, COUNT(*) AS jumlah "
        . "FROM periksa_radiologi pr LEFT JOIN jns_perawatan_radiologi j ON j.kd_jenis_prw = pr.kd_jenis_prw "
        . "GROUP BY pr.kd_jenis_prw, j.nm_perawatan ORDER BY jumlah DESC LIMIT 8");
    if ($res) { while ($row = $res->fetch_assoc()) { $row['jumlah'] = intval($row['jumlah']); $kpi['per_jenis'][] = $row; } }

    $res = $conn->query("SELECT COUNT(*) AS n FROM periksa_radiologi pr "
        . "LEFT JOIN hasil_radiologi h ON h.no_rawat = pr.no_rawat AND h.tgl_periksa = pr.tgl_periksa AND h.jam = pr.jam "
        . "WHERE h.no_rawat IS NULL");
    $row = $res ? $res->fetch_assoc() : null;
    $kpi['belum_dibaca'] = $row ? intval($row['n']) : null;

    $res = $conn->query("SELECT pr.tgl_periksa, pr.jam, COALESCE(j.nm_perawatan, pr.kd_jenis_prw) AS nm_perawatan "
        . "FROM periksa_radiologi pr "
        . "LEFT JOIN hasil_radiologi h ON h.no_rawat = pr.no_rawat AND h.tgl_periksa = pr.tgl_periksa AND h.jam = pr.jam "
        . "LEFT JOIN jns_perawatan_radiologi j ON j.kd_jenis_prw = pr.kd_jenis_prw "
        . "WHERE h.no_rawat IS NULL ORDER BY pr.tgl_periksa ASC, pr.jam ASC LIMIT 1");
    $kpi['tertua_belum_dibaca'] = $res ? $res->fetch_assoc() : null;

    $res = $conn->query("SELECT COUNT(*) AS n FROM permintaan_radiologi pm "
        . "LEFT JOIN periksa_radiologi pr ON pr.no_rawat = pm.no_rawat WHERE pr.no_rawat IS NULL");
    $row = $res ? $res->fetch_assoc() : null;
    $kpi['order_belum_dikerjakan'] = $row ? intval($row['n']) : null;

    $kpi['jam_sibuk'] = [];
    $res = $conn->query("SELECT HOUR(jam) AS jam, COUNT(*) AS jumlah FROM periksa_radiologi GROUP BY HOUR(jam) ORDER BY jam");
    if ($res) { while ($row = $res->fetch_assoc()) { $row['jam'] = intval($row['jam']); $row['jumlah'] = intval($row['jumlah']); $kpi['jam_sibuk'][] = $row; } }

    jawab($kpi);
}

// ============================================================
// MODE TULIS (DUA ARAH) — hanya untuk lingkungan uji pribadi.
// Menulis memakai akun terpisah simrad_rw (INSERT saja pada 3
// tabel radiologi) dan wajib menyertakan kunci tulis. Akun baca
// simrad_ro di atas TIDAK diubah sama sekali.
// >>> DUA BARIS INI WAJIB DIISI DI SALINAN HTDOCS <<<
$RW_PASS = 'GANTI_DENGAN_PASSWORD_RW';        // password user simrad_rw
$KUNCI_TULIS = 'GANTI_DENGAN_KUNCI_TULIS';    // kata rahasia bebas, samakan dengan yang diketik di dashboard

if ($act === 'calon_order') {
    // Bahan formulir buat order: kunjungan terbaru + daftar jenis pemeriksaan.
    $kunjungan = [];
    $res = $conn->query("SELECT rp.no_rawat, rp.no_rkm_medis, p.nm_pasien, rp.tgl_registrasi, rp.jam_reg, rp.status_lanjut "
        . "FROM reg_periksa rp JOIN pasien p ON p.no_rkm_medis = rp.no_rkm_medis "
        . "ORDER BY rp.tgl_registrasi DESC, rp.jam_reg DESC LIMIT 30");
    if ($res) { while ($row = $res->fetch_assoc()) { $kunjungan[] = $row; } }
    $jenis = [];
    $res = $conn->query("SELECT kd_jenis_prw, nm_perawatan FROM jns_perawatan_radiologi ORDER BY nm_perawatan");
    if ($res) { while ($row = $res->fetch_assoc()) { $jenis[] = $row; } }
    jawab(['ok' => true, 'kunjungan' => $kunjungan, 'jenis' => $jenis]);
}

if ($act === 'buat_order' || $act === 'tulis_hasil') {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        jawab(['ok' => false, 'pesan' => 'Perintah tulis harus memakai POST.']);
    }
    $kunci = isset($_POST['kunci']) ? $_POST['kunci'] : '';
    if (!hash_equals($KUNCI_TULIS, $kunci)) {
        jawab(['ok' => false, 'pesan' => 'Kunci tulis salah — order/bacaan tidak ditulis. Periksa kunci tulis di dashboard dan di file jembatan ini.']);
    }
    $rw = @new mysqli($DB_HOST, 'simrad_rw', $RW_PASS, $DB_NAME);
    if ($rw->connect_error) {
        jawab(['ok' => false, 'pesan' => 'Akun tulis simrad_rw belum siap. Jalankan dulu simrad_rw_setup.sql dan samakan password-nya di file jembatan ini.']);
    }
    $rw->set_charset('utf8mb4');

    if ($act === 'buat_order') {
        $no_rawat = isset($_POST['no_rawat']) ? trim($_POST['no_rawat']) : '';
        $kd_jenis = isset($_POST['kd_jenis_prw']) ? trim($_POST['kd_jenis_prw']) : '';
        $diagnosa = isset($_POST['diagnosa']) ? trim($_POST['diagnosa']) : '';
        if ($no_rawat === '' || $kd_jenis === '') {
            jawab(['ok' => false, 'pesan' => 'Kunjungan dan jenis pemeriksaan wajib dipilih.']);
        }
        if (strlen($diagnosa) > 200) { $diagnosa = substr($diagnosa, 0, 200); }

        $stmt = $conn->prepare("SELECT kd_dokter, status_lanjut FROM reg_periksa WHERE no_rawat = ?");
        $stmt->bind_param('s', $no_rawat);
        $stmt->execute();
        $reg = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$reg) { jawab(['ok' => false, 'pesan' => 'No. Rawat tidak ditemukan di reg_periksa — order dibatalkan.']); }

        $stmt = $conn->prepare("SELECT nm_perawatan FROM jns_perawatan_radiologi WHERE kd_jenis_prw = ?");
        $stmt->bind_param('s', $kd_jenis);
        $stmt->execute();
        $jns = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$jns) { jawab(['ok' => false, 'pesan' => 'Jenis pemeriksaan tidak dikenal — order dibatalkan.']); }

        $awalan = 'PR' . date('Ymd');
        $res = $conn->query("SELECT MAX(noorder) AS m FROM permintaan_radiologi WHERE noorder LIKE '" . $awalan . "%'");
        $baris = $res ? $res->fetch_assoc() : null;
        $urut = 1;
        if ($baris && $baris['m']) { $urut = intval(substr($baris['m'], -3)) + 1; }
        $noorder = $awalan . str_pad(strval($urut), 3, '0', STR_PAD_LEFT);
        $status = strtolower($reg['status_lanjut'] ?? 'ralan');
        if ($status !== 'ranap' && $status !== 'ralan') { $status = 'ralan'; }
        $tgl = date('Y-m-d');
        $jam = date('H:i:s');
        $info = 'Order dari dashboard SIMRAD (uji dua arah)';

        $rw->begin_transaction();
        try {
            $stmt = $rw->prepare("INSERT INTO permintaan_radiologi (noorder, no_rawat, tgl_permintaan, jam_permintaan, tgl_sampel, jam_sampel, tgl_hasil, jam_hasil, dokter_perujuk, status, informasi_tambahan, diagnosa_klinis) VALUES (?, ?, ?, ?, '0000-00-00', '00:00:00', '0000-00-00', '00:00:00', ?, ?, ?, ?)");
            $stmt->bind_param('ssssssss', $noorder, $no_rawat, $tgl, $jam, $reg['kd_dokter'], $status, $info, $diagnosa);
            $stmt->execute();
            $stmt->close();
            $stmt = $rw->prepare("INSERT INTO permintaan_pemeriksaan_radiologi (noorder, kd_jenis_prw, stts_bayar) VALUES (?, ?, 'Belum')");
            $stmt->bind_param('ss', $noorder, $kd_jenis);
            $stmt->execute();
            $stmt->close();
            $rw->commit();
        } catch (Throwable $e) {
            $rw->rollback();
            jawab(['ok' => false, 'pesan' => 'Gagal menulis order ke Khanza — tidak ada yang tersimpan.']);
        }
        jawab(['ok' => true, 'pesan' => 'Order berhasil ditulis ke Khanza.', 'noorder' => $noorder, 'nm_perawatan' => $jns['nm_perawatan'], 'no_rawat' => $no_rawat, 'status' => $status]);
    }

    if ($act === 'tulis_hasil') {
        $no_rawat = isset($_POST['no_rawat']) ? trim($_POST['no_rawat']) : '';
        $tgl_periksa = isset($_POST['tgl_periksa']) ? trim($_POST['tgl_periksa']) : '';
        $jam = isset($_POST['jam']) ? trim($_POST['jam']) : '';
        $hasil = isset($_POST['hasil']) ? trim($_POST['hasil']) : '';
        if ($no_rawat === '' || $tgl_periksa === '' || $jam === '' || $hasil === '') {
            jawab(['ok' => false, 'pesan' => 'Pemeriksaan dan teks bacaan wajib diisi.']);
        }
        if (strlen($hasil) > 4000) { $hasil = substr($hasil, 0, 4000); }

        $stmt = $conn->prepare("SELECT COUNT(*) AS n FROM periksa_radiologi WHERE no_rawat = ? AND tgl_periksa = ? AND jam = ?");
        $stmt->bind_param('sss', $no_rawat, $tgl_periksa, $jam);
        $stmt->execute();
        $ada = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$ada || intval($ada['n']) === 0) { jawab(['ok' => false, 'pesan' => 'Pemeriksaan tidak ditemukan di periksa_radiologi — bacaan dibatalkan.']); }

        $stmt = $conn->prepare("SELECT COUNT(*) AS n FROM hasil_radiologi WHERE no_rawat = ? AND tgl_periksa = ? AND jam = ?");
        $stmt->bind_param('sss', $no_rawat, $tgl_periksa, $jam);
        $stmt->execute();
        $sudah = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($sudah && intval($sudah['n']) > 0) { jawab(['ok' => false, 'pesan' => 'Pemeriksaan ini sudah mempunyai bacaan di Khanza — tidak ditulis ulang.']); }

        $stmt = $rw->prepare("INSERT INTO hasil_radiologi (no_rawat, tgl_periksa, jam, hasil) VALUES (?, ?, ?, ?)");
        $stmt->bind_param('ssss', $no_rawat, $tgl_periksa, $jam, $hasil);
        $sukses = $stmt->execute();
        $stmt->close();
        if (!$sukses) { jawab(['ok' => false, 'pesan' => 'Gagal menulis bacaan ke Khanza.']); }
        jawab(['ok' => true, 'pesan' => 'Bacaan berhasil ditulis ke Khanza (tabel hasil_radiologi).', 'no_rawat' => $no_rawat, 'tgl_periksa' => $tgl_periksa, 'jam' => $jam]);
    }
}

jawab(['ok' => false, 'pesan' => 'Perintah tidak dikenal. Pakai act=ping, act=tables, act=describe, act=sample, act=count, act=worklist, act=hasil, act=bacaan, act=studi, act=pratinjau, act=kpi, act=calon_order, act=buat_order, act=tulis_hasil, atau act=orthanc.']);
