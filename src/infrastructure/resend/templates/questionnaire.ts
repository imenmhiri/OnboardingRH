import type { CompanyBranding } from '@/lib/branding';
import { renderEmail, type RenderedEmail } from './layout';

/**
 * Construit et teste des a present ; pas encore appele par un declencheur
 * reel (attend W3 — bilan J+7/J+30, T-23).
 */
export interface QuestionnaireEmailInput {
  readonly employeeName: string;
  /** "J+7" ou "J+30". */
  readonly milestoneLabel: string;
  readonly surveyUrl: string;
  readonly branding: CompanyBranding;
}

export function renderQuestionnaireEmail(input: QuestionnaireEmailInput): RenderedEmail {
  const subject = `Votre avis compte — bilan ${input.milestoneLabel}`;

  return renderEmail(subject, input.branding, {
    heading: `Comment se passe votre integration ?`,
    paragraphs: [
      `Bonjour ${input.employeeName},`,
      `Vous etes arrive depuis quelque temps chez ${input.branding.name} : un court questionnaire ${input.milestoneLabel} nous permet de savoir ce qui fonctionne et ce qui doit etre ameliore.`,
      `Vos reponses restent confidentielles et ne sont jamais partagees nommement.`,
    ],
    cta: { label: 'Repondre au questionnaire', url: input.surveyUrl },
    footerNote: `Questionnaire automatique OnboardingRH. Deux minutes suffisent.`,
  });
}
