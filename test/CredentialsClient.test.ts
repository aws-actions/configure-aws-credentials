import { describe, expect, it, vi } from 'vitest';

vi.mock('@aws-sdk/credential-provider-node', () => ({
  defaultProvider: vi.fn(() => async () => ({ accessKeyId: 'AKIA', secretAccessKey: 'secret' })),
}));

import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { CredentialsClient } from '../src/CredentialsClient';

describe('CredentialsClient', {}, () => {
  it('pins ambient credential resolution to the configured region and STS endpoint', {}, async () => {
    const client = new CredentialsClient({
      region: 'eu-west-1',
      stsEndpoint: 'https://sts.example.com',
      roleChaining: false,
    });
    // biome-ignore lint/suspicious/noExplicitAny: any required to call private method
    await (client as any).loadCredentials();
    expect(defaultProvider).toHaveBeenCalledWith({
      clientConfig: expect.objectContaining({ region: 'eu-west-1', endpoint: 'https://sts.example.com' }),
    });
  });

  it('omits unset client config values from ambient credential resolution', {}, async () => {
    const client = new CredentialsClient({ region: 'eu-west-1', roleChaining: false });
    // biome-ignore lint/suspicious/noExplicitAny: any required to call private method
    await (client as any).loadCredentials();
    expect(defaultProvider).toHaveBeenLastCalledWith({ clientConfig: { region: 'eu-west-1' } });
  });
});
