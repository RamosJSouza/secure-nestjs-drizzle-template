import { IsString, IsUUID, IsOptional, IsNotEmpty, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePermissionDto {
  @ApiProperty()
  @IsUUID()
  featureId: string;

  @ApiProperty({ example: 'view' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-z0-9_-]+$/, {
    message: 'action must be lowercase alphanumeric with underscores/hyphens only',
  })
  action: string;

  @ApiProperty({ example: 'Pode Visualizar' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

export class UpdatePermissionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[a-z0-9_-]+$/, {
    message: 'action must be lowercase alphanumeric with underscores/hyphens only',
  })
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
