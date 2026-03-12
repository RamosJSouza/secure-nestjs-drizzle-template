import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { eq, ilike, or, and, desc, count } from 'drizzle-orm';
import { DatabaseService } from '@/database/database.service';
import { features, Feature } from '@/database/schema/features.schema';
import { CreateFeatureDto, UpdateFeatureDto, QueryFeatureDto } from '../dto/feature.dto';

@Injectable()
export class FeatureService {
  private readonly logger = new Logger(FeatureService.name);

  constructor(private readonly dbService: DatabaseService) {}

  private get db() {
    return this.dbService.db;
  }

  async create(dto: CreateFeatureDto): Promise<Feature> {
    this.logger.debug(`Creating feature: ${dto.key}`);
    try {
      const [feature] = await this.db.insert(features).values(dto).returning();
      return feature;
    } catch (err) {
      if (err.code === '23505') {
        throw new ConflictException(`Feature with key "${dto.key}" already exists`);
      }
      throw err;
    }
  }

  async findAll(query: QueryFeatureDto): Promise<{ data: Feature[]; total: number }> {
    const { page = 1, limit = 10, search, isActive } = query;
    const offset = (page - 1) * limit;

    const conditions = [];

    if (search) {
      conditions.push(
        or(ilike(features.name, `%${search}%`), ilike(features.key, `%${search}%`)),
      );
    }

    if (isActive !== undefined) {
      conditions.push(eq(features.isActive, isActive));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, [{ value: total }]] = await Promise.all([
      this.db.query.features.findMany({
        with: { permissions: true },
        where,
        orderBy: desc(features.createdAt),
        limit,
        offset,
      }),
      this.db.select({ value: count() }).from(features).where(where),
    ]);

    return { data, total };
  }

  async findOne(id: string): Promise<Feature> {
    const feature = await this.db.query.features.findFirst({
      with: { permissions: true },
      where: eq(features.id, id),
    });

    if (!feature) {
      throw new NotFoundException(`Feature with ID "${id}" not found`);
    }

    return feature;
  }

  async update(id: string, dto: UpdateFeatureDto): Promise<Feature> {
    const [updated] = await this.db
      .update(features)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(features.id, id))
      .returning({ id: features.id });

    if (!updated) {
      throw new NotFoundException(`Feature ${id} not found`);
    }

    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    try {
      await this.db.delete(features).where(eq(features.id, id));
    } catch (err) {
      if (err.code === '23503') {
        throw new ConflictException(
          'Cannot delete feature with existing permissions assigned to roles',
        );
      }
      throw err;
    }
  }
}
