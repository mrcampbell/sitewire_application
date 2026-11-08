import { describe, expect, it } from 'vitest';
import { analyzeDataset, isIpv4, isNonRoutableIpv4 } from '../../src/analysis.js';
import type { Dataset } from '../../src/types.js';

const user = (id: number, email = `u${id}@example.com`) => ({ id, first_name: 'First', last_name: 'Last', email });

const dataset: Dataset = {
  scannedAt: '2026-11-07T00:00:00Z',
  baseUrl: 'test',
  users: [user(1), user(2), user(3), user(4), user(5, 'not-an-email'), user(6, 'u1@example.com')],
  logins: {
    // Most recent is in the middle: the classic "last item" bug.
    '1': {
      user_id: 1,
      logins: [
        { login_time: '2026-07-30T12:02:41Z', ip_v4: '115.31.131.47' },
        { login_time: '2026-09-10T08:04:17Z', ip_v4: '61.129.200.209' },
        { login_time: '2026-02-28T20:21:21Z', ip_v4: '118.36.51.49' },
      ],
    },
    '2': { user_id: 2, logins: [] },
    // Future date, private IP on the most recent login.
    '3': { user_id: 3, logins: [{ login_time: '2026-12-25T07:23:24Z', ip_v4: '192.168.1.1' }] },
    // Tie on most recent; mismatched user_id; malformed IP.
    '4': {
      user_id: 44,
      logins: [
        { login_time: '2026-11-01T00:00:00Z', ip_v4: '1.2.3.4' },
        { login_time: '2026-11-01T00:00:00Z', ip_v4: '999.1.1.1' },
      ],
    },
    '6': { user_id: 6, logins: [{ login_time: 'yesterday', ip_v4: '8.8.8.8' }] },
  },
  unresolved: [{ userId: 5, lastError: 'http-500' }],
};

const affected = (check: string) => {
  const found = analyzeDataset(dataset).checks.find((c) => c.check.startsWith(check));
  if (!found) throw new Error(`no check named "${check}"`);
  return found.examples;
};

describe('analyzeDataset', () => {
  it('flags users whose last array item is not the most recent login', () => {
    expect(affected('Last item is NOT the most recent')).toEqual([1]);
    expect(affected('Logins sorted neither')).toEqual([1]);
  });

  it('separates "no logins" from "could not fetch logins"', () => {
    expect(affected('Zero logins')).toEqual([2]);
    expect(affected('Logins never fetched')).toEqual([5]);
  });

  it('catches future dates, ties, id mismatches and bad values', () => {
    expect(affected('Has a login dated after')).toEqual([3]);
    expect(affected('Most recent time shared')).toEqual([4]);
    expect(affected('user_id in response')).toEqual([4]);
    expect(affected('Invalid ip_v4')).toEqual([4]);
    expect(affected('Unparseable')).toEqual([6]);
    expect(affected('Most recent IP is private')).toEqual([3]);
  });

  it('checks /users fields', () => {
    expect(affected('Email fails')).toEqual([5]);
    expect(affected('Shared email')).toEqual([1, 6]);
  });

  it('flags inactivity relative to scan time, not wall clock', () => {
    // User 1's latest is 2026-09-10: ~58 days before the scan.
    expect(affected('Inactive')).toContain(1);
    expect(affected('Inactive')).not.toContain(4);
  });
});

describe('ip helpers', () => {
  it('validates dotted-quad IPv4', () => {
    expect(isIpv4('61.129.200.209')).toBe(true);
    expect(isIpv4('256.1.1.1')).toBe(false);
    expect(isIpv4('1.2.3')).toBe(false);
  });

  it('identifies non-routable ranges', () => {
    for (const ip of ['10.0.0.1', '172.16.0.1', '192.168.0.1', '127.0.0.1', '100.64.0.1', '224.0.0.1']) {
      expect(isNonRoutableIpv4(ip)).toBe(true);
    }
    expect(isNonRoutableIpv4('8.8.8.8')).toBe(false);
    expect(isNonRoutableIpv4('172.32.0.1')).toBe(false);
  });
});
