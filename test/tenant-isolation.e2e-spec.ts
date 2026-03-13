/**
 * E2E: Cross-Tenant Data Isolation
 *
 * Verifies that no data leaks between organizations at the HTTP level.
 * Uses a real PostgreSQL connection and real RS256-signed JWTs.
 *
 * Prerequisites:
 *   1. A running PostgreSQL instance matching the .env values.
 *   2. Drizzle migrations applied (`npm run db:migrate`) so that all tables
 *      including `organization_id` on `users` and `webhook_endpoints` exist.
 *
 * The test bootstraps a minimal NestJS application (no BullMQ, no rate limiting)
 * and seeds two isolated tenants directly via Drizzle.
 *
 * Isolation strategy under test:
 *   - JwtStrategy reads organizationId from the users row and sets it in
 *     RequestContext via RequestContext.setUser(id, orgId).
 *   - TenantGuard rejects requests with no organizationId in context.
 *   - WebhookEndpointsService always includes WHERE organization_id = orgId
 *     (app-level isolation, independent of RLS policies).
 *   - If the RLS SQL in src/database/rls/0001_enable_rls.sql has been applied,
 *     PostgreSQL also enforces isolation at the query engine level.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';

import configuration from '@/config';
import { DatabaseModule } from '@/database/database.module';
import { SecurityModule } from '@/security/security.module';
import { AuditModule } from '@/modules/audit/audit.module';
import { UsersModule } from '@/users/users.module';
import { TenantModule } from '@/tenant/tenant.module';
import { CorrelationIdModule } from '@/logger/correlation-id.module';
import { JwtStrategy } from '@/auth/strategy/jwt.strategy';
import { WebhookEndpointsController } from '@/webhooks/webhook-endpoints.controller';
import { WebhookEndpointsService } from '@/webhooks/webhook-endpoints.service';
import { RequestContext } from '@/logger/request-context';

import { organizations } from '@/database/schema/organizations.schema';
import { users } from '@/database/schema/users.schema';
import { webhookEndpoints } from '@/database/schema/webhook-endpoints.schema';
import * as schema from '@/database/schema';

function buildTestPool(): Pool {
  return new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });
}

describe('Tenant Isolation (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let pool: Pool;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  let orgAId: string;
  let orgBId: string;
  let userAId: string;
  let userBId: string;
  let endpointAId: string;

  let tokenA: string;
  let tokenB: string;

  const insertedOrgs: string[] = [];
  const insertedUsers: string[] = [];
  const insertedEndpoints: string[] = [];


  beforeAll(async () => {
    pool = buildTestPool();
    db = drizzle(pool, { schema });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [configuration],
          validationOptions: { allowUnknown: true },
        }),
        CorrelationIdModule,
        DatabaseModule,
        SecurityModule,
        AuditModule,
        UsersModule,
        TenantModule,
        PassportModule.register({ defaultStrategy: 'jwt', session: false }),
        JwtModule.registerAsync({
          imports: [ConfigModule],
          useFactory: (configService: ConfigService) => ({
            privateKey: configService.get<string>('keys.privateKey'),
            publicKey: configService.get<string>('keys.publicKey'),
            signOptions: { expiresIn: '1h', algorithm: 'RS256' },
          }),
          inject: [ConfigService],
        }),
      ],
      controllers: [WebhookEndpointsController],
      providers: [WebhookEndpointsService, JwtStrategy],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    jwtService = moduleRef.get(JwtService);

    const hashedPassword = await argon2.hash('Test@1234', {
      type: argon2.argon2id,
      memoryCost: 1024,
      timeCost: 1,
      parallelism: 1,
    });

    const [orgA] = await db
      .insert(organizations)
      .values({ name: 'E2E Org A', slug: `e2e-org-a-${randomUUID()}` })
      .returning();
    orgAId = orgA.id;
    insertedOrgs.push(orgAId);

    const [orgB] = await db
      .insert(organizations)
      .values({ name: 'E2E Org B', slug: `e2e-org-b-${randomUUID()}` })
      .returning();
    orgBId = orgB.id;
    insertedOrgs.push(orgBId);

    const [userA] = await db
      .insert(users)
      .values({
        name: 'User A',
        email: `user-a-${randomUUID()}@e2e.test`,
        password: hashedPassword,
        organizationId: orgAId,
        isActive: true,
      })
      .returning();
    userAId = userA.id;
    insertedUsers.push(userAId);

    const [userB] = await db
      .insert(users)
      .values({
        name: 'User B',
        email: `user-b-${randomUUID()}@e2e.test`,
        password: hashedPassword,
        organizationId: orgBId,
        isActive: true,
      })
      .returning();
    userBId = userB.id;
    insertedUsers.push(userBId);

    const [ep] = await db
      .insert(webhookEndpoints)
      .values({
        organizationId: orgAId,
        url: 'https://hooks.example.com/org-a',
        secret: randomUUID(),
        description: 'Org A test endpoint',
        isActive: true,
        events: ['user.created'],
        createdById: userAId,
      })
      .returning();
    endpointAId = ep.id;
    insertedEndpoints.push(endpointAId);

    tokenA = jwtService.sign({ sub: userAId, jti: randomUUID() });
    tokenB = jwtService.sign({ sub: userBId, jti: randomUUID() });
  });

  afterAll(async () => {
    for (const id of insertedEndpoints) {
      await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, id));
    }
    for (const id of insertedUsers) {
      await db.delete(users).where(eq(users.id, id));
    }
    for (const id of insertedOrgs) {
      await db.delete(organizations).where(eq(organizations.id, id));
    }

    await app.close();
    await pool.end();
  });

  describe('User A (Org A owner)', () => {
    it('GET /webhook-endpoints → 200 with Org A endpoint', async () => {
      const res = await request(app.getHttpServer())
        .get('/webhook-endpoints')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const ids = res.body.map((e: any) => e.id);
      expect(ids).toContain(endpointAId);
    });

    it('GET /webhook-endpoints/:id → 200 for own endpoint', async () => {
      const res = await request(app.getHttpServer())
        .get(`/webhook-endpoints/${endpointAId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.id).toBe(endpointAId);
      expect(res.body.organizationId).toBe(orgAId);
    });
  });

  describe('User B (Org B) — cross-tenant isolation', () => {
    it('GET /webhook-endpoints → 200 with empty array (no Org A data leaked)', async () => {
      const res = await request(app.getHttpServer())
        .get('/webhook-endpoints')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const ids = res.body.map((e: any) => e.id);
      expect(ids).not.toContain(endpointAId);
    });

    it('GET /webhook-endpoints/:id → 404 for Org A endpoint', async () => {
      await request(app.getHttpServer())
        .get(`/webhook-endpoints/${endpointAId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });

    it('PATCH /webhook-endpoints/:id → 404, Org A endpoint unchanged', async () => {
      await request(app.getHttpServer())
        .patch(`/webhook-endpoints/${endpointAId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ description: 'hacked by B' })
        .expect(404);

      const [ep] = await db
        .select()
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.id, endpointAId))
        .limit(1);

      expect(ep.description).toBe('Org A test endpoint');
    });

    it('DELETE /webhook-endpoints/:id → 404, Org A endpoint still exists in DB', async () => {
      await request(app.getHttpServer())
        .delete(`/webhook-endpoints/${endpointAId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);

      const [ep] = await db
        .select()
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.id, endpointAId))
        .limit(1);

      expect(ep).toBeDefined();
      expect(ep.id).toBe(endpointAId);
    });
  });

  describe('Unauthenticated', () => {
    it('GET /webhook-endpoints → 401 without token', async () => {
      await request(app.getHttpServer()).get('/webhook-endpoints').expect(401);
    });

    it('GET /webhook-endpoints/:id → 401 without token', async () => {
      await request(app.getHttpServer())
        .get(`/webhook-endpoints/${endpointAId}`)
        .expect(401);
    });
  });

  describe('User without organizationId (TenantGuard)', () => {
    let tokenNoOrg: string;
    let userNoOrgId: string;
    const insertedNoOrgUsers: string[] = [];

    beforeAll(async () => {
      const hashedPassword = await argon2.hash('Test@1234', {
        type: argon2.argon2id,
        memoryCost: 1024,
        timeCost: 1,
        parallelism: 1,
      });

      const [userNoOrg] = await db
        .insert(users)
        .values({
          name: 'User No Org',
          email: `user-noorg-${randomUUID()}@e2e.test`,
          password: hashedPassword,
          organizationId: null,
          isActive: true,
        })
        .returning();

      userNoOrgId = userNoOrg.id;
      insertedNoOrgUsers.push(userNoOrgId);
      insertedUsers.push(userNoOrgId);

      tokenNoOrg = jwtService.sign({ sub: userNoOrgId, jti: randomUUID() });
    });

    it('GET /webhook-endpoints → 403 (no tenant context)', async () => {
      await request(app.getHttpServer())
        .get('/webhook-endpoints')
        .set('Authorization', `Bearer ${tokenNoOrg}`)
        .expect(403);
    });
  });

  describe('Direct DB verification', () => {
    it('Org A endpoint has organizationId = orgAId (not orgBId)', async () => {
      const [ep] = await db
        .select()
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.id, endpointAId))
        .limit(1);

      expect(ep.organizationId).toBe(orgAId);
      expect(ep.organizationId).not.toBe(orgBId);
    });

    it('User A has organizationId = orgAId', async () => {
      const [user] = await db
        .select({ organizationId: users.organizationId })
        .from(users)
        .where(eq(users.id, userAId))
        .limit(1);

      expect(user.organizationId).toBe(orgAId);
    });

    it('User B has organizationId = orgBId', async () => {
      const [user] = await db
        .select({ organizationId: users.organizationId })
        .from(users)
        .where(eq(users.id, userBId))
        .limit(1);

      expect(user.organizationId).toBe(orgBId);
    });
  });
});
