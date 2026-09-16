import { describe, expect, it } from 'vitest';
import {
  canAccess,
  landingArea,
  type Membership,
  resolveActiveCompany,
} from './access';

const nord: Membership = {
  companyId: 'company-nord',
  companySlug: 'atelier-nord',
  companyName: 'Atelier Nord',
  role: 'hr_admin',
};
const gulf: Membership = {
  companyId: 'company-gulf',
  companySlug: 'meridien-gulf',
  companyName: 'Méridien Gulf',
  role: 'employee',
};

describe('canAccess', () => {
  it('ouvre le cockpit a la RH et au manager, pas a l employe', () => {
    expect(canAccess('hr_admin', 'cockpit')).toBe(true);
    expect(canAccess('manager', 'cockpit')).toBe(true);
    expect(canAccess('employee', 'cockpit')).toBe(false);
    expect(canAccess('it', 'cockpit')).toBe(false);
  });

  it('reserve le createur de parcours a la RH', () => {
    expect(canAccess('hr_admin', 'journey_builder')).toBe(true);
    expect(canAccess('manager', 'journey_builder')).toBe(false);
  });

  it('donne un portail a tout le monde, y compris a la RH', () => {
    expect(canAccess('employee', 'portal')).toBe(true);
    expect(canAccess('hr_admin', 'portal')).toBe(true);
  });
});

describe('landingArea', () => {
  it('envoie chacun la ou il a quelque chose a faire', () => {
    expect(landingArea('hr_admin')).toBe('cockpit');
    expect(landingArea('manager')).toBe('cockpit');
    expect(landingArea('it')).toBe('equipment');
    expect(landingArea('employee')).toBe('portal');
  });
});

describe('resolveActiveCompany', () => {
  it('prend la premiere societe quand aucune n est demandee', () => {
    const result = resolveActiveCompany([nord, gulf], null);
    expect(result.ok && result.membership.companyId).toBe('company-nord');
  });

  it('respecte la societe demandee quand l utilisateur en est membre', () => {
    const result = resolveActiveCompany([nord, gulf], 'company-gulf');
    expect(result.ok && result.membership.companyName).toBe('Méridien Gulf');
    expect(result.ok && result.membership.role).toBe('employee');
  });

  it('signale qu un utilisateur membre de plusieurs societes peut basculer', () => {
    expect(resolveActiveCompany([nord, gulf], null).ok && resolveActiveCompany([nord, gulf], null)).toMatchObject({
      canSwitch: true,
    });
    expect(resolveActiveCompany([nord], null)).toMatchObject({ canSwitch: false });
  });

  it('refuse explicitement une societe dont on n est pas membre', () => {
    // URL forgee : on refuse au lieu de retomber en silence sur une autre societe.
    const result = resolveActiveCompany([nord], 'company-gulf');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe('not_a_member');
    expect(!result.ok && result.reason === 'not_a_member' && result.requestedCompanyId).toBe('company-gulf');
  });

  it('distingue l absence totale d appartenance', () => {
    const result = resolveActiveCompany([], null);
    expect(!result.ok && result.reason).toBe('no_membership');
  });
});
