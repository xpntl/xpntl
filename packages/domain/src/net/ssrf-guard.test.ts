import { describe, expect, it } from 'vitest';
import { isIpLiteral, isPrivateAddress } from './ssrf-guard.js';

describe('isPrivateAddress', () => {
  it('blocks private / loopback / link-local / metadata / CGNAT (IPv4)', () => {
    for (const ip of [
      '10.0.0.1',
      '127.0.0.1',
      '169.254.169.254', // cloud metadata
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '100.64.0.1', // CGNAT
      '0.0.0.0', // unspecified
      '255.255.255.255', // broadcast
      '224.0.0.1', // multicast
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it('blocks IPv6 loopback / link-local / unique-local / unspecified / site-local', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'fec0::1', '[::1]']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it('blocks IPv4-mapped IPv6 pointing at internal targets', () => {
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateAddress('::ffff:169.254.169.254')).toBe(true);
  });

  it('allows public unicast addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it('returns false for non-IP strings (hostnames are resolved separately)', () => {
    expect(isPrivateAddress('example.com')).toBe(false);
    expect(isPrivateAddress('not-an-ip')).toBe(false);
  });
});

describe('isIpLiteral', () => {
  it('recognizes IPv4 and IPv6 literals (with or without brackets)', () => {
    expect(isIpLiteral('10.0.0.1')).toBe(true);
    expect(isIpLiteral('::1')).toBe(true);
    expect(isIpLiteral('[2606:4700::1111]')).toBe(true);
  });

  it('rejects hostnames', () => {
    expect(isIpLiteral('example.com')).toBe(false);
    expect(isIpLiteral('jira.mycompany.com')).toBe(false);
  });
});
