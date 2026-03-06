# WitnessLedger — API Documentation

**Base URL:** `https://<your-domain>/api`  
**Auth:** Pass `Authorization: Bearer <token>` for protected routes.

---

## Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | ❌ | Register a new user |
| POST | `/auth/login` | ❌ | Login and get token |

---

## Projects

### Create Project
**`POST /projects`** 🔒 `ADMIN`

```json
{
  "title": "Road Repair - Sector 5",
  "description": "Fix potholes on main road",
  "budget": 50000
}
```
> `adminUnitId` and `createdById` are auto-set from the logged-in user.

---

### List Projects
**`GET /projects`** ❌

Query params (all optional):
| Param | Type | Example |
|-------|------|---------|
| `adminUnitId` | string | `?adminUnitId=xxx` |
| `status` | enum | `?status=PROPOSED` |

**Status values:** `PROPOSED` `ACTIVE` `COMPLETED` `CANCELLED`

**Response:**
```json
[
  {
    "id": "cm1234...",
    "title": "Road Repair - Sector 5",
    "description": "Fix potholes on main road",
    "status": "PROPOSED",
    "budget": "50000",
    "adminUnit": { "id": "...", "name": "Ward 5", "type": "WARD" },
    "createdBy": { "id": "...", "name": "John Admin" },
    "_count": { "issues": 3 },
    "createdAt": "2026-03-06T10:00:00.000Z",
    "updatedAt": "2026-03-06T10:00:00.000Z"
  }
]
```

---

### Get Project by ID
**`GET /projects/:id`** ❌

**Response:**
```json
{
  "id": "cm1234...",
  "title": "Road Repair - Sector 5",
  "status": "PROPOSED",
  "adminUnit": { ... },
  "createdBy": { "id": "...", "name": "John Admin" },
  "issues": [
    { "id": "...", "title": "Broken light", "status": "OPEN" }
  ]
}
```

---

### Approve Project
**`POST /projects/:id/approve`** 🔒 `ADMIN`

No body required. Changes status from `PROPOSED` → `ACTIVE`.

---

### Get Project Timeline
**`GET /projects/:id/timeline`** ❌

Returns audit log for the project.

---

### List Issues in a Project
**`GET /projects/:projectId/issues`** ❌

Query params (all optional):
| Param | Type | Example |
|-------|------|---------|
| `status` | enum | `?status=OPEN` |
| `wardId` | string | `?wardId=xxx` |
| `assignedTo` | string | `?assignedTo=userId` |

---

### Create Issue inside a Project
**`POST /projects/:projectId/issues`** 🔒

```json
{
  "title": "Broken street light",
  "description": "Light on main road not working",
  "department": "ELECTRICITY",
  "latitude": 12.9716,
  "longitude": 77.5946,
  "wardId": "cm-ward-id-here"
}
```
> `projectId` is auto-set from the URL. `createdById` is auto-set from the token.

---

## Issues

### Create Issue (standalone)
**`POST /issues`** 🔒

```json
{
  "title": "Broken street light",
  "description": "Light on main road not working",
  "department": "ELECTRICITY",
  "latitude": 12.9716,
  "longitude": 77.5946,
  "wardId": "cm-ward-id-here",
  "projectId": "cm-project-id-here"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `title` | string | ✅ | |
| `department` | enum | ✅ | See values below |
| `latitude` | number | ✅ | |
| `longitude` | number | ✅ | |
| `wardId` | string | ✅ | Must be a WARD type AdminUnit |
| `description` | string | ❌ | |
| `projectId` | string | ❌ | Link to an existing project |

**Department values:** `MUNICIPAL` `ELECTRICITY` `WATER` `SANITATION` `HEALTH` `TRANSPORT`

---

### List Issues
**`GET /issues`** ❌

Query params (all optional):
| Param | Type | Example |
|-------|------|---------|
| `wardId` | string | `?wardId=xxx` |
| `status` | enum | `?status=OPEN` |
| `assignedTo` | string | `?assignedTo=userId` |
| `projectId` | string | `?projectId=xxx` |

**Status values:** `OPEN` `ACCEPTED` `REJECTED` `ASSIGNED` `IN_PROGRESS` `COMPLETED` `VERIFIED`

**Response:**
```json
[
  {
    "id": "cm5678...",
    "title": "Broken street light",
    "description": "...",
    "status": "OPEN",
    "department": "ELECTRICITY",
    "latitude": 12.9716,
    "longitude": 77.5946,
    "wardId": "...",
    "projectId": null,
    "ward": { "id": "...", "name": "Ward 5" },
    "createdBy": { "id": "...", "name": "Jane Citizen" },
    "assignedTo": null,
    "_count": { "evidence": 2 },
    "createdAt": "2026-03-06T10:00:00.000Z"
  }
]
```

---

### Get Issue by ID
**`GET /issues/:id`** ❌

Returns full issue details including evidence, verification, and timeline.

---

### Accept Issue
**`PATCH /issues/:id/accept`** 🔒 `OFFICER` `ADMIN`

No body required. Changes status `OPEN` → `ACCEPTED`.  
> Officer must belong to the same ward as the issue.

---

### Reject Issue
**`PATCH /issues/:id/reject`** 🔒 `OFFICER` `ADMIN`

```json
{
  "reason": "Not enough evidence provided"
}
```
Changes status `OPEN` → `REJECTED`.  
> Officer must belong to the same ward as the issue.

---

### Assign Issue
**`POST /issues/:id/assign`** 🔒 `OFFICER` `ADMIN`

```json
{
  "assignedToId": "cm-user-id",
  "slaHours": 48
}
```
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `assignedToId` | string | ✅ | User ID of the assignee |
| `slaHours` | number | ❌ | Defaults to server config |

---

### Convert Issue to Project
**`POST /issues/:id/convert`** 🔒 `OFFICER` `ADMIN`# WitnessLedger — API Documentation

**Base URL:** `https://<your-domain>/api`  
**Auth:** Pass `Authorization: Bearer <token>` for protected routes.

---

## Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | ❌ | Register a new user |
| POST | `/auth/login` | ❌ | Login and get token |

---

## Projects

### Create Project
**`POST /projects`** 🔒 `ADMIN`

```json
{
  "title": "Road Repair - Sector 5",
  "description": "Fix potholes on main road",
  "budget": 50000
}
```
> `adminUnitId` and `createdById` are auto-set from the logged-in user.

---

### List Projects
**`GET /projects`** ❌

Query params (all optional):
| Param | Type | Example |
|-------|------|---------|
| `adminUnitId` | string | `?adminUnitId=xxx` |
| `status` | enum | `?status=PROPOSED` |

**Status values:** `PROPOSED` `ACTIVE` `COMPLETED` `CANCELLED`

**Response:**
```json
[
  {
    "id": "cm1234...",
    "title": "Road Repair - Sector 5",
    "description": "Fix potholes on main road",
    "status": "PROPOSED",
    "budget": "50000",
    "adminUnit": { "id": "...", "name": "Ward 5", "type": "WARD" },
    "createdBy": { "id": "...", "name": "John Admin" },
    "_count": { "issues": 3 },
    "createdAt": "2026-03-06T10:00:00.000Z",
    "updatedAt": "2026-03-06T10:00:00.000Z"
  }
]
```

---

### Get Project by ID
**`GET /projects/:id`** ❌

**Response:**
```json
{
  "id": "cm1234...",
  "title": "Road Repair - Sector 5",
  "status": "PROPOSED",
  "adminUnit": { ... },
  "createdBy": { "id": "...", "name": "John Admin" },
  "issues": [
    { "id": "...", "title": "Broken light", "status": "OPEN" }
  ]
}
```

---

### Approve Project
**`POST /projects/:id/approve`** 🔒 `ADMIN`

No body required. Changes status from `PROPOSED` → `ACTIVE`.

---

### Get Project Timeline
**`GET /projects/:id/timeline`** ❌

Returns audit log for the project.

---

### List Issues in a Project
**`GET /projects/:projectId/issues`** ❌

Query params (all optional):
| Param | Type | Example |
|-------|------|---------|
| `status` | enum | `?status=OPEN` |
| `wardId` | string | `?wardId=xxx` |
| `assignedTo` | string | `?assignedTo=userId` |

---

### Create Issue inside a Project
**`POST /projects/:projectId/issues`** 🔒

```json
{
  "title": "Broken street light",
  "description": "Light on main road not working",
  "department": "ELECTRICITY",
  "latitude": 12.9716,
  "longitude": 77.5946,
  "wardId": "cm-ward-id-here"
}
```
> `projectId` is auto-set from the URL. `createdById` is auto-set from the token.

---

## Issues

### Create Issue (standalone)
**`POST /issues`** 🔒

```json
{
  "title": "Broken street light",
  "description": "Light on main road not working",
  "department": "ELECTRICITY",
  "latitude": 12.9716,
  "longitude": 77.5946,
  "wardId": "cm-ward-id-here",
  "projectId": "cm-project-id-here"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `title` | string | ✅ | |
| `department` | enum | ✅ | See values below |
| `latitude` | number | ✅ | |
| `longitude` | number | ✅ | |
| `wardId` | string | ✅ | Must be a WARD type AdminUnit |
| `description` | string | ❌ | |
| `projectId` | string | ❌ | Link to an existing project |

**Department values:** `MUNICIPAL` `ELECTRICITY` `WATER` `SANITATION` `HEALTH` `TRANSPORT`

---

### List Issues
**`GET /issues`** ❌

Query params (all optional):
| Param | Type | Example |
|-------|------|---------|
| `wardId` | string | `?wardId=xxx` |
| `status` | enum | `?status=OPEN` |
| `assignedTo` | string | `?assignedTo=userId` |
| `projectId` | string | `?projectId=xxx` |

**Status values:** `OPEN` `ACCEPTED` `REJECTED` `ASSIGNED` `IN_PROGRESS` `COMPLETED` `VERIFIED`

**Response:**
```json
[
  {
    "id": "cm5678...",
    "title": "Broken street light",
    "description": "...",
    "status": "OPEN",
    "department": "ELECTRICITY",
    "latitude": 12.9716,
    "longitude": 77.5946,
    "wardId": "...",
    "projectId": null,
    "ward": { "id": "...", "name": "Ward 5" },
    "createdBy": { "id": "...", "name": "Jane Citizen" },
    "assignedTo": null,
    "_count": { "evidence": 2 },
    "createdAt": "2026-03-06T10:00:00.000Z"
  }
]
```

---

### Get Issue by ID
**`GET /issues/:id`** ❌

Returns full issue details including evidence, verification, and timeline.

---

### Accept Issue
**`PATCH /issues/:id/accept`** 🔒 `OFFICER` `ADMIN`

No body required. Changes status `OPEN` → `ACCEPTED`.  
> Officer must belong to the same ward as the issue.

---

### Reject Issue
**`PATCH /issues/:id/reject`** 🔒 `OFFICER` `ADMIN`

```json
{
  "reason": "Not enough evidence provided"
}
```
Changes status `OPEN` → `REJECTED`.  
> Officer must belong to the same ward as the issue.

---

### Assign Issue
**`POST /issues/:id/assign`** 🔒 `OFFICER` `ADMIN`

```json
{
  "assignedToId": "cm-user-id",
  "slaHours": 48
}
```
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `assignedToId` | string | ✅ | User ID of the assignee |
| `slaHours` | number | ❌ | Defaults to server config |

---

### Convert Issue to Project
**`POST /issues/:id/convert`** 🔒 `OFFICER` `ADMIN`

```json
{
  "title": "Road Repair Project",
  "description": "Converting issue to a full project",
  "budget": 25000
}
```
Creates a new `PROPOSED` project and links the issue to it.

---

### Toggle Duplicate
**`POST /issues/:id/toggle-duplicate`** 🔒 `OFFICER` `ADMIN`

```json
{
  "duplicateOfId": "cm-original-issue-id"
}
```
Marks/unmarks this issue as a duplicate of another issue.

---

### Get Issue Timeline
**`GET /issues/:id/timeline`** ❌

Returns audit log for the issue (status changes, assignments, etc).

---

## Roles & Permissions

| Role | Permissions |
|------|-------------|
| `CITIZEN` | Create issues, view issues/projects |
| `OFFICER` | Accept/reject/assign issues, convert to project, mark duplicate |
| `ADMIN` | All officer permissions + create/approve projects |
| `INSPECTOR` | View only |
| `CONTRACTOR` | View only |

---

## Error Response Format

```json
{
  "error": "INVALID_WARD",
  "message": "wardId must reference an existing WARD"
}
```


```json
{
  "title": "Road Repair Project",
  "description": "Converting issue to a full project",
  "budget": 25000
}
```
Creates a new `PROPOSED` project and links the issue to it.

---

### Toggle Duplicate
**`POST /issues/:id/toggle-duplicate`** 🔒 `OFFICER` `ADMIN`

```json
{
  "duplicateOfId": "cm-original-issue-id"
}
```
Marks/unmarks this issue as a duplicate of another issue.

---

### Get Issue Timeline
**`GET /issues/:id/timeline`** ❌

Returns audit log for the issue (status changes, assignments, etc).

---

## Roles & Permissions

| Role | Permissions |
|------|-------------|
| `CITIZEN` | Create issues, view issues/projects |
| `OFFICER` | Accept/reject/assign issues, convert to project, mark duplicate |
| `ADMIN` | All officer permissions + create/approve projects |
| `INSPECTOR` | View only |
| `CONTRACTOR` | View only |

---

## Error Response Format

```json
{
  "error": "INVALID_WARD",
  "message": "wardId must reference an existing WARD"
}
```
