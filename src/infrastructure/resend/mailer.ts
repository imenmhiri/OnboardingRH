import { Resend } from 'resend';
import type { EmailMessage, Mailer, SendFailureReason, SendResult } from '@/application/ports/mailer';

/**
 * Sous-ensemble du client Resend dont ce module a besoin. Injecter cette
 * interface plutot que d'appeler `new Resend()` a l'interieur du port permet
 * de la remplacer par un client factice en test, sans jamais toucher au
 * reseau ni exiger une cle d'API reelle.
 */
export interface ResendLikeClient {
  readonly emails: {
    send(payload: {
      readonly from: string;
      readonly to: string[];
      readonly subject: string;
      readonly html: string;
      readonly text: string;
      readonly reply_to?: string;
    }): Promise<{
      readonly data: { readonly id: string } | null;
      readonly error: { readonly message: string; readonly name?: string; readonly statusCode?: number } | null;
    }>;
  };
}

/**
 * Codes d'erreur Resend qui designent le destinataire plutot qu'une panne du
 * fournisseur — voir https://resend.com/docs/api-reference/errors. `name`
 * seul ne suffit pas : verifie en verification reelle T-24 que Resend renvoie
 * "validation_error" a la fois pour une adresse malformee ET pour une cle
 * d'API invalide (401). Le statusCode tranche : 401/403 est toujours une
 * panne cote fournisseur/config, jamais le destinataire, meme si le nom
 * pretend le contraire.
 */
const RECIPIENT_ERROR_CODES: ReadonlySet<string> = new Set([
  'validation_error',
  'invalid_parameter',
  'missing_required_field',
]);

const AUTH_STATUS_CODES: ReadonlySet<number> = new Set([401, 403]);

function classifyError(name: string | undefined, statusCode: number | undefined): SendFailureReason {
  if (statusCode !== undefined && AUTH_STATUS_CODES.has(statusCode)) {
    return 'provider_error';
  }
  return name && RECIPIENT_ERROR_CODES.has(name) ? 'invalid_recipient' : 'provider_error';
}

export function createResendMailer(client: ResendLikeClient, from: string): Mailer {
  return {
    async send(message: EmailMessage): Promise<SendResult> {
      try {
        const { data, error } = await client.emails.send({
          from,
          to: [message.to.email],
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        });

        if (error) {
          return { ok: false, reason: classifyError(error.name, error.statusCode), detail: error.message };
        }
        if (!data) {
          return { ok: false, reason: 'provider_error', detail: 'Reponse vide de Resend.' };
        }
        return { ok: true, messageId: data.id };
      } catch (err) {
        return {
          ok: false,
          reason: 'provider_error',
          detail: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

/**
 * Lit `RESEND_API_KEY` / `RESEND_FROM` depuis l'environnement — jamais de cle
 * en dur dans le depot. Echoue tot et clairement si l'une des deux manque,
 * plutot que de laisser Resend renvoyer une erreur opaque plus tard.
 */
export function createResendMailerFromEnv(): Mailer {
  const apiKey = process.env['RESEND_API_KEY'];
  const from = process.env['RESEND_FROM'];
  if (!apiKey) {
    throw new Error("Variable d'environnement manquante : RESEND_API_KEY. Voir .env.example.");
  }
  if (!from) {
    throw new Error("Variable d'environnement manquante : RESEND_FROM. Voir .env.example.");
  }
  return createResendMailer(new Resend(apiKey) as unknown as ResendLikeClient, from);
}
