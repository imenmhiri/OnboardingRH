/**
 * Qui a le droit de voir quoi, et pour quelle societe. La RLS reste la source de
 * verite de l'autorisation ; ces regles servent a router et a expliquer un refus
 * plutot qu'a laisser une page vide ou une erreur brute.
 */

export const ROLES = ['hr_admin', 'manager', 'it', 'employee'] as const;

export type Role = (typeof ROLES)[number];

export interface Membership {
  readonly companyId: string;
  readonly companySlug: string;
  readonly companyName: string;
  readonly role: Role;
}

export const AREAS = ['cockpit', 'journey_builder', 'equipment', 'portal'] as const;

export type Area = (typeof AREAS)[number];

const AREA_ROLES: Readonly<Record<Area, readonly Role[]>> = {
  cockpit: ['hr_admin', 'manager'],
  journey_builder: ['hr_admin'],
  equipment: ['hr_admin', 'it'],
  // Tout le monde a un parcours : un manager aussi est arrive un jour.
  portal: ['hr_admin', 'manager', 'it', 'employee'],
};

export function canAccess(role: Role, area: Area): boolean {
  return AREA_ROLES[area].includes(role);
}

/** L'espace ou envoyer quelqu'un qui arrive sans destination precise. */
export function landingArea(role: Role): Area {
  return canAccess(role, 'cockpit') ? 'cockpit' : 'portal';
}

export type ActiveCompanyResolution =
  | { readonly ok: true; readonly membership: Membership; readonly canSwitch: boolean }
  | { readonly ok: false; readonly reason: 'no_membership' }
  | { readonly ok: false; readonly reason: 'not_a_member'; readonly requestedCompanyId: string };

/**
 * Resout la societe active. Une societe demandee dont l'utilisateur n'est pas
 * membre est refusee explicitement plutot que remplacee en silence : sans cela,
 * une URL forgee renverrait la premiere societe venue et personne ne saurait
 * qu'une tentative a eu lieu.
 */
export function resolveActiveCompany(
  memberships: readonly Membership[],
  requestedCompanyId: string | null,
): ActiveCompanyResolution {
  const [first] = memberships;
  if (!first) {
    return { ok: false, reason: 'no_membership' };
  }
  const canSwitch = memberships.length > 1;

  if (requestedCompanyId === null) {
    return { ok: true, membership: first, canSwitch };
  }

  const requested = memberships.find((membership) => membership.companyId === requestedCompanyId);
  if (!requested) {
    return { ok: false, reason: 'not_a_member', requestedCompanyId };
  }
  return { ok: true, membership: requested, canSwitch };
}
