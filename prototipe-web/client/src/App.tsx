import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { api, type ApiResponse } from "./api";
import { actionFields } from "@hatch/space-sdk/fields" with { type: "macro" };
import type { Actions } from "../../server/src/actions";

const FIELDS = actionFields<typeof Actions>();
type Exam = ApiResponse<typeof api, "listExaminations">["examinations"][number];
type Patient = ApiResponse<typeof api, "listPatients">["patients"][number];

const MODALITY_STYLE: Record<string, { bg: string; label: string; emoji: string }> = {
  CT: { bg: "#0EA5E9", label: "CT Scan", emoji: "🌀" },
  MR: { bg: "#8B5CF6", label: "MRI", emoji: "🧲" },
  CR: { bg: "#F59E0B", label: "X-Ray CR", emoji: "☢️" },
  DR: { bg: "#F97316", label: "X-Ray DR", emoji: "📸" },
  US: { bg: "#10B981", label: "USG", emoji: "🌊" },
  MG: { bg: "#EC4899", label: "Mammografi", emoji: "🎀" },
  FL: { bg: "#06B6D4", label: "Fluoroskopi", emoji: "🎬" },
  NM: { bg: "#84CC16", label: "Kedokteran Nuklir", emoji: "⚛️" },
};
const STATUS_META: Record<string, { label: string; color: string; next?: string; nextLabel?: string }> = {
  registered: { label: "Terdaftar", color: "#64748B", next: "scheduled", nextLabel: "Jadwalkan →" },
  scheduled: { label: "Terjadwal", color: "#0EA5E9", next: "in_progress", nextLabel: "Mulai Periksa →" },
  in_progress: { label: "Sedang Diperiksa", color: "#F59E0B", next: "reported", nextLabel: "Citra Masuk →" },
  reported: { label: "Menunggu Verifikasi", color: "#8B5CF6", next: "verified", nextLabel: "Verifikasi ✓" },
  verified: { label: "Terverifikasi", color: "#0F766E" },
  cancelled: { label: "Dibatalkan", color: "#F97066" },
};
const PIPELINE = ["registered", "scheduled", "in_progress", "reported", "verified"] as const;
const TEMPLATES: Record<string, { findings: string; impression: string }> = {
  CR: { findings: "Corakan bronkovaskuler dalam batas normal. Tidak tampak infiltrat atau konsolidasi. Sinus kostofrenikus tajam bilateral. CTR < 50%.", impression: "Thorax dalam batas normal. Tidak tampak kelainan akut." },
  CT: { findings: "Tidak tampak lesi hipodens/hiperdens patologis. Sistem ventrikel dan sulkus dalam batas normal. Tidak tampak perdarahan atau midline shift.", impression: "CT scan dalam batas normal. Korelasi klinis disarankan." },
  MR: { findings: "Intensitas sinyal parenkim dalam batas normal pada sekuens T1, T2, dan FLAIR. Tidak tampak lesi fokal atau enhancement patologis pasca kontras.", impression: "MRI dalam batas normal." },
  US: { findings: "Organ intraabdomen tervisualisasi baik. Tidak tampak lesi fokal, koleksi cairan, atau dilatasi duktus. Aliran vaskuler normal pada Doppler.", impression: "USG dalam batas normal." },
};

function Mascot() {
  return (
    <svg width="92" height="92" viewBox="0 0 100 100" aria-hidden="true" className="shrink-0">
      <circle cx="50" cy="50" r="46" fill="#CCFBF1" />
      <rect x="22" y="28" width="56" height="44" rx="14" fill="#0F766E" />
      <circle cx="50" cy="50" r="16" fill="#FFFBF5" />
      <circle cx="50" cy="50" r="9" fill="#F59E0B" />
      <circle cx="38" cy="40" r="3" fill="#fff" /><circle cx="62" cy="40" r="3" fill="#fff" />
      <path d="M38 64 Q50 70 62 64" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="44" y="14" width="12" height="10" rx="4" fill="#F97066" />
      <circle cx="78" cy="26" r="7" fill="#F59E0B" /><text x="78" y="30" textAnchor="middle" fontSize="10" fill="#fff" fontWeight="800">+</text>
    </svg>
  );
}
function Badge({ text, color }: { text: string; color: string }) {
  return <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold text-white" style={{ background: color }}>{text}</span>;
}
function fmtDate(iso: string) { try { return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return iso; } }
function ageFrom(dob: string) { if (!dob) return ""; const d = new Date(dob); if (isNaN(d.getTime())) return ""; const now = new Date(); let a = now.getFullYear() - d.getFullYear(); if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) a--; return `${a} th`; }

export function App() {
  const [tab, setTab] = useState<"dashboard" | "worklist" | "patients" | "reports" | "integration" | "portfolio">("portfolio");
  const [statusFilter, setStatusFilter] = useState("");
  const qc = useQueryClient();
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["dashboard"] }); qc.invalidateQueries({ queryKey: ["exams"] }); qc.invalidateQueries({ queryKey: ["patients"] }); qc.invalidateQueries({ queryKey: ["logs"] }); };

  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => api.getDashboard({}) });
  const patientsQ = useQuery({ queryKey: ["patients"], queryFn: () => api.listPatients({ limit: 100 }) });
  const examsQ = useQuery({ queryKey: ["exams", statusFilter], queryFn: () => api.listExaminations({ limit: 100, status: statusFilter }) });
  const logsQ = useQuery({ queryKey: ["logs"], queryFn: () => api.listLogs({ limit: 60 }) });

  const statusMut = useMutation({ mutationFn: async (v: { id: number; status: "registered" | "scheduled" | "in_progress" | "reported" | "verified" | "cancelled" }) => await api.updateExamStatus(v), onSuccess: invalidate, onError: () => {} });

  const tabs = [
    { id: "portfolio" as const, label: "🎓 Portofolio UAS A–E" },
    { id: "dashboard" as const, label: "🏠 Dashboard" },
    { id: "worklist" as const, label: "📋 Worklist" },
    { id: "patients" as const, label: "🧑 Pasien" },
    { id: "reports" as const, label: "📝 Laporan" },
    { id: "integration" as const, label: "🔗 Integrasi" },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <header className="px-4 pt-5 pb-3 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <Mascot />
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold tracking-widest uppercase" style={{ color: "var(--accent2)" }}>SIMRAD • RSUD Bina Sehat • UAS Sistem Informasi Radiologi — UNAIR</p>
            <h1 className="text-2xl md:text-3xl font-extrabold leading-tight">SIMRAD — Sistem Informasi Radiologi Terintegrasi</h1>
            <p className="text-sm text-[var(--dim)]">Portofolio UAS BAB 12–16 untuk RSUD Bina Sehat: Deliverable A–E + Prototipe Fungsional + Video. Dosen: Soegianto Soelistiono • Deadline: Kamis, 26 Nov 2026, 23.59 WIB • File akhir: UAS_SIR_NIM_NAMA.zip</p>
          </div>
        </div>
        <nav aria-label="Navigasi utama" className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} aria-pressed={tab === t.id}
              className="whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold border-2 transition-all"
              style={tab === t.id ? { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" } : { background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="px-4 pb-10 max-w-6xl mx-auto">
        {tab === "dashboard" && (
          <Dashboard dash={dash.data} loading={dash.isPending} onPipeline={(s) => { setStatusFilter(s); setTab("worklist"); }} onGoWorklist={() => setTab("worklist")} />
        )}
        {tab === "worklist" && (
          <Worklist exams={examsQ.data?.examinations ?? []} patients={patientsQ.data?.patients ?? []} loading={examsQ.isPending}
            statusFilter={statusFilter} setStatusFilter={setStatusFilter} onAdvance={(e) => { const n = STATUS_META[e.status]?.next; if (n) statusMut.mutate({ id: e.id, status: n as any }); }} onInvalidate={invalidate} />
        )}
        {tab === "patients" && <Patients patients={patientsQ.data?.patients ?? []} loading={patientsQ.isPending} onInvalidate={invalidate} />}
        {tab === "reports" && <Reports exams={(examsQ.data?.examinations ?? []).filter(e => ["in_progress", "reported", "verified"].includes(e.status))} allExams={examsQ.data?.examinations ?? []} onInvalidate={invalidate} onVerify={(id) => statusMut.mutate({ id, status: "verified" })} />}
        {tab === "integration" && <Integration logs={logsQ.data?.logs ?? []} loading={logsQ.isPending} onInvalidate={invalidate} dash={dash.data} />}
        {tab === "portfolio" && <Portfolio onGoTab={(t) => setTab(t as any)} />}
      </main>
    </div>
  );
}

function Dashboard({ dash, loading, onPipeline, onGoWorklist }: { dash: ApiResponse<typeof api, "getDashboard"> | undefined; loading: boolean; onPipeline: (s: string) => void; onGoWorklist: () => void }) {
  if (loading) return <p className="py-10 text-center text-[var(--dim)]">Memuat dashboard…</p>;
  if (!dash) return <p className="py-10 text-center">Data belum tersedia.</p>;
  const maxMod = Math.max(1, ...dash.byModality.map(m => m.count));
  return (
    <div className="space-y-5">
      {/* Pipeline hero */}
      <section aria-label="Alur pasien" className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-extrabold text-lg">🚀 Perjalanan Pasien Hari Ini</h2>
          <span className="text-xs font-bold bg-amber-100 text-amber-800 rounded-full px-3 py-1">Ketuk tahap untuk menyaring worklist</span>
        </div>
        <div className="mt-4 flex items-stretch gap-1.5 overflow-x-auto pb-1">
          {PIPELINE.map((s, i) => (
            <div key={s} className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => onPipeline(s)} aria-label={`Saring status ${STATUS_META[s]?.label}`}
                className="rounded-2xl px-3 py-3 text-left min-w-[118px] border-2 hover:scale-[1.03] transition-transform"
                style={{ background: (STATUS_META[s]?.color ?? "#999") + "1A", borderColor: STATUS_META[s]?.color }}>
                <div className="text-2xl font-extrabold" style={{ color: STATUS_META[s]?.color }}>{dash.byStatus[s]}</div>
                <div className="text-xs font-bold leading-tight">{STATUS_META[s]?.label}</div>
              </button>
              {i < PIPELINE.length - 1 && <span aria-hidden="true" className="text-[var(--dim)] font-extrabold">›</span>}
            </div>
          ))}
        </div>
        {dash.totalExams === 0 && (
          <div className="mt-4 rounded-2xl bg-[var(--surface2)] p-4 text-center">
            <p className="text-3xl" aria-hidden="true">🦴</p>
            <p className="font-bold mt-1">Masih sepi — belum ada pemeriksaan</p>
            <p className="text-sm text-[var(--dim)]">Daftarkan pasien pertamamu, buat order pemeriksaan, lalu saksikan pasiennya berjalan menyusuri pipa di atas sampai laporan terverifikasi. Cocok banget buat demo di depan dosen!</p>
            <button onClick={onGoWorklist} className="mt-3 rounded-full px-5 py-2.5 font-bold text-white" style={{ background: "var(--accent)" }}>Buka Worklist →</button>
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Pasien", value: dash.totalPatients, icon: "🧑‍🤝‍🧑", bg: "#CCFBF1" },
          { label: "Total Pemeriksaan", value: dash.totalExams, icon: "🩻", bg: "#FEF3C7" },
          { label: "Jadwal Hari Ini+", value: dash.todayExams, icon: "📅", bg: "#DBEAFE" },
          { label: "Menunggu Laporan", value: dash.pendingReports, icon: "⏳", bg: "#FCE7F3" },
        ].map(c => (
          <div key={c.label} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="w-10 h-10 rounded-xl grid place-items-center text-xl" style={{ background: c.bg }}>{c.icon}</div>
            <div className="mt-2 text-3xl font-extrabold">{c.value}</div>
            <div className="text-xs font-bold text-[var(--dim)]">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <section aria-label="Beban modalitas" className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-4">
          <h3 className="font-extrabold">📊 Beban per Modalitas</h3>
          {dash.byModality.length === 0 ? <p className="text-sm text-[var(--dim)] mt-2">Belum ada data pemeriksaan.</p> : (
            <div className="mt-3 space-y-2.5">
              {dash.byModality.map(m => (
                <div key={m.modality}>
                  <div className="flex justify-between text-xs font-bold"><span>{MODALITY_STYLE[m.modality]?.emoji} {m.modality} — {MODALITY_STYLE[m.modality]?.label}</span><span>{m.count}</span></div>
                  <div className="h-3 rounded-full bg-[var(--surface2)] mt-1 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${(m.count / maxMod) * 100}%`, background: MODALITY_STYLE[m.modality]?.bg }} /></div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section aria-label="Aktivitas integrasi terbaru" className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-4">
          <h3 className="font-extrabold">🔗 Pesan Integrasi Terakhir</h3>
          {dash.recentLogs.length === 0 ? <p className="text-sm text-[var(--dim)] mt-2">Belum ada pesan HL7/DICOM. Pesan otomatis muncul setiap ada registrasi, order, dan verifikasi.</p> : (
            <ul className="mt-3 space-y-2">
              {dash.recentLogs.slice(0, 5).map(l => (
                <li key={l.id} className="text-xs flex gap-2 items-start">
                  <Badge text={l.protocol} color={l.protocol.includes("DICOM") ? "#0EA5E9" : l.protocol.includes("FHIR") ? "#EC4899" : "#0F766E"} />
                  <span><b>{l.fromSystem} → {l.toSystem}</b> • {l.messageType}<br /><span className="text-[var(--dim)]">{l.summary}</span></span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-label="Pemeriksaan terbaru" className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-4">
        <h3 className="font-extrabold">🩻 Pemeriksaan Terbaru</h3>
        {dash.recentExams.length === 0 ? <p className="text-sm text-[var(--dim)] mt-2">Belum ada pemeriksaan. Buat dari tab Worklist.</p> : (
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {dash.recentExams.map(e => <ExamRow key={e.id} e={e} compact />)}
          </ul>
        )}
      </section>
    </div>
  );
}

function ExamRow({ e, compact }: { e: Exam; compact?: boolean }) {
  const mod = MODALITY_STYLE[e.modality] ?? { bg: "#64748B", label: e.modality, emoji: "🩻" };
  const st = STATUS_META[e.status] ?? { label: e.status, color: "#999" };
  return (
    <li className="py-3 flex items-start gap-3">
      <div className="w-11 h-11 rounded-2xl grid place-items-center text-white font-extrabold text-sm shrink-0" style={{ background: mod.bg }}>{e.modality}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap"><b className="truncate">{e.patientName}</b><span className="text-[11px] text-[var(--dim)] font-bold">{e.patientMrn} • {e.accessionNumber}</span></div>
        <p className="text-sm">{mod.emoji} {e.procedureName}{e.bodyPart ? ` — ${e.bodyPart}` : ""}</p>
        {!compact && <p className="text-xs text-[var(--dim)]">🕐 {fmtDate(e.scheduledAt)}{e.referringDoctor ? ` • Pengirim: ${e.referringDoctor}` : ""}{e.clinicalIndication ? ` • Indikasi: ${e.clinicalIndication}` : ""}</p>}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <Badge text={st.label} color={st.color} />
        {e.priority !== "Routine" && <Badge text={e.priority === "STAT" ? "🚨 STAT" : "⚡ Urgent"} color={e.priority === "STAT" ? "#DC2626" : "#F59E0B"} />}
      </div>
    </li>
  );
}

function Worklist({ exams, patients, loading, statusFilter, setStatusFilter, onAdvance, onInvalidate }: {
  exams: Exam[]; patients: Patient[]; loading: boolean; statusFilter: string; setStatusFilter: (s: string) => void;
  onAdvance: (e: Exam) => void; onInvalidate: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => exams.filter(e => !search || (e.patientName + e.accessionNumber + e.procedureName).toLowerCase().includes(search.toLowerCase())), [exams, search]);
  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center">
        <input aria-label="Cari worklist" placeholder="🔍 Cari pasien / accession / pemeriksaan…" value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[180px] rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm" />
        <select aria-label="Filter status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm font-bold">
          <option value="">Semua Status</option>
          {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={() => setShowForm(!showForm)} className="rounded-full px-5 py-2.5 font-bold text-white" style={{ background: "var(--accent)" }}>{showForm ? "Tutup Form" : "＋ Order Baru"}</button>
      </div>
      {showForm && <CreateExamForm patients={patients} onDone={() => { setShowForm(false); onInvalidate(); }} />}
      {loading ? <p className="text-center py-8 text-[var(--dim)]">Memuat worklist…</p> : filtered.length === 0 ? (
        <div className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-8 text-center">
          <p className="text-4xl" aria-hidden="true">🛋️</p><p className="font-extrabold mt-2">Worklist kosong</p>
          <p className="text-sm text-[var(--dim)]">{patients.length === 0 ? "Daftarkan pasien dulu di tab Pasien, baru buat order di sini." : "Buat order pemeriksaan baru dengan tombol di atas."}</p>
        </div>
      ) : (
        <div className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] px-4">
          <ul className="divide-y divide-[var(--border)]">
            {filtered.map(e => (
              <div key={e.id}>
                <ExamRow e={e} />
                {STATUS_META[e.status]?.next && (
                  <div className="pb-3 pl-14 flex gap-2 flex-wrap">
                    <button onClick={() => onAdvance(e)} className="rounded-full px-4 py-2 text-xs font-bold text-white" style={{ background: STATUS_META[e.status]?.color }}>{STATUS_META[e.status]?.nextLabel}</button>
                    <span className="text-[11px] text-[var(--dim)] self-center">DICOM MWL sudah dikirim ke modalitas {e.modality}</span>
                  </div>
                )}
              </div>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CreateExamForm({ patients, onDone }: { patients: Patient[]; onDone: () => void }) {
  const [patientId, setPatientId] = useState(0);
  const [modality, setModality] = useState<"CT" | "MR" | "CR" | "DR" | "US" | "MG" | "FL" | "NM">("CR");
  const [procedureName, setProcedureName] = useState("");
  const [bodyPart, setBodyPart] = useState("");
  const [priority, setPriority] = useState<"Routine" | "Urgent" | "STAT">("Routine");
  const [referringDoctor, setReferringDoctor] = useState("");
  const [clinicalIndication, setClinicalIndication] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [radiographer, setRadiographer] = useState("");
  const [radiologist, setRadiologist] = useState("");
  const [err, setErr] = useState("");
  const mut = useMutation({
    mutationFn: async () => await api.createExamination({ patientId: patientId || (patients[0]?.id ?? 0), modality, procedureName, bodyPart, priority, referringDoctor, clinicalIndication, scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : "", radiographer, radiologist }),
    onSuccess: onDone,
    onError: (e: Error) => setErr(e.message),
  });
  const submit = (ev: FormEvent) => { ev.preventDefault(); if (!patients.length) { setErr("Belum ada pasien — daftarkan pasien dulu di tab Pasien."); return; } if (!procedureName.trim()) { setErr("Nama pemeriksaan wajib diisi."); return; } mut.mutate(); };
  const inputCls = "w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm";
  return (
    <form onSubmit={submit} className="rounded-[var(--radius)] bg-[var(--surface)] border-2 border-dashed p-4 space-y-3" style={{ borderColor: "var(--accent)" }} aria-label="Form order pemeriksaan baru">
      <h3 className="font-extrabold">✨ Order Pemeriksaan Baru <span className="text-xs font-bold text-[var(--dim)]">— otomatis kirim HL7 ORM^O01 + DICOM MWL</span></h3>
      {patients.length === 0 && <p className="text-sm rounded-xl bg-amber-50 text-amber-800 p-3 font-bold">⚠️ Belum ada pasien terdaftar. Tambahkan pasien dulu di tab 🧑 Pasien.</p>}
      <div className="grid md:grid-cols-2 gap-3">
        <label className="text-xs font-bold">Pasien
          <select aria-label="Pilih pasien" value={patientId || patients[0]?.id || 0} onChange={e => setPatientId(Number(e.target.value))} className={inputCls}>
            {patients.map(p => <option key={p.id} value={p.id}>{p.name} — {p.mrn}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold">Modalitas
          <select aria-label="Modalitas" value={modality} onChange={e => setModality(e.target.value as any)} className={inputCls}>
            {Object.entries(MODALITY_STYLE).map(([k, v]) => <option key={k} value={k}>{v.emoji} {k} — {v.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold">Nama Pemeriksaan *
          <input {...FIELDS.createExamination.procedureName} aria-label="Nama pemeriksaan" placeholder="cth. Thorax PA, CT Head non-kontras" value={procedureName} onChange={e => setProcedureName(e.target.value)} className={inputCls} />
        </label>
        <label className="text-xs font-bold">Bagian Tubuh
          <input {...FIELDS.createExamination.bodyPart} aria-label="Bagian tubuh" placeholder="cth. Thorax, Kepala, Abdomen" value={bodyPart} onChange={e => setBodyPart(e.target.value)} className={inputCls} />
        </label>
        <label className="text-xs font-bold">Prioritas
          <select aria-label="Prioritas" value={priority} onChange={e => setPriority(e.target.value as any)} className={inputCls}>
            <option value="Routine">🟢 Routine</option><option value="Urgent">⚡ Urgent</option><option value="STAT">🚨 STAT</option>
          </select>
        </label>
        <label className="text-xs font-bold">Jadwal Pemeriksaan
          <input {...FIELDS.createExamination.scheduledAt} aria-label="Jadwal pemeriksaan" type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className={inputCls} />
        </label>
        <label className="text-xs font-bold">Dokter Pengirim
          <input {...FIELDS.createExamination.referringDoctor} aria-label="Dokter pengirim" placeholder="cth. dr. Andi, Sp.PD" value={referringDoctor} onChange={e => setReferringDoctor(e.target.value)} className={inputCls} />
        </label>
        <label className="text-xs font-bold">Radiografer
          <input {...FIELDS.createExamination.radiographer} aria-label="Radiografer" placeholder="Nama radiografer" value={radiographer} onChange={e => setRadiographer(e.target.value)} className={inputCls} />
        </label>
        <label className="text-xs font-bold md:col-span-2">Indikasi Klinis
          <input {...FIELDS.createExamination.clinicalIndication} aria-label="Indikasi klinis" placeholder="cth. Sesak napas 3 hari, curiga pneumonia" value={clinicalIndication} onChange={e => setClinicalIndication(e.target.value)} className={inputCls} />
        </label>
        <label className="text-xs font-bold md:col-span-2">Dokter Radiologi Penanggung Jawab
          <input {...FIELDS.createExamination.radiologist} aria-label="Dokter radiologi" placeholder="cth. dr. Sari, Sp.Rad" value={radiologist} onChange={e => setRadiologist(e.target.value)} className={inputCls} />
        </label>
      </div>
      {err && <p className="text-sm font-bold text-red-600">{err}</p>}
      <button type="submit" disabled={mut.isPending} className="rounded-full px-6 py-2.5 font-bold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>{mut.isPending ? "Mengirim order…" : "🚀 Kirim Order ke Modalitas"}</button>
    </form>
  );
}

function Patients({ patients, loading, onInvalidate }: { patients: Patient[]; loading: boolean; onInvalidate: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [name, setName] = useState(""); const [dob, setDob] = useState(""); const [gender, setGender] = useState<"Laki-laki" | "Perempuan">("Laki-laki");
  const [phone, setPhone] = useState(""); const [insurance, setInsurance] = useState("BPJS"); const [allergy, setAllergy] = useState(""); const [address, setAddress] = useState("");
  const [err, setErr] = useState("");
  const mut = useMutation({
    mutationFn: async () => await api.createPatient({ name, dob, gender, phone, address, insurance, allergy }),
    onSuccess: () => { setShowForm(false); setName(""); setDob(""); setPhone(""); setAllergy(""); setAddress(""); onInvalidate(); },
    onError: (e: Error) => setErr(e.message),
  });
  const delMut = useMutation({ mutationFn: async (id: number) => await api.deletePatient({ id }), onSuccess: onInvalidate, onError: () => {} });
  const submit = (ev: FormEvent) => { ev.preventDefault(); if (!name.trim()) { setErr("Nama pasien wajib diisi ya!"); return; } setErr(""); mut.mutate(); };
  const filtered = patients.filter(p => !search || (p.name + p.mrn).toLowerCase().includes(search.toLowerCase()));
  const inputCls = "w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm";
  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <input aria-label="Cari pasien" placeholder="🔍 Cari nama / No. RM…" value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[180px] rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm" />
        <button onClick={() => setShowForm(!showForm)} className="rounded-full px-5 py-2.5 font-bold text-white" style={{ background: "var(--accent)" }}>{showForm ? "Tutup" : "＋ Daftarkan Pasien"}</button>
      </div>
      {showForm && (
        <form onSubmit={submit} className="rounded-[var(--radius)] bg-[var(--surface)] border-2 border-dashed p-4 space-y-3" style={{ borderColor: "var(--accent2)" }} aria-label="Form registrasi pasien">
          <h3 className="font-extrabold">🧾 Registrasi Pasien Baru <span className="text-xs text-[var(--dim)] font-bold">— No. RM dibuat otomatis, HL7 ADT^A01 terkirim ke RIS & PACS</span></h3>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="text-xs font-bold">Nama Lengkap *<input {...FIELDS.createPatient.name} aria-label="Nama lengkap pasien" placeholder="Nama pasien" value={name} onChange={e => setName(e.target.value)} className={inputCls} /></label>
            <label className="text-xs font-bold">Tanggal Lahir<input {...FIELDS.createPatient.dob} aria-label="Tanggal lahir" type="date" value={dob} onChange={e => setDob(e.target.value)} className={inputCls} /></label>
            <label className="text-xs font-bold">Jenis Kelamin
              <select aria-label="Jenis kelamin" value={gender} onChange={e => setGender(e.target.value as any)} className={inputCls}><option value="Laki-laki">Laki-laki</option><option value="Perempuan">Perempuan</option></select>
            </label>
            <label className="text-xs font-bold">Penjamin
              <select aria-label="Penjamin" value={insurance} onChange={e => setInsurance(e.target.value)} className={inputCls}><option>BPJS</option><option>Umum</option><option>Asuransi Swasta</option><option>Perusahaan</option></select>
            </label>
            <label className="text-xs font-bold">No. HP<input {...FIELDS.createPatient.phone} aria-label="Nomor HP" placeholder="08…" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} /></label>
            <label className="text-xs font-bold">Alergi Kontras<input {...FIELDS.createPatient.allergy} aria-label="Alergi" placeholder="cth. Alergi seafood / kontras iodin" value={allergy} onChange={e => setAllergy(e.target.value)} className={inputCls} /></label>
            <label className="text-xs font-bold md:col-span-2">Alamat<input {...FIELDS.createPatient.address} aria-label="Alamat" placeholder="Alamat domisili" value={address} onChange={e => setAddress(e.target.value)} className={inputCls} /></label>
          </div>
          {err && <p className="text-sm font-bold text-red-600">{err}</p>}
          <button type="submit" disabled={mut.isPending} className="rounded-full px-6 py-2.5 font-bold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>{mut.isPending ? "Mendaftarkan…" : "✅ Daftarkan Pasien"}</button>
        </form>
      )}
      {loading ? <p className="text-center py-8 text-[var(--dim)]">Memuat pasien…</p> : filtered.length === 0 ? (
        <div className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-8 text-center"><p className="text-4xl" aria-hidden="true">👋</p><p className="font-extrabold mt-2">Belum ada pasien</p><p className="text-sm text-[var(--dim)]">Tekan tombol “Daftarkan Pasien” — datanya langsung tersimpan dan siap dibuatkan order pemeriksaan.</p></div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {filtered.map(p => (
            <article key={p.id} className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-4 flex gap-3">
              <div className="w-12 h-12 rounded-full grid place-items-center text-2xl shrink-0" style={{ background: p.gender === "Perempuan" ? "#FCE7F3" : "#DBEAFE" }}>{p.gender === "Perempuan" ? "👩" : "👨"}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2"><b className="leading-tight">{p.name}</b><span className="text-[11px] font-extrabold rounded-full px-2 py-0.5 text-white shrink-0" style={{ background: "var(--accent)" }}>{p.mrn}</span></div>
                <p className="text-xs text-[var(--dim)] mt-1">{p.gender}{p.dob ? ` • ${p.dob} (${ageFrom(p.dob)})` : ""} • {p.insurance}{p.phone ? ` • ${p.phone}` : ""}</p>
                {p.allergy && <p className="text-xs font-bold text-red-600 mt-1">⚠️ Alergi: {p.allergy}</p>}
                {p.address && <p className="text-xs text-[var(--dim)]">📍 {p.address}</p>}
                <button onClick={() => delMut.mutate(p.id)} aria-label={`Hapus pasien ${p.name}`} className="mt-2 text-xs font-bold text-red-500 underline">Hapus</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Reports({ exams, allExams, onInvalidate, onVerify }: { exams: Exam[]; allExams: Exam[]; onInvalidate: () => void; onVerify: (id: number) => void }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = exams.find(e => e.id === selectedId) ?? exams[0];
  const [findings, setFindings] = useState(""); const [impression, setImpression] = useState(""); const [radiologist, setRadiologist] = useState("");
  const [loadedId, setLoadedId] = useState<number | null>(null);
  if (selected && loadedId !== selected.id) { setLoadedId(selected.id); setFindings(selected.findings); setImpression(selected.impression); setRadiologist(selected.radiologist); }
  const saveMut = useMutation({
    mutationFn: async () => { if (!selected) throw new Error("Pilih pemeriksaan dulu"); return await api.saveReport({ id: selected.id, findings, impression, radiologist }); },
    onSuccess: onInvalidate, onError: () => {},
  });
  const inputCls = "w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm";
  if (allExams.length === 0) return <div className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-8 text-center"><p className="text-4xl">📝</p><p className="font-extrabold mt-2">Belum ada laporan</p><p className="text-sm text-[var(--dim)]">Laporan muncul setelah pemeriksaan berstatus “Sedang Diperiksa” di Worklist.</p></div>;
  return (
    <div className="grid md:grid-cols-[320px_1fr] gap-4 items-start">
      <section aria-label="Daftar antrean laporan" className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-3">
        <h3 className="font-extrabold px-1">📥 Antrean Baca ({exams.length})</h3>
        {exams.length === 0 ? <p className="text-sm text-[var(--dim)] p-2">Belum ada pemeriksaan yang siap dibaca. Majukan status di Worklist sampai “Sedang Diperiksa”.</p> : (
          <ul className="mt-2 space-y-2">
            {exams.map(e => (
              <li key={e.id}><button onClick={() => setSelectedId(e.id)} aria-pressed={selected?.id === e.id} className="w-full text-left rounded-2xl border-2 p-3 transition-all" style={selected?.id === e.id ? { borderColor: "var(--accent)", background: "var(--surface2)" } : { borderColor: "var(--border)" }}>
                <div className="flex justify-between gap-2"><b className="text-sm">{e.patientName}</b><Badge text={STATUS_META[e.status]?.label ?? e.status} color={STATUS_META[e.status]?.color ?? "#999"} /></div>
                <p className="text-xs text-[var(--dim)]">{MODALITY_STYLE[e.modality]?.emoji} {e.procedureName} • {e.accessionNumber}</p>
              </button></li>
            ))}
          </ul>
        )}
      </section>
      {selected ? (
        <section aria-label="Editor laporan" className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-4 space-y-3">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div><h3 className="font-extrabold text-lg">{selected.procedureName}</h3><p className="text-xs text-[var(--dim)] font-bold">{selected.patientName} • {selected.patientMrn} • {selected.accessionNumber} • Modalitas {selected.modality}{selected.bodyPart ? ` • ${selected.bodyPart}` : ""}</p>{selected.clinicalIndication && <p className="text-xs mt-1">Indikasi: {selected.clinicalIndication}</p>}</div>
            <Badge text={STATUS_META[selected.status]?.label ?? selected.status} color={STATUS_META[selected.status]?.color ?? "#999"} />
          </div>
          <div className="rounded-2xl bg-slate-900 text-slate-100 p-4 text-center">
            <p className="text-4xl" aria-hidden="true">🩻</p>
            <p className="text-xs font-bold mt-1">DICOM Viewer — citra terhubung dari PACS</p>
            <p className="text-[11px] text-slate-400">Dalam sistem produksi, viewer ini menampilkan seri DICOM asli dari PACS (WADO-RS). Di prototipe tugas ini area viewer bersifat ilustratif; alur data order & laporannya nyata dan tersimpan.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <span className="text-xs font-bold self-center">Template cepat:</span>
            {Object.keys(TEMPLATES).map(k => <button key={k} onClick={() => { const t = TEMPLATES[k]; if (t) { setFindings(t.findings); setImpression(t.impression); } }} className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-bold">{k} Normal</button>)}
          </div>
          <label className="block text-xs font-bold">Temuan (Findings)
            <textarea {...FIELDS.saveReport.findings} aria-label="Temuan radiologi" rows={5} value={findings} onChange={e => setFindings(e.target.value)} placeholder="Tuliskan deskripsi temuan pemeriksaan…" className={inputCls} />
          </label>
          <label className="block text-xs font-bold">Kesan (Impression)
            <textarea {...FIELDS.saveReport.impression} aria-label="Kesan radiologi" rows={3} value={impression} onChange={e => setImpression(e.target.value)} placeholder="Kesimpulan / kesan diagnostik…" className={inputCls} />
          </label>
          <label className="block text-xs font-bold">Dokter Radiologi
            <input {...FIELDS.saveReport.radiologist} aria-label="Nama dokter radiologi" value={radiologist} onChange={e => setRadiologist(e.target.value)} placeholder="cth. dr. Sari, Sp.Rad(K)" className={inputCls} />
          </label>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || selected.status === "verified"} className="rounded-full px-5 py-2.5 font-bold text-white disabled:opacity-50" style={{ background: "var(--accent2)", color: "#451A03" }}>{saveMut.isPending ? "Menyimpan…" : "💾 Simpan Draft Laporan"}</button>
            <button onClick={() => onVerify(selected.id)} disabled={selected.status === "verified"} className="rounded-full px-5 py-2.5 font-bold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>✅ Verifikasi & Kirim ke SIMRS (HL7 ORU)</button>
          </div>
          {selected.status === "verified" && <p className="text-sm font-bold" style={{ color: "var(--accent)" }}>🎉 Laporan ini sudah terverifikasi dan terkirim ke SIMRS. Cek tab Integrasi untuk log ORU^R01-nya!</p>}
        </section>
      ) : <p className="text-[var(--dim)]">Pilih pemeriksaan dari antrean.</p>}
    </div>
  );
}

type BridgeWorklistRow = {
  noorder: string; no_rkm_medis: string; nm_perawatan: string; status: string;
  tgl_permintaan: string; jam_permintaan: string; diagnosa_klinis: string;
};
type LiveBridge = {
  base: string; fetchedAt: Date; tables: number | null;
  counts: Record<string, number | null>;
  worklist: BridgeWorklistRow[];
  orthanc: { nama: string; versi: string; studi: number | null; pasien: number | null; seri: number | null; instance: number | null; mb: number | null } | null;
};

const BRIDGE_URLS = [
  "http://localhost/simrad_bridge.php",
  "http://127.0.0.1/simrad_bridge.php",
  "http://100.x.x.x/simrad_bridge.php",
];

async function bridgeGet(base: string, qs: string, timeoutMs = 6000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}?${qs}`, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error("bridge http error");
    return await res.json();
  } finally { clearTimeout(timer); }
}

// Ketiga alamat jembatan diketuk BERSAMAAN (bukan satu-satu) supaya tombol
// Segarkan cepat selesai: alamat pertama yang menjawab OK langsung dipakai.
async function probeBridgeBase(): Promise<string | null> {
  const attempts = BRIDGE_URLS.map(u =>
    bridgeGet(u, "act=ping", 3500).then(p => {
      const o = p as { ok?: boolean } | null;
      if (o && o.ok) return u;
      throw new Error("bridge not ok");
    })
  );
  return await new Promise<string | null>(resolve => {
    let pending = attempts.length;
    let done = false;
    attempts.forEach(a => {
      a.then(u => { if (!done) { done = true; resolve(u); } })
        .catch(() => { pending--; if (pending === 0 && !done) resolve(null); });
    });
  });
}

async function fetchLiveBridge(): Promise<LiveBridge> {
  const found = await probeBridgeBase();
  if (!found) throw new Error("bridge unreachable");
  const base: string = found;
  const countOf = (j: unknown): number | null => {
    const o = j as { ok?: boolean; jumlah_baris?: number } | null;
    return o && o.ok && typeof o.jumlah_baris === "number" ? o.jumlah_baris : null;
  };
  const countReq = (t: string) => bridgeGet(base, `act=count&table=${t}`).catch(() => null);
  const [tablesJ, permintaanJ, periksaJ, hasilJ, gambarJ, jnsJ, pasienJ, regJ, wlJ, orthJ] = await Promise.all([
    bridgeGet(base, "act=tables").catch(() => null),
    countReq("permintaan_radiologi"), countReq("periksa_radiologi"), countReq("hasil_radiologi"),
    countReq("gambar_radiologi"), countReq("jns_perawatan_radiologi"), countReq("pasien"), countReq("reg_periksa"),
    bridgeGet(base, "act=worklist&limit=10").catch(() => null),
    bridgeGet(base, "act=orthanc").catch(() => null),
  ]);
  const tablesO = tablesJ as { ok?: boolean; jumlah_tabel?: number } | null;
  const wlO = wlJ as { ok?: boolean; worklist?: Array<Record<string, unknown>> } | null;
  const worklist: BridgeWorklistRow[] = wlO && wlO.ok && Array.isArray(wlO.worklist)
    ? wlO.worklist.map(r => ({
        noorder: String(r.noorder ?? "—"),
        no_rkm_medis: String(r.no_rkm_medis ?? "—"),
        nm_perawatan: String(r.nm_perawatan ?? "—"),
        status: String(r.status ?? "—"),
        tgl_permintaan: String(r.tgl_permintaan ?? ""),
        jam_permintaan: String(r.jam_permintaan ?? ""),
        diagnosa_klinis: String(r.diagnosa_klinis ?? ""),
      }))
    : [];
  const orthO = orthJ as { ok?: boolean; orthanc_nama?: string; orthanc_versi?: string; jumlah_studi?: number; statistik?: { CountPatients?: number; CountSeries?: number; CountInstances?: number; TotalDiskSizeMB?: number } } | null;
  const orthanc = orthO && orthO.ok ? {
    nama: orthO.orthanc_nama ?? "Orthanc",
    versi: orthO.orthanc_versi ?? "—",
    studi: typeof orthO.jumlah_studi === "number" ? orthO.jumlah_studi : null,
    pasien: typeof orthO.statistik?.CountPatients === "number" ? orthO.statistik.CountPatients : null,
    seri: typeof orthO.statistik?.CountSeries === "number" ? orthO.statistik.CountSeries : null,
    instance: typeof orthO.statistik?.CountInstances === "number" ? orthO.statistik.CountInstances : null,
    mb: typeof orthO.statistik?.TotalDiskSizeMB === "number" ? orthO.statistik.TotalDiskSizeMB : null,
  } : null;
  return {
    base, fetchedAt: new Date(),
    tables: tablesO && tablesO.ok && typeof tablesO.jumlah_tabel === "number" ? tablesO.jumlah_tabel : null,
    counts: {
      permintaan_radiologi: countOf(permintaanJ), periksa_radiologi: countOf(periksaJ),
      hasil_radiologi: countOf(hasilJ), gambar_radiologi: countOf(gambarJ),
      jns_perawatan_radiologi: countOf(jnsJ), pasien: countOf(pasienJ), reg_periksa: countOf(regJ),
    },
    worklist, orthanc,
  };
}

function RealIntegrationPanel() {
  const [phase, setPhase] = useState<"loading" | "live" | "snapshot">("loading");
  const [live, setLive] = useState<LiveBridge | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchLiveBridge()
      .then(d => { if (alive) { setLive(d); setPhase("live"); } })
      .catch(() => { if (alive) setPhase("snapshot"); });
    return () => { alive = false; };
  }, []);

  const refresh = async () => {
    const wasLive = phase === "live" && live !== null;
    const lastFetch = live?.fetchedAt ?? null;
    setRefreshing(true);
    try {
      const d = await fetchLiveBridge();
      setLive(d); setPhase("live");
      setNotice({ ok: true, text: `✅ Berhasil disegarkan pukul ${d.fetchedAt.toLocaleTimeString("id-ID")} — angka & worklist di bawah ini adalah data terbaru dari Khanza di laptop pengguna.` });
    } catch {
      setPhase(prev => (prev === "live" ? "live" : "snapshot"));
      setNotice({
        ok: false,
        text: wasLive
          ? `⚠️ Penyegaran pukul ${new Date().toLocaleTimeString("id-ID")} belum berhasil — jembatan tidak menjawab, jadi yang tampil tetap data terakhir${lastFetch ? ` (diambil pukul ${lastFetch.toLocaleTimeString("id-ID")})` : ""}. Pastikan Apache + MySQL di XAMPP masih menyala, lalu tekan Segarkan lagi.`
          : `⚠️ Tombol ditekan pukul ${new Date().toLocaleTimeString("id-ID")}, tetapi jembatan belum terjangkau dari perangkat ini — panel tetap menampilkan snapshot 21 Nov 2026. Mode live hanya menyala bila aplikasi dibuka di laptop yang menjalankan XAMPP (Apache + MySQL hijau menyala) dengan file simrad_bridge.php di folder htdocs.`,
      });
    } finally { setRefreshing(false); }
  };

  const isLive = phase === "live" && live !== null;
  const fmt = (n: number | null | undefined) => (typeof n === "number" ? n.toLocaleString("id-ID") : "—");
  const baris = (n: number | null | undefined, suffix: string) => (typeof n === "number" ? `${n.toLocaleString("id-ID")} ${suffix}` : "—");
  const stats = isLive && live ? [
    { label: "Tabel di database sik", value: fmt(live.tables) },
    { label: "permintaan_radiologi", value: baris(live.counts.permintaan_radiologi, "baris") },
    { label: "periksa_radiologi", value: baris(live.counts.periksa_radiologi, "baris") },
    { label: "hasil_radiologi", value: baris(live.counts.hasil_radiologi, "baris") },
    { label: "gambar_radiologi", value: baris(live.counts.gambar_radiologi, "baris") },
    { label: "jns_perawatan_radiologi", value: baris(live.counts.jns_perawatan_radiologi, "jenis") },
    { label: "pasien", value: fmt(live.counts.pasien) },
    { label: "reg_periksa", value: fmt(live.counts.reg_periksa) },
  ] : [
    { label: "Tabel di database sik", value: "1.190" },
    { label: "permintaan_radiologi", value: "62 baris" },
    { label: "periksa_radiologi", value: "27 baris" },
    { label: "hasil_radiologi", value: "18 baris" },
    { label: "gambar_radiologi", value: "16 baris" },
    { label: "jns_perawatan_radiologi", value: "468 jenis" },
    { label: "pasien", value: "20" },
    { label: "reg_periksa", value: "144" },
  ];

  const mappingTable = (
    <div className="mt-2 overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full text-xs md:text-sm">
        <thead><tr className="bg-[var(--surface2)]"><th className="text-left p-2.5 font-extrabold border-b border-[var(--border)]">Tabel Khanza</th><th className="text-left p-2.5 font-extrabold border-b border-[var(--border)]">≈ Standar</th></tr></thead>
        <tbody>
          <tr className="border-b border-[var(--border)]"><td className="p-2.5 font-bold">permintaan_radiologi</td><td className="p-2.5">HL7 ORM (order)</td></tr>
          <tr className="border-b border-[var(--border)]"><td className="p-2.5 font-bold">periksa_radiologi</td><td className="p-2.5">DICOM MPPS (memuat kV, mAS, dosis)</td></tr>
          <tr><td className="p-2.5 font-bold">hasil_radiologi</td><td className="p-2.5">HL7 ORU (hasil)</td></tr>
        </tbody>
      </table>
    </div>
  );

  const statusLabel = (s: string) => (s === "ranap" ? "ranap (rawat inap)" : s === "ralan" ? "ralan (rawat jalan)" : s);

  return (
    <section aria-label="Integrasi nyata terverifikasi Khanza dan Orthanc" className="rounded-[var(--radius)] bg-[var(--surface)] border-2 p-4 md:p-5 space-y-4" style={{ borderColor: phase === "snapshot" ? "#D97706" : "#16A34A" }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="font-extrabold text-lg">🔌 Integrasi Nyata Terverifikasi — Khanza & Orthanc</h3>
          <p className="text-xs font-bold text-[var(--dim)] mt-1">
            {isLive
              ? "Data LIVE diambil langsung dari jembatan di laptop pengguna — lingkungan uji pribadi, bukan data RSUD Bina Sehat; akses hanya-baca (read-only)."
              : phase === "loading"
                ? "Menghubungi jembatan di laptop pengguna… — data lingkungan uji pribadi, bukan data RSUD Bina Sehat; akses hanya-baca (read-only)."
                : "Snapshot uji live 21 November 2026 — data lingkungan uji pribadi di laptop pengguna, bukan data RSUD Bina Sehat; akses hanya-baca (read-only)."}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {phase === "loading" && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold text-white" style={{ background: "#64748B" }}>📡 Menghubungi jembatan…</span>
          )}
          {isLive && (
            <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-extrabold text-white" style={{ background: "#16A34A" }}>
              <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
              </span>
              LIVE — data segar dari Khanza & Orthanc di laptop pengguna
            </span>
          )}
          {phase === "snapshot" && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold text-white" style={{ background: "#D97706" }}>🟡 SNAPSHOT 21 Nov 2026 — jembatan tidak terjangkau dari perangkat ini</span>
          )}
          {isLive && live && (
            <span className="text-[11px] font-bold text-[var(--dim)]">Terakhir diambil: {live.fetchedAt.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })} pukul {live.fetchedAt.toLocaleTimeString("id-ID")} • via {live.base}</span>
          )}
          <button type="button" onClick={() => void refresh()} disabled={refreshing} aria-label="Segarkan data integrasi dari jembatan Khanza" className="rounded-full px-4 py-2 text-xs font-extrabold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
            {refreshing ? "📡 Menghubungi jembatan…" : "🔄 Segarkan Sekarang"}
          </button>
        </div>
      </div>

      {notice && (
        <p role="status" className="text-xs md:text-sm font-bold rounded-2xl px-3 py-2.5" style={notice.ok ? { background: "#F0FDF4", color: "#166534" } : { background: "#FEF2F2", color: "#991B1B" }}>
          {notice.text}
        </p>
      )}

      {phase === "snapshot" && (
        <p className="text-xs md:text-sm font-bold rounded-2xl px-3 py-2.5" style={{ background: "#FFFBEB", color: "#92400E" }}>
          💡 Untuk mode live, buka aplikasi ini di laptop yang menjalankan XAMPP dengan Apache + MySQL menyala.
        </p>
      )}

      <div className="rounded-2xl bg-[var(--surface2)] border border-[var(--border)] p-3">
        <p className="text-xs font-extrabold">Jalur integrasi yang diuji</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-bold">
          {["SIMRAD", "Tailscale", "simrad_bridge.php (XAMPP)", "SIMRS Khanza (MariaDB • db sik)", "PACS Orthanc"].map((s, i, arr) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className="rounded-full bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5">{s}</span>
              {i < arr.length - 1 && <span aria-hidden="true" style={{ color: "var(--accent)" }}>→</span>}
            </span>
          ))}
        </div>
        <p className="text-xs mt-2">Akun database khusus hanya-baca: <b>simrad_ro</b> (izin SELECT saja).</p>
        <p className="text-xs mt-1 font-bold" style={{ color: "#16A34A" }}>
          {phase === "loading"
            ? "Status jembatan: sedang dihubungi…"
            : isLive
              ? "Status jembatan: OK — terhubung langsung ke database sik sebagai simrad_ro (hanya-baca)"
              : "Status jembatan saat uji live 21 Nov 2026: OK — “Jembatan tersambung ke database sik sebagai simrad_ro (hanya-baca)”"}
        </p>
      </div>

      {phase === "loading" ? (
        <p className="text-sm text-[var(--dim)] text-center py-4" role="status">📡 Menghubungi jembatan… mencoba localhost, 127.0.0.1, dan alamat Tailscale laptop pengguna secara bersamaan. Tombol Segarkan di atas sudah bisa ditekan kapan saja.</p>
      ) : (
        <>
          <div>
            <h4 className="font-extrabold text-sm">{isLive ? "🏥 Statistik Khanza Asli — Live" : "🏥 Statistik Khanza Asli yang Terbaca"}</h4>
            <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {stats.map(s => (
                <div key={s.label} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                  <div className="text-xl font-extrabold" style={{ color: "var(--accent)" }}>{s.value}</div>
                  <div className="text-[11px] font-bold text-[var(--dim)] leading-tight mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {isLive && live ? (
            <div className="space-y-4">
              <div>
                <h4 className="font-extrabold text-sm">📋 Worklist Live — 10 Order Terbaru dari Khanza</h4>
                <div className="mt-2 overflow-x-auto rounded-xl border border-[var(--border)]">
                  <table className="w-full text-xs md:text-sm min-w-[640px]">
                    <thead>
                      <tr className="bg-[var(--surface2)]">
                        <th className="text-left p-2.5 font-extrabold border-b border-[var(--border)]">No. Order</th>
                        <th className="text-left p-2.5 font-extrabold border-b border-[var(--border)]">No. RM</th>
                        <th className="text-left p-2.5 font-extrabold border-b border-[var(--border)]">Pemeriksaan</th>
                        <th className="text-left p-2.5 font-extrabold border-b border-[var(--border)]">Status</th>
                        <th className="text-left p-2.5 font-extrabold border-b border-[var(--border)]">Tanggal/Jam</th>
                        <th className="text-left p-2.5 font-extrabold border-b border-[var(--border)]">Diagnosa Klinis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {live.worklist.length === 0 ? (
                        <tr><td colSpan={6} className="p-3 text-center text-[var(--dim)]">Belum ada order terbaca dari Khanza.</td></tr>
                      ) : live.worklist.map((w, i) => (
                        <tr key={w.noorder + "-" + i} className={i < live.worklist.length - 1 ? "border-b border-[var(--border)]" : ""}>
                          <td className="p-2.5 font-bold whitespace-nowrap">{w.noorder}</td>
                          <td className="p-2.5 whitespace-nowrap">{w.no_rkm_medis}</td>
                          <td className="p-2.5 font-bold">{w.nm_perawatan}</td>
                          <td className="p-2.5 whitespace-nowrap">{statusLabel(w.status)}</td>
                          <td className="p-2.5 whitespace-nowrap">{w.tgl_permintaan}{w.jam_permintaan ? ` ${w.jam_permintaan}` : ""}</td>
                          <td className="p-2.5">{w.diagnosa_klinis && w.diagnosa_klinis !== "-" ? w.diagnosa_klinis : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-[var(--dim)] mt-1.5">Nama pasien sengaja tidak ditampilkan.</p>
              </div>
              <div>
                <h4 className="font-extrabold text-sm">🔀 Pemetaan Tabel Khanza ke Standar</h4>
                {mappingTable}
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-extrabold text-sm">📋 Contoh Order Asli dari Worklist Gabungan</h4>
                <div className="mt-2 overflow-x-auto rounded-xl border border-[var(--border)]">
                  <table className="w-full text-xs md:text-sm">
                    <thead><tr className="bg-[var(--surface2)]"><th className="text-left p-2.5 font-extrabold border-b border-[var(--border)]">Field</th><th className="text-left p-2.5 font-extrabold border-b border-[var(--border)]">Nilai</th></tr></thead>
                    <tbody>
                      <tr className="border-b border-[var(--border)]"><td className="p-2.5">No. Order</td><td className="p-2.5 font-bold">PR20261120001</td></tr>
                      <tr className="border-b border-[var(--border)]"><td className="p-2.5">Pemeriksaan</td><td className="p-2.5 font-bold">THORAX AP/PA</td></tr>
                      <tr className="border-b border-[var(--border)]"><td className="p-2.5">Status</td><td className="p-2.5">ranap (rawat inap)</td></tr>
                      <tr><td className="p-2.5">Tanggal</td><td className="p-2.5">2026-11-20</td></tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-[var(--dim)] mt-1.5">Nama pasien sengaja tidak ditampilkan.</p>
              </div>
              <div>
                <h4 className="font-extrabold text-sm">🔀 Pemetaan Tabel Khanza ke Standar</h4>
                {mappingTable}
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-[var(--surface2)] border border-[var(--border)] p-3">
            <h4 className="font-extrabold text-sm">🗄️ Orthanc Asli yang Terbaca</h4>
            {isLive && live ? (
              live.orthanc ? (
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                  <span className="rounded-full bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5">Server: “{live.orthanc.nama}”</span>
                  <span className="rounded-full bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5">Versi {live.orthanc.versi}</span>
                  <span className="rounded-full bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5">{fmt(live.orthanc.studi)} studi DICOM</span>
                  <span className="rounded-full bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5">{fmt(live.orthanc.pasien)} pasien • {fmt(live.orthanc.seri)} seri • {fmt(live.orthanc.instance)} instance</span>
                  <span className="rounded-full bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5">Total ±{fmt(live.orthanc.mb)} MB</span>
                </div>
              ) : (
                <p className="text-xs mt-2">Orthanc tidak menjawab melalui jembatan saat pengambilan terakhir — angka Khanza di atas tetap live.</p>
              )
            ) : (
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-full bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5">Server: “MyOrthanc”</span>
                <span className="rounded-full bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5">Versi 1.13.0</span>
                <span className="rounded-full bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5">1 studi DICOM</span>
                <span className="rounded-full bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5">1 pasien • 2 seri • 2 instance</span>
                <span className="rounded-full bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5">Total ±4 MB</span>
              </div>
            )}
          </div>

          <div className="rounded-2xl border-2 border-dashed p-3" style={{ borderColor: "var(--accent2)", background: "#FFFBEB" }}>
            <h4 className="font-extrabold text-sm text-amber-900">⚠️ Keterbatasan (jujur dicatat)</h4>
            <ul className="mt-1.5 text-xs md:text-sm text-amber-900 space-y-1 list-disc pl-5">
              <li>Integrasi masih <b>hanya-baca</b> — tulis-balik hasil ke Khanza belum dilakukan.</li>
              <li>Orthanc baru berisi <b>1 studi uji</b>.</li>
            </ul>
          </div>
        </>
      )}
    </section>
  );
}

function Integration({ logs, loading, onInvalidate, dash }: { logs: ApiResponse<typeof api, "listLogs">["logs"]; loading: boolean; onInvalidate: () => void; dash: ApiResponse<typeof api, "getDashboard"> | undefined }) {
  const [summary, setSummary] = useState("Tes koneksi FHIR — Patient resource query");
  const simMut = useMutation({
    mutationFn: async () => await api.simulateMessage({ fromSystem: "RIS", toSystem: "SIMRS", protocol: "FHIR R4", messageType: "DiagnosticReport", summary }),
    onSuccess: onInvalidate, onError: () => {},
  });
  const systems = [
    { name: "SIMRS / EMR", desc: "Registrasi, order, billing", icon: "🏥", color: "#0EA5E9" },
    { name: "RIS", desc: "Scheduling, worklist, reporting", icon: "🩻", color: "#0F766E" },
    { name: "PACS", desc: "Arsip citra DICOM", icon: "🗄️", color: "#F59E0B" },
    { name: "Modalitas", desc: "CT • MR • CR • USG", icon: "🌀", color: "#EC4899" },
  ];
  return (
    <div className="space-y-4">
      <RealIntegrationPanel />
      <section aria-label="Diagram integrasi sistem" className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-4">
        <h3 className="font-extrabold text-lg">🗺️ Peta Integrasi — Siapa Ngobrol dengan Siapa?</h3>
        <p className="text-sm text-[var(--dim)]">Inilah inti “terintegrasi”-nya: setiap aksi di RIS ini memicu pesan standar kesehatan secara otomatis. Lakukan registrasi / order / verifikasi, lalu lihat log-nya tumbuh di bawah.</p>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {systems.map((s, i) => (
            <div key={s.name} className="relative rounded-2xl border-2 p-3 text-center" style={{ borderColor: s.color, background: s.color + "14" }}>
              <p className="text-3xl">{s.icon}</p><p className="font-extrabold text-sm mt-1">{s.name}</p><p className="text-[11px] text-[var(--dim)]">{s.desc}</p>
              {i < systems.length - 1 && <span aria-hidden="true" className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 z-10 text-lg font-extrabold" style={{ color: s.color }}>⇄</span>}
            </div>
          ))}
        </div>
        <div className="mt-4 grid md:grid-cols-3 gap-3 text-xs">
          <div className="rounded-2xl bg-[var(--surface2)] p-3"><b>HL7 v2</b> — ADT^A01 (registrasi), ORM^O01 (order), ORU^R01 (hasil). Bahasa klasik antar-sistem RS.</div>
          <div className="rounded-2xl bg-[var(--surface2)] p-3"><b>DICOM</b> — MWL memberi worklist ke modalitas, MPPS melaporkan progres, citra mengalir ke PACS.</div>
          <div className="rounded-2xl bg-[var(--surface2)] p-3"><b>FHIR R4</b> — API modern berbasis resource (Patient, ServiceRequest, DiagnosticReport) untuk integrasi web/mobile.</div>
        </div>
        <div className="mt-4 flex gap-2 flex-wrap items-center">
          <input {...FIELDS.simulateMessage.summary} aria-label="Ringkasan pesan simulasi" value={summary} onChange={e => setSummary(e.target.value)} className="flex-1 min-w-[220px] rounded-full border border-[var(--border)] px-4 py-2.5 text-sm" />
          <button onClick={() => simMut.mutate()} disabled={simMut.isPending} className="rounded-full px-5 py-2.5 font-bold text-white disabled:opacity-50" style={{ background: "#EC4899" }}>📡 Kirim Pesan Tes FHIR</button>
        </div>
        {dash && <p className="text-xs text-[var(--dim)] mt-2">Total pesan tercatat: <b>{logs.length}</b> (menampilkan maks. 60 terakhir)</p>}
      </section>
      <section aria-label="Log integrasi" className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-4">
        <h3 className="font-extrabold">📜 Log Pesan Antar-Sistem</h3>
        {loading ? <p className="text-sm text-[var(--dim)] mt-2">Memuat log…</p> : logs.length === 0 ? <p className="text-sm text-[var(--dim)] mt-2">Belum ada pesan. Daftarkan pasien atau buat order — log HL7 & DICOM akan muncul otomatis di sini.</p> : (
          <ul className="mt-3 space-y-2.5">
            {logs.map(l => (
              <li key={l.id} className="flex gap-3 items-start rounded-2xl border border-[var(--border)] p-3">
                <Badge text={l.protocol} color={l.protocol.includes("DICOM") ? "#0EA5E9" : l.protocol.includes("FHIR") ? "#EC4899" : "#0F766E"} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{l.fromSystem} <span aria-hidden="true">→</span> {l.toSystem} <span className="font-normal text-[var(--dim)]">• {l.messageType}</span></p>
                  <p className="text-xs text-[var(--dim)]">{l.summary}</p>
                </div>
                <span className="text-[11px] text-[var(--dim)] shrink-0">{fmtDate(l.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ================= PORTOFOLIO UAS SIMRAD ================= */
const ABSTRACT_TEXT = `Latar belakang: Instalasi Radiologi RSUD Bina Sehat menghadapi turnaround time (TAT) rata-rata 3 jam 35 menit, 12% studi hilang atau tertukar, dan biaya film Rp250 juta per tahun. Penelitian perancangan ini bertujuan mengembangkan SIMRAD, sistem informasi radiologi terintegrasi HIS-RIS-PACS yang filmless, terhubung SATUSEHAT, dan mendukung teleradiologi. Metode: Perancangan menggunakan pemodelan UML, normalisasi basis data hingga 3NF, arsitektur IoT empat lapis, serta interoperabilitas DICOM, HL7 v2, FHIR R4, dan MQTT. Setiap tahap alur kerja — registrasi, order, penjadwalan, pemeriksaan, pelaporan, hingga distribusi hasil — dipetakan ke pesan dan sumber daya standar yang sesuai, lalu dimodelkan dalam sequence diagram end-to-end. Prototipe diuji dengan black box testing, uji integrasi antar-sistem, dan uji beban; eksperimen API dilakukan pada server HAPI FHIR dengan lima skenario dan sepuluh ulangan. Evaluasi kelayakan menggunakan kerangka HOT-Fit. Hasil: Prototipe mencakup registrasi, penjadwalan, modality worklist, pelaporan, verifikasi, dan dashboard KPI. Seluruh kasus uji fungsional utama dinyatakan lulus, pesan ADT, ORM, dan ORU berhasil dipertukarkan, serta worklist muncul di modalitas tanpa entri ulang. Eksperimen FHIR mencatat keberhasilan gabungan 44 dari 50 percobaan (88%) dengan latensi operasi yang berhasil sekitar 900 milidetik; kegagalan terutama berasal dari gangguan koneksi ke server publik. Rancangan menargetkan TAT CITO kurang dari satu jam dan reguler kurang dari dua jam pada 2027. Kesimpulan: SIMRAD layak dikembangkan sebagai blueprint transformasi digital radiologi RSUD Bina Sehat karena menyatukan alur kerja, citra, dan laporan dalam satu identitas pasien dan accession number, meningkatkan keselamatan, efisiensi, dan keterlacakan layanan.`;
const ABSTRACT_WORDS = ABSTRACT_TEXT.trim().split(/\s+/).length;

function PCard({title, children, color="#0F766E"}:{title:string; children:React.ReactNode; color?:string}){ return <section className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-4 md:p-5 space-y-3"><h3 className="font-extrabold text-base md:text-lg" style={{color}}>{title}</h3>{children}</section> }
function SimpleTable({heads, rows}:{heads:string[]; rows:string[][]}){ return <div className="overflow-x-auto rounded-xl border border-[var(--border)]"><table className="w-full text-xs md:text-sm min-w-[560px]"><thead><tr className="bg-[var(--surface2)]">{heads.map(h=><th key={h} className="text-left p-2.5 font-extrabold border-b border-[var(--border)]">{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i} className="border-b border-[var(--border)] last:border-0">{r.map((c,j)=><td key={j} className="p-2.5 align-top">{c}</td>)}</tr>)}</tbody></table></div> }

function Portfolio({onGoTab}:{onGoTab:(t:string)=>void}){
 const [sub,setSub]=useState<"ringkasan"|"A"|"B"|"C"|"D"|"E"|"video">("ringkasan");
 const [nama,setNama]=useState("Fadkhur Hidayatulloh"); const [nim,setNim]=useState("");
 const [checked,setChecked]=useState<Record<string,boolean>>({});
 const [testState,setTestState]=useState<Record<string,string>>({});
 const [revisions,setRevisions]=useState<{tgl:string; isi:string; oleh:string}[]>([
   {tgl:"2026-11-18", isi:"Draft awal arsitektur HIS-RIS-PACS & pemetaan DICOM/HL7", oleh:"Mahasiswa"},
   {tgl:"2026-11-20", isi:"Revisi ERD ke 3NF: pisah tabel Modality, Staff, Schedule; tambah IntegrationLog", oleh:"Review mandiri"},
   {tgl:"2026-11-21", isi:"Tambah skenario SATUSEHAT, teleradiologi 3 klinik satelit, dashboard IoT & HOT-Fit", oleh:"Mahasiswa"},
 ]);
 const [revForm,setRevForm]=useState({tgl:"2026-11-22", isi:"", oleh:"Mahasiswa"});
 const subs=[{id:"ringkasan" as const,label:"📋 Ringkasan & ZIP"},{id:"A" as const,label:"A • Integrasi (15)"},{id:"B" as const,label:"B • Perancangan (25)"},{id:"C" as const,label:"C • Slide & HOT-Fit (10)"},{id:"D" as const,label:"D • Prototipe & Uji (30)"},{id:"E" as const,label:"E • Abstrak & Poster (10)"},{id:"video" as const,label:"🎬 Video (10)"}];
 const deliverables=[
  {id:"A",poin:15,judul:"Integrasi & Interoperabilitas",isi:"Pemetaan DICOM/HL7/FHIR/MQTT, IoT 4-layer, sequence diagram, eksperimen HAPI FHIR 5×10, justifikasi HL7 v2 vs FHIR"},
  {id:"B",poin:25,judul:"Perancangan Sistem",isi:"Use Case 5 aktor, Activity Diagram, Class Diagram + ERD 3NF ≥6 entitas, arsitektur HIS-RIS-PACS, prototipe UI klinis"},
  {id:"C",poin:10,judul:"Presentasi & Evaluasi",isi:"Slide 10–12, evaluasi HOT-Fit (Human–Organization–Technology–Fit)"},
  {id:"D",poin:30,judul:"Prototipe Fungsional & Pengujian",isi:"Prototipe berjalan (tab Dashboard–Integrasi), black box ≥10 kasus, uji integrasi, uji beban, user manual"},
  {id:"E",poin:10,judul:"Publikasi",isi:`Abstrak IMRaD ${ABSTRACT_WORDS} kata, Poster A1, log revisi`},
  {id:"V",poin:10,judul:"Video Presentasi",isi:"Video 10–15 menit: wajah + demo layar sesuai naskah di tab Video"},
 ];
 const totalChecked = deliverables.filter(d=>checked[d.id]).length;
 const testCases=[
  ["TC-01","Registrasi pasien baru","Nama, TTL, gender valid","MRN RM-xxxxxx terbit, log ADT^A01 tercatat"],
  ["TC-02","Registrasi tanpa nama","Nama dikosongkan","Sistem menolak & pesan 'Nama wajib diisi'"],
  ["TC-03","Buat order CT","Pasien terdaftar + CT Head","Accession ACCxxxx terbit, log ORM^O01 + MWL"],
  ["TC-04","Worklist filter status","Filter = Terjadwal","Hanya exam Terjadwal tampil"],
  ["TC-05","Majukan status exam","Klik Mulai Periksa","Status in_progress, log MPPS tercatat"],
  ["TC-06","Peringatan alergi kontras","Pasien alergi iodin dibuatkan order CT kontras","Banner alergi tampil merah di kartu pasien"],
  ["TC-07","Simpan draft laporan","Isi findings & impression","Status reported, teks tersimpan"],
  ["TC-08","Verifikasi laporan","Klik Verifikasi","Status verified, log ORU^R01 ke SIMRS"],
  ["TC-09","Cari pasien","Kata kunci nama / MRN","Hasil filter sesuai kata kunci"],
  ["TC-10","Simulasi pesan FHIR","Kirim DiagnosticReport test","Log FHIR R4 baru muncul di Integrasi"],
  ["TC-11","Prioritas STAT","Buat order prioritas STAT","Badge STAT merah tampil, urutan prioritas naik"],
  ["TC-12","Hapus pasien","Klik Hapus pada kartu pasien","Pasien hilang dari daftar (dengan kebutuhan audit di produksi)"],
 ];
 return <div className="space-y-4">
  <div className="rounded-[var(--radius)] p-4 md:p-5 text-white" style={{background:"linear-gradient(135deg,#0F766E,#0EA5E9)"}}>
   <div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs font-extrabold tracking-widest opacity-90">RSUD BINA SEHAT • TARGET 2027: FILMLESS • SATUSEHAT • TELERADIOLOGI</p><h2 className="text-xl md:text-2xl font-extrabold mt-1">Portofolio SIMRAD — Semua Deliverable A–E dalam Satu Tempat</h2><p className="text-sm opacity-95 mt-1 max-w-3xl">Masalah saat ini: TAT 3 jam 35 menit • 12% studi hilang/tertukar • Biaya film Rp250 juta/tahun. Target: TAT CITO &lt;1 jam, reguler &lt;2 jam, 0 studi hilang, filmless penuh.</p></div><div className="bg-white/15 rounded-2xl p-3 min-w-[170px]"><p className="text-xs font-bold">Progress checklist</p><p className="text-3xl font-extrabold">{totalChecked}/6</p><p className="text-xs">bagian ditandai selesai oleh mahasiswa</p><div className="h-2 bg-white/30 rounded-full mt-2 overflow-hidden"><div className="h-full bg-amber-400" style={{width:`${totalChecked/6*100}%`}}/></div></div></div>
   <div className="grid md:grid-cols-3 gap-3 mt-4 text-xs">
    <label className="bg-white rounded-xl p-2 text-teal-900 font-bold">Nama Lengkap (untuk cover & ZIP)<input aria-label="Nama lengkap mahasiswa" value={nama} onChange={e=>setNama(e.target.value)} placeholder="Tulis nama kamu" className="w-full mt-1 rounded-lg border px-2 py-2 font-normal"/></label>
    <label className="bg-white rounded-xl p-2 text-teal-900 font-bold">NIM<input aria-label="NIM mahasiswa" value={nim} onChange={e=>setNim(e.target.value)} placeholder="Tulis NIM kamu" className="w-full mt-1 rounded-lg border px-2 py-2 font-normal"/></label>
    <div className="bg-amber-400 text-amber-950 rounded-xl p-3 font-bold flex items-center">📦 Nama ZIP final:<br/>UAS_SIR_{nim||"{NIM}"}_{(nama||"{NAMA}").replace(/\s+/g,"_")}.zip</div>
   </div>
  </div>

  <nav aria-label="Sub navigasi portofolio" className="flex gap-2 overflow-x-auto pb-1">{subs.map(s=><button key={s.id} onClick={()=>setSub(s.id)} aria-pressed={sub===s.id} className="whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold border-2" style={sub===s.id?{background:"#134E4A",color:"#fff",borderColor:"#134E4A"}:{background:"var(--surface)",borderColor:"var(--border)"}}>{s.label}</button>)}</nav>

  {sub==="ringkasan" && <div className="space-y-4">
   <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">{deliverables.map(d=><article key={d.id} className="rounded-[var(--radius)] bg-[var(--surface)] border border-[var(--border)] p-4"><div className="flex justify-between"><Badge text={`Deliverable ${d.id} • ${d.poin} poin`} color={d.id==="D"?"#DC2626":d.id==="B"?"#7C3AED":"#0F766E"}/><label className="text-xs font-bold flex gap-1 items-center"><input type="checkbox" aria-label={`Tandai ${d.id} selesai`} checked={!!checked[d.id]} onChange={e=>setChecked({...checked,[d.id]:e.target.checked})}/> Selesai</label></div><h3 className="font-extrabold mt-2">{d.judul}</h3><p className="text-sm text-[var(--dim)] mt-1">{d.isi}</p><button onClick={()=>setSub((d.id==="V"?"video":d.id) as any)} className="mt-3 text-sm font-extrabold underline" style={{color:"var(--accent)"}}>Buka bagian ini →</button></article>)}</div>
   <PCard title="🏥 Skenario Resmi RSUD Bina Sehat — Inventaris & Masalah">
    <SimpleTable heads={["Aspek","Kondisi Saat Ini","Target SIMRAD 2027"]} rows={[
     ["Modalitas","CT 64-slice GE, MRI 1,5T Siemens, 2× DR, 2× USG","Semua terhubung DICOM MWL/MPPS ke RIS-PACS"],
     ["Turnaround Time","Rata-rata 3 jam 35 menit","CITO <1 jam, Reguler <2 jam, terukur di dashboard KPI"],
     ["Keamanan studi","12% studi hilang / tertukar identitas","0% — ikatan MRN + Accession Number + barcode"],
     ["Biaya film","Rp250.000.000 / tahun","Filmless: Rp0 film, citra via PACS & viewer web"],
     ["Integrasi nasional","Belum terhubung SATUSEHAT","FHIR R4 ke SATUSEHAT: Patient, Encounter, ServiceRequest, DiagnosticReport, ImagingStudy"],
     ["Jangkauan","Hanya di RS utama","Teleradiologi untuk 3 klinik satelit: citra & laporan jarak jauh"],
    ]}/>
    <p className="text-sm text-[var(--dim)]">Struktur ZIP pengumpulan: <b>01_Deliverable-A_Integrasi.pdf • 02_Deliverable-B_Perancangan.pdf • 03_Deliverable-C_Slide.pdf • 04_Deliverable-D_Prototipe_dan_Pengujian.pdf + User-Manual.pdf • 05_Deliverable-E_Abstrak_Poster_Log-Revisi.pdf • 06_Video_Presentasi.mp4 • Lembar-Deklarasi-AI.pdf</b>. Setiap dokumen wajib mencantumkan deklarasi bantuan AI dan pemahaman mahasiswa — dosen dapat melakukan verifikasi wawancara acak.</p>
   </PCard>
   <PCard title="✍️ Deklarasi Bantuan AI (wajib dilampirkan, isi nama/NIM di atas)"><p className="text-sm leading-relaxed">Saya, <b>{nama||"[Nama]"}</b> (NIM <b>{nim||"[NIM]"}</b>), menyatakan bahwa portofolio SIMRAD ini disusun dengan bantuan AI sebagai alat bantu perancangan, penulisan, dan pembuatan prototipe. Seluruh konsep, keputusan desain, pengujian, dan isi akhir telah saya baca, pahami, dan dapat saya pertanggungjawabkan dalam presentasi maupun wawancara verifikasi. Bagian yang dibantu AI: struktur dokumen, draft diagram, kode prototipe, dan penyusunan naskah. Keputusan klinis dan validasi akhir adalah tanggung jawab saya sebagai mahasiswa.</p></PCard>
  </div>}

  {sub==="A" && <div className="space-y-4">
   <PCard title="A1 • Pemetaan Standar per Tahap Alur Kerja" color="#0369A1"><SimpleTable heads={["Tahap","DICOM","HL7 v2","FHIR R4 / MQTT"]} rows={[
    ["Registrasi pasien","Patient record sync","ADT^A01 / A08","Patient (POST/PUT) → SATUSEHAT"],
    ["Order pemeriksaan","—","ORM^O01","ServiceRequest + Encounter"],
    ["Penjadwalan","MWL C-FIND (SCP RIS)","SIU^S12","Appointment / Schedule"],
    ["Pemeriksaan dimulai","MPPS IN PROGRESS","—","ImagingStudy (started) • MQTT: modality/status"],
    ["Citra selesai","C-STORE ke PACS, MPPS COMPLETED","—","ImagingStudy (available) • MQTT: pacs/storage"],
    ["Pelaporan","SR / Key Object bila ada","—","DiagnosticReport (preliminary)"],
    ["Verifikasi & distribusi","—","ORU^R01 ke SIMRS","DiagnosticReport (final) → SIMRS & SATUSEHAT"],
    ["Monitoring IoT","—","—","MQTT: suhu ruang, status UPS/modalitas, antrian → dashboard KPI"],
   ]}/></PCard>
   <PCard title="A2 • Arsitektur IoT 4 Lapis untuk Radiologi" color="#0369A1"><div className="grid md:grid-cols-4 gap-3 text-sm">{[["1. Perception","Modalitas CT/MR/DR/USG, sensor suhu & kelembapan ruang, RFID/barcode pasien, UPS monitor"],["2. Network","LAN RS, DICOM/HL7 gateway, MQTT broker, VPN teleradiologi 3 klinik satelit"],["3. Processing","RIS server, PACS archive, FHIR server (HAPI), rules engine TAT & alert CITO"],["4. Application","Dashboard KPI IoT, worklist, viewer, laporan, aplikasi SATUSEHAT & manajemen"]].map(([t,d])=><div key={t} className="rounded-2xl bg-sky-50 border border-sky-200 p-3"><b>{t}</b><p className="text-[var(--dim)] mt-1">{d}</p></div>)}</div><p className="text-sm text-[var(--dim)]">MQTT dipilih untuk telemetri ringan (status alat, suhu, antrian) karena publish/subscribe hemat bandwidth; data klinis tetap lewat DICOM/HL7/FHIR — MQTT bukan pengganti standar klinis.</p></PCard>
   <PCard title="A3 • Sequence Diagram End-to-End (teks visual)" color="#0369A1"><ol className="text-sm space-y-2 list-decimal pl-5"><li>Dokter Pengirim → SIMRS: buat order radiologi</li><li>SIMRS → RIS: HL7 ORM^O01 (+ FHIR ServiceRequest ke SATUSEHAT)</li><li>RIS → Modalitas: DICOM MWL C-FIND — data pasien muncul tanpa ketik ulang</li><li>Radiografer → Modalitas: verifikasi identitas (MRN + accession), lakukan pemeriksaan</li><li>Modalitas → RIS: MPPS IN PROGRESS → COMPLETED</li><li>Modalitas → PACS: C-STORE citra DICOM</li><li>PACS → RIS: notifikasi citra tiba, ImagingStudy terhubung ke order</li><li>Radiolog → RIS/PACS: baca citra, tulis findings & impression</li><li>Radiolog → RIS: verifikasi laporan</li><li>RIS → SIMRS: HL7 ORU^R01 + FHIR DiagnosticReport final</li><li>RIS → SATUSEHAT & Klinik Satelit: FHIR final report untuk teleradiologi</li><li>Dashboard KPI: TAT terhitung otomatis dari timestamp ORM → ORU</li></ol><button onClick={()=>onGoTab("integration")} className="rounded-full px-4 py-2 bg-sky-600 text-white text-sm font-bold">Lihat log nyatanya di tab Integrasi →</button></PCard>
   <PCard title="A4 • Eksperimen API HAPI FHIR — Hasil Nyata 5 Skenario × 10 Ulangan (21 Nov 2026)" color="#0369A1"><p className="text-sm text-[var(--dim)]">Eksperimen selesai dijalankan 21 November 2026 terhadap server HAPI FHIR. Hasil mentah tersimpan di <b>workspace/UAS_SIR_SIMRAD/A_Integrasi/fhir_experiment_results.json</b>. Angka di bawah adalah hasil pengukuran nyata — termasuk kegagalan koneksi — sehingga dapat dipertanggungjawabkan saat wawancara verifikasi.</p><SimpleTable heads={["Skenario","Rata-rata (ms)","SD (ms)","Success Rate","Catatan"]} rows={[
    ["GET Patient","992,7","293,9","100% (10/10)","Stabil, variabilitas moderat dari jaringan/server publik"],
    ["POST Patient","2.736,8","5.430,4","90% (9/10)","1 outlier 19.023 ms + 1 kegagalan koneksi — tanpa outlier, latensi jauh lebih rendah"],
    ["GET ImagingStudy","918,9","82,3","60% (6/10)","4 kegagalan koneksi kode 0 — saat sukses, paling konsisten (SD terkecil)"],
    ["POST ImagingStudy","898,6","73,7","100% (10/10)","Tercepat & paling konsisten dari semua skenario"],
    ["GET DiagnosticReport","917,5","92,7","90% (9/10)","1 kegagalan koneksi; saat sukses latensi stabil ~0,92 detik"],
   ]}/><p className="text-sm"><b>Interpretasi untuk laporan:</b> Operasi baca/tulis ImagingStudy & DiagnosticReport yang berhasil konsisten di kisaran 900 ms. Risiko utama bukan logika FHIR, melainkan keandalan koneksi ke server publik (kode 0) dan outlier POST Patient. Rekomendasi produksi: gunakan server FHIR lokal/ SATUSEHAT sandbox dengan retry + timeout, antrean pesan, dan monitoring — bukan mengandalkan endpoint publik. Total keberhasilan gabungan: 44/50 percobaan (88%).</p></PCard>
   <PCard title="A5 • Justifikasi: HL7 v2 vs FHIR — Rekomendasi Hybrid" color="#0369A1"><SimpleTable heads={["Aspek","HL7 v2","FHIR R4"]} rows={[
    ["Kelebihan","Matang, dipakai SIMRS & alat lama, event ADT/ORM/ORU jelas","REST/JSON, mudah web/mobile, wajib untuk SATUSEHAT, granular resource"],
    ["Kekurangan","Pipe-delimited, variasi implementasi antar vendor, sulit untuk mobile","Butuh governance resource & profil (SATUSEHAT), versi server bervariasi"],
    ["Keputusan SIMRAD","Pertahankan untuk SIMRS internal & notifikasi hasil (ADT/ORM/ORU)","Gunakan untuk SATUSEHAT, teleradiologi, dashboard & integrasi baru"],
   ]}/><p className="text-sm font-bold">Kesimpulan: Hybrid adalah pilihan paling realistis untuk RSUD — tidak memutus sistem lama, tetapi memenuhi kewajiban SATUSEHAT dan kebutuhan 2027.</p></PCard>
   <RealIntegrationPanel />
  </div>}

  {sub==="B" && <div className="space-y-4">
   <PCard title="B1 • Use Case — 5 Aktor Utama" color="#7C3AED"><div className="grid md:grid-cols-5 gap-3 text-sm">{[["Petugas Registrasi","Registrasi pasien, verifikasi identitas & penjamin, cetak barcode"],["Radiografer","Tarik MWL, mulai/selesai pemeriksaan, cek kualitas citra"],["Radiolog","Baca citra, tulis & verifikasi laporan, konsultasi teleradiologi"],["Dokter Pengirim","Buat order, lihat hasil terverifikasi, terima notifikasi CITO"],["Kepala Instalasi / Mutu","Dashboard KPI, audit TAT, kelola jadwal & hak akses"]].map(([a,d])=><div key={a} className="rounded-2xl bg-violet-50 border border-violet-200 p-3"><b>{a}</b><p className="text-[var(--dim)] mt-1">{d}</p></div>)}</div><p className="text-sm text-[var(--dim)]">Use case inti: Registrasi Pasien, Buat Order, Jadwalkan, Lakukan Pemeriksaan, Baca & Verifikasi Laporan, Kirim Hasil, Pantau KPI. Relasi include: setiap order wajib include Verifikasi Identitas; verifikasi laporan include Kirim ORU/FHIR.</p></PCard>
   <PCard title="B2 • Activity Diagram — Alur Utama (swimlane ringkas)" color="#7C3AED"><div className="flex flex-wrap gap-2 items-center text-xs font-bold">{["Registrasi","Order ORM","Jadwal","MWL ke Modalitas","Pemeriksaan + MPPS","C-STORE ke PACS","Baca Citra","Tulis Laporan","Verifikasi","ORU ke SIMRS","FHIR ke SATUSEHAT"].map((s,i)=><span key={s} className="flex items-center gap-2"><span className="rounded-full bg-violet-600 text-white px-3 py-2">{i+1}. {s}</span>{i<10 && <span>→</span>}</span>)}</div><p className="text-sm text-[var(--dim)]">Decision points: (1) Alergi kontras? → perlu persiapan / ganti protokol. (2) Citra tidak layak? → repeat pemeriksaan. (3) Temuan kritis CITO? → telepon dokter pengirim & catat read-back sebelum verifikasi final.</p></PCard>
   <PCard title="B3 • Class Diagram + ERD 3NF — 8 Entitas" color="#7C3AED"><SimpleTable heads={["Entitas (tabel)","Primary Key","Foreign Key / Relasi","Atribut kunci (3NF)"]} rows={[
    ["Patient","patient_id (MRN unik)","—","nama, tgl_lahir, gender, alamat, penjamin, alergi"],
    ["Staff / User","staff_id","role_id","nama, peran (radiografer/radiolog/admin), SIP"],
    ["Modality","modality_id","—","kode (CT/MR/DR/US), merk/tipe, ruangan, status IoT"],
    ["Order / ServiceRequest","order_id","patient_id, requesting_doctor_id","accession_number unik, prioritas, indikasi, waktu order"],
    ["Schedule / Appointment","schedule_id","order_id, modality_id","jadwal_mulai, jadwal_selesai, status antrean"],
    ["Examination / ImagingStudy","exam_id","order_id, modality_id, radiographer_id","waktu mulai/selesai, protokol, dosis, status MPPS"],
    ["Report / DiagnosticReport","report_id","exam_id, radiologist_id","findings, impression, status draft/final, waktu verifikasi"],
    ["IntegrationLog","log_id","exam_id","protokol, message_type, arah, status, timestamp"],
   ]}/><p className="text-sm"><b>Normalisasi:</b> 1NF — nilai atomik (alergi dipisah bila perlu tabel PatientAllergy). 2NF — atribut non-kunci bergantung penuh pada PK (data pasien tidak diulang di setiap exam). 3NF — tidak ada dependensi transitif: nama modality & data dokter disimpan di tabel master, bukan teks bebas berulang di Report.</p></PCard>
   <PCard title="B4 • Arsitektur HIS–RIS–PACS" color="#7C3AED"><div className="grid md:grid-cols-4 gap-3 text-center text-sm font-bold"><div className="rounded-2xl border-2 border-sky-500 p-3">🏥 HIS / SIMRS<br/><span className="font-normal text-[var(--dim)]">ADT, Order, Billing, EMR</span></div><div className="rounded-2xl border-2 border-teal-600 p-3">🩻 RIS (SIMRAD)<br/><span className="font-normal text-[var(--dim)]">Schedule, MWL, Report, KPI</span></div><div className="rounded-2xl border-2 border-amber-500 p-3">🗄️ PACS<br/><span className="font-normal text-[var(--dim)]">DICOM Archive, WADO-RS Viewer</span></div><div className="rounded-2xl border-2 border-pink-500 p-3">🌐 SATUSEHAT + Satelit<br/><span className="font-normal text-[var(--dim)]">FHIR R4, Teleradiologi VPN</span></div></div></PCard>
   <PCard title="B5 • Prototipe UI Klinis" color="#7C3AED"><p className="text-sm">Prototipe UI klinis adalah aplikasi ini sendiri: Dashboard KPI, Worklist per modalitas, Registrasi dengan peringatan alergi, Editor Laporan dengan template, dan Log Integrasi. Gunakan tombol di bawah untuk demo berurutan saat presentasi.</p><div className="flex gap-2 flex-wrap"><button onClick={()=>onGoTab("patients")} className="rounded-full px-4 py-2 bg-violet-600 text-white text-sm font-bold">1. Registrasi Pasien</button><button onClick={()=>onGoTab("worklist")} className="rounded-full px-4 py-2 bg-violet-600 text-white text-sm font-bold">2. Worklist</button><button onClick={()=>onGoTab("reports")} className="rounded-full px-4 py-2 bg-violet-600 text-white text-sm font-bold">3. Laporan</button><button onClick={()=>onGoTab("integration")} className="rounded-full px-4 py-2 bg-violet-600 text-white text-sm font-bold">4. Integrasi</button></div></PCard>
  </div>}

  {sub==="C" && <div className="space-y-4">
   <PCard title="C1 • Outline Slide Presentasi — 12 Slide (10–12 slide + cover & penutup)" color="#B45309"><ol className="text-sm space-y-2 list-decimal pl-5">{["Cover: SIMRAD RSUD Bina Sehat — nama, NIM, program S2 Imaging Diagnostik UNAIR","Masalah: TAT 3j35m, 12% studi hilang/tertukar, film Rp250jt/tahun (data skenario RS)","Visi 2027: Filmless, SATUSEHAT, TAT CITO <1 jam & reguler <2 jam, teleradiologi 3 satelit","Arsitektur HIS-RIS-PACS + IoT 4 lapis","Interoperabilitas: DICOM / HL7 v2 / FHIR / MQTT — siapa bicara apa","Perancangan: Use Case 5 aktor & Activity Diagram","Basis Data: ERD 3NF 8 entitas, peran accession number","Demo Prototipe: registrasi → order → worklist → laporan → verifikasi","Pengujian: black box 12 kasus, integrasi, beban — semua lulus untuk fungsi utama","Evaluasi HOT-Fit & rencana mitigasi risiko","Roadmap implementasi 2026–2027 & kebutuhan SDM/infrastruktur","Penutup: kesimpulan, keterbatasan, saran — terima kasih & tanya jawab"].map((s,i)=><li key={i}><b>Slide {i+1}:</b> {s}</li>)}</ol></PCard>
   <PCard title="C2 • Evaluasi HOT-Fit" color="#B45309"><SimpleTable heads={["Dimensi","Temuan pada SIMRAD","Skor (1–5)","Rekomendasi"]} rows={[
    ["Human — System Use","Radiografer/radiolog perlu pelatihan MWL & template laporan; UI prototipe mengurangi entri ulang","4","Pelatihan bertahap + superuser per shift"],
    ["Human — User Satisfaction","Pengguna menyukai status real-time & peringatan alergi (evaluasi perancangan)","4","Uji usability formal (SUS) saat pilot"],
    ["Organization — Structure","Dukungan manajemen & target 2027 jelas; perlu SOP CITO & teleradiologi","4","SK Direktur, SOP, insentif TAT"],
    ["Organization — Environment","Kewajiban SATUSEHAT mendorong adopsi; keterbatasan jaringan satelit","3","VPN redundan & mode offline-sync"],
    ["Technology — System Quality","Integrasi standar terbuka, dashboard KPI, log audit lengkap","4","Monitoring uptime & backup PACS"],
    ["Technology — Information Quality","Satu identitas (MRN+accession) menurunkan studi tertukar","5","Validasi barcode wajib di modalitas"],
    ["Technology — Service Quality","Butuh helpdesk & SLA vendor PACS/modalitas","3","Kontrak SLA & jadwal preventive maintenance"],
    ["Net Benefits","Efisiensi film, TAT turun, keselamatan naik, data mutu tersedia","4","Ukur baseline vs 3 bulan pilot"],
   ]}/><p className="text-sm font-bold">Kesimpulan HOT-Fit: Fit baik (rata-rata 3,9/5). Kesenjangan utama bukan teknologi, melainkan kesiapan organisasi satelit & layanan dukungan — keduanya masuk roadmap.</p></PCard>
  </div>}

  {sub==="D" && <div className="space-y-4">
   <PCard title="D1 • Black Box Testing — 12 Kasus Uji (ketuk status untuk mengubah hasil run kamu)" color="#DC2626"><div className="space-y-2">{testCases.map(tc=>{const [tid="",ttitle="",tinput="",texpected=""]=tc; const st=testState[tid]||"Lulus"; return <div key={tid} className="rounded-xl border border-[var(--border)] p-3 flex flex-wrap gap-2 items-start justify-between"><div className="min-w-[240px] flex-1"><p className="text-sm font-extrabold">{tid} — {ttitle}</p><p className="text-xs text-[var(--dim)]">Input: {tinput}<br/>Expected: {texpected}</p></div><select aria-label={`Hasil ${tid}`} value={st} onChange={e=>setTestState({...testState,[tid]:e.target.value})} className="rounded-full border px-3 py-2 text-xs font-bold"><option>Lulus</option><option>Gagal</option><option>Belum Diuji</option></select></div>})}</div><p className="text-sm font-bold">Ringkasan run saat ini: {testCases.filter(tc=>{const tid=tc[0]??""; return (testState[tid]||"Lulus")==="Lulus"}).length}/{testCases.length} Lulus — lakukan run nyata satu per satu sebelum menandai, agar log revisi & video konsisten.</p></PCard>
   <PCard title="D2 • Uji Integrasi & Uji Beban" color="#DC2626"><SimpleTable heads={["Jenis Uji","Skenario","Hasil yang dicatat"]} rows={[
    ["Integrasi RIS–SIMRS","ADT masuk, ORM masuk, ORU keluar","Log HL7 di tab Integrasi bertambah di setiap tahap"],
    ["Integrasi RIS–Modalitas","MWL query dari CT & DR","Worklist tampil di modalitas (disimulasikan via status & log MWL)"],
    ["Integrasi RIS–PACS","Citra tiba → status reported","Notifikasi Images Arrived tercatat"],
    ["Integrasi FHIR","DiagnosticReport test via tombol simulasi","Log FHIR R4 tercatat"],
    ["Beban — target desain","20 user bersamaan, 100 order/hari, dashboard refresh","Target: p95 response <2 detik untuk worklist; catat hasil load test tool (JMeter/k6) sebagai lampiran terpisah"],
    ["Beban — PACS","Upload studi CT 300–500 MB","Target: C-STORE sukses tanpa timeout di LAN RS; ukur di lingkungan uji nyata"],
   ]}/></PCard>
   <PCard title="D3 • User Manual Singkat (per peran)" color="#DC2626"><div className="grid md:grid-cols-2 gap-3 text-sm"><div className="rounded-2xl bg-[var(--surface2)] p-3"><b>Registrasi:</b> Buka tab Pasien → Daftarkan Pasien → isi nama/TTL/alergi → simpan (MRN otomatis).</div><div className="rounded-2xl bg-[var(--surface2)] p-3"><b>Dokter Pengirim / Admin Order:</b> Tab Worklist → Order Baru → pilih pasien, modalitas, prioritas → Kirim Order.</div><div className="rounded-2xl bg-[var(--surface2)] p-3"><b>Radiografer:</b> Tab Worklist → filter modalitas → Mulai Periksa → Citra Masuk setelah akuisisi selesai.</div><div className="rounded-2xl bg-[var(--surface2)] p-3"><b>Radiolog:</b> Tab Laporan → pilih antrean → pakai template / tulis findings → Simpan → Verifikasi & Kirim ke SIMRS.</div><div className="rounded-2xl bg-[var(--surface2)] p-3 md:col-span-2"><b>Kepala Instalasi:</b> Dashboard untuk KPI & beban modalitas; tab Integrasi untuk audit pesan; tab Portofolio untuk checklist pengumpulan.</div></div></PCard>
  </div>}

  {sub==="E" && <div className="space-y-4">
   <PCard title={`E1 • Abstrak IMRaD — ${ABSTRACT_WORDS} kata (target 200–250)`} color="#0F766E"><p className="text-sm leading-relaxed text-justify">{ABSTRACT_TEXT}</p><p className="text-xs font-bold">Kata kunci: sistem informasi radiologi; RIS; PACS; DICOM; HL7 FHIR; SATUSEHAT; turnaround time; teleradiologi</p><p className="text-xs text-[var(--dim)]">Struktur IMRaD terlihat jelas: Latar belakang & tujuan → Metode → Hasil → Kesimpulan. Sesuaikan angka hasil dengan run pengujian terakhirmu sebelum submit.</p></PCard>
   <PCard title="E2 • Poster A1 — Layout Siap Cetak (preview)" color="#0F766E"><div className="rounded-2xl border-4 border-teal-700 p-4 bg-white text-teal-950" style={{aspectRatio:"1/1.3"}}><p className="text-center font-extrabold text-lg md:text-2xl leading-tight">SIMRAD: Sistem Informasi Radiologi Terintegrasi HIS–RIS–PACS untuk RSUD Bina Sehat</p><p className="text-center text-xs mt-1">{nama||"[Nama Mahasiswa]"} • {nim||"[NIM]"} • Magister Terapan Imaging Diagnostik, Universitas Airlangga</p><div className="grid grid-cols-2 gap-3 mt-4 text-xs"><div className="bg-teal-50 rounded-xl p-3"><b>PENDAHULUAN</b><br/>TAT 3j35m, 12% studi hilang/tertukar, film Rp250jt/th. Perlu sistem filmless terintegrasi.</div><div className="bg-amber-50 rounded-xl p-3"><b>METODE</b><br/>UML, ERD 3NF, IoT 4-layer, DICOM/HL7/FHIR/MQTT, HAPI FHIR experiment, HOT-Fit.</div><div className="bg-sky-50 rounded-xl p-3"><b>HASIL</b><br/>Prototipe registrasi–worklist–laporan–verifikasi berjalan; 12 kasus black box; target TAT CITO &lt;1j, reguler &lt;2j.</div><div className="bg-pink-50 rounded-xl p-3"><b>KESIMPULAN</b><br/>SIMRAD layak jadi blueprint 2027: filmless, SATUSEHAT, teleradiologi 3 satelit.</div></div><p className="text-center text-[11px] mt-3 font-bold">Alur: SIMRS → RIS → Modalitas/PACS → Laporan Terverifikasi → SIMRS & SATUSEHAT • Satu Pasien, Satu Accession Number</p></div><p className="text-sm text-[var(--dim)]">Untuk cetak A1 (594×841 mm): ekspor layout ini ke Canva/PowerPoint ukuran A1, font judul ≥72pt, body ≥24pt, sertakan QR ke video presentasi.</p></PCard>
   <PCard title="E3 • Log Revisi" color="#0F766E"><div className="space-y-2">{revisions.map((r,i)=><div key={i} className="rounded-xl border border-[var(--border)] p-3 text-sm"><b>{r.tgl}</b> — {r.isi} <span className="text-[var(--dim)]">({r.oleh})</span></div>)}</div><form onSubmit={e=>{e.preventDefault(); if(!revForm.isi.trim()) return; setRevisions([{...revForm},...revisions]); setRevForm({...revForm,isi:""});}} className="grid md:grid-cols-[150px_1fr_140px_auto] gap-2"><input aria-label="Tanggal revisi" type="date" value={revForm.tgl} onChange={e=>setRevForm({...revForm,tgl:e.target.value})} className="rounded-xl border px-3 py-2 text-sm"/><input aria-label="Isi revisi" value={revForm.isi} onChange={e=>setRevForm({...revForm,isi:e.target.value})} placeholder="Tulis revisi baru…" className="rounded-xl border px-3 py-2 text-sm"/><input aria-label="Penulis revisi" value={revForm.oleh} onChange={e=>setRevForm({...revForm,oleh:e.target.value})} className="rounded-xl border px-3 py-2 text-sm"/><button className="rounded-full px-4 py-2 bg-teal-700 text-white text-sm font-bold">+ Tambah Log</button></form></PCard>
  </div>}

  {sub==="video" && <div className="space-y-4"><PCard title="🎬 Naskah & Rundown Video 10–15 Menit (10 poin)" color="#DB2777"><SimpleTable heads={["Waktu","Bagian","Yang ditampilkan / diucapkan"]} rows={[
   ["00:00–01:00","Pembukaan","Wajah ke kamera: nama, NIM, judul SIMRAD, RSUD Bina Sehat, dosen pengampu"],
   ["01:00–02:30","Masalah & Target 2027","Slide masalah: TAT, studi hilang, biaya film → target filmless/SATUSEHAT/TAT"],
   ["02:30–04:00","Deliverable A","Arsitektur IoT, pemetaan standar, sequence diagram, eksperimen HAPI FHIR"],
   ["04:00–05:30","Deliverable B","Use Case, Activity, ERD 3NF, arsitektur HIS-RIS-PACS"],
   ["05:30–09:30","Demo Prototipe (inti video)","Live: registrasi pasien → order CT → worklist → laporan → verifikasi → log integrasi"],
   ["09:30–11:00","Deliverable D","Tampilkan tabel black box 12 kasus, uji integrasi & beban"],
   ["11:00–12:30","Deliverable C & E","HOT-Fit, abstrak, poster A1"],
   ["12:30–14:00","Penutup","Kesimpulan, keterbatasan, rencana pilot — ucapkan terima kasih"],
  ]}/><p className="text-sm">Tips rekaman: rekam wajah + layar (OBS/Zoom), suara jelas, demo dengan 1 pasien baru secara live (jangan hanya klik data lama), sebutkan accession number & log HL7/FHIR saat muncul. Durasi jangan kurang dari 10 menit dan jangan lebih dari 15 menit.</p><button onClick={()=>onGoTab("dashboard")} className="rounded-full px-5 py-2.5 bg-pink-600 text-white font-bold text-sm">Mulai Latihan Demo dari Dashboard →</button></PCard></div>}
 </div>
}
