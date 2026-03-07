# WitnessLedger Backend

**Ward-scoped public-works transparency engine** — a Node.js + Express + Prisma backend for civic issue tracking with tamper-evident proof, geotagged evidence, SLA enforcement, and inspector verification.

---

## Tech Stack

- **Runtime**: Node.js ≥ 18, TypeScript
- **Framework**: Express 5
- **ORM**: Prisma (PostgreSQL 15+)
- **Auth**: bcrypt + JWT
- **File Handling**: Multer (memory storage → disk)
- **Hashing**: SHA-256 (crypto), Merkle trees
- **EXIF**: exifr
- **Testing**: Jest + Supertest
- **Logging**: Winston
- **QR Codes**: qrcode

---

## Setup

### 1. Prerequisites

- **Node.js** ≥ 18
- **PostgreSQL** ≥ 15 running locally or remotely

### 2. Clone & Install

```bash
cd witnessledger-backend
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set your `DATABASE_URL`:

```
DATABASE_URL=postgresql://user:pass@localhost:5432/witnessledger_dev
JWT_SECRET=change_me_in_production
```

### 4. Create Database

```bash
createdb witnessledger_dev
# Or via psql:
# psql -c "CREATE DATABASE witnessledger_dev;"
```

### 5. Run Migrations

```bash
npx prisma migrate dev --name init
```

This generates the Prisma client and applies the schema.

### 6. Seed the Database

```bash
npx prisma db seed
# or
npm run seed
```

The seed script creates:

- **Admin Units**: India (GLOBAL) → Lucknow (CITY) → Ward 12/13/14 (WARD)
- **Users**: Admin, Inspector, City Officer, Ward Officers (12/13/14)
- **Issues**: 2 sample issues (Ward 12 & Ward 13)
- **Project**: 1 active drainage project
- **Residents**: 10 from CSV

Credentials printed to console:

| Role      | Email                  | Password          |
| --------- | ---------------------- | ----------------- |
| ADMIN     | admin@demo.local       | AdminPass123!     |
| OFFICER   | cityofficer@demo.local | OfficerPass123!   |
| INSPECTOR | inspector@demo.local   | InspectorPass123! |
| OFFICER   | officer12@demo.local   | OfficerPass123!   |
| OFFICER   | officer13@demo.local   | OfficerPass123!   |
| OFFICER   | officer14@demo.local   | OfficerPass123!   |

### 7. Run the Server

```bash
npm run dev    # Development (hot reload via tsx)
npm start      # Production
```

Server starts at `http://localhost:4000`.

### 8. Verify

```bash
curl http://localhost:4000/health
# → {"ok":true,"db":true,"timestamp":"..."}
```

---

## Running Tests

```bash
# All tests (requires test DB)
npm test

# Unit tests only (no DB needed)
npm run test:unit

# Integration tests only
npm run test:integration
```

> **Test DB**: Set `DATABASE_URL` to a separate test database to avoid clobbering dev data.
> The integration test creates and cleans up its own data.

---

## API Reference

### Auth

| Method | Endpoint             | Auth | Body                                  |
| ------ | -------------------- | ---- | ------------------------------------- |
| POST   | `/api/auth/register` | No   | `{name, email?, password, wardId?}`   |
| POST   | `/api/auth/login`    | No   | `{email, password}` → `{token, user}` |

### Admin Units

| Method | Endpoint                        | Auth  | Notes                    |
| ------ | ------------------------------- | ----- | ------------------------ |
| GET    | `/api/admin-units`              | No    | List all (filter: ?type) |
| POST   | `/api/admin-units`              | ADMIN | Create city/ward         |
| GET    | `/api/admin-units/:id/children` | No    | Get child units          |

### Users

| Method | Endpoint        | Auth  | Notes                          |
| ------ | --------------- | ----- | ------------------------------ |
| POST   | `/api/users`    | ADMIN | Create officer/inspector/admin |
| GET    | `/api/users/me` | Auth  | Current user profile           |

### Projects

| Method | Endpoint                     | Auth  | Notes                              |
| ------ | ---------------------------- | ----- | ---------------------------------- |
| POST   | `/api/projects`              | ADMIN | Create project                     |
| GET    | `/api/projects`              | No    | List (filter: adminUnitId, status) |
| GET    | `/api/projects/:id`          | No    | Project details                    |
| POST   | `/api/projects/:id/approve`  | ADMIN | Approve PROPOSED → ACTIVE          |
| GET    | `/api/projects/:id/timeline` | No    | Audit log entries                  |

### Issues

| Method | Endpoint                           | Auth           | Notes                                     |
| ------ | ---------------------------------- | -------------- | ----------------------------------------- |
| POST   | `/api/issues`                      | Auth           | Create issue (auto-assigns)               |
| GET    | `/api/issues`                      | No             | List (filter: wardId, status, assignedTo) |
| GET    | `/api/issues/:id`                  | No             | Issue details + evidence                  |
| POST   | `/api/issues/:id/assign`           | OFFICER, ADMIN | Assign/reassign                           |
| POST   | `/api/issues/:id/convert`          | OFFICER        | Convert to project (atomic)               |
| POST   | `/api/issues/:id/toggle-duplicate` | OFFICER, ADMIN | Mark/unmark duplicate                     |
| GET    | `/api/issues/:id/timeline`         | No             | Audit log entries                         |

### Evidence

| Method | Endpoint                   | Auth | Notes                                          |
| ------ | -------------------------- | ---- | ---------------------------------------------- |
| POST   | `/api/issues/:id/evidence` | Auth | Multipart file + `?type=BEFORE/AFTER/DOCUMENT` |
| GET    | `/api/issues/:id/evidence` | No   | List evidence for issue                        |

### Verification

| Method | Endpoint                 | Auth      | Body                                         |
| ------ | ------------------------ | --------- | -------------------------------------------- |
| POST   | `/api/issues/:id/verify` | INSPECTOR | `{verdict: "APPROVED"/"REJECTED", remarks?}` |

### Proof & QR

| Method | Endpoint                | Auth | Notes                        |
| ------ | ----------------------- | ---- | ---------------------------- |
| GET    | `/api/issues/:id/proof` | No   | Public proof bundle + merkle |
| GET    | `/api/issues/:id/qr`    | No   | QR code data URL             |

### Residents & Notifications

| Method | Endpoint                | Auth           | Notes                   |
| ------ | ----------------------- | -------------- | ----------------------- |
| POST   | `/api/residents/import` | ADMIN          | Upload CSV (multipart)  |
| GET    | `/api/notify/issue/:id` | ADMIN, OFFICER | Notify nearby residents |

### Metrics & Health

| Method | Endpoint       | Auth | Notes                      |
| ------ | -------------- | ---- | -------------------------- |
| GET    | `/api/metrics` | No   | KPIs (verified%, SLA, etc) |
| GET    | `/health`      | No   | `{ok, db, timestamp}`      |

---

## Demo cURL Workflow

```bash
BASE=http://localhost:4000

# 1. Login as admin
TOKEN=$(curl -s -X POST $BASE/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.local","password":"AdminPass123!"}' \
  | jq -r '.token')
echo "Admin token: $TOKEN"

# 2. Get admin units (find ward IDs)
curl -s $BASE/api/admin-units | jq .

# 3. Register a citizen
CIT=$(curl -s -X POST $BASE/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Demo Citizen","email":"citizen@demo.local","password":"CitizenPass123!"}' \
  | jq -r '.token')
echo "Citizen token: $CIT"

# 4. Create an issue (as citizen) — replace WARD_ID with actual Ward 12 ID
WARD_ID=$(curl -s $BASE/api/admin-units | jq -r '.[] | select(.name=="Ward 12") | .id')
ISSUE=$(curl -s -X POST $BASE/api/issues \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $CIT" \
  -d "{\"title\":\"Broken pipe on Kanpur Road\",\"description\":\"Water leaking from main pipe\",\"latitude\":26.8467,\"longitude\":80.9462,\"wardId\":\"$WARD_ID\"}")
ISSUE_ID=$(echo $ISSUE | jq -r '.id')
echo "Issue ID: $ISSUE_ID"

# 5. Upload BEFORE evidence (as citizen)
curl -s -X POST "$BASE/api/issues/$ISSUE_ID/evidence?type=BEFORE" \
  -H "Authorization: Bearer $CIT" \
  -F "file=@/path/to/before-photo.jpg" | jq .

# 6. Login as officer
OFF_TOKEN=$(curl -s -X POST $BASE/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"officer12@demo.local","password":"OfficerPass123!"}' \
  | jq -r '.token')

# 7. Assign issue (re-assign with custom SLA)
OFFICER_ID=$(curl -s $BASE/api/users/me -H "Authorization: Bearer $OFF_TOKEN" | jq -r '.id')
curl -s -X POST "$BASE/api/issues/$ISSUE_ID/assign" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OFF_TOKEN" \
  -d "{\"assignedToId\":\"$OFFICER_ID\",\"slaHours\":24}" | jq .

# 8. Upload AFTER evidence (as officer)
curl -s -X POST "$BASE/api/issues/$ISSUE_ID/evidence?type=AFTER" \
  -H "Authorization: Bearer $OFF_TOKEN" \
  -F "file=@/path/to/after-photo.jpg" | jq .

# 9. Login as inspector & verify
INS_TOKEN=$(curl -s -X POST $BASE/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"inspector@demo.local","password":"InspectorPass123!"}' \
  | jq -r '.token')

curl -s -X POST "$BASE/api/issues/$ISSUE_ID/verify" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $INS_TOKEN" \
  -d '{"verdict":"APPROVED","remarks":"Work verified on-site"}' | jq .

# 10. Get public proof
curl -s "$BASE/api/issues/$ISSUE_ID/proof" | jq .

# 11. Get QR code
curl -s "$BASE/api/issues/$ISSUE_ID/qr" | jq .

# 12. View metrics
curl -s $BASE/api/metrics | jq .

# 13. View timeline
curl -s "$BASE/api/issues/$ISSUE_ID/timeline" | jq .
```

---

## Optional: PostGIS

For radius-based queries using database-level geometry:

```sql
-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geometry columns
ALTER TABLE "Issue" ADD COLUMN geom geometry(Point, 4326);
ALTER TABLE "Resident" ADD COLUMN geom geometry(Point, 4326);

-- Create spatial indices
CREATE INDEX idx_issue_geom ON "Issue" USING GIST (geom);
CREATE INDEX idx_resident_geom ON "Resident" USING GIST (geom);

-- Populate from existing lat/lon
UPDATE "Issue" SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326);
UPDATE "Resident" SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326);
```

Without PostGIS, the app uses in-memory haversine filtering.

## Optional: Twilio

Set these in `.env` to enable real SMS notifications:

```
TWILIO_SID=your_account_sid
TWILIO_TOKEN=your_auth_token
TWILIO_FROM=+1234567890
```

Without Twilio, notifications are simulated and logged.

---

## Architecture

```
src/
├── app.ts              # Express app setup & route mounting
├── server.ts           # HTTP server entry point
├── config/             # Environment configuration
├── prisma/             # Prisma client singleton
├── routes/             # Route definitions (10 modules)
├── controllers/        # Request handlers (11 modules)
├── services/           # Business logic (9 modules)
├── middleware/          # Auth, RBAC, validation, error
├── utils/              # Hash, Merkle, EXIF, geo, CSV
├── seed/               # Seed script & sample data
└── tests/              # Unit & integration tests
```

## License

ISC
