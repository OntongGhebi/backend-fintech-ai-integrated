import { ApiProperty } from '@nestjs/swagger';

import { UserSessionResponseDto } from './user-session-response.dto';

export class UserSessionsResponseDto {
  @ApiProperty({
    type: [UserSessionResponseDto],
  })
  sessions!: UserSessionResponseDto[];
}
