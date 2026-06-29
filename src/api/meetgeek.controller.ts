import {
  Controller,
  Get,
  Param,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { MeetGeekClient } from '@waha/core/integrations/meetgeek/MeetGeekClient';
import {
  MeetGeekConnectionStatus,
  MeetGeekMeetingsPage,
} from '@waha/core/integrations/meetgeek/meetgeek.dto';

@ApiSecurity('api_key')
@Controller('api/meetgeek')
@ApiTags('🔌 Integrations')
export class MeetGeekController {
  constructor(private readonly client: MeetGeekClient) {}

  @Get('/ping')
  @ApiOperation({
    summary: 'Check the MeetGeek connection',
    description:
      'Probes the MeetGeek API using the configured MEETGEEK_API_KEY and ' +
      'reports whether the connection is healthy, the latency and any error.',
  })
  async ping(): Promise<MeetGeekConnectionStatus> {
    return this.client.checkConnection();
  }

  @Get('/meetings')
  @ApiOperation({
    summary: 'List MeetGeek meetings',
    description: 'Returns a page of meetings from the connected MeetGeek account.',
  })
  async listMeetings(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<MeetGeekMeetingsPage> {
    return this.guard(() =>
      this.client.listMeetings({
        cursor,
        limit: limit ? Number(limit) : undefined,
      }),
    );
  }

  @Get('/meetings/:id/transcript')
  @ApiOperation({ summary: 'Get a meeting transcript from MeetGeek' })
  async getTranscript(@Param('id') id: string): Promise<any> {
    return this.guard(() => this.client.getTranscript(id));
  }

  @Get('/meetings/:id/summary')
  @ApiOperation({ summary: 'Get a meeting summary from MeetGeek' })
  async getSummary(@Param('id') id: string): Promise<any> {
    return this.guard(() => this.client.getSummary(id));
  }

  /**
   * Turn connection/auth failures into a 503 with a clear message instead of
   * leaking a raw stack trace.
   */
  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      throw new ServiceUnavailableException(
        `MeetGeek request failed: ${error.message}`,
      );
    }
  }
}
