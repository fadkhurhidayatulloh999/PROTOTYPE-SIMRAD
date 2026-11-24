import { defineAction, z, type ActionsModule, type Ctx } from "@hatch/space-sdk";
import { desc, eq, sql } from "drizzle-orm";
import * as schema from "./schema";

const patientShape = z.object({
  id: z.number(), mrn: z.string(), name: z.string(), dob: z.string(), gender: z.string(),
  phone: z.string(), address: z.string(), insurance: z.string(), allergy: z.string(), created_at: z.string(),
});
const examShape = z.object({
  id: z.number(), patientId: z.number(), patientName: z.string(), patientMrn: z.string(),
  accessionNumber: z.string(), modality: z.string(), procedureName: z.string(), bodyPart: z.string(),
  priority: z.string(), status: z.string(), referringDoctor: z.string(), clinicalIndication: z.string(),
  scheduledAt: z.string(), radiographer: z.string(), radiologist: z.string(), findings: z.string(), impression: z.string(),
  createdAt: z.string(),
});
const logShape = z.object({
  id: z.number(), examId: z.number().nullable(), fromSystem: z.string(), toSystem: z.string(),
  protocol: z.string(), messageType: z.string(), status: z.string(), summary: z.string(), createdAt: z.string(),
});

async function addLog(ctx: Ctx, data: { examId?: number | null; fromSystem: string; toSystem: string; protocol: "HL7 v2" | "FHIR R4" | "DICOM" | "DICOM MWL"; messageType: string; summary: string }) {
  const db = ctx.db<typeof schema>();
  await db.insert(schema.integrationLogs).values({
    examId: data.examId ?? null, fromSystem: data.fromSystem, toSystem: data.toSystem,
    protocol: data.protocol, messageType: data.messageType, status: "success", summary: data.summary,
  });
}

export const Actions = {
  getDashboard: defineAction({
    description: "Returns RIS dashboard aggregates and recent activity.",
    request: z.object({}),
    response: z.object({
      totalPatients: z.number(), totalExams: z.number(),
      byStatus: z.object({ registered: z.number(), scheduled: z.number(), in_progress: z.number(), reported: z.number(), verified: z.number(), cancelled: z.number() }),
      byModality: z.array(z.object({ modality: z.string(), count: z.number() })),
      todayExams: z.number(), pendingReports: z.number(),
      recentExams: z.array(examShape), recentLogs: z.array(logShape),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const patients = await db.select().from(schema.patients);
      const exams = await db.select().from(schema.examinations).orderBy(desc(schema.examinations.scheduledAt));
      const logs = await db.select().from(schema.integrationLogs).orderBy(desc(schema.integrationLogs.id)).limit(8);
      const byStatus = { registered: 0, scheduled: 0, in_progress: 0, reported: 0, verified: 0, cancelled: 0 };
      const modMap = new Map<string, number>();
      const today = new Date(); today.setHours(0,0,0,0);
      let todayExams = 0;
      for (const e of exams) {
        if (e.status in byStatus) (byStatus as any)[e.status]++;
        modMap.set(e.modality, (modMap.get(e.modality) ?? 0) + 1);
        if (e.scheduledAt >= today) todayExams++;
      }
      const pMap = new Map(patients.map(p => [p.id, p]));
      const recentExams = exams.slice(0, 6).map(e => {
        const p = pMap.get(e.patientId);
        return { id: e.id, patientId: e.patientId, patientName: p?.name ?? "—", patientMrn: p?.mrn ?? "—", accessionNumber: e.accessionNumber, modality: e.modality, procedureName: e.procedureName, bodyPart: e.bodyPart, priority: e.priority, status: e.status, referringDoctor: e.referringDoctor, clinicalIndication: e.clinicalIndication, scheduledAt: e.scheduledAt.toISOString(), radiographer: e.radiographer, radiologist: e.radiologist, findings: e.findings, impression: e.impression, createdAt: e.createdAt.toISOString() };
      });
      return {
        totalPatients: patients.length, totalExams: exams.length, byStatus,
        byModality: Array.from(modMap.entries()).map(([modality, count]) => ({ modality, count })).sort((a,b)=>b.count-a.count),
        todayExams, pendingReports: byStatus.in_progress + byStatus.reported,
        recentExams,
        recentLogs: logs.map(l => ({ id: l.id, examId: l.examId, fromSystem: l.fromSystem, toSystem: l.toSystem, protocol: l.protocol, messageType: l.messageType, status: l.status, summary: l.summary, createdAt: l.createdAt.toISOString() })),
      };
    },
  }),

  listPatients: defineAction({
    description: "Lists all registered patients.",
    request: z.object({ limit: z.number().int().positive().max(200).default(100) }),
    response: z.object({ patients: z.array(patientShape) }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.patients).orderBy(desc(schema.patients.id)).limit(args.limit);
      return { patients: rows.map(r => ({ id: r.id, mrn: r.mrn, name: r.name, dob: r.dob, gender: r.gender, phone: r.phone, address: r.address, insurance: r.insurance, allergy: r.allergy, created_at: r.createdAt.toISOString() })) };
    },
  }),

  createPatient: defineAction({
    description: "Registers a new patient and logs HL7 ADT^A01 to RIS.",
    request: z.object({
      name: z.string().trim().min(1).max(120), dob: z.string().max(20).default(""),
      gender: z.enum(["Laki-laki", "Perempuan"]).default("Laki-laki"),
      phone: z.string().max(30).default(""), address: z.string().max(300).default(""),
      insurance: z.string().max(60).default("Umum"), allergy: z.string().max(200).default(""),
    }),
    response: z.object({ id: z.number(), mrn: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const countRow = await db.select({ c: sql<number>`count(*)` }).from(schema.patients);
      const seq = (countRow[0]?.c ?? 0) + 1;
      const mrn = `RM-${String(seq).padStart(6, "0")}`;
      const res = await db.insert(schema.patients).values({ mrn, name: args.name, dob: args.dob, gender: args.gender, phone: args.phone, address: args.address, insurance: args.insurance, allergy: args.allergy }).returning({ id: schema.patients.id });
      const id = res[0]!.id;
      await addLog(ctx, { fromSystem: "SIMRS", toSystem: "RIS", protocol: "HL7 v2", messageType: "ADT^A01", summary: `Registrasi pasien ${args.name} (${mrn}) diterima dari SIMRS` });
      await addLog(ctx, { fromSystem: "RIS", toSystem: "PACS", protocol: "DICOM", messageType: "Patient Record Sync", summary: `Demografi ${mrn} disinkronkan ke PACS` });
      ctx.invalidateQueries();
      return { id, mrn };
    },
  }),

  deletePatient: defineAction({
    description: "Deletes a patient record.",
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.patients).where(eq(schema.patients.id, args.id));
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  listExaminations: defineAction({
    description: "Lists examinations with patient info, optionally filtered by status.",
    request: z.object({ limit: z.number().int().positive().max(200).default(100), status: z.string().max(30).default("") }),
    response: z.object({ examinations: z.array(examShape) }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const patients = await db.select().from(schema.patients);
      const pMap = new Map(patients.map(p => [p.id, p]));
      let rows = await db.select().from(schema.examinations).orderBy(desc(schema.examinations.scheduledAt)).limit(args.limit);
      if (args.status) rows = rows.filter(r => r.status === args.status);
      return { examinations: rows.map(e => { const p = pMap.get(e.patientId); return { id: e.id, patientId: e.patientId, patientName: p?.name ?? "Pasien terhapus", patientMrn: p?.mrn ?? "—", accessionNumber: e.accessionNumber, modality: e.modality, procedureName: e.procedureName, bodyPart: e.bodyPart, priority: e.priority, status: e.status, referringDoctor: e.referringDoctor, clinicalIndication: e.clinicalIndication, scheduledAt: e.scheduledAt.toISOString(), radiographer: e.radiographer, radiologist: e.radiologist, findings: e.findings, impression: e.impression, createdAt: e.createdAt.toISOString() }; }) };
    },
  }),

  createExamination: defineAction({
    description: "Creates a new exam order, generates accession number, and logs HL7 ORM + DICOM MWL.",
    request: z.object({
      patientId: z.number().int().positive(),
      modality: z.enum(["CT", "MR", "CR", "DR", "US", "MG", "FL", "NM"]),
      procedureName: z.string().trim().min(1).max(160),
      bodyPart: z.string().max(80).default(""),
      priority: z.enum(["Routine", "Urgent", "STAT"]).default("Routine"),
      referringDoctor: z.string().max(120).default(""),
      clinicalIndication: z.string().max(500).default(""),
      scheduledAt: z.string().max(40).default(""),
      radiographer: z.string().max(120).default(""),
      radiologist: z.string().max(120).default(""),
    }),
    response: z.object({ id: z.number(), accessionNumber: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const countRow = await db.select({ c: sql<number>`count(*)` }).from(schema.examinations);
      const seq = (countRow[0]?.c ?? 0) + 1;
      const accessionNumber = `ACC${new Date().getFullYear()}${String(seq).padStart(5, "0")}`;
      const sched = args.scheduledAt ? new Date(args.scheduledAt) : new Date();
      const res = await db.insert(schema.examinations).values({
        patientId: args.patientId, accessionNumber, modality: args.modality, procedureName: args.procedureName,
        bodyPart: args.bodyPart, priority: args.priority, status: "scheduled", referringDoctor: args.referringDoctor,
        clinicalIndication: args.clinicalIndication, scheduledAt: isNaN(sched.getTime()) ? new Date() : sched,
        radiographer: args.radiographer, radiologist: args.radiologist,
      }).returning({ id: schema.examinations.id });
      const id = res[0]!.id;
      await addLog(ctx, { examId: id, fromSystem: "SIMRS", toSystem: "RIS", protocol: "HL7 v2", messageType: "ORM^O01", summary: `Order ${args.modality} — ${args.procedureName} (${accessionNumber}) masuk ke RIS` });
      await addLog(ctx, { examId: id, fromSystem: "RIS", toSystem: "Modalitas " + args.modality, protocol: "DICOM MWL", messageType: "MWL C-FIND", summary: `Worklist ${accessionNumber} tersedia di modality worklist` });
      ctx.invalidateQueries();
      return { id, accessionNumber };
    },
  }),

  updateExamStatus: defineAction({
    description: "Moves an examination to the next workflow status and logs integration events.",
    request: z.object({ id: z.number().int().positive(), status: z.enum(["registered", "scheduled", "in_progress", "reported", "verified", "cancelled"]) }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      await db.update(schema.examinations).set({ status: args.status, updatedAt: new Date() }).where(eq(schema.examinations.id, args.id));
      const rows = await db.select().from(schema.examinations).where(eq(schema.examinations.id, args.id));
      const ex = rows[0];
      if (ex) {
        if (args.status === "in_progress") await addLog(ctx, { examId: ex.id, fromSystem: "Modalitas " + ex.modality, toSystem: "RIS", protocol: "DICOM", messageType: "MPPS IN PROGRESS", summary: `Pemeriksaan ${ex.accessionNumber} dimulai — MPPS diterima` });
        if (args.status === "reported") await addLog(ctx, { examId: ex.id, fromSystem: "PACS", toSystem: "RIS", protocol: "DICOM", messageType: "Images Arrived", summary: `Citra ${ex.accessionNumber} tiba di PACS & terhubung ke order` });
        if (args.status === "verified") await addLog(ctx, { examId: ex.id, fromSystem: "RIS", toSystem: "SIMRS", protocol: "HL7 v2", messageType: "ORU^R01", summary: `Hasil terverifikasi ${ex.accessionNumber} dikirim ke SIMRS / EMR` });
      }
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  saveReport: defineAction({
    description: "Saves radiologist findings and impression for an examination.",
    request: z.object({ id: z.number().int().positive(), findings: z.string().max(5000).default(""), impression: z.string().max(3000).default(""), radiologist: z.string().max(120).default("") }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      await db.update(schema.examinations).set({ findings: args.findings, impression: args.impression, radiologist: args.radiologist, status: "reported", updatedAt: new Date() }).where(eq(schema.examinations.id, args.id));
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  listLogs: defineAction({
    description: "Lists integration logs between SIMRS, RIS, PACS, and modalities.",
    request: z.object({ limit: z.number().int().positive().max(200).default(60) }),
    response: z.object({ logs: z.array(logShape) }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.integrationLogs).orderBy(desc(schema.integrationLogs.id)).limit(args.limit);
      return { logs: rows.map(l => ({ id: l.id, examId: l.examId, fromSystem: l.fromSystem, toSystem: l.toSystem, protocol: l.protocol, messageType: l.messageType, status: l.status, summary: l.summary, createdAt: l.createdAt.toISOString() })) };
    },
  }),

  simulateMessage: defineAction({
    description: "Simulates sending a test integration message between systems.",
    request: z.object({ fromSystem: z.string().max(40), toSystem: z.string().max(40), protocol: z.enum(["HL7 v2", "FHIR R4", "DICOM", "DICOM MWL"]), messageType: z.string().max(60), summary: z.string().max(300) }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const res = await db.insert(schema.integrationLogs).values({ fromSystem: args.fromSystem, toSystem: args.toSystem, protocol: args.protocol, messageType: args.messageType, summary: args.summary, status: "success" }).returning({ id: schema.integrationLogs.id });
      ctx.invalidateQueries();
      return { id: res[0]!.id };
    },
  }),
} satisfies ActionsModule;
