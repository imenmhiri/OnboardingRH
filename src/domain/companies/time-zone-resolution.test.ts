import { describe, expect, it } from 'vitest';
import { resolveTimeZone } from './time-zone-resolution';

describe('resolveTimeZone', () => {
  it('prefers the site override over the company time zone', () => {
    expect(resolveTimeZone({ timeZone: 'Europe/Paris' }, { timeZone: 'Asia/Dubai' })).toBe('Asia/Dubai');
  });

  it('falls back to the company time zone when the site has none', () => {
    expect(resolveTimeZone({ timeZone: 'Europe/Paris' }, { timeZone: null })).toBe('Europe/Paris');
  });

  it('falls back to the company time zone when there is no site at all', () => {
    expect(resolveTimeZone({ timeZone: 'Europe/Paris' }, null)).toBe('Europe/Paris');
  });

  it('falls back to UTC when neither the company nor the site have one', () => {
    expect(resolveTimeZone({ timeZone: null }, null)).toBe('UTC');
  });
});
