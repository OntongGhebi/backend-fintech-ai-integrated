import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { CurrentUser } from '../auth/decorators/current-user-decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { UsersService } from './users.service';
import { UserProfileResponseDto } from './dto/user-profile-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePreferencesDto } from './dto/update-preference.dto';
import { UserPreferencesResponseDto } from './dto/user-preferences-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('users')
@ApiTags('Users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Returns the authenticated user profile and user preferences.',
  })
  @ApiResponse({
    status: 200,
    description: 'Current user profile retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token.',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async getProfile(
    @CurrentUser() userId: string,
  ): Promise<UserProfileResponseDto> {
    return (await this.usersService.getProfile(
      userId,
    )) as UserProfileResponseDto;
  }

  @Patch('me')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update current user profile',
    description:
      'Updates the authenticated user profile. Changing the email address requires email verification again.',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile updated successfully.',
    type: UserProfileResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data.',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token.',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
  })
  @ApiResponse({
    status: 409,
    description: 'Email already registered.',
  })
  async updateProfile(
    @CurrentUser() userId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfileResponseDto> {
    return (await this.usersService.updateProfile(
      userId,
      dto,
    )) as UserProfileResponseDto;
  }

  @Get('me/preferences')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user preferences',
    description: 'Returns the authenticated user preferences.',
  })
  @ApiResponse({
    status: 200,
    description: 'User preferences retrieved successfully.',
    type: UserPreferencesResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token.',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
  })
  async getPreferences(
    @CurrentUser() userId: string,
  ): Promise<UserPreferencesResponseDto> {
    return (await this.usersService.getPreferences(
      userId,
    )) as UserPreferencesResponseDto;
  }

  @Patch('me/preferences')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update current user preferences',
    description: 'Updates the authenticated user preferences.',
  })
  @ApiResponse({
    status: 200,
    description: 'User preferences updated successfully.',
    type: UserPreferencesResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data.',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token.',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
  })
  async updatePreferences(
    @CurrentUser() userId: string,
    @Body() dto: UpdatePreferencesDto,
  ): Promise<UserPreferencesResponseDto> {
    return (await this.usersService.updatePreferences(
      userId,
      dto,
    )) as UserPreferencesResponseDto;
  }

  @Patch('me/password')
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change current user password',
    description:
      'Changes the authenticated user password. All existing refresh-token sessions are revoked after a successful password change.',
  })
  @ApiResponse({
    status: 200,
    description: 'Password changed successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data.',
  })
  @ApiResponse({
    status: 401,
    description:
      'Missing or invalid access token or incorrect current password.',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
  })
  @ApiResponse({
    status: 409,
    description: 'New password must be different from the current password.',
  })
  async changePassword(
    @CurrentUser() userId: string,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    return this.usersService.changePassword(userId, dto);
  }
}
