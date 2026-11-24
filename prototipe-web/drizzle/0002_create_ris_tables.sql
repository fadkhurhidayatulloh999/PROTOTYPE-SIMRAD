DROP TABLE IF EXISTS entries;
--> statement-breakpoint
CREATE TABLE patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mrn TEXT NOT NULL,
  name TEXT NOT NULL,
  dob TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT 'Laki-laki',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  insurance TEXT NOT NULL DEFAULT 'Umum',
  allergy TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE examinations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL,
  accession_number TEXT NOT NULL,
  modality TEXT NOT NULL DEFAULT 'CR',
  procedure_name TEXT NOT NULL,
  body_part TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'Routine',
  status TEXT NOT NULL DEFAULT 'registered',
  referring_doctor TEXT NOT NULL DEFAULT '',
  clinical_indication TEXT NOT NULL DEFAULT '',
  scheduled_at INTEGER NOT NULL,
  radiographer TEXT NOT NULL DEFAULT '',
  radiologist TEXT NOT NULL DEFAULT '',
  findings TEXT NOT NULL DEFAULT '',
  impression TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE integration_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER,
  from_system TEXT NOT NULL DEFAULT 'SIMRS',
  to_system TEXT NOT NULL DEFAULT 'RIS',
  protocol TEXT NOT NULL DEFAULT 'HL7 v2',
  message_type TEXT NOT NULL DEFAULT 'ORM^O01',
  status TEXT NOT NULL DEFAULT 'success',
  summary TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
