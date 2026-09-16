/**
 * Decide quel canal joint un destinataire d'email, sans jamais echouer en
 * silence : la bascule vers un canal alternatif est ce que renvoie cette
 * fonction, pas un effet de bord invisible dans l'infrastructure d'envoi.
 * Ordre de priorite : l'email personnel d'abord (le plus rapide a atteindre
 * avant meme la creation d'un compte), puis l'adresse professionnelle une
 * fois le compte cree, puis le manager en dernier recours pour une remise en
 * main propre.
 */

export type EmailChannel = 'personal' | 'professional' | 'manager';

export interface RecipientCandidates {
  readonly personalEmail: string | null;
  readonly professionalEmail: string | null;
  readonly managerEmail: string | null;
}

export type RecipientResolution =
  | { readonly ok: true; readonly channel: EmailChannel; readonly email: string }
  | { readonly ok: false; readonly reason: 'no_channel_available' };

export function resolveRecipient(candidates: RecipientCandidates): RecipientResolution {
  if (candidates.personalEmail) {
    return { ok: true, channel: 'personal', email: candidates.personalEmail };
  }
  if (candidates.professionalEmail) {
    return { ok: true, channel: 'professional', email: candidates.professionalEmail };
  }
  if (candidates.managerEmail) {
    return { ok: true, channel: 'manager', email: candidates.managerEmail };
  }
  return { ok: false, reason: 'no_channel_available' };
}
