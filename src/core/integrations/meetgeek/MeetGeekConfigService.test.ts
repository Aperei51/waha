import { ConfigService } from '@nestjs/config';

import { MeetGeekClient } from './MeetGeekClient';
import {
  MeetGeekConfigService,
  MeetGeekRetryPolicy,
} from './MeetGeekConfigService';

function configWith(values: Record<string, string>): ConfigService {
  return {
    get: (key: string, def?: any) =>
      key in values ? values[key] : def,
  } as unknown as ConfigService;
}

describe('MeetGeekConfigService', () => {
  it('uses sensible defaults when nothing is set', () => {
    const config = new MeetGeekConfigService(configWith({}));
    expect(config.enabled).toBe(true);
    expect(config.apiKey).toBeNull();
    expect(config.baseUrl).toBe('https://api.meetgeek.ai/v1');
    expect(config.timeoutMs).toBe(30_000);
    expect(config.retryAttempts).toBe(5);
    expect(config.retryDelayMs).toBe(2_000);
    expect(config.retryPolicy).toBe(MeetGeekRetryPolicy.EXPONENTIAL);
  });

  it('strips trailing slashes from the base url', () => {
    const config = new MeetGeekConfigService(
      configWith({ MEETGEEK_API_URL: 'https://api.meetgeek.ai/v1///' }),
    );
    expect(config.baseUrl).toBe('https://api.meetgeek.ai/v1');
  });

  it('trims and exposes the api key', () => {
    const config = new MeetGeekConfigService(
      configWith({ MEETGEEK_API_KEY: '  secret-key  ' }),
    );
    expect(config.apiKey).toBe('secret-key');
    expect(config.requireApiKey()).toBe('secret-key');
  });

  it('throws a clear error when the api key is missing', () => {
    const config = new MeetGeekConfigService(configWith({}));
    expect(() => config.requireApiKey()).toThrow(/MEETGEEK_API_KEY/);
  });

  it('falls back to defaults for invalid numeric/policy values', () => {
    const config = new MeetGeekConfigService(
      configWith({
        MEETGEEK_TIMEOUT_SECONDS: 'abc',
        MEETGEEK_RETRY_ATTEMPTS: '-3',
        MEETGEEK_RETRY_POLICY: 'bogus',
      }),
    );
    expect(config.timeoutMs).toBe(30_000);
    expect(config.retryAttempts).toBe(5);
    expect(config.retryPolicy).toBe(MeetGeekRetryPolicy.EXPONENTIAL);
  });
});

describe('MeetGeekClient.checkConnection (no network)', () => {
  it('reports disabled integration without calling the API', async () => {
    const config = new MeetGeekConfigService(
      configWith({ MEETGEEK_ENABLED: 'false' }),
    );
    const status = await new MeetGeekClient(config).checkConnection();
    expect(status.connected).toBe(false);
    expect(status.enabled).toBe(false);
    expect(status.error).toMatch(/disabled/i);
  });

  it('reports missing api key without calling the API', async () => {
    const config = new MeetGeekConfigService(configWith({}));
    const status = await new MeetGeekClient(config).checkConnection();
    expect(status.connected).toBe(false);
    expect(status.configured).toBe(false);
    expect(status.error).toMatch(/MEETGEEK_API_KEY/);
  });
});
