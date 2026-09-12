import { ApiProperty } from '@nestjs/swagger';

import { TransactionResponseDto } from './transaction-response.dto';

export class TransactionListMetaDto {
  @ApiProperty({
    example: 1,
  })
  page!: number;

  @ApiProperty({
    example: 20,
  })
  limit!: number;

  @ApiProperty({
    example: 35,
  })
  total!: number;

  @ApiProperty({
    example: 2,
  })
  totalPages!: number;
}

export class TransactionListResponseDto {
  @ApiProperty({
    type: TransactionResponseDto,
    isArray: true,
  })
  data!: TransactionResponseDto[];

  @ApiProperty({
    type: TransactionListMetaDto,
  })
  meta!: TransactionListMetaDto;
}
