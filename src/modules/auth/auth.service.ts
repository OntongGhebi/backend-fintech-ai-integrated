import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { PasswordService } from './services/password.service';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  async register(registerDto: RegisterDto) {
    const email = registerDto.email.trim().toLowerCase();
    const name = registerDto.name.trim();

    const existingUser = await this.prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    });

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await this.passwordService.hash(registerDto.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          name,
        },
        select: {
          id: true,
          email: true,
          name: true,
          emailVerifiedAt: true,
        },
      });
      await tx.userPreference.create({
        data: {
          userId: createdUser.id,
        },
      });

      return createdUser;
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerifiedAt !== null,
    };
  }
}
