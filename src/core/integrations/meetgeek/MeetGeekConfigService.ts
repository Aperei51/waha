import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { parseBool } from '../../../helpers';

export enum MeetGeekRetryPolicy {
  CONSTANT = 'constant',
  LINEAR = 'linear',
  EXPONENTIAL = 'exponential',
}

/**
 * Reads MeetGeek connection settings from environment variables.
 *
 * All values are optional so the app boots even without MeetGeek configured -
 * the controller returns a clear error when the API key is missing.
 */
@Injectable()
export class MeetGeekConfigService {
  private readonly logger = new Logger('MeetGeekConfigService');

  constructor(protected configService: ConfigService) {}

  get enabled(): boolean {
    const value = this.configService.get('MEETGEEK_ENABLED', 'true');
    return parseBool(value);
  }

  get apiKey(): string | null {
    const value = this.configService.get('MEETGEEK_API_KEY', '');
    return value ? String(value).trim() : null;
  }

  get baseUrl(): string {
    const value = this.configService.get(
      'MEETGEEK_API_URL',
      'https://api.meetgeek.ai/v1',
    );
    // Drop trailing slashes to keep URL joins predictable
    return String(value).replace(/\/+$/, '');
  }

  /**
   * Per-request timeout in milliseconds.
   */
  get timeoutMs(): number {
    const value = this.configService.get('MEETGEEK_TIMEOUT_SECONDS', '30');
    return this.toNumber(value, 30) * 1000;
  }

  get retryAttempts(): number {
    const value = this.configService.get('MEETGEEK_RETRY_ATTEMPTS', '5');
    return this.toNumber(value, 5);
  }

  get retryDelayMs(): number {
    const value = this.configService.get('MEETGEEK_RETRY_DELAY_SECONDS', '2');
    return this.toNumber(value, 2) * 1000;
  }

  get retryPolicy(): MeetGeekRetryPolicy {
    const value = String(
      this.configService.get('MEETGEEK_RETRY_POLICY', 'exponential'),
    ).toLowerCase();
    if (
      Object.values(MeetGeekRetryPolicy).includes(
        value as MeetGeekRetryPolicy,
      )
    ) {
      return value as MeetGeekRetryPolicy;
    }
    this.logger.warn(
      `Unknown MEETGEEK_RETRY_POLICY=${value}. Using 'exponential'.`,
    );
    return MeetGeekRetryPolicy.EXPONENTIAL;
  }

  /**
   * Returns the API key or throws if it is not configured.
   */
  requireApiKey(): string {
    const key = this.apiKey;
    if (!key) {
      throw new Error(
        'MeetGeek API key is not configured. ' +
          'Set the MEETGEEK_API_KEY environment variable.',
      );
    }
    return key;
  }

  private toNumber(value: any, fallback: number): number {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
    this.logger.warn(`Invalid numeric config value '${value}'. Using ${fallback}.`);
    return fallback;
  }
}
