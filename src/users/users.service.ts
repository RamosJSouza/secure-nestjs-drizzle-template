import { Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DatabaseService } from '@/database/database.service';
import { users, User } from '@/database/schema/users.schema';
import { sessions } from '@/database/schema/sessions.schema';
import { TokenRevocationService } from '@/security/token-revocation/token-revocation.service';
import { RequestContext } from '@/logger/request-context';
import { CreateUserDto } from './dto/create-user.dto';

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

const SAFE_FIELDS = {
  id: users.id,
  email: users.email,
  name: users.name,
  roleId: users.roleId,
  organizationId: users.organizationId,
  isActive: users.isActive,
  failedLoginAttempts: users.failedLoginAttempts,
  lockedUntil: users.lockedUntil,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
  deletedAt: users.deletedAt,
  emailVerifiedAt: users.emailVerifiedAt,
  passwordChangedAt: users.passwordChangedAt,
};

@Injectable()
export class UsersService {
  constructor(
    private readonly dbService: DatabaseService,
    private readonly tokenRevocationService: TokenRevocationService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const [user] = await this.dbService.db
      .insert(users)
      .values({
        name: createUserDto.name,
        email: createUserDto.email,
        password: createUserDto.password,
        roleId: createUserDto.roleId ?? null,
      })
      .returning();
    return user;
  }

  async findAll(): Promise<Omit<User, 'password'>[]> {
    const organizationId = RequestContext.getOrganizationId();
    return this.dbService.db
      .select(SAFE_FIELDS)
      .from(users)
      .where(and(isNull(users.deletedAt), organizationId ? eq(users.organizationId, organizationId) : undefined));
  }

  async findOneByIdForAuth(id: string): Promise<User | undefined> {
    const [user] = await this.dbService.db
      .select()
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);
    return user;
  }

  async findOne(email: string): Promise<User | undefined> {
    const [user] = await this.dbService.db
      .select()
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);
    return user;
  }

  async findById(id: string): Promise<Omit<User, 'password'> | undefined> {
    const [user] = await this.dbService.db
      .select(SAFE_FIELDS)
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);
    return user;
  }

  async recordFailedLogin(userId: string): Promise<{ failedLoginAttempts: number; lockedUntil: Date | null }> {
    return this.dbService.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ failedLoginAttempts: sql`${users.failedLoginAttempts} + 1` })
        .where(eq(users.id, userId));

      const [updated] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);

      if (!updated) throw new Error('User not found');

      const now = new Date();
      const shouldLock = updated.failedLoginAttempts >= LOCKOUT_THRESHOLD && (!updated.lockedUntil || updated.lockedUntil <= now);

      if (shouldLock) {
        const lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MS);
        await tx.update(users).set({ lockedUntil }).where(eq(users.id, userId));
        return { failedLoginAttempts: updated.failedLoginAttempts, lockedUntil };
      }

      return {
        failedLoginAttempts: updated.failedLoginAttempts,
        lockedUntil: updated.lockedUntil ?? null,
      };
    });
  }

  async resetFailedLogin(userId: string): Promise<void> {
    await this.dbService.db.update(users).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, userId));
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    const now = new Date();
    await this.dbService.db
      .update(users)
      .set({ password: hashedPassword, passwordChangedAt: now, updatedAt: now })
      .where(eq(users.id, userId));
  }

  async markEmailVerified(userId: string): Promise<void> {
    const now = new Date();
    await this.dbService.db
      .update(users)
      .set({ emailVerifiedAt: now, updatedAt: now })
      .where(eq(users.id, userId));
  }

  async remove(id: string): Promise<void> {
    const failClosed = this.tokenRevocationService.isFailClosedEnabled();

    await this.dbService.db.transaction(async (tx) => {
      await tx.update(users).set({ deletedAt: new Date(), isActive: false }).where(eq(users.id, id));

      const revoked = await tx
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, id), isNull(sessions.revokedAt)))
        .returning({
          id: sessions.id,
          accessTokenJti: sessions.accessTokenJti,
          refreshTokenJti: sessions.refreshTokenJti,
        });

      await this.tokenRevocationService.revokeSessionJtis(revoked, failClosed);
    });
  }
}
