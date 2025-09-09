import type * as http from 'node:http';
import { describe, expect, test } from 'vitest';
import { type ProxyOptions, ProxyResolver } from '../src/ProxyResolver';

describe('ProxyResolver', () => {
  const mockReq = {} as http.ClientRequest;

  test('returns http proxy for http URLs', () => {
    const options: ProxyOptions = { httpProxy: 'http://proxy:8080' };
    const resolver = new ProxyResolver(options);

    expect(resolver.getProxyForUrl('http://example.com', mockReq)).toBe('http://proxy:8080');
  });

  test('returns https proxy for https URLs', () => {
    const options: ProxyOptions = { httpsProxy: 'https://proxy:8080' };
    const resolver = new ProxyResolver(options);

    expect(resolver.getProxyForUrl('https://example.com', mockReq)).toBe('https://proxy:8080');
  });

  test('returns empty string when no proxy configured', () => {
    const resolver = new ProxyResolver({});

    expect(resolver.getProxyForUrl('http://example.com', mockReq)).toBe('');
  });

  test('respects noProxy setting', () => {
    const options: ProxyOptions = {
      httpProxy: 'http://proxy:8080',
      noProxy: 'example.com',
    };
    const resolver = new ProxyResolver(options);

    expect(resolver.getProxyForUrl('http://example.com', mockReq)).toBe('');
    expect(resolver.getProxyForUrl('http://other.com', mockReq)).toBe('http://proxy:8080');
  });

  test('handles invalid URLs', () => {
    const resolver = new ProxyResolver({ httpProxy: 'http://proxy:8080' });

    expect(resolver.getProxyForUrl('invalid-url', mockReq)).toBe('');
  });

  test('handles wildcard noProxy', () => {
    const options: ProxyOptions = {
      httpProxy: 'http://proxy:8080',
      noProxy: '*',
    };
    const resolver = new ProxyResolver(options);

    expect(resolver.getProxyForUrl('http://example.com', mockReq)).toBe('');
  });

  test('handles comma-separated noProxy list', () => {
    const options: ProxyOptions = {
      httpProxy: 'http://proxy:8080',
      noProxy: 'example.com,test.com',
    };
    const resolver = new ProxyResolver(options);

    expect(resolver.getProxyForUrl('http://example.com', mockReq)).toBe('');
    expect(resolver.getProxyForUrl('http://test.com', mockReq)).toBe('');
    expect(resolver.getProxyForUrl('http://other.com', mockReq)).toBe('http://proxy:8080');
  });

  test('handles port-specific noProxy', () => {
    const options: ProxyOptions = {
      httpProxy: 'http://proxy:8080',
      noProxy: 'example.com:80',
    };
    const resolver = new ProxyResolver(options);

    expect(resolver.getProxyForUrl('http://example.com', mockReq)).toBe('');
    expect(resolver.getProxyForUrl('http://example.com:8080', mockReq)).toBe('http://proxy:8080');
  });

  test('handles wildcard domain noProxy', () => {
    const options: ProxyOptions = {
      httpProxy: 'http://proxy:8080',
      noProxy: '*.example.com',
    };
    const resolver = new ProxyResolver(options);

    expect(resolver.getProxyForUrl('http://sub.example.com', mockReq)).toBe('');
    expect(resolver.getProxyForUrl('http://example.com', mockReq)).toBe('http://proxy:8080');
    expect(resolver.getProxyForUrl('http://other.com', mockReq)).toBe('http://proxy:8080');
  });

  test('handles empty noProxy entries', () => {
    const options: ProxyOptions = {
      httpProxy: 'http://proxy:8080',
      noProxy: 'example.com, ,test.com',
    };
    const resolver = new ProxyResolver(options);

    expect(resolver.getProxyForUrl('http://example.com', mockReq)).toBe('');
    expect(resolver.getProxyForUrl('http://test.com', mockReq)).toBe('');
  });
});
