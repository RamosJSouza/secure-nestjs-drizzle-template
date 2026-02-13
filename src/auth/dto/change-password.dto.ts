import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({
    minLength: 8,
    example: 'NewSecureP@ssw0rd123',
    description: 'New password (min 8 characters)',
    required: true,
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  newPassword: string;
}
