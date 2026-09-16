import type { CompanyBranding } from '@/lib/branding';
import type { EmailChannel } from '@/domain/notifications/recipient-resolution';
import type { PlainDate } from '@/domain/scheduling/plain-date';
import { formatFrenchDate, renderEmail, type EmailContentBlock, type RenderedEmail } from './layout';

export interface WelcomeEmailInput {
  readonly employeeName: string;
  readonly arrivalDate: PlainDate;
  readonly portalUrl: string;
  readonly branding: CompanyBranding;
  readonly channel: EmailChannel;
  readonly managerName: string | null;
}

/**
 * Le lien pointe vers le portail, jamais vers un document : la connexion
 * Supabase le protege deja, ce qui suffit au sens du cahier des charges
 * ("lien signe" n'est necessaire que pour contourner l'authentification).
 */
export function renderWelcomeEmail(input: WelcomeEmailInput): RenderedEmail {
  const subject = `Bienvenue chez ${input.branding.name}`;
  const dateLabel = formatFrenchDate(input.arrivalDate);

  const block: EmailContentBlock =
    input.channel === 'manager'
      ? {
          heading: `${input.employeeName} arrive le ${dateLabel}`,
          paragraphs: [
            input.managerName ? `Bonjour ${input.managerName},` : 'Bonjour,',
            `${input.employeeName} n'a pas encore d'adresse email joignable : ce message de bienvenue vous est transmis pour une remise en main propre le jour de son arrivee, le ${dateLabel}.`,
            `Le parcours d'integration est deja pret cote application : taches, responsables et echeances sont visibles depuis le cockpit.`,
          ],
          cta: { label: 'Ouvrir le cockpit', url: input.portalUrl },
          footerNote: `Message envoye automatiquement par OnboardingRH, a defaut d'adresse personnelle ou professionnelle joignable pour ${input.employeeName}.`,
        }
      : {
          heading: `Bienvenue chez ${input.branding.name}, ${input.employeeName} !`,
          paragraphs: [
            `Bonjour ${input.employeeName},`,
            `Toute l'equipe est heureuse de vous accueillir le ${dateLabel}. Votre parcours d'integration est deja prepare : documents a fournir, contacts de la premiere semaine et agenda vous attendent sur le portail.`,
            `Connectez-vous des que possible pour decouvrir votre feuille de route.`,
          ],
          cta: { label: 'Ouvrir mon portail', url: input.portalUrl },
          footerNote: `Une question avant votre arrivee ? Repondez simplement a cet email, votre equipe RH vous lira.`,
        };

  return renderEmail(subject, input.branding, block);
}
