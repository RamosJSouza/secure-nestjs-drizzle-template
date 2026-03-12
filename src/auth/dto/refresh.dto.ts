import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshDto {
  @ApiProperty({
    example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Refresh token received from login or previous refresh',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(2048, { message: 'Token must not exceed 2048 characters' })
  refresh_token: string;
}
