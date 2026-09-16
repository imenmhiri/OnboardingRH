import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Lien signe et limite dans le temps pour un questionnaire de satisfaction
 * (W3, T-23) — le meme besoin que `Storage.createSignedUrl` (T-07), mais pour
 * une ressource qui n'est pas un fichier Supabase Storage : une reponse a un
 * questionnaire. Plutot qu'une table `survey_access_tokens` a purger, un
 * jeton signe (HMAC-SHA256) sans etat : verifiable sans lecture base, non
 * rejouable au-dela de son expiration, et immediatement invalide si altere.
 *
 * Format : `<payload-base64url>.<signature-hex>`, payload = `{ surveyId, exp }`
 * (exp en secondes epoch). Le secret vient de `SURVEY_LINK_SECRET`, distinct
 * de `N8N_WEBHOOK_SECRET` : deux jetons avec des perimetres differents
 * (webhook entrant vs lien envoye a une personne exterieure) ne doivent
 * jamais partager la meme cle.
 */

export interface SurveyTokenPayload {
  readonly surveyId: string;
  readonly exp: number;
}

export type VerifySurveyTokenResult =
  | { readonly ok: true; readonly surveyId: string }
  | { readonly ok: false; readonly reason: 'malformed' | 'tampered' | 'expired' };

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('hex');
}

export function createSurveyAccessToken(input: {
  readonly surveyId: string;
  readonly expiresAtEpochSeconds: number;
  readonly secret: string;
}): string {
  const payload: SurveyTokenPayload = { surveyId: input.surveyId, exp: input.expiresAtEpochSeconds };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = sign(payloadB64, input.secret);
  return `${payloadB64}.${signature}`;
}

export function verifySurveyAccessToken(input: {
  readonly token: string;
  readonly secret: string;
  /** Epoch seconds — injecte, jamais lu depuis l'horloge systeme ici. */
  readonly nowEpochSeconds: number;
}): VerifySurveyTokenResult {
  const parts = input.token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: 'malformed' };
  }
  const [payloadB64, providedSignature] = parts;

  const expectedSignature = sign(payloadB64, input.secret);
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');
  const providedBuffer = Buffer.from(providedSignature, 'hex');
  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return { ok: false, reason: 'tampered' };
  }

  let payload: SurveyTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as SurveyTokenPayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof payload.surveyId !== 'string' || typeof payload.exp !== 'number') {
    return { ok: false, reason: 'malformed' };
  }
  if (payload.exp < input.nowEpochSeconds) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, surveyId: payload.surveyId };
}
