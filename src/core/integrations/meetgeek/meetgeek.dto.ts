import { ApiProperty } from '@nestjs/swagger';

/**
 * Result of a connectivity check against the MeetGeek API.
 */
export class MeetGeekConnectionStatus {
  @ApiProperty({
    description: 'Whether the connection to MeetGeek is healthy',
    example: true,
  })
  connected: boolean;

  @ApiProperty({
    description: 'Whether the integration is enabled via MEETGEEK_ENABLED',
    example: true,
  })
  enabled: boolean;

  @ApiProperty({
    description: 'Whether the MEETGEEK_API_KEY is configured',
    example: true,
  })
  configured: boolean;

  @ApiProperty({
    description: 'MeetGeek API base URL in use',
    example: 'https://api.meetgeek.ai/v1',
  })
  baseUrl: string;

  @ApiProperty({
    description: 'HTTP status code returned by the probe request',
    example: 200,
    nullable: true,
  })
  statusCode: number | null;

  @ApiProperty({
    description: 'Round-trip latency of the probe request in milliseconds',
    example: 184,
    nullable: true,
  })
  latencyMs: number | null;

  @ApiProperty({
    description: 'Error message when the connection is not healthy',
    example: null,
    nullable: true,
  })
  error: string | null;
}

/**
 * A single meeting record as returned by MeetGeek.
 * Kept loose on purpose - we forward whatever MeetGeek sends.
 */
export class MeetGeekMeeting {
  @ApiProperty({ example: 'b3f1c2d4-...' })
  id?: string;

  @ApiProperty({ example: 'Weekly sync', nullable: true })
  title?: string;

  [key: string]: any;
}

export class MeetGeekMeetingsPage {
  @ApiProperty({ type: [MeetGeekMeeting] })
  meetings: MeetGeekMeeting[];

  @ApiProperty({
    description: 'Cursor/token for the next page, if any',
    nullable: true,
  })
  cursor: string | null;
}
