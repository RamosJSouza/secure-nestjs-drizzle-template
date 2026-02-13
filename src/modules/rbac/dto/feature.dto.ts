import { IsString, IsBoolean, IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateFeatureDto {
    @ApiProperty({
        example: 'financial_dashboard',
        description: 'Unique feature key (snake_case)',
        required: true,
    })
    @IsString()
    key: string;

    @ApiProperty({
        example: 'Dashboard Financeiro',
        description: 'Human-readable feature name',
        required: true,
    })
    @IsString()
    name: string;

    @ApiPropertyOptional({
        example: 'Dashboard com métricas financeiras',
        description: 'Feature description',
    })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({
        default: true,
        example: true,
        description: 'Whether the feature is active',
    })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

export class UpdateFeatureDto {
    @ApiPropertyOptional({ example: 'financial_dashboard_v2' })
    @IsOptional()
    @IsString()
    key?: string;

    @ApiPropertyOptional({ example: 'Dashboard Financeiro (v2)' })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({ example: 'Updated description' })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ example: true })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

export class QueryFeatureDto {
    @ApiPropertyOptional({ default: 1, minimum: 1, example: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @ApiPropertyOptional({ default: 10, minimum: 1, example: 10 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number;

    @ApiPropertyOptional({ example: 'financial', description: 'Search in key and name' })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({ example: true, description: 'Filter by active status' })
    @IsOptional()
    @IsBoolean()
    @Type(() => Boolean)
    isActive?: boolean;
}

/** Response DTO for Feature operations */
export class FeatureResponseDto {
    @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
    id: string;

    @ApiProperty({ example: 'financial_dashboard' })
    key: string;

    @ApiProperty({ example: 'Dashboard Financeiro' })
    name: string;

    @ApiPropertyOptional({ example: 'Dashboard com métricas financeiras' })
    description?: string;

    @ApiProperty({ example: true })
    isActive: boolean;

    @ApiProperty()
    createdAt: Date;

    @ApiProperty()
    updatedAt: Date;
}
