import { landingArea, resolveActiveCompany, type Area, type Membership } from '@/domain/companies/access';
import type { AuthenticatedUser, CompanyDirectory, SessionReader } from '@/application/ports/company-directory';
import type { CompanyBranding } from '@/lib/branding';

/**
 * Ce que tout ecran authentifie a besoin de savoir : qui regarde, pour quelle
 * societe, avec quel role, et sous quelle marque. Le cas d'usage orchestre, les
 * regles restent dans le domaine.
 */
export interface SessionContext {
  readonly user: AuthenticatedUser;
  readonly membership: Membership;
  readonly memberships: readonly Membership[];
  readonly canSwitch: boolean;
  readonly branding: CompanyBranding;
  readonly landing: Area;
}

export type SessionFailure =
  | { readonly reason: 'signed_out' }
  | { readonly reason: 'no_membership'; readonly user: AuthenticatedUser }
  | { readonly reason: 'not_a_member'; readonly user: AuthenticatedUser; readonly requestedCompanyId: string }
  | { readonly reason: 'company_missing'; readonly user: AuthenticatedUser };

export type SessionResult =
  | { readonly ok: true; readonly context: SessionContext }
  | { readonly ok: false; readonly failure: SessionFailure };

export async function loadSessionContext(
  session: SessionReader,
  directory: CompanyDirectory,
  requestedCompanyId: string | null,
): Promise<SessionResult> {
  const user = await session.currentUser();
  if (!user) {
    return { ok: false, failure: { reason: 'signed_out' } };
  }

  const memberships = await directory.membershipsOf(user.id);
  const resolution = resolveActiveCompany(memberships, requestedCompanyId);
  if (!resolution.ok) {
    return {
      ok: false,
      failure:
        resolution.reason === 'no_membership'
          ? { reason: 'no_membership', user }
          : { reason: 'not_a_member', user, requestedCompanyId: resolution.requestedCompanyId },
    };
  }

  const branding = await directory.brandingOf(resolution.membership.companyId);
  if (!branding) {
    // La RLS a filtre la societe alors que l'appartenance existe : anomalie de
    // donnees, pas un cas normal a masquer par une marque par defaut.
    return { ok: false, failure: { reason: 'company_missing', user } };
  }

  return {
    ok: true,
    context: {
      user,
      membership: resolution.membership,
      memberships,
      canSwitch: resolution.canSwitch,
      branding,
      landing: landingArea(resolution.membership.role),
    },
  };
}
