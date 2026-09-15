import type { Membership } from '@/domain/companies/access';
import type { CompanyBranding } from '@/lib/branding';

/** Qui est connecte, vu de l'application. Rien de sensible au-dela de l'identite. */
export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly fullName: string | null;
}

export interface CompanyDirectory {
  /** Les societes dont l'utilisateur est membre, avec son role dans chacune. */
  membershipsOf(userId: string): Promise<readonly Membership[]>;
  brandingOf(companyId: string): Promise<CompanyBranding | null>;
}

export interface SessionReader {
  currentUser(): Promise<AuthenticatedUser | null>;
}
