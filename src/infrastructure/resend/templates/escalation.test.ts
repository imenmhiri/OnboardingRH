import { describe, expect, it } from 'vitest';
import type { CompanyBranding } from '@/lib/branding';
import { parsePlainDate } from '@/domain/scheduling/plain-date';
import { renderEscalationEmail } from './escalation';

const BRANDING: CompanyBranding = {
  name: 'Atelier Nord',
  primary: '#123456',
  accent: '#654321',
  logoUrl: null,
};

describe('renderEscalationEmail', () => {
  it('nomme le manager, le proprietaire de la tache et la tache elle-meme', () => {
    const rendered = renderEscalationEmail({
      managerName: 'Nadia Nour',
      ownerName: 'Marc Manceau',
      taskTitle: 'Accueil',
      dueDate: parsePlainDate('2026-04-20'),
      portalUrl: 'https://app.example.com/portail',
      branding: BRANDING,
    });

    expect(rendered.html).toContain('Nadia Nour');
    expect(rendered.html).toContain('Marc Manceau');
    expect(rendered.html).toContain('Accueil');
  });
});
