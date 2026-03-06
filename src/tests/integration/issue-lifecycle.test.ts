/**
 * WitnessLedger — Integration test: full issue lifecycle
 *
 * Tests the complete flow:
 *   Register citizen → Login → Create issue → Upload BEFORE evidence →
 *   Assign to officer → Officer uploads AFTER evidence →
 *   Inspector verifies → GET proof (merkleRoot present)
 *
 * Requires a running test database. Set DATABASE_URL to a test DB.
 */
import request from 'supertest';
import app from '../../app';
import { PrismaClient, AdminUnitType, Role } from '../../generated/prisma/client.js';
import bcrypt from 'bcrypt';
import path from 'path';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Test state
let ward12Id: string;
let citizenToken: string;
let officerToken: string;
let inspectorToken: string;
let issueId: string;
let officerId: string;

beforeAll(async () => {
  // Clean slate — delete in dependency order
  await prisma.notificationLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.project.deleteMany();
  await prisma.resident.deleteMany();
  await prisma.user.deleteMany();
  await prisma.adminUnit.deleteMany();

  // Create admin unit hierarchy
  const india = await prisma.adminUnit.create({ data: { name: 'India', type: AdminUnitType.GLOBAL } });
  const lucknow = await prisma.adminUnit.create({ data: { name: 'Lucknow', type: AdminUnitType.CITY, parentId: india.id } });
  const ward12 = await prisma.adminUnit.create({ data: { name: 'Ward 12', type: AdminUnitType.WARD, parentId: lucknow.id } });
  ward12Id = ward12.id;

  // Create officer
  const officer = await prisma.user.create({
    data: {
      name: 'Test Officer',
      email: 'testofficer@test.local',
      passwordHash: await bcrypt.hash('TestPass123!', 10),
      role: Role.OFFICER,
      adminUnitId: ward12.id,
    },
  });
  officerId = officer.id;

  // Create inspector
  await prisma.user.create({
    data: {
      name: 'Test Inspector',
      email: 'testinspector@test.local',
      passwordHash: await bcrypt.hash('TestPass123!', 10),
      role: Role.INSPECTOR,
    },
  });
});

afterAll(async () => {
  // Cleanup
  await prisma.notificationLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.project.deleteMany();
  await prisma.resident.deleteMany();
  await prisma.user.deleteMany();
  await prisma.adminUnit.deleteMany();
  await prisma.$disconnect();
});

describe('Issue Lifecycle Integration', () => {
  // ─── Step 1: Register citizen ─────────────────────────
  it('should register a citizen', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test Citizen', email: 'testcitizen@test.local', password: 'TestPass123!', wardId: ward12Id })
      .expect(201);

    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe('CITIZEN');
    citizenToken = res.body.token;
  });

  // ─── Step 2: Login officer ────────────────────────────
  it('should login the officer', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'testofficer@test.local', password: 'TestPass123!' })
      .expect(200);

    expect(res.body.token).toBeDefined();
    officerToken = res.body.token;
  });

  // ─── Step 3: Login inspector ──────────────────────────
  it('should login the inspector', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'testinspector@test.local', password: 'TestPass123!' })
      .expect(200);

    expect(res.body.token).toBeDefined();
    inspectorToken = res.body.token;
  });

  // ─── Step 4: Create issue ─────────────────────────────
  it('should create an issue with status OPEN', async () => {
    const res = await request(app)
      .post('/api/issues')
      .set('Authorization', `Bearer ${citizenToken}`)
      .send({
        title: 'Test Pothole',
        description: 'A large pothole on the main road',
        latitude: 26.8467,
        longitude: 80.9462,
        wardId: ward12Id,
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('OPEN');
    issueId = res.body.id;
  });

  // ─── Step 4.5: Officer accepts issue ──────────────────
  it('should accept the issue (officer review)', async () => {
    const res = await request(app)
      .patch(`/api/issues/${issueId}/accept`)
      .set('Authorization', `Bearer ${officerToken}`)
      .expect(200);

    expect(res.body.status).toBe('ACCEPTED');
    expect(res.body.acceptedBy).toBeTruthy();
  });

  // ─── Step 5: Upload BEFORE evidence ───────────────────
  it('should upload BEFORE evidence', async () => {
    // Create a minimal test file
    const testBuffer = Buffer.from('fake image data for BEFORE evidence');

    const res = await request(app)
      .post(`/api/issues/${issueId}/evidence?type=BEFORE`)
      .set('Authorization', `Bearer ${citizenToken}`)
      .attach('file', testBuffer, 'before.jpg')
      .expect(201);

    expect(res.body.evidence).toBeDefined();
    expect(res.body.evidence.fileHash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.evidence.type).toBe('BEFORE');
  });

  // ─── Step 6: Assign to officer (re-assign) ───────────
  it('should assign issue to officer', async () => {
    const res = await request(app)
      .post(`/api/issues/${issueId}/assign`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ assignedToId: officerId, slaHours: 24 })
      .expect(200);

    expect(res.body.status).toBe('ASSIGNED');
  });

  // ─── Step 7: Officer uploads AFTER evidence ───────────
  it('should allow officer to upload AFTER evidence', async () => {
    const testBuffer = Buffer.from('fake image data for AFTER evidence');

    const res = await request(app)
      .post(`/api/issues/${issueId}/evidence?type=AFTER`)
      .set('Authorization', `Bearer ${officerToken}`)
      .attach('file', testBuffer, 'after.jpg')
      .expect(201);

    expect(res.body.evidence.type).toBe('AFTER');
    expect(res.body.evidence.fileHash).toMatch(/^[0-9a-f]{64}$/);
  });

  // ─── Step 8: Inspector verifies ───────────────────────
  it('should verify the issue as APPROVED', async () => {
    const res = await request(app)
      .post(`/api/issues/${issueId}/verify`)
      .set('Authorization', `Bearer ${inspectorToken}`)
      .send({ verdict: 'APPROVED', remarks: 'Work completed satisfactorily' })
      .expect(200);

    expect(res.body.verification.verdict).toBe('APPROVED');
    expect(res.body.newStatus).toBe('VERIFIED');
  });

  // ─── Step 9: GET proof ────────────────────────────────
  it('should return proof with merkleRoot', async () => {
    const res = await request(app)
      .get(`/api/issues/${issueId}/proof`)
      .expect(200);

    expect(res.body.merkleRoot).toBeDefined();
    expect(res.body.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.beforeHashes.length).toBeGreaterThanOrEqual(1);
    expect(res.body.afterHashes.length).toBeGreaterThanOrEqual(1);
    expect(res.body.verification).toBeDefined();
    expect(res.body.verification.verdict).toBe('APPROVED');
  });

  // ─── Step 10: Timeline ────────────────────────────────
  it('should return audit timeline for the issue', async () => {
    const res = await request(app)
      .get(`/api/issues/${issueId}/timeline`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(4); // create, accept, evidence x2, assign, verify
  });

  // ─── Step 11: Rejection flow (separate issue) ─────────
  it('should reject a new issue with a reason', async () => {
    // Create a second issue to test rejection
    const createRes = await request(app)
      .post('/api/issues')
      .set('Authorization', `Bearer ${citizenToken}`)
      .send({
        title: 'Broken streetlight',
        description: 'Not a valid municipal issue',
        latitude: 26.8500,
        longitude: 80.9500,
        wardId: ward12Id,
      })
      .expect(201);

    expect(createRes.body.status).toBe('OPEN');

    const rejectRes = await request(app)
      .patch(`/api/issues/${createRes.body.id}/reject`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ reason: 'This falls outside municipal jurisdiction' })
      .expect(200);

    expect(rejectRes.body.status).toBe('REJECTED');
    expect(rejectRes.body.rejectionReason).toBe('This falls outside municipal jurisdiction');
    expect(rejectRes.body.rejectedBy).toBeTruthy();
  });
});
