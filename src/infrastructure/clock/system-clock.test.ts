import { describe, expect, it } from 'vitest';
import { createSystemClock } from './system-clock';

describe('createSystemClock', () => {
  it('rend le jour civil du fuseau demande', () => {
    const instant = new Date('2026-03-02T10:00:00Z');
    expect(createSystemClock('Europe/Paris', () => instant).today()).toBe('2026-03-02');
    expect(createSystemClock('Asia/Dubai', () => instant).today()).toBe('2026-03-02');
  });

  it('change de jour avant Paris pour un site du Golfe', () => {
    // 22h30 UTC : il est 23h30 a Paris, mais deja 2h30 le lendemain a Dubai.
    const instant = new Date('2026-03-02T22:30:00Z');
    expect(createSystemClock('Europe/Paris', () => instant).today()).toBe('2026-03-02');
    expect(createSystemClock('Asia/Dubai', () => instant).today()).toBe('2026-03-03');
  });

  it('suit le passage a l heure d ete', () => {
    // Le 29 mars 2026 a 01h30 UTC, Paris est deja en heure d ete (UTC+2).
    const instant = new Date('2026-03-28T23:30:00Z');
    expect(createSystemClock('Europe/Paris', () => instant).today()).toBe('2026-03-29');
  });

  it('produit une date exploitable par le moteur d echeances', () => {
    const today = createSystemClock('Europe/Paris', () => new Date('2026-04-07T08:00:00Z')).today();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
