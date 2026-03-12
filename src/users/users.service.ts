import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DatabaseService } from '@/database/database.service';
import { users, User } from '@/database/schema/users.schema';
import { CreateUserDto } from './dto/create-user.dto';

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

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

  async findAll(): Promise<User[]> {
    return this.dbService.db.select().from(users);
  }

  async findOne(email: string): Promise<User | undefined> {
    const [user] = await this.dbService.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return user;
  }

  async findById(id: string): Promise<User | undefined> {
    const [user] = await this.dbService.db
      .select()
      .from(users)
      .where(eq(users.id, id))
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
      .set({ deletedAt: new Date() })
      .where(eq(users.id, id));
  }
}
