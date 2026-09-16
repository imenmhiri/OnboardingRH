import type { KnownIdentifiers } from '@/domain/privacy/anonymize-comment';

/**
 * Fournit au cas d'usage T-26 la liste des identifiants reels a considerer
 * pour une societe donnee, afin que `domain/privacy/anonymize-comment`
 * (fonction pure, zero I/O) puisse les rediger. Le domaine ne touche jamais
 * la base ; c'est ce port qui l'interroge.
 */
export interface RosterDirectory {
  rosterFor(companyId: string): Promise<KnownIdentifiers>;
}
