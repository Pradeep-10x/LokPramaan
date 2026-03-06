# WitnessLedger — Features & USP

> **Civic issue tracking platform with cryptographic proof, AI-powered classification, fraud detection, and real-time notifications — built for Ghaziabad Municipal Corporation.**

---

## What is WitnessLedger?

WitnessLedger is a civic accountability platform that lets citizens report infrastructure problems (potholes, broken lights, water leaks, etc.) to their municipal ward. Every issue goes through a **tamper-proof lifecycle** — from citizen report → official acceptance → inspection → contractor work → photographic verification — with every step audited, GPS-stamped, and cryptographically hashed.

The core promise: **no issue can be marked fixed without photographic proof taken on-site, and every photo is verified for authenticity.**

---

## Feature List

### 1. 🗺️ Auto Ward Detection
- Citizens never need to select their ward manually.
- GPS coordinates from the photo EXIF data (or device GPS fallback) are used to calculate the **nearest ward** via haversine distance.
- The ward is always server-determined — it cannot be spoofed from the frontend.

### 2. 🤖 Auto Department Classification (Keyword NLP)
- When a citizen reports an issue, the title + description are run through a keyword classifier.
- **80+ keywords** across 6 departments: `MUNICIPAL`, `ELECTRICITY`, `WATER`, `SANITATION`, `HEALTH`, `TRANSPORT`.
- Multi-word phrase matching (e.g. "street light", "water pipeline") with weighted scoring.
- Returns confidence level: `HIGH`, `MEDIUM`, or `LOW` (falls back to `MUNICIPAL`).
- Department is **always auto-determined** — citizens cannot manipulate it.

### 3. 📸 EXIF Photo Authentication
- Every uploaded photo is checked for EXIF GPS coordinates and timestamp.
- **Hard reject if photo is > 6 hours old** (configurable via `PHOTO_MAX_AGE_HOURS`). Prevents use of stock/archive photos.
- **Hard reject if device GPS and photo EXIF GPS differ by > 500m** (configurable via `DEVICE_PHOTO_DISTANCE_METRES`). Prevents submitting a photo taken elsewhere.
- For issue creation (citizen photo): soft warning if GPS mismatch (doesn't block submission, but flags it).

### 4. 🔍 Perceptual Hash Fraud Detection (dHash)
- Every uploaded evidence photo gets a **64-bit dHash** (difference hash) fingerprint stored in the DB.
- When an AFTER photo is submitted, the system automatically:
  - Compares it against the issue's own BEFORE photo (detects same photo used for both).
  - Compares it against **all photos in the database** (detects recycled/stock photos across issues).
- If Hamming distance ≤ 10 (visually near-identical), the evidence is flagged: `fraudFlag = true`, `fraudReason = "SAME_AS_BEFORE" | "RECYCLED_PHOTO"`.
- Fraud flags trigger a **ward-staff notification** and are visible in the evidence record.

### 5. 📋 Full Issue Lifecycle
Strict state machine with 11 statuses:

```
OPEN → ACCEPTED → INSPECTING → WORK_DONE → UNDER_REVIEW → VERIFIED
                ↓
             REJECTED
                         ↗ CONTRACTOR_ASSIGNED
                         ↗ ASSIGNED
                         ↗ IN_PROGRESS
                         ↗ COMPLETED
```

Each transition is role-gated:
| Action | Allowed Role |
|---|---|
| Create issue | CITIZEN (or any) |
| Accept / Reject | OFFICER, ADMIN |
| Assign inspector | OFFICER, ADMIN |
| Hire contractor | OFFICER, ADMIN |
| Mark work done | CONTRACTOR |
| Upload BEFORE photo | INSPECTOR (must be assigned to this issue) |
| Upload AFTER photo | INSPECTOR (must be assigned to this issue) |
| Verify / reject resolution | OFFICER, ADMIN |
| Convert issue to project | OFFICER, ADMIN |

### 6. 🏗️ Three-Photo Evidence Chain
Each issue has a structured photo record:
- **CITIZEN photo** — taken at time of reporting; auto-extracted from the issue creation upload.
- **BEFORE photo** — taken by inspector on-site before work begins. Must be fresh (EXIF timestamp < 6h).
- **AFTER photo** — taken by inspector after contractor completes work. Triggers fraud check + auto-transitions to UNDER_REVIEW.

All three are stored as separate `Evidence` records and returned together via `getIssueById`.

### 7. 🔐 Cryptographic Proof & QR Codes
- Every evidence file gets a **SHA-256 hash** computed server-side at upload time.
- The proof endpoint returns: issue details, all evidence with hashes, EXIF metadata, geo-validation status.
- A **QR code** (PNG/data URL) can be generated for any issue, linking to the public proof URL.
- Use case: GMC can print QR stickers at a repair site; anyone can scan to verify the fix is documented.

### 8. 🔔 Real-Time In-App Notifications
Automatic notifications are sent to the right people at every lifecycle event:

| Event | Recipients |
|---|---|
| Issue created | Ward officers + admins |
| Issue accepted | Citizen who reported |
| Issue rejected | Citizen who reported |
| Inspector assigned | Inspector |
| Contractor hired | Contractor |
| Work marked done | Ward officers + inspector |
| AFTER photo uploaded | Ward officers + citizen |
| Issue verified | Citizen |
| Fraud detected | Ward staff (officers + inspectors) |
| SLA breach | Ward staff |
| Escalation triggered | Ward staff |

Notifications are scoped to the ward — staff only receive notifications for issues in their own ward.

### 9. ⏰ SLA Tracking & Auto-Escalation
- Every issue is assigned a **SLA deadline** (default: 48 hours, configurable).
- An escalation service runs every 1 hour and fires for:
  - Issues OPEN for > 48 hours with no action.
  - Issues that have breached their SLA deadline.
  - Issues stuck in WORK_DONE for > 24 hours (inspector not responding).
- Escalated issues get an `escalatedAt` timestamp and a ward-staff notification. Each issue escalates only once.

### 10. 🔁 Duplicate Issue Detection
- When a new issue is created, the server automatically scans for existing OPEN/ACCEPTED issues within **100 metres** of the same GPS coordinates.
- If duplicates are found, they are returned in the response (`nearbyDuplicates`).
- Officers can **link duplicates** via `POST /api/issues/:id/toggle-duplicate`, setting `duplicateOfId`.

### 11. 📧 Email OTP Verification (Registration Flow)
- Citizens must verify their email via OTP before completing registration.
- Flow: `POST /api/otp/send` → receive OTP in email → `POST /api/otp/verify` → `POST /api/auth/register`.
- OTPs are rate-limited, time-bound, and stored server-side.

### 12. 🏢 Hierarchical Admin Units
- Three-level hierarchy: `GLOBAL (India) → CITY (Ghaziabad) → WARD (Raj Nagar, etc.)`
- Each user is scoped to an admin unit — RBAC is fully ward-aware.
- Ward center GPS coordinates stored; used for ward detection and issue routing.
- Ward-level admins manage only their own ward. City admin has full authority.

### 13. 📊 Live KPI Dashboard (Metrics API)
Single endpoint returning:
- Total issues, verified issues, verified %
- Average resolution time (hours)
- SLA compliance % (resolved before deadline)
- Proof coverage count and % (issues with both BEFORE + AFTER photos)

### 14. 👥 Resident Proximity Notifications (SMS-ready)
- Resident phone numbers are stored as **SHA-256 hashes** (privacy-preserving).
- Officers can trigger notifications to residents within a configurable radius (default: 50m) of any issue.
- Twilio integration ready for SMS dispatch.

### 15. 🏗️ Project Management
- Issues can be **converted to infrastructure projects** (e.g., a single pothole → Road Repair Project).
- Issues can be attached to existing projects.
- Projects have budget, status (`PROPOSED → ACTIVE → COMPLETED`), and timeline audit logs.
- Citizens can view all projects in their ward.

### 16. 📁 Proof from Photo (Location from Photo)
- Frontend can upload a photo and receive back extracted GPS coordinates + nearest ward — without creating an issue.
- Used for pre-filling the issue creation form.

---

## Unique Selling Points (USP)

### 🛡️ Tamper-Proof Evidence Chain
Unlike standard complaint portals, WitnessLedger makes it **technically impossible** to mark an issue as resolved without uploading a fresh, GPS-verified on-site photo. The SHA-256 hash of every photo is stored at upload time — any file modification would invalidate the proof.

### 🤳 Photo-First Workflow
The entire platform is built around photos. No text-only resolutions. The CITIZEN → BEFORE → AFTER photo chain creates a visual before-and-after record that is publicly verifiable via QR code.

### 🚫 Anti-Fraud at Upload Time
The dHash fraud detection runs **synchronously at upload**. A contractor cannot submit an AFTER photo that is visually identical to the BEFORE photo or to any previously submitted photo in the system. This is the first known implementation of perceptual hash fraud detection in a civic issue tracker.

### 🗺️ Zero-Trust Location
Location is never trusted from the frontend. The server always extracts GPS from the photo EXIF and cross-checks it against device GPS. If they diverge > 500m, the upload is rejected. This prevents a field officer from submitting a photo taken at their desk.

### 🔏 Cryptographic Public Accountability
QR codes on site boards let any citizen scan and verify the repair documentation without needing an account. This turns infrastructure maintenance into a **publicly auditable record**.

### 🤖 Zero Manual Department Routing
GMC staff don't spend time routing complaints to departments. The NLP classifier assigns the correct department from the issue text at sub-millisecond speed.

### 🏙️ Ward-Scoped Privacy
Every staff member sees only their own ward's issues and notifications. Citizens never expose data to the wrong ward. This makes the platform safe for multi-ward rollout without a complex permissions UI.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 + TypeScript (strict) |
| Framework | Express.js |
| Database | PostgreSQL (Supabase) via Prisma ORM |
| Auth | JWT (Bearer token, 7-day expiry) |
| File Storage | Cloudinary (production) / local uploads (dev) |
| Image Processing | sharp (dHash computation) |
| EXIF Extraction | exifr |
| Password Hashing | bcrypt (12 rounds) |
| Email | Nodemailer (SMTP) |
| SMS | Twilio (optional) |
| QR Code | qrcode |
| Validation | Custom middleware (field-level) |
| Logging | Winston (structured JSON) |
| Tests | Jest + @swc/jest |

---

## Roles Summary

| Role | Scope | Key Permissions |
|---|---|---|
| `ADMIN` | City or Ward | Full CRUD, create users, verify issues, approve projects |
| `OFFICER` | Ward | Accept/reject/assign issues, hire contractors, verify issues |
| `INSPECTOR` | Ward | Upload BEFORE/AFTER photos (only own assigned issues) |
| `CONTRACTOR` | City | Mark work done on assigned issues |
| `CITIZEN` | None (or ward) | Create issues, view own issues, view ward transparency feed |

---

## Data Integrity Guarantees

1. **Every file** has a SHA-256 hash stored at upload time.
2. **Every status change** creates an `AuditLog` entry with actor, timestamp, and metadata.
3. **Department** is always machine-determined (not user-selected).
4. **Ward** is always GPS-determined (not user-selected).
5. **After photos** are perceptually compared against all prior photos before acceptance.
6. **Photos older than 6 hours** are rejected at the server level.
7. **Resident phone numbers** are never stored in plaintext — SHA-256 hashed with a server-side salt.
