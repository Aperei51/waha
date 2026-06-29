import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import axiosRetry, { retryAfter } from 'axios-retry';

import { VERSION } from '../../../version';
import {
  MeetGeekConfigService,
  MeetGeekRetryPolicy,
} from './MeetGeekConfigService';
import {
  MeetGeekConnectionStatus,
  MeetGeekMeeting,
  MeetGeekMeetingsPage,
} from './meetgeek.dto';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const HttpAgent = require('agentkeepalive');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const HttpsAgent = require('agentkeepalive').HttpsAgent;

function exponentialDelay(delayFactorMs: number) {
  return (retryNumber = 0, error = undefined) => {
    const calculated = 2 ** retryNumber * delayFactorMs;
    const delay = Math.max(calculated, retryAfter(error));
    // Add 0-20% jitter to avoid thundering herd
    return delay + delay * 0.2 * Math.random();
  };
}

/**
 * HTTP client for the MeetGeek REST API.
 *
 * Provides a "stable connection" by:
 *  - reusing TCP sockets via keep-alive agents,
 *  - retrying transient failures (network errors, 429, 5xx) with backoff,
 *  - honouring the Retry-After header,
 *  - applying a per-request timeout.
 */
@Injectable()
export class MeetGeekClient {
  private readonly logger = new Logger('MeetGeekClient');

  // Shared across requests so sockets are pooled and reused
  private static readonly AGENTS = {
    http: new HttpAgent({}),
    https: new HttpsAgent({}),
  };

  private http: AxiosInstance | null = null;

  constructor(private readonly config: MeetGeekConfigService) {}

  /**
   * Lazily build (and memoize) the axios instance so config is read at
   * first use, after the app has fully booted.
   */
  private client(): AxiosInstance {
    if (this.http) {
      return this.http;
    }
    const apiKey = this.config.requireApiKey();
    const instance = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeoutMs,
      httpAgent: MeetGeekClient.AGENTS.http,
      httpsAgent: MeetGeekClient.AGENTS.https,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'User-Agent': `WAHA/${VERSION.version}`,
      },
    });

    const attempts = this.config.retryAttempts;
    const delayMs = this.config.retryDelayMs;
    axiosRetry(instance, {
      retries: attempts,
      retryDelay: this.buildRetryDelay(delayMs),
      // Retry network errors, idempotent 5xx and rate limiting
      retryCondition: (error) => {
        const status = error.response?.status;
        if (status === 429) {
          return true;
        }
        return (
          axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          (status !== undefined && status >= 500)
        );
      },
      onRetry: (retryCount, error) => {
        this.logger.warn(
          `MeetGeek request failed ('${error.message}'). ` +
            `Retrying ${retryCount}/${attempts}...`,
        );
      },
    });

    this.http = instance;
    return instance;
  }

  private buildRetryDelay(delayMs: number) {
    if (!delayMs) {
      return (_n = 0, error = undefined) => Math.max(0, retryAfter(error));
    }
    switch (this.config.retryPolicy) {
      case MeetGeekRetryPolicy.CONSTANT:
        return (_n = 0, error = undefined) =>
          Math.max(delayMs, retryAfter(error));
      case MeetGeekRetryPolicy.LINEAR:
        return axiosRetry.linearDelay(delayMs);
      case MeetGeekRetryPolicy.EXPONENTIAL:
      default:
        return exponentialDelay(delayMs);
    }
  }

  /**
   * Reset the memoized client - useful after a config change.
   */
  reset(): void {
    this.http = null;
  }

  /**
   * Probe the MeetGeek API to verify the connection is healthy.
   * Never throws - returns a structured status instead.
   */
  async checkConnection(): Promise<MeetGeekConnectionStatus> {
    const status: MeetGeekConnectionStatus = {
      connected: false,
      enabled: this.config.enabled,
      configured: Boolean(this.config.apiKey),
      baseUrl: this.config.baseUrl,
      statusCode: null,
      latencyMs: null,
      error: null,
    };

    if (!status.enabled) {
      status.error = 'MeetGeek integration is disabled (MEETGEEK_ENABLED=false).';
      return status;
    }
    if (!status.configured) {
      status.error =
        'MeetGeek API key is not configured (set MEETGEEK_API_KEY).';
      return status;
    }

    const startedAt = Date.now();
    try {
      // Listing a single meeting is the cheapest authenticated probe.
      const response = await this.client().get('/meetings', {
        params: { limit: 1 },
      });
      status.connected = true;
      status.statusCode = response.status;
    } catch (error: any) {
      status.statusCode = error.response?.status ?? null;
      status.error = this.describeError(error);
    } finally {
      status.latencyMs = Date.now() - startedAt;
    }
    return status;
  }

  /**
   * List meetings. `cursor` and `limit` map to MeetGeek pagination.
   */
  async listMeetings(
    options: { cursor?: string; limit?: number } = {},
  ): Promise<MeetGeekMeetingsPage> {
    const params: Record<string, any> = {};
    if (options.limit) {
      params.limit = options.limit;
    }
    if (options.cursor) {
      params.cursor = options.cursor;
    }
    const response = await this.client().get('/meetings', { params });
    return this.toMeetingsPage(response);
  }

  /**
   * Fetch the transcript of a meeting.
   */
  async getTranscript(meetingId: string): Promise<any> {
    const response = await this.client().get(
      `/meetings/${encodeURIComponent(meetingId)}/transcript`,
    );
    return response.data;
  }

  /**
   * Fetch the summary/highlights of a meeting.
   */
  async getSummary(meetingId: string): Promise<any> {
    const response = await this.client().get(
      `/meetings/${encodeURIComponent(meetingId)}/summary`,
    );
    return response.data;
  }

  private toMeetingsPage(response: AxiosResponse): MeetGeekMeetingsPage {
    const data = response.data ?? {};
    // MeetGeek may return either a bare array or an object with a list field.
    let meetings: MeetGeekMeeting[];
    if (Array.isArray(data)) {
      meetings = data;
    } else {
      meetings = data.meetings ?? data.data ?? data.results ?? [];
    }
    const cursor =
      data.cursor ?? data.next_cursor ?? data.nextCursor ?? null;
    return { meetings, cursor };
  }

  private describeError(error: any): string {
    if (error.response) {
      const status = error.response.status;
      const body = error.response.data;
      const detail =
        typeof body === 'string' ? body : body?.message ?? body?.error ?? '';
      if (status === 401 || status === 403) {
        return `Authentication failed (HTTP ${status}). Check MEETGEEK_API_KEY.`;
      }
      return `MeetGeek API returned HTTP ${status}${detail ? `: ${detail}` : ''}`;
    }
    return error.message || 'Unknown error contacting MeetGeek';
  }
}
