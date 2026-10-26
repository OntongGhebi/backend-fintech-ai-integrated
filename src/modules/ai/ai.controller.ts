import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user-decorator';

import { AIChatService } from './services/ai-chat.service';
import { AIConversationService } from './services/ai-conversation.service';

import { CreateAIConversationDto } from './dto/create-ai-conversation.dto';
import { SendAIMessageDto } from './dto/send-ai-message.dto';
import { UpdateAIConversationDto } from './dto/update-ai-conversation.dto';

@Controller('ai')
@ApiTags('AI Assistant')
@UseGuards(AccessTokenGuard)
@ApiBearerAuth()
export class AiController {
  constructor(
    private readonly aiConversationService: AIConversationService,
    private readonly aiChatService: AIChatService,
  ) {}

  @Post('conversations')
  @ApiOperation({ summary: 'Create an AI conversation' })
  @ApiCreatedResponse({
    description: 'AI conversation created successfully',
  })
  async createConversation(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAIConversationDto,
  ) {
    return this.aiConversationService.createConversation(userId, dto.title);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'List the authenticated user AI conversations' })
  @ApiOkResponse({
    description: 'AI conversations ordered by most recently updated',
  })
  async findConversations(@CurrentUser('id') userId: string) {
    return this.aiConversationService.findMany(userId);
  }

  @Get('conversations/:id')
  @ApiOperation({
    summary: 'Get an AI conversation and its messages',
  })
  @ApiOkResponse({
    description: 'Conversation with messages in chronological order',
  })
  async findConversation(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) conversationId: string,
  ) {
    return this.aiConversationService.findById(userId, conversationId);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({
    summary: 'Send a message to the AI assistant',
    description:
      'Optionally accepts Idempotency-Key to safely retry the same chat request.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Client-generated key, 8–128 characters. Reuse the same key only for retries of the same message.',
    schema: {
      type: 'string',
      minLength: 8,
      maxLength: 128,
    },
  })
  @ApiCreatedResponse({
    description: 'AI response generated and persisted successfully',
  })
  async sendMessage(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) conversationId: string,
    @Body() dto: SendAIMessageDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.aiChatService.sendMessage(
      userId,
      conversationId,
      dto.content,
      idempotencyKey,
    );
  }

  @Patch('conversations/:id')
  @ApiOperation({ summary: 'Update an AI conversation title' })
  @ApiOkResponse({
    description: 'AI conversation title updated successfully',
  })
  async updateConversation(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) conversationId: string,
    @Body() dto: UpdateAIConversationDto,
  ) {
    return this.aiConversationService.updateTitle(
      userId,
      conversationId,
      dto.title,
    );
  }

  @Delete('conversations/:id')
  @ApiOperation({ summary: 'Delete an AI conversation' })
  @ApiOkResponse({
    description: 'Conversation and its related messages deleted',
    schema: {
      example: {
        message: 'AI conversation deleted successfully',
      },
    },
  })
  async removeConversation(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) conversationId: string,
  ): Promise<{ message: string }> {
    return this.aiConversationService.remove(userId, conversationId);
  }
}
