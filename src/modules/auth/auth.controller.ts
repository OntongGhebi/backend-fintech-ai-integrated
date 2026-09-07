import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';

import { VerifyEmailDto } from './dto/verify-email.dto';
import { EmailVerificationService } from './services/email-verification.service';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new user',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'User successfully registered',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid registration data',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Email is already registered',
  })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify user email address',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Email successfully verified',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Invalid verification token',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Verification token is expired or already used',
  })
  async verifyEmail(@Body() verifyEmailDto: VerifyEmailDto) {
    await this.emailVerificationService.verifyEmail(verifyEmailDto.token);

    return {
      message: 'Email verified successfully',
    };
  }
}
