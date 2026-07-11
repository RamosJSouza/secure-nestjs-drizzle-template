import { Body, Controller, Post, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { PasswordRecoveryService } from './services/password-recovery.service';
import { EmailVerificationService } from './services/email-verification.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from './strategy/jwt-auth.guard';
import { PermissionGuard, RequirePermissions } from '@/common/guards/permission.guard';
import { Auditable } from '@/modules/audit/decorators/auditable.decorator';
import { CurrentUser, ClientContext, ClientContextData } from '@/common/decorators';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private passwordRecoveryService: PasswordRecoveryService,
    private emailVerificationService: EmailVerificationService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { ttl: 60_000, limit: 5 } })
  @ApiOperation({
    summary: 'User login',
    description: 'Authenticates a user and returns access and refresh tokens.',
  })
  @ApiOkResponse({ description: 'Login successful, returns access_token and refresh_token' })
  @ApiBadRequestResponse({ description: 'Invalid email or password' })
  async login(@Body() dto: LoginDto, @ClientContext() client: ClientContextData) {
    return this.authService.login(dto, client.ip, client.userAgent);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { ttl: 60_000, limit: 10 } })
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Exchanges a valid refresh token for new access and refresh tokens.',
  })
  @ApiOkResponse({ description: 'New access_token and refresh_token' })
  @ApiBadRequestResponse({ description: 'Invalid or expired refresh token' })
  async refresh(@Body() dto: RefreshDto, @ClientContext() client: ClientContextData) {
    return this.authService.refresh(dto, client.ip, client.userAgent);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Logout',
    description: 'Revokes the provided refresh token, invalidating the current session.',
  })
  @ApiNoContentResponse({ description: 'Session revoked successfully' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async logout(@Body() dto: RefreshDto, @CurrentUser('id') userId: string) {
    await this.authService.logout(userId, dto.refresh_token);
  }

  @Post('register')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @SkipThrottle({ auth: true })
  @ApiTags('auth', 'Users')
  @ApiOperation({
    summary: 'Create user (admin only)',
    description: 'Registers a new user. Requires users:create permission.',
  })
  @ApiCreatedResponse({ description: 'User created successfully' })
  @ApiBadRequestResponse({ description: 'Invalid request body or validation error' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'User lacks users:create permission' })
  @RequirePermissions('users:create')
  @Auditable('user.create', 'User', { entityIdFromResult: 'userId' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change password',
    description: 'Changes the password of the authenticated user.',
  })
  @ApiOkResponse({ description: 'Password changed successfully' })
  @ApiBadRequestResponse({ description: 'Invalid password format' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @Auditable('user.change_password', 'User', { entityIdFromResult: 'userId' })
  async changePassword(@Body() dto: ChangePasswordDto, @CurrentUser('id') userId: string, @ClientContext() client: ClientContextData) {
    return this.authService.changePassword(userId, dto.currentPassword, dto.newPassword, client.ip, client.userAgent);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ auth: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Request password reset email' })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @ClientContext() client: ClientContextData) {
    await this.passwordRecoveryService.forgotPassword(dto, client.ip);
    return { message: 'If the email exists, password reset instructions were sent.' };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { ttl: 60_000, limit: 10 } })
  @Auditable('auth.password.reset', 'User', { entityIdFromResult: 'userId' })
  async resetPassword(@Body() dto: ResetPasswordDto, @ClientContext() client: ClientContextData) {
    return this.passwordRecoveryService.resetPassword(dto, client.ip);
  }

  @Post('send-verification')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ auth: { ttl: 60_000, limit: 5 } })
  @ApiBearerAuth()
  async sendVerification(@CurrentUser('id') userId: string) {
    await this.emailVerificationService.sendVerification(userId);
    return { message: 'If eligible, a verification email was sent.' };
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Auditable('auth.email.verified', 'User', { entityIdFromResult: 'userId' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.emailVerificationService.verifyEmail(dto.token);
  }
}
