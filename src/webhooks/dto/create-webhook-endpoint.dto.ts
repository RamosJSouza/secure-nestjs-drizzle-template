import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  ArrayMaxSize,
} from 'class-validator';

export class CreateWebhookEndpointDto {
  @IsUrl({ require_tld: false })
  url: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  events: string[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
