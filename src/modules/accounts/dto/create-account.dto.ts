import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

import { AccountType } from 'src/database/enums/account-type.enum';

export class CreateAccountDto {
  @ApiProperty({
    example: 'BCA Main Account',
    description: 'Name of the financial account.',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    enum: AccountType,
    example: AccountType.BANK,
    description: 'Type of the financial account.',
  })
  @IsEnum(AccountType)
  type!: AccountType;

  @ApiPropertyOptional({
    example: 1500000,
    description:
      'Initial balance of the account. Must be greater than or equal to 0.',
    minimum: 0,
    default: 0,
  })
  @IsOptional()
  @IsNumber(
    {
      maxDecimalPlaces: 4,
    },
    {
      message: 'openingBalance must be a valid number with up to 4 decimals',
    },
  )
  @Min(0)
  openingBalance?: number;

  @ApiPropertyOptional({
    example: 'IDR',
    description: 'ISO 4217-style three-letter currency code.',
    default: 'IDR',
    minLength: 3,
    maxLength: 3,
  })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be exactly 3 uppercase letters',
  })
  currency?: string;
}
