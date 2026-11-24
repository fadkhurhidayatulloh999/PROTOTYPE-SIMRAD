import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const patients = sqliteTable("patients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mrn: text("mrn").notNull(),
  name: text("name").notNull(),
  dob: text("dob").notNull().default(""),
  gender: text("gender", { enum: ["Laki-laki", "Perempuan"] }).notNull().default("Laki-laki"),
  phone: text("phone").notNull().default(""),
  address: text("address").notNull().default(""),
  insurance: text("insurance").notNull().default("Umum"),
  allergy: text("allergy").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const examinations = sqliteTable("examinations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  patientId: integer("patient_id").notNull(),
  accessionNumber: text("accession_number").notNull(),
  modality: text("modality", { enum: ["CT", "MR", "CR", "DR", "US", "MG", "FL", "NM"] }).notNull().default("CR"),
  procedureName: text("procedure_name").notNull(),
  bodyPart: text("body_part").notNull().default(""),
  priority: text("priority", { enum: ["Routine", "Urgent", "STAT"] }).notNull().default("Routine"),
  status: text("status", { enum: ["registered", "scheduled", "in_progress", "reported", "verified", "cancelled"] }).notNull().default("registered"),
  referringDoctor: text("referring_doctor").notNull().default(""),
  clinicalIndication: text("clinical_indication").notNull().default(""),
  scheduledAt: integer("scheduled_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  radiographer: text("radiographer").notNull().default(""),
  radiologist: text("radiologist").notNull().default(""),
  findings: text("findings").notNull().default(""),
  impression: text("impression").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

export const integrationLogs = sqliteTable("integration_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  examId: integer("exam_id"),
  fromSystem: text("from_system").notNull().default("SIMRS"),
  toSystem: text("to_system").notNull().default("RIS"),
  protocol: text("protocol", { enum: ["HL7 v2", "FHIR R4", "DICOM", "DICOM MWL"] }).notNull().default("HL7 v2"),
  messageType: text("message_type").notNull().default("ORM^O01"),
  status: text("status", { enum: ["success", "pending", "failed"] }).notNull().default("success"),
  summary: text("summary").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});
