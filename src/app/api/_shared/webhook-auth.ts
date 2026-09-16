import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

/**
 * Authentification partagee de tous les webhooks n8n (W1, T-24, W2, ...) :
 * secret partage dans l'en-tete `x-webhook-secret`, compare en temps
 * constant pour qu'une longueur ou un contenu errone ne fuite rien par le
 * temps de reponse. Troisieme copie identique repere dans W2 (T-22) :
 * factorisee ici plutot que recopiee une fois de plus.
 */
export function isAuthorizedWebhookRequest(request: NextRequest): boolean {
  const expected = process.env['N8N_WEBHOOK_SECRET'];
  const provided = request.headers.get('x-webhook-secret');
  if (!expected || !provided) {
    return false;
  }
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, providedBuffer);
}
