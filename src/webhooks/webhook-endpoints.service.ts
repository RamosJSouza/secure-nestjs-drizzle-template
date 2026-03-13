import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { TenantDatabaseService } from '@/tenant/tenant-database.service';
import { RequestContext } from '@/logger/request-context';
import { webhookEndpoints, WebhookEndpoint } from '@/database/schema/webhook-endpoints.schema';
import { CreateWebhookEndpointDto } from './dto/create-webhook-endpoint.dto';
import { UpdateWebhookEndpointDto } from './dto/update-webhook-endpoint.dto';

@Injectable()
export class WebhookEndpointsService {
  constructor(private readonly tenantDb: TenantDatabaseService) {}

  private get organizationId(): string {
    const orgId = RequestContext.getOrganizationId();
    if (!orgId) throw new Error('Organization context not set');
    return orgId;
  }

  async findAll(): Promise<WebhookEndpoint[]> {
    const orgId = this.organizationId;
    return this.tenantDb.withTenant(orgId, (tx) =>
      tx.select().from(webhookEndpoints).where(eq(webhookEndpoints.organizationId, orgId)),
    );
  }

  async findOne(id: string): Promise<WebhookEndpoint> {
    const orgId = this.organizationId;
    const [endpoint] = await this.tenantDb.withTenant(orgId, (tx) =>
      tx
        .select()
        .from(webhookEndpoints)
        .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.organizationId, orgId)))
        .limit(1),
    );
    if (!endpoint) throw new NotFoundException('Webhook endpoint not found');
    return endpoint;
  }

  async create(dto: CreateWebhookEndpointDto, createdById?: string): Promise<WebhookEndpoint> {
    const orgId = this.organizationId;
    const secret = randomBytes(32).toString('hex');
    const [endpoint] = await this.tenantDb.withTenant(orgId, (tx) =>
      tx
        .insert(webhookEndpoints)
        .values({
          organizationId: orgId,
          url: dto.url,
          secret,
          description: dto.description ?? null,
          isActive: dto.isActive ?? true,
          events: dto.events,
          createdById: createdById ?? null,
        })
        .returning(),
    );
    return endpoint;
  }

  async update(id: string, dto: UpdateWebhookEndpointDto): Promise<WebhookEndpoint> {
    const orgId = this.organizationId;
    const [endpoint] = await this.tenantDb.withTenant(orgId, (tx) =>
      tx
        .update(webhookEndpoints)
        .set({ ...dto, updatedAt: new Date() })
        .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.organizationId, orgId)))
        .returning(),
    );
    if (!endpoint) throw new NotFoundException('Webhook endpoint not found');
    return endpoint;
  }

  async remove(id: string): Promise<void> {
    const orgId = this.organizationId;
    const result = await this.tenantDb.withTenant(orgId, (tx) =>
      tx
        .delete(webhookEndpoints)
        .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.organizationId, orgId)))
        .returning({ id: webhookEndpoints.id }),
    );
    if (!result.length) throw new NotFoundException('Webhook endpoint not found');
  }
}
