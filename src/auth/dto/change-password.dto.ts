import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({
    example: 'CurrentP@ssw0rd',
    description: 'Current password for verification',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(72, { message: 'Password must not exceed 72 characters' })
  currentPassword: string;

  @ApiProperty({
    minLength: 8,
    example: 'NewSecureP@ssw0rd123',
    description: 'New password (min 8 chars, must include uppercase, lowercase, and digit)',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72, { message: 'Password must not exceed 72 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  newPassword: string;
}
