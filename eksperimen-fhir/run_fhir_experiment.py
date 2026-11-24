#!/usr/bin/env python3
"""Eksperimen API FHIR untuk Deliverable A4 UAS SIR SIMRAD.
5 skenario x 10 ulangan ke server publik HAPI FHIR R4.
Mengukur latensi (ms) dan success rate. Hasil: JSON mentah + ringkasan CSV.
Data pasien yang dibuat adalah data uji fiktif untuk server publik HAPI.
"""
import json, time, statistics, urllib.request, urllib.error, uuid, csv, os

BASE = "https://hapi.fhir.org/baseR4"
OUT_DIR = os.path.dirname(os.path.abspath(__file__))
RUN_ID = uuid.uuid4().hex[:8]

def do_request(method, path, payload=None):
    url = BASE + path
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Accept", "application/fhir+json")
    if data:
        req.add_header("Content-Type", "application/fhir+json")
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read()
            elapsed = (time.perf_counter() - start) * 1000
            return resp.status, elapsed, body
    except urllib.error.HTTPError as e:
        elapsed = (time.perf_counter() - start) * 1000
        return e.code, elapsed, b""
    except Exception:
        elapsed = (time.perf_counter() - start) * 1000
        return 0, elapsed, b""

def patient_payload(i):
    return {
        "resourceType": "Patient",
        "identifier": [{"system": "http://rsudbinasehat.example/mrn", "value": f"SIMRAD-TEST-{RUN_ID}-{i}"}],
        "name": [{"family": "UjiSIMRAD", "given": [f"Pasien{i}"]}],
        "gender": "female" if i % 2 else "male",
        "birthDate": "1990-05-17",
    }

def imagingstudy_payload(i, patient_ref=None):
    study = {
        "resourceType": "ImagingStudy",
        "status": "available",
        "identifier": [{"system": "http://rsudbinasehat.example/accession", "value": f"ACC-SIMRAD-{RUN_ID}-{i}"}],
        "modality": [{"system": "http://dicom.nema.org/resources/ontology/DCM", "code": "CT", "display": "Computed Tomography"}],
        "started": "2026-11-21T02:00:00Z",
        "numberOfSeries": 1,
        "numberOfInstances": 1,
        "series": [{
            "uid": f"1.2.840.999.{i}.{int(time.time())%100000}",
            "number": 1,
            "modality": {"system": "http://dicom.nema.org/resources/ontology/DCM", "code": "CT"},
            "numberOfInstances": 1,
            "instance": [{"uid": f"1.2.840.998.{i}.{int(time.time())%100000}", "sopClass": {"system": "urn:ietf:rfc:3986", "code": "urn:oid:1.2.840.10008.5.1.4.1.1.2"}, "number": 1}]
        }],
    }
    if patient_ref:
        study["subject"] = {"reference": patient_ref}
    return study

scenarios = []
created_patient_ref = None

# Skenario dijalankan berurutan agar POST ImagingStudy bisa merujuk Patient bila tersedia
plan = [
    ("GET Patient", "GET", "/Patient?_count=5", None),
    ("POST Patient", "POST", "/Patient", "patient"),
    ("GET ImagingStudy", "GET", "/ImagingStudy?_count=5", None),
    ("POST ImagingStudy", "POST", "/ImagingStudy", "imaging"),
    ("GET DiagnosticReport", "GET", "/DiagnosticReport?_count=5", None),
]

for name, method, path, kind in plan:
    latencies, successes, codes = [], 0, []
    for i in range(10):
        payload = None
        if kind == "patient":
            payload = patient_payload(i)
        elif kind == "imaging":
            payload = imagingstudy_payload(i, created_patient_ref)
        status, elapsed, body = do_request(method, path, payload)
        latencies.append(round(elapsed, 1))
        codes.append(status)
        if status in (200, 201):
            successes += 1
            if kind == "patient" and created_patient_ref is None and body:
                try:
                    rid = json.loads(body).get("id")
                    if rid:
                        created_patient_ref = f"Patient/{rid}"
                except Exception:
                    pass
        time.sleep(0.3)
    scenarios.append({
        "scenario": name,
        "method": method,
        "endpoint": BASE + path,
        "n": 10,
        "latencies_ms": latencies,
        "mean_ms": round(statistics.mean(latencies), 1),
        "stdev_ms": round(statistics.pstdev(latencies), 1) if len(latencies) > 1 else 0.0,
        "min_ms": min(latencies),
        "max_ms": max(latencies),
        "success": successes,
        "success_rate_pct": successes * 10.0,
        "http_codes": codes,
    })
    print(name, scenarios[-1]["mean_ms"], scenarios[-1]["success_rate_pct"])

result = {"base": BASE, "run_id": RUN_ID, "date": "2026-11-21", "created_patient_ref": created_patient_ref, "scenarios": scenarios}
with open(os.path.join(OUT_DIR, "fhir_experiment_results.json"), "w") as f:
    json.dump(result, f, indent=2)
with open(os.path.join(OUT_DIR, "fhir_experiment_summary.csv"), "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["Skenario", "Metode", "Endpoint", "Ulangan", "Rata-rata latensi (ms)", "Simpangan baku (ms)", "Min (ms)", "Max (ms)", "Success rate (%)"])
    for s in scenarios:
        w.writerow([s["scenario"], s["method"], s["endpoint"], s["n"], s["mean_ms"], s["stdev_ms"], s["min_ms"], s["max_ms"], s["success_rate_pct"]])
print("DONE", created_patient_ref)
