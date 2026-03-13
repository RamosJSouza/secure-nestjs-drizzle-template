import { Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DatabaseService } from '@/database/database.service';
import { users, User } from '@/database/schema/users.schema';
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
};

@Injectable()
export class UsersService {
  constructor(private readonly dbService: DatabaseService) {}

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
    return this.dbService.db
      .select(SAFE_FIELDS)
      .from(users)
      .where(isNull(users.deletedAt));
  }

  /**
   * Find an active, non-deleted user by ID.
   * Returns the full row (including password hash) for auth verification only.
   * Used exclusively by changePassword to verify the current password.
   * Callers outside of auth flows must NOT expose this object to clients.
   */
  async findOneByIdForAuth(id: string): Promise<User | undefined> {
    const [user] = await this.dbService.db
      .select()
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);
    return user;
  }

  /**
   * Find an active, non-deleted user by email.
   * Returns the full row (including password hash) for auth verification only.
   * Callers outside of auth flows must NOT expose this object to clients.
   */
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

  async recordFailedLogin(
    userId: string,
  ): Promise<{ failedLoginAttempts: number; lockedUntil: Date | null }> {
    return this.dbService.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ failedLoginAttempts: sql`${users.failedLoginAttempts} + 1` })
        .where(eq(users.id, userId));

      const [updated] = await tx
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!updated) throw new Error('User not found');

      const now = new Date();
      const shouldLock =
        updated.failedLoginAttempts >= LOCKOUT_THRESHOLD &&
        (!updated.lockedUntil || updated.lockedUntil <= now);

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
    await this.dbService.db
      .update(users)
      .set({ failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(users.id, userId));
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await this.dbService.db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, userId));
  }

  async remove(id: string): Promise<void> {
    await this.dbService.db
      .update(users)
      .set({ deletedAt: new Date(), isActive: false })
      .where(eq(users.id, id));
  }
}
