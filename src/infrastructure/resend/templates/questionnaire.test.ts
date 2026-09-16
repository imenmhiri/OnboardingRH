import { describe, expect, it } from 'vitest';
import type { CompanyBranding } from '@/lib/branding';
import { renderQuestionnaireEmail } from './questionnaire';

const BRANDING: CompanyBranding = {
  name: 'Atelier Nord',
  primary: '#123456',
  accent: '#654321',
  logoUrl: null,
};

describe('renderQuestionnaireEmail', () => {
  it('mentionne le jalon et rassure sur la confidentialite', () => {
    const rendered = renderQuestionnaireEmail({
      employeeName: 'Alice Arrivante',
      milestoneLabel: 'J+30',
      surveyUrl: 'https://app.example.com/questionnaire',
      branding: BRANDING,
    });

    expect(rendered.subject).toContain('J+30');
    expect(rendered.html).toContain('confidentielles');
    expect(rendered.text).toContain('Repondre au questionnaire : https://app.example.com/questionnaire');
  });
});
