import { EventEmitter, once } from 'node:events';
import type * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';
import { ProxyAgent } from 'proxy-agent';
import { describe, expect, test } from 'vitest';
import { type ProxyOptions, ProxyResolver } from '../src/ProxyResolver';

describe('ProxyResolver', () => {
  const mockReq = () => new EventEmitter() as unknown as http.ClientRequest;

  test('returns http proxy for http URLs', () => {
    const options: ProxyOptions = { httpProxy: 'http://proxy:8080' };
    const resolver = new ProxyResolver(options);

    expect(resolver.getProxyForUrl('http://example.com', mockReq())).toBe('http://proxy:8080');
  });

  test('returns https proxy for https URLs', () => {
    const options: ProxyOptions = { httpsProxy: 'https://proxy:8080' };
    const resolver = new ProxyResolver(options);

    expect(resolver.getProxyForUrl('https://example.com', mockReq())).toBe('https://proxy:8080');
  });

  test('returns empty string when no proxy configured', () => {
    const resolver = new ProxyResolver({});

    expect(resolver.getProxyForUrl('http://example.com', mockReq())).toBe('');
  });

  test('respects noProxy setting', () => {
    const options: ProxyOptions = {
      httpProxy: 'http://proxy:8080',
      noProxy: 'example.com',
    };
    const resolver = new ProxyResolver(options);

    expect(resolver.getProxyForUrl('http://example.com', mockReq())).toBe('');
    expect(resolver.getProxyForUrl('http://other.com', mockReq())).toBe('http://proxy:8080');
  });

  test('handles invalid URLs', () => {
    const resolver = new ProxyResolver({ httpProxy: 'http://proxy:8080' });

    expect(resolver.getProxyForUrl('invalid-url', mockReq())).toBe('');
  });

  test('handles wildcard noProxy', () => {
    const options: ProxyOptions = {
      httpProxy: 'http://proxy:8080',
      noProxy: '*',
    };
    const resolver = new ProxyResolver(options);

    expect(resolver.getProxyForUrl('http://example.com', mockReq())).toBe('');
  });

  test('handles comma-separated noProxy list', () => {
    const options: ProxyOptions = {
      httpProxy: 'http://proxy:8080',
      noProxy: 'example.com,test.com',
    };
    const resolver = new ProxyResolver(options);

    expect(resolver.getProxyForUrl('http://example.com', mockReq())).toBe('');
    expect(resolver.getProxyForUrl('http://test.com', mockReq())).toBe('');
    expect(resolver.getProxyForUrl('http://other.com', mockReq())).toBe('http://proxy:8080');
  });

  test('handles port-specific noProxy', () => {
    const options: ProxyOptions = {
      httpProxy: 'http://proxy:8080',
      noProxy: 'example.com:80',
    };
    const resolver = new ProxyResolver(options);

    expect(resolver.getProxyForUrl('http://example.com', mockReq())).toBe('');
    expect(resolver.getProxyForUrl('http://example.com:8080', mockReq())).toBe('http://proxy:8080');
  });

  test('handles wildcard domain noProxy', () => {
    const options: ProxyOptions = {
      httpProxy: 'http://proxy:8080',
      noProxy: '*.example.com',
    };
    const resolver = new ProxyResolver(options);

    expect(resolver.getProxyForUrl('http://sub.example.com', mockReq())).toBe('');
    expect(resolver.getProxyForUrl('http://example.com', mockReq())).toBe('http://proxy:8080');
    expect(resolver.getProxyForUrl('http://other.com', mockReq())).toBe('http://proxy:8080');
  });

  test('handles empty noProxy entries', () => {
    const options: ProxyOptions = {
      httpProxy: 'http://proxy:8080',
      noProxy: 'example.com, ,test.com',
    };
    const resolver = new ProxyResolver(options);

    expect(resolver.getProxyForUrl('http://example.com', mockReq())).toBe('');
    expect(resolver.getProxyForUrl('http://test.com', mockReq())).toBe('');
  });

  test('attaches a proxyConnect listener when a proxy is used', () => {
    const resolver = new ProxyResolver({ httpsProxy: 'http://proxy:8080' });
    const req = mockReq();

    resolver.getProxyForUrl('https://example.com', req);

    expect(req.listenerCount('proxyConnect')).toBe(1);
  });

  test('does not attach a proxyConnect listener when no proxy is used', () => {
    const resolver = new ProxyResolver({ httpsProxy: 'http://proxy:8080', noProxy: 'example.com' });
    const req = mockReq();

    resolver.getProxyForUrl('https://example.com', req);

    expect(req.listenerCount('proxyConnect')).toBe(0);
  });
});

describe('proxy CONNECT enforcement', () => {
  // A proxy that answers every CONNECT with a fixed plaintext response and never establishes a tunnel.
  async function startFakeProxy(response: string) {
    const server = net.createServer((socket) => {
      socket.on('error', () => {});
      socket.once('data', () => socket.end(response));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address() as net.AddressInfo;
    return {
      url: `http://127.0.0.1:${port}`,
      close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
  }

  // The target host is never reached: the fake proxy answers the CONNECT itself.
  function requestViaAgent(agent: ProxyAgent) {
    return new Promise<{ statusCode?: number; body: string }>((resolve, reject) => {
      const req = https.request('https://secretsmanager.us-east-1.amazonaws.com/', { agent }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      });
      req.on('error', reject);
      req.end();
    });
  }

  function agentFor(proxyUrl: string) {
    const resolver = new ProxyResolver({ httpProxy: proxyUrl, httpsProxy: proxyUrl });
    return new ProxyAgent({ getProxyForUrl: resolver.getProxyForUrl });
  }

  const forgedBody = '{"SecretString":"forged"}';
  const forged2xxResponse =
    'HTTP/1.1 202 Accepted\r\n' +
    'Content-Type: application/json\r\n' +
    `Content-Length: ${forgedBody.length}\r\n` +
    'Connection: close\r\n' +
    '\r\n' +
    forgedBody;

  test('aborts the request when CONNECT returns a plaintext 2xx other than 200', async () => {
    const proxy = await startFakeProxy(forged2xxResponse);
    try {
      await expect(requestViaAgent(agentFor(proxy.url))).rejects.toThrow(/CONNECT returned HTTP 202/);
    } finally {
      await proxy.close();
    }
  });

  test('aborts the request when CONNECT returns a non-2xx status', async () => {
    const proxy = await startFakeProxy('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
    try {
      await expect(requestViaAgent(agentFor(proxy.url))).rejects.toThrow(/CONNECT returned HTTP 403/);
    } finally {
      await proxy.close();
    }
  });

  // Documents the upstream https-proxy-agent behavior this enforcement exists for: without the
  // proxyConnect listener, the proxy's plaintext 202 response is replayed to the HTTP parser and
  // surfaces as a genuine response from the target host. It also proves the tests above exercise
  // the replay path rather than passing vacuously. If this test starts failing, upstream has fixed
  // the behavior and the enforcement in verifyProxyConnect may be removable.
  test('without enforcement, a plaintext 2xx CONNECT response is accepted as a real response', async () => {
    const proxy = await startFakeProxy(forged2xxResponse);
    try {
      const agent = new ProxyAgent({ getProxyForUrl: () => proxy.url });
      await expect(requestViaAgent(agent)).resolves.toEqual({ statusCode: 202, body: forgedBody });
    } finally {
      await proxy.close();
    }
  });
});
