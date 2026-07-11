import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { OpaqueTokenDto } from './opaque-token.dto';

export class ResetPasswordDto extends OpaqueTokenDto {
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain uppercase, lowercase, and digit',
  })
  newPassword!: string;
}
