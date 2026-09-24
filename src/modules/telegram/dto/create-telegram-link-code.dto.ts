import { ApiProperty } from '@nestjs/swagger';

export class CreateTelegramLinkCodeDto {
  @ApiProperty({
    description:
      'Request body is intentionally empty. Authentication identifies the user.',
    required: false,
  })
  readonly _?: never;
}
