import { ApiProperty } from '@nestjs/swagger';

import { AccountType } from 'src/database/enums/account-type.enum';

export class AccountResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '8f5c4c0d-7d6d-4c8f-9b7d-6a8f4d3e2c1b',
  })
  id!: string;

  @ApiProperty({
    format: 'uuid',
    example: '1f4e7a0b-3c2d-4e5f-8a9b-0c1d2e3f4a5b',
  })
  userId!: string;

  @ApiProperty({
    example: 'BCA Main Account',
  })
  name!: string;

  @ApiProperty({
    enum: AccountType,
    example: AccountType.BANK,
  })
  type!: AccountType;

  @ApiProperty({
    example: '1500000.0000',
    description: 'Opening balance represented as a decimal string.',
  })
  openingBalance!: string;

  @ApiProperty({
    example: 'IDR',
  })
  currency!: string;

  @ApiProperty({
    example: true,
  })
  isActive!: boolean;

  @ApiProperty({
    format: 'date-time',
    example: '2026-09-11T10:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    format: 'date-time',
    example: '2026-09-11T10:00:00.000Z',
  })
  updatedAt!: Date;
}
