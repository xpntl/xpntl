// Shared SSRF guard. Blocks requests to private/loopback/link-local/cloud-metadata
// addresses, with DNS resolution at request time so a public hostname that
// resolves (or rebinds) to an internal IP is still rejected. Used by any code
// that fetches a user-supplied URL (Jira import, outbound webhooks, …).

import ipaddr from 'ipaddr.js';
import { ValidationError } from '../errors.js';

export function isIpLiteral(host: string): boolean {
  // strip IPv6 brackets
  return ipaddr.isValid(host.replace(/^\[|\]$/g, ''));
}

// True for any address that is NOT a globally-routable unicast host — i.e.
// loopback, private (RFC1918), link-local (incl. cloud metadata 169.254/16),
// unique-local, unspecified (:: / 0.0.0.0), broadcast, multicast, CGNAT and
// reserved ranges. We classify with a real IP parser rather than string
// prefixes so alternate IPv6 spellings (::, expanded loopback, fec0:, …) and
// IPv4-mapped addresses can't slip past. Anything we can't parse as an IP
// literal returns false — callers resolve hostnames via assertPublicHost.
export function isPrivateAddress(addr: string): boolean {
  const h = addr.replace(/^\[|\]$/g, '');
  let parsed: ReturnType<typeof ipaddr.parse>;
  try {
    parsed = ipaddr.parse(h);
  } catch {
    return false;
  }
  // Judge an IPv4-mapped IPv6 address (::ffff:a.b.c.d) by its embedded v4.
  if (parsed.kind() === 'ipv6') {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) {
      parsed = v6.toIPv4Address();
    } else if (v6.match(ipaddr.parse('fec0::') as ipaddr.IPv6, 10)) {
      // Deprecated site-local (RFC 3879). ipaddr.js reports it as unicast, but
      // it's still an internal range — block it explicitly.
      return true;
    }
  }
  return parsed.range() !== 'unicast';
}

// Resolve the host and reject if ANY resolved address is private/internal.
// Runs at fetch time so a hostname that resolves to an internal IP (DNS
// rebinding / internal DNS entry) is blocked even if the literal looked fine.
export async function assertPublicHost(hostname: string, label = 'URL'): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (isIpLiteral(host)) {
    if (isPrivateAddress(host)) throw new ValidationError(`${label} host is not allowed`);
    return;
  }
  const { lookup } = await import('node:dns/promises');
  let results: Array<{ address: string }>;
  try {
    results = await lookup(host, { all: true });
  } catch {
    throw new ValidationError(`Could not resolve ${label} host`);
  }
  if (results.length === 0) throw new ValidationError(`Could not resolve ${label} host`);
  for (const { address } of results) {
    if (isPrivateAddress(address)) {
      throw new ValidationError(`${label} resolves to a non-public address`);
    }
  }
}

// Parse a user-supplied URL, require https, and assert the host is public.
// Returns the parsed URL so callers can reuse it.
export async function assertPublicHttpsUrl(rawUrl: string, label = 'URL'): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ValidationError(`Invalid ${label}`);
  }
  if (parsed.protocol !== 'https:') throw new ValidationError(`${label} must use HTTPS`);
  await assertPublicHost(parsed.hostname, label);
  return parsed;
}
