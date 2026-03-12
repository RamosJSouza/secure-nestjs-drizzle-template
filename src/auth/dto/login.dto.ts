import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email',
    required: true,
  })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'P@ssw0rd123',
    description: 'User password',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  // MaxLength prevents Argon2id DoS: hashing a multi-MB password consumes
  // 64 MiB RAM + 3 CPU iterations per request. 72 matches bcrypt/argon2 practical limit.
  @MaxLength(72, { message: 'Password must not exceed 72 characters' })
  password: string;
}
