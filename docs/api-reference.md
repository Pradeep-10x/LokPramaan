# WitnessLedger — Frontend API Reference

> **Base URL:** `http://localhost:4000` (dev) | `https://your-render-url.onrender.com` (prod)
>
> **Auth:** All protected endpoints require `Authorization: Bearer <token>` header.
> Token is returned from `/api/auth/login` and `/api/auth/register`.
>
> **Content-Type:** `application/json` for JSON requests; `multipart/form-data` for file uploads.

---

## Table of Contents

1. [OTP / Email Verification](#1-otp--email-verification)
2. [Auth](#2-auth)
3. [Users & Profile](#3-users--profile)
4. [Admin Units (Wards)](#4-admin-units-wards)
5. [Issues — CRUD & Lifecycle](#5-issues--crud--lifecycle)
6. [Evidence (Photos)](#6-evidence-photos)
7. [Verification](#7-verification)
8. [Proof & QR Code](#8-proof--qr-code)
9. [Projects](#9-projects)
10. [Notifications](#10-notifications)
11. [Residents](#11-residents)
12. [Metrics / Dashboard](#12-metrics--dashboard)
13. [Health Check](#13-health-check)
14. [Error Format](#14-error-format)
15. [Status & Role Reference](#15-status--role-reference)
16. [Complete Screen-by-Screen Guide](#16-complete-screen-by-screen-guide)

---

## 1. OTP / Email Verification

> Required before a new citizen can register. Must complete this flow first.

---

### `POST /api/otp/send`
Send an OTP to an email address.

**Auth:** None

**Request Body:**
```json
{ "email": "user@example.com" }
```

**Response `200`:**
```json
{ "message": "OTP sent to user@example.com" }
```

**Errors:**
| Code | Meaning |
|---|---|
| `429` | OTP already sent recently — tell user to check inbox |
| `500` | SMTP failure |

---

### `POST /api/otp/verify`
Verify the OTP the user received by email.

**Auth:** None

**Request Body:**
```json
{ "email": "user@example.com", "otp": "123456" }
```

**Response `200`:**
```json
{ "message": "Email verified successfully", "verified": true }
```

**Errors:**
| Code | Meaning |
|---|---|
| `400` | Invalid or expired OTP |

**Frontend Flow:**
```
[Email input] → POST /api/otp/send
[OTP input]   → POST /api/otp/verify → verified = true
[Register form] → POST /api/auth/register
```

---

## 2. Auth

---

### `POST /api/auth/register`
Register a new user. Email must be verified via OTP first.

**Auth:** None

**Request Body:**
```json
{
  "name": "Mohit Agarwal",
  "email": "mohit@example.com",
  "password": "StrongPass123!",
  "role": "CITIZEN"
}
```
> `role` defaults to `CITIZEN` if omitted. Only `ADMIN` can create staff accounts via `/api/users/create-user`.

**Response `201`:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "name": "Mohit Agarwal",
    "email": "mohit@example.com",
    "role": "CITIZEN",
    "adminUnitId": null
  }
}
```

**Response `202` — OTP not yet verified:**
```json
{
  "step": "verify_email",
  "message": "OTP sent to your email. Verify it first using POST /api/otp/verify, then call register again."
}
```

> **Frontend note:** If you get `202`, redirect to OTP verification screen. After verification, re-submit the same registration form.

---

### `POST /api/auth/login`
Log in with email and password.

**Auth:** None

**Request Body:**
```json
{ "email": "mohit@example.com", "password": "StrongPass123!" }
```

**Response `200`:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "name": "Mohit Agarwal",
    "email": "mohit@example.com",
    "role": "CITIZEN",
    "adminUnitId": "ward-uuid-or-null"
  }
}
```

> **Store the token** in `localStorage` / `SecureStorage`. Attach it as `Authorization: Bearer <token>` on every subsequent request. Token expires in **7 days**.

---

## 3. Users & Profile

---

### `GET /api/users/me`
Get the logged-in user's profile.

**Auth:** Required

**Response `200`:**
```json
{
  "id": "uuid",
  "name": "Mohit Agarwal",
  "email": "mohit@example.com",
  "role": "CITIZEN",
  "adminUnitId": "ward-uuid",
  "adminUnit": { "id": "uuid", "name": "Raj Nagar", "type": "WARD" },
  "createdAt": "2026-03-07T10:00:00.000Z"
}
```

---

### `PATCH /api/users/me/ward`
Set the logged-in user's ward — either by passing a wardId or GPS coordinates.

**Auth:** Required

**Request Body (option A — manual selection):**
```json
{ "wardId": "ward-uuid" }
```

**Request Body (option B — auto-detect from GPS):**
```json
{ "deviceLat": 28.6783, "deviceLng": 77.4491 }
```

**Response `200`:**
```json
{
  "id": "uuid",
  "adminUnitId": "ward-uuid",
  "adminUnit": { "id": "uuid", "name": "Raj Nagar", "type": "WARD" }
}
```

> **Frontend note:** Show a ward selection dropdown (populated from `GET /api/admin-units?type=WARD`) **or** use device GPS to auto-detect. Prompt citizen to set their ward after first login if `adminUnitId` is null.

---

### `GET /api/users`
List users in an admin unit. Staff/admin only.

**Auth:** Required (`ADMIN`, `OFFICER`)

**Query Params:**
| Param | Type | Description |
|---|---|---|
| `adminUnitId` | string | Filter by ward/city UUID |
| `role` | string | `OFFICER` \| `INSPECTOR` \| `CONTRACTOR` \| `ADMIN` |

**Response `200`:** Array of user objects (no passwords).

---

### `POST /api/users/create-user`
Create a new staff user (officer, inspector, etc.) in the admin's own ward.

**Auth:** Required (`ADMIN`)

**Request Body:**
```json
{
  "name": "Sunita Verma",
  "email": "sunita@gmc.local",
  "password": "Officer@123!",
  "role": "OFFICER"
}
```

**Response `201`:** Created user object.

---

### `POST /api/users/contractor`
Create a new contractor account.

**Auth:** Required (`ADMIN`, `OFFICER`)

**Request Body:**
```json
{
  "name": "Bharat Nirman Pvt. Ltd.",
  "email": "bharatnirman@contractor.local",
  "password": "Cont@123!"
}
```

**Response `201`:** Created contractor object.

---

## 4. Admin Units (Wards)

---

### `GET /api/admin-units`
List all admin units, optionally filtered by type or parent.

**Auth:** None

**Query Params:**
| Param | Type | Description |
|---|---|---|
| `type` | string | `GLOBAL` \| `CITY` \| `WARD` |
| `parentId` | string | UUID of parent admin unit |

**Response `200`:**
```json
[
  {
    "id": "uuid",
    "name": "Raj Nagar",
    "type": "WARD",
    "parentId": "city-uuid",
    "centerLat": 28.6786,
    "centerLng": 77.4487
  }
]
```

> **Frontend note:** Use `?type=WARD` to populate the ward selector dropdown. Use `?type=CITY` to get the city. Use `?parentId=<cityId>` to get all wards under Ghaziabad.

---

### `GET /api/admin-units/nearest-ward`
Find the nearest ward to a GPS coordinate.

**Auth:** None

**Query Params:** `lat` (float), `lng` (float)

**Example:** `GET /api/admin-units/nearest-ward?lat=28.6783&lng=77.4491`

**Response `200`:**
```json
{
  "wardId": "uuid",
  "wardName": "Raj Nagar",
  "distanceMetres": 42.3
}
```

---

### `POST /api/admin-units/location-from-photo`
Extract GPS + ward from a photo file. Use this to pre-fill coordinates on the issue creation form.

**Auth:** None  
**Content-Type:** `multipart/form-data`

**Form Fields:**
| Field | Type | Description |
|---|---|---|
| `photo` | file | Any JPEG/PNG with EXIF GPS |

**Response `200`:**
```json
{
  "latitude": 28.6783,
  "longitude": 77.4491,
  "takenAt": "2026-03-07T10:00:00.000Z",
  "wardId": "uuid",
  "wardName": "Raj Nagar",
  "distanceMetres": 42.3
}
```

**Error `400`:**
```json
{ "code": "NO_GPS", "message": "Photo does not contain GPS EXIF data" }
```

> **Frontend note:** When citizen picks a photo in the issue form, optionally call this endpoint first to extract the location. If it succeeds, use the returned coordinates. If it fails (no GPS), fall back to device GPS from `navigator.geolocation`.

---

### `POST /api/admin-units`
Create a new admin unit.

**Auth:** Required (`ADMIN`)

**Request Body:**
```json
{
  "name": "New Ward",
  "type": "WARD",
  "parentId": "city-uuid",
  "centerLat": 28.67,
  "centerLng": 77.45
}
```

**Response `201`:** Created admin unit object.

---

### `GET /api/admin-units/:id/children`
Get all direct children of an admin unit.

**Auth:** None

**Response `200`:** Array of child admin unit objects.

---

## 5. Issues — CRUD & Lifecycle

---

### `POST /api/issues`
Create a new issue. The ward is auto-detected from GPS; department is auto-classified from the title.

**Auth:** Required  
**Content-Type:** `multipart/form-data`

**Form Fields:**
| Field | Type | Required | Description |
|---|---|---|---|
| `title` | string | ✅ | Short description of the problem |
| `description` | string | — | Longer details |
| `photo` | file | — | Citizen's photo (JPEG/PNG). GPS extracted from EXIF if present |
| `deviceLat` | float (string) | — | Device GPS latitude (fallback if photo has no EXIF) |
| `deviceLng` | float (string) | — | Device GPS longitude |
| `projectId` | string | — | Attach directly to an existing project |

> **At least one of** `photo` (with EXIF GPS) or `deviceLat`+`deviceLng` must be provided. If both are present, photo EXIF is used for ward detection; device GPS is used only if EXIF is missing.

**Response `201`:**
```json
{
  "id": "issue-uuid",
  "title": "Large pothole on Road No. 4",
  "description": "...",
  "status": "OPEN",
  "department": "MUNICIPAL",
  "latitude": 28.6783,
  "longitude": 77.4491,
  "wardId": "ward-uuid",
  "ward": { "id": "uuid", "name": "Raj Nagar" },
  "createdById": "user-uuid",
  "slaDeadline": "2026-03-09T10:00:00.000Z",
  "progressScore": 5,
  "classification": {
    "department": "MUNICIPAL",
    "confidence": "HIGH",
    "autoClassified": true
  },
  "citizenPhoto": {
    "id": "evidence-uuid",
    "url": "https://res.cloudinary.com/...",
    "type": "CITIZEN"
  },
  "nearbyDuplicates": [],
  "photoDeviceLocationWarning": null
}
```

> **`nearbyDuplicates`** — array of existing issues within 100m. Show a warning: *"Similar issues already reported nearby"* with links.
>
> **`photoDeviceLocationWarning`** — string or null. Show as a non-blocking warning toast if present.

---

### `GET /api/issues`
List all issues with optional filters.

**Auth:** None

**Query Params:**
| Param | Type | Description |
|---|---|---|
| `wardId` | string | Filter by ward UUID |
| `status` | string | Filter by status (e.g. `OPEN`, `VERIFIED`) |
| `assignedTo` | string | Filter by assigned officer UUID |
| `createdById` | string | Filter by creator UUID |
| `projectId` | string | Filter by project UUID |

**Response `200`:** Array of issue objects (same shape as create response, minus `classification`).

---

### `GET /api/issues/mine`
Get the logged-in citizen's own issues.

**Auth:** Required

**Query Params:** `status` (optional filter)

**Response `200`:** Array of issue objects.

> **Frontend note:** Use for the citizen's *"My Complaints"* tab.

---

### `GET /api/issues/my-ward`
Get all issues in the logged-in user's ward (transparency feed).

**Auth:** Required (user must have `adminUnitId` set)

**Query Params:** `status` (optional filter)

**Response `200`:** Array of issue objects.

> **Frontend note:** Use for the public ward dashboard showing all ward activity.

---

### `GET /api/issues/:id`
Get full details of a single issue including structured photos.

**Auth:** None

**Response `200`:**
```json
{
  "id": "issue-uuid",
  "title": "...",
  "status": "UNDER_REVIEW",
  "department": "MUNICIPAL",
  "progressScore": 85,
  "latitude": 28.6783,
  "longitude": 77.4491,
  "ward": { "id": "uuid", "name": "Raj Nagar" },
  "createdBy": { "id": "uuid", "name": "Mohit Agarwal" },
  "assignedTo": { "id": "uuid", "name": "Sunita Verma" },
  "inspector": { "id": "uuid", "name": "Suresh Dubey" },
  "contractor": { "id": "uuid", "name": "Bharat Nirman Pvt. Ltd." },
  "photos": {
    "citizen": { "id": "uuid", "url": "https://...", "type": "CITIZEN" },
    "before":  { "id": "uuid", "url": "https://...", "type": "BEFORE", "fraudFlag": false },
    "after":   { "id": "uuid", "url": "https://...", "type": "AFTER",  "fraudFlag": false }
  },
  "verification": null,
  "slaDeadline": "2026-03-09T10:00:00.000Z",
  "duplicateOfId": null,
  "project": null,
  "createdAt": "2026-03-07T10:00:00.000Z",
  "updatedAt": "2026-03-07T10:00:00.000Z"
}
```

> **`progressScore`** — 0–100. Use for a progress bar on the issue detail screen.
> **`photos`** — structured object (never an array). Each can be `null` if not yet uploaded.

---

### `GET /api/issues/:id/timeline`
Get the full audit log for an issue (all status changes, assignments, etc.).

**Auth:** None

**Response `200`:**
```json
[
  {
    "id": "uuid",
    "action": "ISSUE_CREATED",
    "actor": { "id": "uuid", "name": "Mohit Agarwal" },
    "metadata": { "status": "OPEN" },
    "createdAt": "2026-03-07T10:00:00.000Z"
  },
  {
    "id": "uuid",
    "action": "ISSUE_ACCEPTED",
    "actor": { "id": "uuid", "name": "Sunita Verma" },
    "metadata": { "status": "ACCEPTED" },
    "createdAt": "2026-03-07T11:30:00.000Z"
  }
]
```

> **Frontend note:** Render as a vertical timeline component on the issue detail page.

---

### `PATCH /api/issues/:id/accept`
Accept an issue (move OPEN → ACCEPTED, auto-assigns inspector).

**Auth:** Required (`OFFICER`, `ADMIN`)

**Response `200`:** Updated issue object with status `ACCEPTED`.

> Auto-assigns the least-busy inspector in the ward. The inspector is notified automatically.

---

### `PATCH /api/issues/:id/reject`
Reject an issue (move OPEN → REJECTED).

**Auth:** Required (`OFFICER`, `ADMIN`)

**Request Body:**
```json
{ "reason": "Duplicate of issue #xyz" }
```

**Response `200`:** Updated issue object with status `REJECTED`.

---

### `POST /api/issues/:id/assign`
Assign an issue to a specific officer.

**Auth:** Required (`OFFICER`, `ADMIN`)

**Request Body:**
```json
{
  "assignedToId": "officer-uuid",
  "slaHours": 72
}
```

**Response `200`:** Updated issue object.

---

### `POST /api/issues/:id/assign-inspector`
Assign a specific inspector to the issue.

**Auth:** Required (`OFFICER`, `ADMIN`)

**Request Body:**
```json
{ "inspectorId": "inspector-uuid" }
```

**Response `200`:** Updated issue object with `inspectorId` set.

---

### `POST /api/issues/:id/hire-contractor`
Assign a contractor to the issue.

**Auth:** Required (`OFFICER`, `ADMIN`)

**Request Body:**
```json
{ "contractorId": "contractor-uuid" }
```

**Response `200`:** Updated issue object with `contractorId` set and status → `CONTRACTOR_ASSIGNED`.

---

### `PATCH /api/issues/:id/work-done`
Contractor marks their work as complete.

**Auth:** Required (`CONTRACTOR`)

**Response `200`:** Updated issue with status → `WORK_DONE`.

> After this, the assigned inspector receives a notification to submit the AFTER photo.

---

### `POST /api/issues/:id/toggle-duplicate`
Link or unlink an issue as a duplicate of another.

**Auth:** Required (`OFFICER`, `ADMIN`)

**Request Body:**
```json
{ "duplicateOfId": "parent-issue-uuid" }
```
> Pass `null` to unlink.

**Response `200`:** Updated issue object.

---

### `POST /api/issues/:id/convert`
Convert a standalone issue into a project.

**Auth:** Required (`OFFICER`, `ADMIN`)

**Request Body:**
```json
{
  "title": "Raj Nagar Road Repair Project",
  "description": "Comprehensive road resurfacing for Road No. 4",
  "budget": 2500000
}
```

**Response `201`:** The newly created project object.

---

## 6. Evidence (Photos)

---

### `POST /api/issues/:id/evidence`
Upload a BEFORE or AFTER photo for an issue.

**Auth:** Required (`INSPECTOR`, `OFFICER`, `ADMIN`)  
**Content-Type:** `multipart/form-data`

**Query or Body Params:**
| Field | Type | Required | Description |
|---|---|---|---|
| `type` | string | ✅ | `BEFORE` or `AFTER` |
| `file` | file | ✅ | Photo (JPEG/PNG, max 20MB) |
| `deviceLat` | float | — | Device GPS latitude |
| `deviceLng` | float | — | Device GPS longitude |

> `type` can be sent as a **query parameter** (`?type=BEFORE`) or in the form body.

**Response `201`:**
```json
{
  "evidence": {
    "id": "evidence-uuid",
    "issueId": "issue-uuid",
    "type": "BEFORE",
    "url": "https://res.cloudinary.com/...",
    "fileHash": "sha256hex",
    "latitude": 28.6783,
    "longitude": 77.4491,
    "takenAt": "2026-03-07T10:00:00.000Z",
    "fraudFlag": false,
    "fraudReason": null,
    "pHash": "a1b2c3d4e5f60718",
    "createdAt": "2026-03-07T10:05:00.000Z"
  },
  "geoWarning": null,
  "geoFallback": false
}
```

**Response `200` (with geo warning):**
```json
{
  "evidence": { "...": "..." },
  "geoWarning": "Photo location (28.6783, 77.4491) is 65m from the issue location. Flagged.",
  "geoFallback": false
}
```

**Common errors:**
| Code | HTTP | Meaning |
|---|---|---|
| `PHOTO_TOO_OLD` | 400 | Photo EXIF timestamp is > 6 hours old |
| `LOCATION_MISMATCH` | 400 | Device GPS differs from photo EXIF GPS by > 500m |
| `INVALID_STATUS` | 400 | Issue is not in the correct status for this evidence type |
| `FORBIDDEN` | 403 | Inspector is not assigned to this issue |

> **Rules:**
> - `BEFORE` photo: issue must be `INSPECTING`, uploader must be the assigned inspector.
> - `AFTER` photo: issue must be `WORK_DONE`, uploader must be the assigned inspector. Triggers fraud check + auto-transitions to `UNDER_REVIEW`.

---

### `GET /api/issues/:id/evidence`
List all evidence for an issue.

**Auth:** None

**Response `200`:**
```json
[
  {
    "id": "uuid",
    "type": "CITIZEN",
    "url": "https://res.cloudinary.com/...",
    "fileHash": "sha256hex",
    "latitude": 28.6783,
    "longitude": 77.4491,
    "takenAt": "2026-03-07T09:55:00.000Z",
    "fraudFlag": false,
    "fraudReason": null,
    "uploader": { "id": "uuid", "name": "Mohit Agarwal" }
  }
]
```

---

## 7. Verification

---

### `POST /api/issues/:id/verify`
Officer/Admin verifies or rejects the resolved issue. Issue must be `UNDER_REVIEW`.

**Auth:** Required (`OFFICER`, `ADMIN`)

**Request Body:**
```json
{
  "verdict": "APPROVED",
  "remarks": "Work quality satisfactory. Road smooth."
}
```
> `verdict` must be `"APPROVED"` or `"REJECTED"`.  
> `remarks` is required for REJECTED. Required for APPROVED only if BEFORE+AFTER photos are missing (override case).

**Response `201` (APPROVED):**
```json
{
  "verification": {
    "id": "uuid",
    "issueId": "issue-uuid",
    "verifiedById": "officer-uuid",
    "verdict": "APPROVED",
    "remarks": "Work quality satisfactory.",
    "createdAt": "2026-03-07T14:00:00.000Z"
  },
  "issue": {
    "id": "issue-uuid",
    "status": "VERIFIED",
    "progressScore": 100
  }
}
```

> APPROVED → issue status becomes `VERIFIED`.  
> REJECTED → issue status becomes `IN_PROGRESS` (sent back for re-work).

---

## 8. Proof & QR Code

---

### `GET /api/issues/:id/proof`
Get the full cryptographic proof bundle for an issue.

**Auth:** None (public)

**Response `200`:**
```json
{
  "issueId": "uuid",
  "title": "Large pothole on Road No. 4",
  "status": "VERIFIED",
  "ward": "Raj Nagar",
  "createdAt": "2026-03-07T10:00:00.000Z",
  "evidence": [
    {
      "id": "uuid",
      "type": "BEFORE",
      "url": "https://...",
      "fileHash": "sha256hex",
      "latitude": 28.6783,
      "longitude": 77.4491,
      "takenAt": "2026-03-07T10:05:00.000Z",
      "geoWarning": null
    },
    {
      "id": "uuid",
      "type": "AFTER",
      "url": "https://...",
      "fileHash": "sha256hex",
      "takenAt": "2026-03-07T13:00:00.000Z"
    }
  ],
  "merkleRoot": "abc123...",
  "verification": {
    "verdict": "APPROVED",
    "verifiedBy": "Sunita Verma",
    "remarks": "Work quality satisfactory."
  }
}
```

---

### `GET /api/issues/:id/qr`
Generate a QR code linking to the public proof URL.

**Auth:** None (public)

**Response `200`:**
```json
{
  "issueId": "uuid",
  "proofUrl": "https://yourapp.com/api/issues/uuid/proof",
  "qrDataUrl": "data:image/png;base64,iVBORw0KGgo..."
}
```

> **Frontend note:** Render `qrDataUrl` as an `<img>` tag. Can be printed on site boards for physical verification.

---

## 9. Projects

---

### `POST /api/projects`
Create a new infrastructure project.

**Auth:** Required (`ADMIN`)

**Request Body:**
```json
{
  "title": "Raj Nagar Road Re-carpeting Phase-I",
  "description": "...",
  "budget": 35000000,
  "adminUnitId": "ward-or-city-uuid"
}
```

**Response `201`:** Created project object.

---

### `GET /api/projects`
List all projects.

**Auth:** None

**Query Params:**
| Param | Type | Description |
|---|---|---|
| `adminUnitId` | string | Filter by ward/city UUID |
| `status` | string | `PROPOSED` \| `ACTIVE` \| `COMPLETED` \| `CANCELLED` |

**Response `200`:** Array of project objects.

---

### `GET /api/projects/my-ward`
Get all projects in the logged-in user's ward.

**Auth:** Required (user must have `adminUnitId` set)

**Response `200`:** Array of project objects.

---

### `GET /api/projects/:id`
Get full project details.

**Auth:** None

**Response `200`:**
```json
{
  "id": "uuid",
  "title": "Raj Nagar Road Re-carpeting Phase-I",
  "description": "...",
  "budget": 35000000,
  "status": "ACTIVE",
  "adminUnitId": "uuid",
  "adminUnit": { "id": "uuid", "name": "Ghaziabad", "type": "CITY" },
  "createdBy": { "id": "uuid", "name": "Rajiv Sharma" },
  "issues": [ "...array of issues linked to this project..." ],
  "createdAt": "2026-03-07T10:00:00.000Z"
}
```

---

### `POST /api/projects/:id/approve`
Approve a project (move PROPOSED → ACTIVE).

**Auth:** Required (`ADMIN`)

**Response `200`:** Updated project object with status `ACTIVE`.

---

### `GET /api/projects/:id/timeline`
Get the audit log for a project.

**Auth:** None

**Response `200`:** Array of audit log entries (same shape as issue timeline).

---

### `POST /api/projects/:projectId/issues`
Create an issue directly under a project.

**Auth:** Required  
**Content-Type:** `multipart/form-data`

Same form fields as `POST /api/issues`. The `projectId` is automatically set from the URL.

**Response `201`:** Issue object with `projectId` set.

---

### `GET /api/projects/:projectId/issues`
List all issues under a project.

**Auth:** None

**Query Params:** Same filters as `GET /api/issues`.

**Response `200`:** Array of issue objects.

---

## 10. Notifications

---

### `GET /api/notify/me`
Get the logged-in user's in-app notifications (latest 50).

**Auth:** Required

**Response `200`:**
```json
{
  "notifications": [
    {
      "id": "uuid",
      "title": "Issue Accepted ✅",
      "body": "Your issue 'Large pothole on Road No. 4' has been accepted.",
      "read": false,
      "createdAt": "2026-03-07T11:30:00.000Z",
      "issue": { "id": "uuid", "title": "Large pothole on Road No. 4", "status": "ACCEPTED" },
      "project": null
    }
  ],
  "unreadCount": 3
}
```

> **Frontend note:** Poll this endpoint every 30 seconds **or** implement a notification bell that fetches on click. Show `unreadCount` as a badge.

---

### `PATCH /api/notify/:id/read`
Mark a single notification as read.

**Auth:** Required

**Response `200`:** `{ "ok": true }`

---

### `PATCH /api/notify/read-all`
Mark all of the current user's notifications as read.

**Auth:** Required

**Response `200`:** `{ "ok": true }`

---

### `GET /api/notify/issue/:id`
Notify nearby residents about an issue (radius-based SMS/system notification).

**Auth:** Required (`ADMIN`, `OFFICER`)

**Query Params:** `radius` (integer, metres, default: 50)

**Response `200`:**
```json
{
  "notified": 12,
  "message": "12 residents within 50m notified."
}
```

---

## 11. Residents

---

### `POST /api/residents/import`
Import residents from a CSV file. Phone numbers are hashed on import.

**Auth:** Required (`ADMIN`)  
**Content-Type:** `multipart/form-data`

**CSV Format:**
```
name,phone,latitude,longitude
Aarav Sharma,+919876501001,28.6782,77.4490
```

**Form Fields:**
| Field | Type | Description |
|---|---|---|
| `file` | CSV file | Residents CSV |

**Response `200`:**
```json
{ "imported": 30, "skipped": 0 }
```

---

## 12. Metrics / Dashboard

---

### `GET /api/metrics`
Get platform-wide KPI statistics.

**Auth:** None

**Response `200`:**
```json
{
  "total_issues": 120,
  "verified_issues": 45,
  "verified_percent": 37.5,
  "avg_resolution_time_hours": 31.4,
  "sla_compliance_percent": 82.2,
  "proof_coverage_count": 38,
  "proof_coverage_percent": 31.67
}
```

> **Frontend note:** Use for the admin dashboard summary cards.

---

## 13. Health Check

---

### `GET /health`
Check if the server and database are up.

**Auth:** None

**Response `200`:**
```json
{ "ok": true, "db": true, "timestamp": "2026-03-07T10:00:00.000Z" }
```

**Response `503`:**
```json
{ "ok": false, "db": false }
```

---

## 14. Error Format

All API errors follow a consistent format:

```json
{
  "code": "INVALID_STATUS",
  "message": "Issue must be in INSPECTING status for a BEFORE photo",
  "statusCode": 400
}
```

Common codes:
| Code | HTTP | Description |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid JWT |
| `FORBIDDEN` | 403 | Authenticated but insufficient role |
| `NOT_FOUND` | 404 | Resource does not exist |
| `INVALID_STATUS` | 400 | Wrong issue status for this action |
| `PHOTO_TOO_OLD` | 400 | EXIF timestamp > 6 hours |
| `LOCATION_MISMATCH` | 400 | Device GPS vs photo EXIF > 500m |
| `LOCATION_REQUIRED` | 400 | No GPS available at all |
| `NO_GPS` | 400 | Photo has no EXIF GPS data |
| `ALREADY_VERIFIED` | 409 | Issue already has a verification record |
| `MISSING_EVIDENCE` | 400 | BEFORE or AFTER photo missing for approval |
| `DUPLICATE_EMAIL` | 400 | Email already registered |

---

## 15. Status & Role Reference

### Issue Statuses

| Status | Progress | Description |
|---|---|---|
| `OPEN` | 5% | Freshly reported, awaiting officer review |
| `ACCEPTED` | 15% | Officer accepted, inspector being assigned |
| `REJECTED` | 0% | Officer rejected the complaint |
| `ASSIGNED` | 25% | Assigned to officer |
| `INSPECTING` | 40% | Inspector on-site, BEFORE photo expected |
| `CONTRACTOR_ASSIGNED` | 55% | Contractor hired, work starting |
| `WORK_DONE` | 70% | Contractor marked work done, AFTER photo expected |
| `UNDER_REVIEW` | 85% | AFTER photo submitted, awaiting officer verification |
| `IN_PROGRESS` | 60% | Sent back for re-work after rejected verification |
| `COMPLETED` | 95% | Work completed (alternate terminal state) |
| `VERIFIED` | 100% | Officially verified and closed ✅ |

### Roles

| Role | Can Create Issues | Can Accept/Reject | Can Upload BEFORE/AFTER | Can Verify | Can Create Projects |
|---|---|---|---|---|---|
| `CITIZEN` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `OFFICER` | ✅ | ✅ | ❌ | ✅ | ❌ |
| `INSPECTOR` | ✅ | ❌ | ✅ (own issues only) | ❌ | ❌ |
| `CONTRACTOR` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ADMIN` | ✅ | ✅ | ❌ | ✅ | ✅ |

---

## 16. Complete Screen-by-Screen Guide

---

### 🖥️ Public / Citizen Screens

#### Landing / Map Screen
```
GET /api/issues?wardId=<uuid>&status=OPEN        → plot open issues on map
GET /api/admin-units?type=WARD                   → populate ward filter dropdown
GET /api/metrics                                 → show summary cards (total, verified%)
```

#### Issue Detail Screen
```
GET /api/issues/:id                              → issue data, photos, status, progress score
GET /api/issues/:id/timeline                     → audit trail / timeline
GET /api/issues/:id/proof                        → proof bundle
GET /api/issues/:id/qr                           → QR code image (for print/share)
GET /api/issues/:id/evidence                     → all 3 photos
```

#### Report Issue Screen (Citizen)
```
1. POST /api/admin-units/location-from-photo     → extract GPS from photo (optional pre-fill)
   OR use navigator.geolocation for deviceLat/deviceLng

2. POST /api/issues   (multipart/form-data)
   fields: title, description, photo (file), deviceLat, deviceLng

3. On response:
   - Show issue.id, issue.status = "OPEN"
   - Show citizenPhoto.url if present
   - Warn if nearbyDuplicates.length > 0
   - Warn if photoDeviceLocationWarning is set
```

#### My Complaints Screen (Citizen)
```
GET /api/issues/mine                             → citizen's own issues
GET /api/issues/mine?status=OPEN                 → filtered
```

#### Ward Transparency Feed (Citizen)
```
GET /api/issues/my-ward                          → all issues in citizen's ward
GET /api/projects/my-ward                        → all projects in ward
```

#### Notifications Bell
```
GET /api/notify/me                               → fetch on bell click, show unreadCount badge
PATCH /api/notify/:id/read                       → on tap individual notification
PATCH /api/notify/read-all                       → "mark all read" button
```

---

### 🖥️ Officer / Admin Screens

#### Officer Dashboard
```
GET /api/issues?wardId=<myWardId>&status=OPEN    → issues needing action
GET /api/metrics                                 → KPIs
GET /api/notify/me                               → notifications
```

#### Issue Management (Accept/Reject/Assign)
```
PATCH /api/issues/:id/accept                     → accept (auto-assigns inspector)
PATCH /api/issues/:id/reject  { reason }         → reject
POST  /api/issues/:id/assign-inspector { inspectorId }
POST  /api/issues/:id/hire-contractor  { contractorId }
POST  /api/issues/:id/toggle-duplicate { duplicateOfId }
```

#### Verification Screen
```
GET /api/issues?status=UNDER_REVIEW&wardId=...   → issues awaiting verification
GET /api/issues/:id                              → view photos (before/after)
POST /api/issues/:id/verify { verdict, remarks } → approve or send back
```

#### User Management
```
GET  /api/users?adminUnitId=<wardId>             → list ward staff
POST /api/users/create-user                      → add inspector/officer
POST /api/users/contractor                       → add contractor
```

#### Project Management
```
GET  /api/projects?adminUnitId=<cityId>          → list projects
POST /api/projects                               → create project
POST /api/projects/:id/approve                   → approve
GET  /api/projects/:id/timeline                  → audit trail
POST /api/issues/:id/convert { title, budget }   → convert issue to project
```

#### Notify Residents
```
GET /api/notify/issue/:id?radius=100             → SMS/system notify nearby residents
```

---

### 🖥️ Inspector Screens

#### My Assigned Issues
```
GET /api/issues?wardId=<myWardId>&status=INSPECTING → issues to inspect
GET /api/issues?wardId=<myWardId>&status=WORK_DONE  → issues waiting for AFTER photo
```

#### Upload Evidence
```
// On-site: upload BEFORE photo
POST /api/issues/:id/evidence?type=BEFORE
  (multipart: file, deviceLat, deviceLng)

// After contractor done: upload AFTER photo  
POST /api/issues/:id/evidence?type=AFTER
  (multipart: file, deviceLat, deviceLng)
  → response includes fraudFlag if fraud detected
  → issue auto-transitions to UNDER_REVIEW on success
```

---

### 🖥️ Contractor Screens

#### My Work Queue
```
GET /api/issues?wardId=...&status=CONTRACTOR_ASSIGNED
```

#### Mark Work Done
```
PATCH /api/issues/:id/work-done
```

---

## Token & Auth Notes

- Store the JWT token securely (localStorage for web, SecureStorage for mobile).
- Attach on every request: `Authorization: Bearer <your_token>`.
- Token expires in **7 days**. When you get `401 UNAUTHORIZED`, the token has expired — redirect to login.
- The `role` field in the user object controls what UI elements to show (accept/reject buttons, upload evidence button, etc.).
- For staff users, `adminUnitId` is set to their ward UUID. For citizens, it may be `null` until they set it.

## Demo Credentials (Seeded)

| Role | Email | Password |
|---|---|---|
| City Admin | `admin@gmc.local` | `Admin@Ghz2025!` |
| Ward Admin (Raj Nagar) | `admin.rajnagar@gmc.local` | `WAdmin@123!` |
| Ward Admin (Indirapuram) | `admin.indirapuram@gmc.local` | `WAdmin@123!` |
| Ward Admin (Vaishali) | `admin.vaishali@gmc.local` | `WAdmin@123!` |
| Officer (Raj Nagar) | `officer.rajnagar@gmc.local` | `Officer@123!` |
| Officer (Indirapuram) | `officer.indirapuram@gmc.local` | `Officer@123!` |
| Inspector (North) | `insp.north@gmc.local` | `Insp@123!` |
| Inspector (South) | `insp.south@gmc.local` | `Insp@123!` |
| Contractor (Bharat Nirman) | `bharatnirman@contractor.local` | `Cont@123!` |
| Citizen | `mohit.agarwal@gmail.com` | `Mohit@123!` |
| Citizen | `ritu.saxena@gmail.com` | `Ritu@123!` |
