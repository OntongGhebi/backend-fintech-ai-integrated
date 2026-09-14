import { ApiProperty } from '@nestjs/swagger';

import { TransactionResponseDto } from './transaction-response.dto';

export class TransferResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '7e6d5c4b-3a2f-1e0d-9c8b-7a6f5e4d3c2b',
    description: 'Shared identifier of the two transaction records.',
  })
  transferGroupId!: string;

  @ApiProperty({
    type: TransactionResponseDto,
    isArray: true,
  })
  transactions!: TransactionResponseDto[];
}
