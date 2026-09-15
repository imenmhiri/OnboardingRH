import { describe, expect, it } from 'vitest';
import type { AuthenticatedUser, CompanyDirectory, SessionReader } from '@/application/ports/company-directory';
import type { Membership } from '@/domain/companies/access';
import type { CompanyBranding } from '@/lib/branding';
import { loadSessionContext } from './load-session-context';

const rachel: AuthenticatedUser = { id: 'user-rh', email: 'rh@nord.test', fullName: 'Rachel RH' };

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

const BRANDINGS: Record<string, CompanyBranding> = {
  'company-nord': { name: 'Atelier Nord', primary: '#1d3557', accent: '#0d9488', logoUrl: null },
  'company-gulf': { name: 'Méridien Gulf', primary: '#f6d55c', accent: '#0d9488', logoUrl: null },
};

// Des doublures simples, pas des mocks : le cas d'usage n'a que deux ports.
function session(user: AuthenticatedUser | null): SessionReader {
  return { currentUser: async () => user };
}

function directory(memberships: readonly Membership[], brandings = BRANDINGS): CompanyDirectory {
  return {
    membershipsOf: async () => memberships,
    brandingOf: async (companyId) => brandings[companyId] ?? null,
  };
}

describe('loadSessionContext', () => {
  it('refuse un visiteur non connecte', async () => {
    const result = await loadSessionContext(session(null), directory([nord]), null);
    expect(!result.ok && result.failure.reason).toBe('signed_out');
  });

  it('assemble identite, role, societe et marque', async () => {
    const result = await loadSessionContext(session(rachel), directory([nord]), null);
    expect(result.ok && result.context.membership.role).toBe('hr_admin');
    expect(result.ok && result.context.branding.primary).toBe('#1d3557');
    expect(result.ok && result.context.landing).toBe('cockpit');
    expect(result.ok && result.context.canSwitch).toBe(false);
  });

  it('bascule de societe change le role, la marque et la destination', async () => {
    const both = directory([nord, gulf]);
    const first = await loadSessionContext(session(rachel), both, null);
    const second = await loadSessionContext(session(rachel), both, 'company-gulf');

    expect(first.ok && first.context.branding.primary).toBe('#1d3557');
    expect(second.ok && second.context.branding.primary).toBe('#f6d55c');
    expect(second.ok && second.context.membership.role).toBe('employee');
    expect(second.ok && second.context.landing).toBe('portal');
    expect(second.ok && second.context.canSwitch).toBe(true);
  });

  it('refuse une societe dont l utilisateur n est pas membre', async () => {
    const result = await loadSessionContext(session(rachel), directory([nord]), 'company-gulf');
    expect(!result.ok && result.failure.reason).toBe('not_a_member');
  });

  it('nomme le cas de l utilisateur sans aucune appartenance', async () => {
    const result = await loadSessionContext(session(rachel), directory([]), null);
    expect(!result.ok && result.failure.reason).toBe('no_membership');
  });

  it('signale une societe introuvable au lieu d inventer une marque', async () => {
    const result = await loadSessionContext(session(rachel), directory([nord], {}), null);
    expect(!result.ok && result.failure.reason).toBe('company_missing');
  });
});
