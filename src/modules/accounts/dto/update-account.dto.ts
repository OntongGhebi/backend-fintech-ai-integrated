import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

import { AccountType } from 'src/database/enums/account-type.enum';

export class UpdateAccountDto {
  @ApiPropertyOptional({
    example: 'BCA Personal Account',
    description: 'Updated name of the financial account.',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    enum: AccountType,
    example: AccountType.BANK,
    description: 'Updated type of the financial account.',
  })
  @IsOptional()
  @IsEnum(AccountType)
  type?: AccountType;

  @ApiPropertyOptional({
    example: 'IDR',
    description: 'Updated three-letter currency code.',
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
