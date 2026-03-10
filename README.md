JanPramaan Backend

JanPramaan is a transparent public service CRM and civic accountability platform that transforms citizen complaints into verifiable, trackable government actions.

The system enables citizens to report civic issues (roads, water leaks, streetlights, sanitation, etc.), automatically routes them to responsible government officers, and ensures tamper-proof verification of completed work through geo-tagged evidence and inspector validation.

By combining workflow automation, geospatial routing, cryptographic evidence verification, and transparent audit trails, JanPramaan ensures that every complaint results in accountable public action rather than disappearing into bureaucratic systems.

Problem Addressed

Municipal and public service departments receive thousands of complaints daily across domains such as:

Road maintenance

Water supply

Sanitation

Electricity infrastructure

Public lighting

Drainage systems

However, existing grievance platforms suffer from major gaps:

No centralized task routing — complaints are manually forwarded between departments

Lack of accountability — officers can close issues without proof

No real-time tracking — citizens cannot verify progress

Evidence manipulation risk — uploaded proof can be modified

No transparent audit trail — historical actions are not publicly verifiable

JanPramaan addresses these challenges by introducing a verifiable civic workflow engine where every complaint becomes a traceable, evidence-backed government action.

Core System Concept

JanPramaan converts a complaint into a structured governance workflow:

Citizen Complaint
        ↓
Automatic Department Routing
        ↓
Officer Assignment
        ↓
Inspector Captures Geo-Tagged Evidence
        ↓
Contractor Executes Work
        ↓
Inspector Uploads After-Evidence
        ↓
Officer Verifies Completion
        ↓
Public Proof + QR Transparency

Each step is recorded in a tamper-evident audit log, ensuring full transparency.

Key Innovations
Tamper-Proof Evidence System

Before and after images are hashed using SHA-256 cryptographic hashing and linked through a Merkle root, ensuring uploaded evidence cannot be altered.

Inspector-Based Verification

Issues cannot be closed by a single officer.
Completion requires independent inspector verification, preventing fraudulent closures.

Geo-Aware Complaint Routing

Using PostGIS spatial queries, complaints are automatically mapped to the correct ward and department jurisdiction.

Transparent Public Proof

Every resolved issue generates a public proof page and QR code containing:

Geo-location of issue

Evidence images

Timeline of actions

Responsible department

Verification record

SLA Enforcement

Each complaint has a configurable resolution deadline.
If officers fail to respond in time, the system automatically flags delays.

Tech Stack
Layer	Technology	Purpose
Runtime	Node.js	Backend runtime
Framework	Express.js	API routing and service orchestration
Database	PostgreSQL + PostGIS	Geospatial complaint routing
ORM	Prisma	Type-safe database queries
Authentication	JWT + bcrypt	Secure user authentication
Evidence Processing	Multer + EXIF	Image uploads and GPS metadata extraction
Security	SHA-256 hashing	Tamper-proof evidence verification
Audit System	Merkle Trees	Immutable action verification
Notifications	Twilio SMS / Web Push	Citizen alerts
Storage	AWS S3 / Cloudinary	Evidence storage
QR System	qrcode	Public transparency pages
Core Modules
Complaint Management

Handles complaint creation, categorization, and routing.

Workflow Engine

Automates officer assignment and issue lifecycle management.

Evidence Verification System

Processes uploaded images, extracts GPS metadata, and generates tamper-proof hashes.

Inspector Verification Module

Allows field inspectors to validate completed work.

Transparency Dashboard

Generates public verification records and governance metrics.

Example Civic Workflow

Citizen reports a broken water pipe via mobile app.

System identifies the correct ward using geospatial routing.

Complaint is assigned to the responsible officer.

Inspector captures before evidence.

Contractor performs repair work.

Inspector uploads after evidence.

Officer verifies completion.

System generates public proof page and QR transparency record.

Architecture Overview
Citizen App (Flutter)
        ↓
API Gateway (Node.js + Express)
        ↓
AI Classification Engine
        ↓
Complaint Workflow Engine
        ↓
Geospatial Routing (PostGIS)
        ↓
Evidence Processing Layer
        ↓
Inspector Verification
        ↓
Public Proof + Notification System
Why JanPramaan Matters

JanPramaan transforms public grievance systems from passive complaint portals into active accountability platforms.

The platform ensures:

Transparency in public works

Accountability for government officers

Trust between citizens and institutions

By making every civic action verifiable and publicly auditable, JanPramaan strengthens digital governance and enables data-driven public service delivery.
