import { ApiProperty } from '@nestjs/swagger';

import { NotificationResponseDto } from './notification-response.dto';

export class NotificationListMetaDto {
  @ApiProperty({
    example: 1,
    minimum: 1,
  })
  page!: number;

  @ApiProperty({
    example: 20,
    minimum: 1,
    maximum: 100,
  })
  limit!: number;

  @ApiProperty({
    example: 35,
    minimum: 0,
  })
  total!: number;

  @ApiProperty({
    example: 2,
    minimum: 0,
  })
  totalPages!: number;
}

export class NotificationListResponseDto {
  @ApiProperty({
    type: NotificationResponseDto,
    isArray: true,
  })
  data!: NotificationResponseDto[];

  @ApiProperty({
    type: NotificationListMetaDto,
  })
  meta!: NotificationListMetaDto;
}
