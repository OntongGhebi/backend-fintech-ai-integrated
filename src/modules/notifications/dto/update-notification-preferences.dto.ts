import { ApiPropertyOptional } from '@nestjs/swagger';
import { ValidateIf, IsBoolean } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({
    description: 'Aktifkan atau nonaktifkan notifikasi Telegram.',
    example: true,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  telegramEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Aktifkan atau nonaktifkan notifikasi email.',
    example: true,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  emailEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Aktifkan atau nonaktifkan peringatan anggaran.',
    example: true,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  budgetAlertEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Aktifkan atau nonaktifkan ringkasan harian.',
    example: false,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  dailySummaryEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Aktifkan atau nonaktifkan ringkasan mingguan.',
    example: false,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  weeklySummaryEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Aktifkan atau nonaktifkan ringkasan bulanan.',
    example: false,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  monthlySummaryEnabled?: boolean;
}
