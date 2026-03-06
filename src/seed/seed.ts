/*
 * Ghaziabad Municipal Corporation – WitnessLedger Demo Seed
 *
 * 10 real Ghaziabad wards (5 GMC zones) · 1 city admin + 10 ward admins + 10 officers
 * · 4 inspectors · 3 contractors · 6 citizens · 12 issues · 3 projects · 30 residents
 *
 * Run:  npm run seed          (ts-node src/seed/seed.ts)
 *       npx prisma db seed    (via package.json prisma.seed)
 *
 * ⚠ Designed for a fresh / reset DB.  If re-seeding run:
 *       npx prisma migrate reset --force
 */
import { PrismaClient, Role, AdminUnitType, IssueStatus, ProjectStatus, Department } from '../generated/prisma/client.js';
import dotenv from 'dotenv';
dotenv.config();
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const SALT_ROUNDS = 12;
const PHONE_SALT = process.env.RESIDENT_PHONE_SALT || 'gmc_gzb_2025';

// ─────────────────────────────────────────────────────────────────────────────
// GEO – 10 real Ghaziabad wards with verified Google Maps center-points
// Source: Ghaziabad Municipal Corporation ward list (5 zones, 100 wards)
// ─────────────────────────────────────────────────────────────────────────────
const WARD_GEO = {
  'Raj Nagar':   { lat: 28.6786, lng: 77.4487 }, // City Zone       – upscale colony near NH-58
  'Sahibabad':   { lat: 28.6630, lng: 77.3628 }, // City Zone       – industrial hub, GT Road
  'Kavi Nagar':  { lat: 28.6560, lng: 77.4368 }, // Kavi Nagar Zone – mixed residential
  'Nehru Nagar': { lat: 28.6512, lng: 77.4501 }, // Kavi Nagar Zone – dense residential
  'Vijay Nagar': { lat: 28.6753, lng: 77.4212 }, // Vijay Nagar Zone– established colony
  'Mohan Nagar': { lat: 28.6869, lng: 77.4235 }, // Mohan Nagar Zone– commercial corridor
  'Vasundhara':  { lat: 28.6268, lng: 77.3621 }, // Vasundhara Zone – planned township
  'Indirapuram': { lat: 28.6401, lng: 77.3695 }, // Vasundhara Zone – IT/residential hub
  'Vaishali':    { lat: 28.6454, lng: 77.3337 }, // Vasundhara Zone – near Delhi border
  'Kaushambi':   { lat: 28.6395, lng: 77.3178 }, // Vasundhara Zone – metro corridor
} as const;

type WardName = keyof typeof WARD_GEO;

// ─────────────────────────────────────────────────────────────────────────────
// USER DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────
// ── City-level admin (manages Ghaziabad as a whole) ─────────────────────────
const CITY_ADMIN_CRED = {
  name: 'Rajiv Sharma',
  email: 'admin@gmc.local',
  password: 'Admin@Ghz2025!',
};

// ── One ADMIN per ward (ward-level authority) ─────────────────────────────────
const WARD_ADMIN_CREDS: { name: string; email: string; password: string; ward: WardName }[] = [
  { name: 'Anand Tripathi',    email: 'admin.rajnagar@gmc.local',    password: 'WAdmin@123!', ward: 'Raj Nagar'   },
  { name: 'Seema Yadav',       email: 'admin.sahibabad@gmc.local',   password: 'WAdmin@123!', ward: 'Sahibabad'   },
  { name: 'Vinod Mishra',      email: 'admin.kavinagar@gmc.local',   password: 'WAdmin@123!', ward: 'Kavi Nagar'  },
  { name: 'Geeta Srivastava',  email: 'admin.nehrunagar@gmc.local',  password: 'WAdmin@123!', ward: 'Nehru Nagar' },
  { name: 'Sudhir Pal',        email: 'admin.vijaynagar@gmc.local',  password: 'WAdmin@123!', ward: 'Vijay Nagar' },
  { name: 'Rekha Tiwari',      email: 'admin.mohannagar@gmc.local',  password: 'WAdmin@123!', ward: 'Mohan Nagar' },
  { name: 'Kapil Dev Sharma',  email: 'admin.vasundhara@gmc.local',  password: 'WAdmin@123!', ward: 'Vasundhara'  },
  { name: 'Alka Gupta',        email: 'admin.indirapuram@gmc.local', password: 'WAdmin@123!', ward: 'Indirapuram' },
  { name: 'Narendra Chauhan',  email: 'admin.vaishali@gmc.local',    password: 'WAdmin@123!', ward: 'Vaishali'    },
  { name: 'Sanjay Agarwal',    email: 'admin.kaushambi@gmc.local',   password: 'WAdmin@123!', ward: 'Kaushambi'   },
];

// ── One OFFICER per ward (field-level execution) ─────────────────────────────
const OFFICER_CREDS: { name: string; email: string; password: string; ward: WardName }[] = [
  { name: 'Sunita Verma',       email: 'officer.rajnagar@gmc.local',    password: 'Officer@123!', ward: 'Raj Nagar'   },
  { name: 'Manish Kumar',       email: 'officer.sahibabad@gmc.local',   password: 'Officer@123!', ward: 'Sahibabad'   },
  { name: 'Pankaj Mishra',      email: 'officer.kavinagar@gmc.local',   password: 'Officer@123!', ward: 'Kavi Nagar'  },
  { name: 'Deepak Srivastava',  email: 'officer.nehrunagar@gmc.local',  password: 'Officer@123!', ward: 'Nehru Nagar' },
  { name: 'Neelam Yadav',       email: 'officer.vijaynagar@gmc.local',  password: 'Officer@123!', ward: 'Vijay Nagar' },
  { name: 'Ashok Tiwari',       email: 'officer.mohannagar@gmc.local',  password: 'Officer@123!', ward: 'Mohan Nagar' },
  { name: 'Priya Singh',        email: 'officer.vasundhara@gmc.local',  password: 'Officer@123!', ward: 'Vasundhara'  },
  { name: 'Deepak Gupta',       email: 'officer.indirapuram@gmc.local', password: 'Officer@123!', ward: 'Indirapuram' },
  { name: 'Kavita Rani',        email: 'officer.vaishali@gmc.local',    password: 'Officer@123!', ward: 'Vaishali'    },
  { name: 'Sunil Agarwal',      email: 'officer.kaushambi@gmc.local',   password: 'Officer@123!', ward: 'Kaushambi'   },
];

// Each inspector is homed to a ward but covers the full zone in practice
const INSPECTOR_CREDS: { name: string; email: string; password: string; ward: WardName }[] = [
  { name: 'Suresh Dubey',  email: 'insp.north@gmc.local',   password: 'Insp@123!', ward: 'Raj Nagar'   },
  { name: 'Anil Sharma',   email: 'insp.central@gmc.local', password: 'Insp@123!', ward: 'Vijay Nagar' },
  { name: 'Vikas Pandey',  email: 'insp.south@gmc.local',   password: 'Insp@123!', ward: 'Vasundhara'  },
  { name: 'Ramesh Pal',    email: 'insp.east@gmc.local',    password: 'Insp@123!', ward: 'Sahibabad'   },
];

const CONTRACTOR_CREDS: { name: string; email: string; password: string }[] = [
  { name: 'Bharat Nirman Pvt. Ltd.',    email: 'bharatnirman@contractor.local',   password: 'Cont@123!' },
  { name: 'GZB Infrastructure Works',   email: 'gzbinfra@contractor.local',        password: 'Cont@123!' },
  { name: 'Sarkar Builders & Co.',       email: 'sarkarbuilders@contractor.local',  password: 'Cont@123!' },
];

const CITIZEN_CREDS: { name: string; email: string; password: string }[] = [
  { name: 'Mohit Agarwal',   email: 'mohit.agarwal@gmail.com',   password: 'Mohit@123!' },
  { name: 'Ritu Saxena',     email: 'ritu.saxena@gmail.com',     password: 'Ritu@123!'  },
  { name: 'Amit Chauhan',    email: 'amit.chauhan@gmail.com',    password: 'Amit@123!'  },
  { name: 'Pooja Kesarwani', email: 'pooja.kesarwani@gmail.com', password: 'Pooja@123!' },
  { name: 'Rakesh Jain',     email: 'rakesh.jain@gmail.com',     password: 'Rakesh@123!'},
  { name: 'Shweta Dixit',    email: 'shweta.dixit@gmail.com',    password: 'Shweta@123!'},
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000);

async function hashPw(pw: string) {
  return bcrypt.hash(pw, SALT_ROUNDS);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🏙️  WitnessLedger – Ghaziabad Municipal Corporation demo seed\n');

  // ── 1. Admin Units ──────────────────────────────────────────────────────────
  const india = await prisma.adminUnit.create({
    data: { name: 'India', type: AdminUnitType.GLOBAL },
  });
  console.log(`  ✅ AdminUnit: India (GLOBAL) → ${india.id}`);

  const ghaziabad = await prisma.adminUnit.create({
    data: {
      name: 'Ghaziabad',
      type: AdminUnitType.CITY,
      parentId: india.id,
      centerLat: 28.6692,
      centerLng: 77.4538,
    },
  });
  console.log(`  ✅ AdminUnit: Ghaziabad (CITY) → ${ghaziabad.id}`);

  const wardIds: Record<WardName, string> = {} as Record<WardName, string>;
  for (const [name, geo] of Object.entries(WARD_GEO) as [WardName, { lat: number; lng: number }][]) {
    const w = await prisma.adminUnit.create({
      data: {
        name,
        type: AdminUnitType.WARD,
        parentId: ghaziabad.id,
        centerLat: geo.lat,
        centerLng: geo.lng,
      },
    });
    wardIds[name] = w.id;
    console.log(`  ✅ AdminUnit: ${name} (WARD, ${geo.lat}, ${geo.lng}) → ${w.id}`);
  }

  // ── 2. Users ─────────────────────────────────────────────────────────────
  const uid: Record<string, string> = {};

  // City-level admin
  const cityAdmin = await prisma.user.create({
    data: {
      name: CITY_ADMIN_CRED.name,
      email: CITY_ADMIN_CRED.email,
      passwordHash: await hashPw(CITY_ADMIN_CRED.password),
      role: Role.ADMIN,
      adminUnitId: ghaziabad.id,
    },
  });
  uid[CITY_ADMIN_CRED.email] = cityAdmin.id;

  // Ward-level admins (one per ward)
  for (const wa of WARD_ADMIN_CREDS) {
    const u = await prisma.user.create({
      data: {
        name: wa.name,
        email: wa.email,
        passwordHash: await hashPw(wa.password),
        role: Role.ADMIN,
        adminUnitId: wardIds[wa.ward],
      },
    });
    uid[wa.email] = u.id;
  }

  // Officers (one per ward – field execution layer)
  for (const o of OFFICER_CREDS) {
    const u = await prisma.user.create({
      data: {
        name: o.name,
        email: o.email,
        passwordHash: await hashPw(o.password),
        role: Role.OFFICER,
        adminUnitId: wardIds[o.ward],
      },
    });
    uid[o.email] = u.id;
  }

  // Inspectors (homed to a ward)
  for (const i of INSPECTOR_CREDS) {
    const u = await prisma.user.create({
      data: {
        name: i.name,
        email: i.email,
        passwordHash: await hashPw(i.password),
        role: Role.INSPECTOR,
        adminUnitId: wardIds[i.ward],
      },
    });
    uid[i.email] = u.id;
  }

  // Contractors (city-level, no specific ward)
  for (const c of CONTRACTOR_CREDS) {
    const u = await prisma.user.create({
      data: {
        name: c.name,
        email: c.email,
        passwordHash: await hashPw(c.password),
        role: Role.CONTRACTOR,
        adminUnitId: ghaziabad.id,
      },
    });
    uid[c.email] = u.id;
  }

  // Citizens
  for (const c of CITIZEN_CREDS) {
    const u = await prisma.user.create({
      data: {
        name: c.name,
        email: c.email,
        passwordHash: await hashPw(c.password),
        role: Role.CITIZEN,
      },
    });
    uid[c.email] = u.id;
  }

  console.log(`\n  ✅ Users created: ${Object.keys(uid).length}`);

  // Short-hand lookups
  const adminId      = uid['admin@gmc.local'];
  const inspNorth    = uid['insp.north@gmc.local'];
  const inspCentral  = uid['insp.central@gmc.local'];
  const inspSouth    = uid['insp.south@gmc.local'];
  const inspEast     = uid['insp.east@gmc.local'];
  const contRoad     = uid['bharatnirman@contractor.local'];
  const contWater    = uid['gzbinfra@contractor.local'];
  const contMisc     = uid['sarkarbuilders@contractor.local'];
  const citizenMohit = uid['mohit.agarwal@gmail.com'];
  const citizenRitu  = uid['ritu.saxena@gmail.com'];
  const citizenAmit  = uid['amit.chauhan@gmail.com'];
  const citizenPooja = uid['pooja.kesarwani@gmail.com'];
  const citizenRakesh= uid['rakesh.jain@gmail.com'];
  const citizenShweta= uid['shweta.dixit@gmail.com'];

  // ── 3. Issues ──────────────────────────────────────────────────────────────
  //
  // Issue catalogue – 12 issues spread across 10 wards, 5 statuses, 5 depts.
  // GPS offsets are ~50–200 m from ward centre for realism.
  // ──────────────────────────────────────────────────────────────────────────

  // [1] Raj Nagar – VERIFIED (pothole, closed successfully)
  const issue1 = await prisma.issue.create({
    data: {
      title: 'Large pothole on Raj Nagar Road No. 4 near Rajat Cineplex',
      description:
        'A 2-foot-wide, 8-inch-deep pothole has formed on Road No. 4 just outside Rajat Cineplex. Two-wheelers have already skidded. Urgently needs patching before the monsoon season worsens it.',
      department: Department.MUNICIPAL,
      latitude: 28.6783,
      longitude: 77.4491,
      wardId: wardIds['Raj Nagar'],
      createdById: citizenMohit,
      inspectorId: inspNorth,
      contractorId: contRoad,
      status: IssueStatus.VERIFIED,
      slaDeadline: daysFromNow(-18),
    },
  });
  await prisma.auditLog.createMany({
    data: [
      { issueId: issue1.id, actorId: citizenMohit, action: 'ISSUE_CREATED',   metadata: { status: 'OPEN' } },
      { issueId: issue1.id, actorId: adminId,       action: 'ISSUE_ACCEPTED',  metadata: { status: 'ACCEPTED' } },
      { issueId: issue1.id, actorId: inspNorth,     action: 'INSPECTION_STARTED', metadata: { status: 'INSPECTING' } },
      { issueId: issue1.id, actorId: contRoad,      action: 'WORK_COMPLETED',  metadata: { status: 'WORK_DONE' } },
      { issueId: issue1.id, actorId: adminId,       action: 'ISSUE_VERIFIED',  metadata: { status: 'VERIFIED' } },
    ],
  });
  console.log(`  ✅ Issue [VERIFIED]:       "${issue1.title}"`);

  // [2] Raj Nagar – UNDER_REVIEW (water pipeline, after photo uploaded)
  const issue2 = await prisma.issue.create({
    data: {
      title: 'Burst water pipeline causing waterlogging near Raj Nagar Market',
      description:
        'A 6-inch municipal water main has burst at the junction near Raj Nagar market. Water is pooling on the road, disrupting traffic and shop access. Several households in the surrounding lanes have had water supply cut off.',
      department: Department.WATER,
      latitude: 28.6780,
      longitude: 77.4495,
      wardId: wardIds['Raj Nagar'],
      createdById: citizenRitu,
      inspectorId: inspNorth,
      contractorId: contWater,
      status: IssueStatus.UNDER_REVIEW,
      slaDeadline: daysFromNow(-3),
    },
  });
  await prisma.auditLog.createMany({
    data: [
      { issueId: issue2.id, actorId: citizenRitu, action: 'ISSUE_CREATED',      metadata: { status: 'OPEN' } },
      { issueId: issue2.id, actorId: adminId,      action: 'ISSUE_ACCEPTED',     metadata: { status: 'ACCEPTED' } },
      { issueId: issue2.id, actorId: inspNorth,    action: 'INSPECTION_STARTED', metadata: { status: 'INSPECTING' } },
      { issueId: issue2.id, actorId: contWater,    action: 'WORK_COMPLETED',     metadata: { status: 'WORK_DONE' } },
    ],
  });
  console.log(`  ✅ Issue [UNDER_REVIEW]:   "${issue2.title}"`);

  // [3] Kavi Nagar – WORK_DONE (sewer overflow, awaiting after photo)
  const issue3 = await prisma.issue.create({
    data: {
      title: 'Overflowing sewer manhole near Kavi Nagar Chowk causing health hazard',
      description:
        'The sewer manhole cover at Kavi Nagar Chowk has been overflowing for three days. Sewage is spilling onto the footpath. Foul smell and mosquito breeding is alarming residents and shopkeepers alike.',
      department: Department.SANITATION,
      latitude: 28.6558,
      longitude: 77.4371,
      wardId: wardIds['Kavi Nagar'],
      createdById: citizenAmit,
      inspectorId: inspNorth,
      contractorId: contMisc,
      status: IssueStatus.WORK_DONE,
      slaDeadline: daysFromNow(-1),
    },
  });
  await prisma.auditLog.createMany({
    data: [
      { issueId: issue3.id, actorId: citizenAmit, action: 'ISSUE_CREATED',      metadata: { status: 'OPEN' } },
      { issueId: issue3.id, actorId: adminId,      action: 'ISSUE_ACCEPTED',     metadata: { status: 'ACCEPTED' } },
      { issueId: issue3.id, actorId: inspNorth,    action: 'INSPECTION_STARTED', metadata: { status: 'INSPECTING' } },
      { issueId: issue3.id, actorId: contMisc,     action: 'WORK_COMPLETED',     metadata: { status: 'WORK_DONE' } },
    ],
  });
  console.log(`  ✅ Issue [WORK_DONE]:      "${issue3.title}"`);

  // [4] Kavi Nagar – OPEN (encroachment)
  const issue4 = await prisma.issue.create({
    data: {
      title: 'Illegal encroachment blocking public footpath near Wave Mall, Kavi Nagar',
      description:
        'Street vendors have permanently occupied the footpath outside Wave Mall, forcing pedestrians onto the main road. This has led to near-misses with fast-moving traffic. The encroachment has been ongoing for over two weeks.',
      department: Department.MUNICIPAL,
      latitude: 28.6562,
      longitude: 77.4375,
      wardId: wardIds['Kavi Nagar'],
      createdById: citizenPooja,
      status: IssueStatus.OPEN,
      slaDeadline: daysFromNow(2),
    },
  });
  await prisma.auditLog.create({
    data: { issueId: issue4.id, actorId: citizenPooja, action: 'ISSUE_CREATED', metadata: { status: 'OPEN' } },
  });
  console.log(`  ✅ Issue [OPEN]:           "${issue4.title}"`);

  // [5] Vijay Nagar – INSPECTING (deep pothole, inspector on site)
  const issue5 = await prisma.issue.create({
    data: {
      title: 'Multiple deep potholes on Vijay Nagar Extension Road near Block-C',
      description:
        'Vijay Nagar Extension Road between Block-B and Block-C is riddled with potholes up to 10 inches deep. A motorcyclist sustained injuries last week. The stretch becomes impassable after rain. Requires complete re-carpeting.',
      department: Department.MUNICIPAL,
      latitude: 28.6748,
      longitude: 77.4218,
      wardId: wardIds['Vijay Nagar'],
      createdById: citizenRakesh,
      inspectorId: inspCentral,
      status: IssueStatus.INSPECTING,
      slaDeadline: daysFromNow(1),
    },
  });
  await prisma.auditLog.createMany({
    data: [
      { issueId: issue5.id, actorId: citizenRakesh, action: 'ISSUE_CREATED',      metadata: { status: 'OPEN' } },
      { issueId: issue5.id, actorId: adminId,        action: 'ISSUE_ACCEPTED',     metadata: { status: 'ACCEPTED' } },
      { issueId: issue5.id, actorId: inspCentral,    action: 'INSPECTION_STARTED', metadata: { status: 'INSPECTING' } },
    ],
  });
  console.log(`  ✅ Issue [INSPECTING]:     "${issue5.title}"`);

  // [6] Vijay Nagar – ACCEPTED (streetlights, inspector assigned)
  const issue6 = await prisma.issue.create({
    data: {
      title: 'Street lights non-functional on Block-C to Block-E stretch, Vijay Nagar',
      description:
        'Seven consecutive street lights covering 400 metres of the Block-C to Block-E stretch have been dark for ten days. The area is a known crime hotspot and residents are afraid to walk at night. Power supply trips appear to originate near the secondary substation.',
      department: Department.ELECTRICITY,
      latitude: 28.6757,
      longitude: 77.4207,
      wardId: wardIds['Vijay Nagar'],
      createdById: citizenShweta,
      inspectorId: inspCentral,
      status: IssueStatus.ACCEPTED,
      slaDeadline: daysFromNow(2),
    },
  });
  await prisma.auditLog.createMany({
    data: [
      { issueId: issue6.id, actorId: citizenShweta, action: 'ISSUE_CREATED',  metadata: { status: 'OPEN' } },
      { issueId: issue6.id, actorId: adminId,        action: 'ISSUE_ACCEPTED', metadata: { status: 'ACCEPTED' } },
    ],
  });
  console.log(`  ✅ Issue [ACCEPTED]:       "${issue6.title}"`);

  // [7] Mohan Nagar – OPEN (garbage heap)
  const issue7 = await prisma.issue.create({
    data: {
      title: 'Illegal garbage dumping near Mohan Nagar Chowk bus stand',
      description:
        'An unsanctioned waste dump has formed behind the Mohan Nagar Chowk bus shelter. Construction debris, domestic waste, and organic refuse are mixed together. Stray dogs and pigs frequent the site. No GMC garbage truck has collected from this point in over a week.',
      department: Department.SANITATION,
      latitude: 28.6872,
      longitude: 77.4228,
      wardId: wardIds['Mohan Nagar'],
      createdById: citizenMohit,
      status: IssueStatus.OPEN,
      slaDeadline: daysFromNow(2),
    },
  });
  await prisma.auditLog.create({
    data: { issueId: issue7.id, actorId: citizenMohit, action: 'ISSUE_CREATED', metadata: { status: 'OPEN' } },
  });
  console.log(`  ✅ Issue [OPEN]:           "${issue7.title}"`);

  // [8] Vasundhara – ACCEPTED (water pipeline leak)
  const issue8 = await prisma.issue.create({
    data: {
      title: 'Leaking underground water pipeline in Vasundhara Sector 2A near Park',
      description:
        'A continuous water leak has been observed for five days at the junction of Sector 2A main road and the community park entrance. The road surface is eroding and the park pathway is waterlogged. Residents suspect a 4-inch supply main is damaged.',
      department: Department.WATER,
      latitude: 28.6265,
      longitude: 77.3618,
      wardId: wardIds['Vasundhara'],
      createdById: citizenRitu,
      inspectorId: inspSouth,
      status: IssueStatus.ACCEPTED,
      slaDeadline: daysFromNow(1),
    },
  });
  await prisma.auditLog.createMany({
    data: [
      { issueId: issue8.id, actorId: citizenRitu, action: 'ISSUE_CREATED',  metadata: { status: 'OPEN' } },
      { issueId: issue8.id, actorId: adminId,      action: 'ISSUE_ACCEPTED', metadata: { status: 'ACCEPTED' } },
    ],
  });
  console.log(`  ✅ Issue [ACCEPTED]:       "${issue8.title}"`);

  // [9] Indirapuram – OPEN (road surface damage)
  const issue9 = await prisma.issue.create({
    data: {
      title: 'Severely damaged road surface on Gyan Khand III main road, Indirapuram',
      description:
        'The main road through Gyan Khand III has developed extensive cracking and surface breakage over a 300-metre stretch. The damage is likely due to heavy waterlogging last monsoon. School buses and ambulances have difficulty navigating the section.',
      department: Department.MUNICIPAL,
      latitude: 28.6398,
      longitude: 77.3698,
      wardId: wardIds['Indirapuram'],
      createdById: citizenAmit,
      status: IssueStatus.OPEN,
      slaDeadline: daysFromNow(2),
    },
  });
  await prisma.auditLog.create({
    data: { issueId: issue9.id, actorId: citizenAmit, action: 'ISSUE_CREATED', metadata: { status: 'OPEN' } },
  });
  console.log(`  ✅ Issue [OPEN]:           "${issue9.title}"`);

  // [10] Vaishali – OPEN (blocked storm drain)
  const issue10 = await prisma.issue.create({
    data: {
      title: 'Choked stormwater drain causing road flooding near Vaishali Metro Station',
      description:
        'The stormwater drain running alongside the feeder road to Vaishali Metro Station is completely blocked with silt and plastic waste. Even light rain causes a 6-inch flood that disrupts commuter access to the metro. This has been reported twice earlier with no action.',
      department: Department.WATER,
      latitude: 28.6452,
      longitude: 77.3342,
      wardId: wardIds['Vaishali'],
      createdById: citizenPooja,
      status: IssueStatus.OPEN,
      slaDeadline: daysFromNow(2),
    },
  });
  await prisma.auditLog.create({
    data: { issueId: issue10.id, actorId: citizenPooja, action: 'ISSUE_CREATED', metadata: { status: 'OPEN' } },
  });
  console.log(`  ✅ Issue [OPEN]:           "${issue10.title}"`);

  // [11] Sahibabad – INSPECTING (industrial effluent discharge)
  const issue11 = await prisma.issue.create({
    data: {
      title: 'Industrial effluent discharging into open municipal drain, GT Road Sahibabad',
      description:
        'Dark, foul-smelling liquid is being discharged from a factory compound near GT Road into the open municipal drain. The drain feeds into the local canal. Foam and discoloration are visible. Residents in nearby Rampur Colony have reported skin irritation.',
      department: Department.SANITATION,
      latitude: 28.6628,
      longitude: 77.3632,
      wardId: wardIds['Sahibabad'],
      createdById: citizenRakesh,
      inspectorId: inspEast,
      status: IssueStatus.INSPECTING,
      slaDeadline: daysFromNow(1),
    },
  });
  await prisma.auditLog.createMany({
    data: [
      { issueId: issue11.id, actorId: citizenRakesh, action: 'ISSUE_CREATED',      metadata: { status: 'OPEN' } },
      { issueId: issue11.id, actorId: adminId,        action: 'ISSUE_ACCEPTED',     metadata: { status: 'ACCEPTED' } },
      { issueId: issue11.id, actorId: inspEast,       action: 'INSPECTION_STARTED', metadata: { status: 'INSPECTING' } },
    ],
  });
  console.log(`  ✅ Issue [INSPECTING]:     "${issue11.title}"`);

  // [12] Kaushambi – OPEN (broken public toilet)
  const issue12 = await prisma.issue.create({
    data: {
      title: 'Public toilet facility near Kaushambi Bus Terminus completely non-functional',
      description:
        'The GMC public toilet block at Kaushambi Bus Terminus has been out of service for two weeks. Doors are broken, water supply is cut off, and sanitation is deplorable. This is a high-footfall area used by hundreds of daily commuters. Health risk is significant.',
      department: Department.HEALTH,
      latitude: 28.6392,
      longitude: 77.3182,
      wardId: wardIds['Kaushambi'],
      createdById: citizenShweta,
      status: IssueStatus.OPEN,
      slaDeadline: daysFromNow(2),
    },
  });
  await prisma.auditLog.create({
    data: { issueId: issue12.id, actorId: citizenShweta, action: 'ISSUE_CREATED', metadata: { status: 'OPEN' } },
  });
  console.log(`  ✅ Issue [OPEN]:           "${issue12.title}"`);

  // ── 4. Projects ────────────────────────────────────────────────────────────

  // Project A – Road re-carpeting, city-wide, ACTIVE
  const projectA = await prisma.project.create({
    data: {
      title: 'Ghaziabad Road Re-carpeting Phase-I (Raj Nagar & Vijay Nagar)',
      description:
        'Comprehensive re-carpeting of arterial and residential roads in Raj Nagar and Vijay Nagar wards. Phase-I covers 22 km of roads damaged by waterlogging. Work includes base repair, bituminous macadam, and reflective road markings.',
      budget: 35_000_000,   // ₹3.5 Crore
      status: ProjectStatus.ACTIVE,
      adminUnitId: ghaziabad.id,
      createdById: adminId,
    },
  });
  // Link road-related issues to this project
  await prisma.issue.updateMany({
    where: { id: { in: [issue1.id, issue5.id] } },
    data: { projectId: projectA.id },
  });
  await prisma.auditLog.create({
    data: { projectId: projectA.id, actorId: adminId, action: 'PROJECT_CREATED', metadata: { status: 'ACTIVE', budget: 35_000_000 } },
  });
  console.log(`  ✅ Project [ACTIVE]:       "${projectA.title}"`);

  // Project B – Water network upgrade, PLANNING
  const projectB = await prisma.project.create({
    data: {
      title: 'Vasundhara-Indirapuram Water Distribution Network Upgrade',
      description:
        'Replacement of ageing 4-inch cast-iron water mains with 8-inch HDPE pipes across Vasundhara Sectors 1–5 and Gyan Khand I–III in Indirapuram. Expected to eliminate recurring pipe bursts and improve supply pressure for ~40,000 households.',
      budget: 18_000_000,   // ₹1.8 Crore
      status: ProjectStatus.PROPOSED,
      adminUnitId: ghaziabad.id,
      createdById: adminId,
    },
  });
  await prisma.issue.update({ where: { id: issue8.id }, data: { projectId: projectB.id } });
  await prisma.auditLog.create({
    data: { projectId: projectB.id, actorId: adminId, action: 'PROJECT_CREATED', metadata: { status: 'PLANNING', budget: 18_000_000 } },
  });
  console.log(`  ✅ Project [PLANNING]:     "${projectB.title}"`);

  // Project C – Stormwater drainage, ACTIVE
  const projectC = await prisma.project.create({
    data: {
      title: 'Mohan Nagar Integrated Stormwater Drainage Rehabilitation',
      description:
        'Complete desilting and structural repair of the stormwater drainage network in Mohan Nagar and connecting outfall to the Hindon River drain. Work includes 4.2 km of drain widening, 6 new outfall chambers, and solid-waste screening grids at 14 inlets.',
      budget: 25_000_000,   // ₹2.5 Crore
      status: ProjectStatus.ACTIVE,
      adminUnitId: ghaziabad.id,
      createdById: adminId,
    },
  });
  await prisma.auditLog.create({
    data: { projectId: projectC.id, actorId: adminId, action: 'PROJECT_CREATED', metadata: { status: 'ACTIVE', budget: 25_000_000 } },
  });
  console.log(`  ✅ Project [ACTIVE]:       "${projectC.title}"`);

  // ── 5. Residents from CSV ─────────────────────────────────────────────────
  const csvPath = path.join(process.cwd(), 'src/seed/sample-data/residents.csv');
  const csvBuffer = fs.readFileSync(csvPath);
  const rows = parse(csvBuffer, { columns: true, trim: true, skip_empty_lines: true }) as Array<{
    name: string;
    phone: string;
    latitude: string;
    longitude: string;
  }>;

  let residentCount = 0;
  for (const row of rows) {
    const phoneHash = crypto
      .createHash('sha256')
      .update(row.phone + PHONE_SALT)
      .digest('hex');

    await prisma.resident.create({
      data: {
        name: row.name || null,
        phoneHash,
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
      },
    });
    residentCount++;
  }
  console.log(`  ✅ Residents imported: ${residentCount}`);

  // ── 6. Print credentials ────────────────────────────────────────────────────
  const allCreds = [
    { role: 'CITY-ADMIN',  email: CITY_ADMIN_CRED.email,  password: CITY_ADMIN_CRED.password },
    ...WARD_ADMIN_CREDS.map(u => ({ role: 'WARD-ADMIN',  email: u.email, password: u.password })),
    ...OFFICER_CREDS.map(u => ({ role: 'OFFICER',     email: u.email, password: u.password })),
    ...INSPECTOR_CREDS.map(u => ({ role: 'INSPECTOR',  email: u.email, password: u.password })),
    ...CONTRACTOR_CREDS.map(u => ({ role: 'CONTRACTOR', email: u.email, password: u.password })),
    ...CITIZEN_CREDS.map(u => ({ role: 'CITIZEN',    email: u.email, password: u.password })),
  ];

  console.log('\n  ╔══════════════════════════════════════════════════════════════════════╗');
  console.log('  ║               WitnessLedger GMC – Demo Credentials                  ║');
  console.log('  ╠══════════════╦══════════════════════════════════════╦═══════════════╣');
  console.log('  ║ Role         ║ Email                                ║ Password      ║');
  console.log('  ╠══════════════╬══════════════════════════════════════╬═══════════════╣');
  for (const c of allCreds) {
    console.log(`  ║ ${c.role.padEnd(12)} ║ ${c.email.padEnd(36)} ║ ${c.password.padEnd(13)} ║`);
  }
  console.log('  ╚══════════════╩══════════════════════════════════════╩═══════════════╝');

  console.log('\n🎉  Ghaziabad seed complete!\n');
}

main()
  .catch((e) => {
    console.error('❌  Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
