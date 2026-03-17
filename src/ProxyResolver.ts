// Based on https://github.com/Rob--W/proxy-from-env/tree/caf8c32301afdac8b5feaf346028bd8240690144
// See https://github.com/Rob--W/proxy-from-env/blob/caf8c32301afdac8b5feaf346028bd8240690144/LICENSE
import type * as http from 'node:http';

const DEFAULT_PORTS: Record<string, number> = {
  http: 80,
  https: 443,
};
export interface ProxyOptions {
  readonly noProxy?: string;
  readonly httpsProxy?: string;
  readonly httpProxy?: string;
}

export class ProxyResolver {
  options: ProxyOptions;
  constructor(options: ProxyOptions) {
    this.options = options;
  }

  // This method matches the interface expected by 'proxy-agent'. It is an arrow function to bind 'this'.
  public readonly getProxyForUrl = (url: string, _req: http.ClientRequest): string => {
    return this.getProxyForUrlOptions(url, this.options);
  };

  private getProxyForUrlOptions(url: string | URL, options?: ProxyOptions): string {
    let parsedUrl: URL;
    try {
      parsedUrl = typeof url === 'string' ? new URL(url) : url;
    } catch (_) {
      return ''; // Don't proxy invalid URLs.
    }
    const proto = parsedUrl.protocol.split(':', 1)[0];
    if (!proto) return ''; // Don't proxy URLs without a protocol.
    const hostname = parsedUrl.host;
    const port = parseInt(parsedUrl.port || '') || DEFAULT_PORTS[proto] || 0;

    if (options?.noProxy && !this.shouldProxy(hostname, port, options.noProxy)) return '';
    if (proto === 'http' && options?.httpProxy) return options.httpProxy;
    if (proto === 'https' && options?.httpsProxy) return options.httpsProxy;
    return ''; // No proxy configured for this protocol or unknown protocol
  }

  private shouldProxy(hostname: string, port: number, noProxy: string): boolean {
    if (!noProxy) return true;
    if (noProxy === '*') return false; // Never proxy if wildcard is set.

    return noProxy.split(/[,\s]/).every((proxy) => {
      if (!proxy) return true; // Skip zero-length hosts.

      const parsedProxy = proxy.match(/^(.+):(\d+)$/);
      const parsedProxyHostname = parsedProxy ? parsedProxy[1] : proxy;
      const parsedProxyPort = parsedProxy?.[2] ? parseInt(parsedProxy[2]) : 0;

      if (parsedProxyPort && parsedProxyPort !== port) return true; // Skip if ports don't match.

      if (parsedProxyHostname && !/^[.*]/.test(parsedProxyHostname)) {
        // No wildcards, so stop proxying if there is an exact match.
        return hostname !== parsedProxyHostname;
      }

      let cleanProxyHostname = parsedProxyHostname;
      if (parsedProxyHostname && parsedProxyHostname.charAt(0) === '*') {
        // Remove leading wildcard.
        cleanProxyHostname = parsedProxyHostname.slice(1);
      }
      // Stop proxying if the hostname ends with the no_proxy host.
      return !cleanProxyHostname || !hostname.endsWith(cleanProxyHostname);
    });
  }
}
