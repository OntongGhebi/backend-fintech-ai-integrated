import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { DashboardService } from './dashboard.service';

interface AuthenticatedRequest extends Request {
  user: {
    sub: string;
  };
}

@Controller('dashboard')
@UseGuards(AccessTokenGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('architecture')
  getArchitectture(@Req() request: AuthenticatedRequest) {
    return {
      userId: request.user.sub,
      ...this.dashboardService.getArchitecture(),
    };
  }
}
