import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { LoginDto } from './login.dto';
import { RegisterDto } from './register.dto';
import { RefreshTokenDto } from './refresh-token.dto';
import { VerifyEmailDto } from './verify-email.dto';

describe('Auth DTO validation', () => {
  describe('RegisterDto', () => {
    it('should accept valid registration data', async () => {
      const dto = plainToInstance(RegisterDto, {
        name: 'Ghebi Armando',
        email: 'ghebi@example.com',
        password: 'password123',
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should reject invalid email', async () => {
      const dto = plainToInstance(RegisterDto, {
        name: 'Ghebi Armando',
        email: 'invalid-email',
        password: 'password123',
      });

      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject password shorter than 8 characters', async () => {
      const dto = plainToInstance(RegisterDto, {
        name: 'Ghebi Armando',
        email: 'ghebi@example.com',
        password: '1234567',
      });

      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject password longer than 128 characters', async () => {
      const dto = plainToInstance(RegisterDto, {
        name: 'Ghebi Armando',
        email: 'ghebi@example.com',
        password: 'a'.repeat(129),
      });

      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject empty name', async () => {
      const dto = plainToInstance(RegisterDto, {
        name: '',
        email: 'ghebi@example.com',
        password: 'password123',
      });

      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject name longer than 100 characters', async () => {
      const dto = plainToInstance(RegisterDto, {
        name: 'a'.repeat(101),
        email: 'ghebi@example.com',
        password: 'password123',
      });

      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('LoginDto', () => {
    it('should accept valid login data', async () => {
      const dto = plainToInstance(LoginDto, {
        email: 'ghebi@example.com',
        password: 'password123',
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should reject invalid email', async () => {
      const dto = plainToInstance(LoginDto, {
        email: 'invalid-email',
        password: 'password123',
      });

      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject short password', async () => {
      const dto = plainToInstance(LoginDto, {
        email: 'ghebi@example.com',
        password: '1234567',
      });

      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('RefreshTokenDto', () => {
    it('should accept valid refresh token', async () => {
      const dto = plainToInstance(RefreshTokenDto, {
        refreshToken: 'refresh-token',
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should reject empty refresh token', async () => {
      const dto = plainToInstance(RefreshTokenDto, {
        refreshToken: '',
      });

      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject oversized refresh token', async () => {
      const dto = plainToInstance(RefreshTokenDto, {
        refreshToken: 'a'.repeat(4097),
      });

      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('VerifyEmailDto', () => {
    it('should accept valid verification token', async () => {
      const dto = plainToInstance(VerifyEmailDto, {
        token: 'verification-token',
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('should reject empty verification token', async () => {
      const dto = plainToInstance(VerifyEmailDto, {
        token: '',
      });

      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject oversized verification token', async () => {
      const dto = plainToInstance(VerifyEmailDto, {
        token: 'a'.repeat(4097),
      });

      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
