import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/auth/strategy/jwt-auth.guard';
import { TenantGuard } from '@/tenant/tenant.guard';
import { RequireTenant } from '@/tenant/require-tenant.decorator';
import { WebhookEndpointsService } from './webhook-endpoints.service';
import { CreateWebhookEndpointDto } from './dto/create-webhook-endpoint.dto';
import { UpdateWebhookEndpointDto } from './dto/update-webhook-endpoint.dto';

@Controller('webhook-endpoints')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequireTenant()
export class WebhookEndpointsController {
  constructor(private readonly webhookEndpointsService: WebhookEndpointsService) {}

  @Get()
  findAll() {
    return this.webhookEndpointsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.webhookEndpointsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateWebhookEndpointDto, @Request() req: any) {
    return this.webhookEndpointsService.create(dto, req.user?.id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWebhookEndpointDto) {
    return this.webhookEndpointsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.webhookEndpointsService.remove(id);
  }
}
