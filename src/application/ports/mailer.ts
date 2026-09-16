/**
 * Port d'envoi d'email transactionnel. Aucune dependance a Resend ici : le
 * domaine et les cas d'usage ne connaissent que cette interface, ce qui rend
 * le chemin d'envoi testable avec un client factice, sans cle d'API.
 */

export interface EmailAddress {
  readonly email: string;
  readonly name?: string;
}

export interface EmailMessage {
  readonly to: EmailAddress;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly replyTo?: string;
}

/**
 * Distingue un succes d'un echec ou d'un rejet : le ticket exige que ces cas
 * soient traites reellement, pas avales. `invalid_recipient` couvre une
 * adresse malformee ou rejetee par le fournisseur ; `provider_error` couvre
 * une panne ou une erreur reseau qui n'a rien a voir avec le destinataire.
 */
export type SendFailureReason = 'invalid_recipient' | 'provider_error';

export type SendResult =
  | { readonly ok: true; readonly messageId: string }
  | { readonly ok: false; readonly reason: SendFailureReason; readonly detail?: string };

export interface Mailer {
  send(message: EmailMessage): Promise<SendResult>;
}
