import { describe, expect, it } from 'vitest';
import type { CompanyBranding } from '@/lib/branding';
import { parsePlainDate } from '@/domain/scheduling/plain-date';
import { renderReminderEmail } from './reminder';

const BRANDING: CompanyBranding = {
  name: 'Atelier Nord',
  primary: '#123456',
  accent: '#654321',
  logoUrl: null,
};

describe('renderReminderEmail', () => {
  it('indique le retard en jours ouvres', () => {
    const rendered = renderReminderEmail({
      ownerName: 'Marc Manceau',
      taskTitle: 'Accueil',
      dueDate: parsePlainDate('2026-04-20'),
      workingDaysLate: 2,
      portalUrl: 'https://app.example.com/portail',
      branding: BRANDING,
    });

    expect(rendered.html).toContain('2 jours ouvres');
    expect(rendered.subject).toContain('Accueil');
  });

  it('accorde au singulier pour un seul jour de retard', () => {
    const rendered = renderReminderEmail({
      ownerName: 'Marc Manceau',
      taskTitle: 'Accueil',
      dueDate: parsePlainDate('2026-04-20'),
      workingDaysLate: 1,
      portalUrl: 'https://app.example.com/portail',
      branding: BRANDING,
    });

    expect(rendered.html).toContain('1 jour ouvre');
  });
});
