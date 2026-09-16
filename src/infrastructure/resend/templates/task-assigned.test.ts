import { describe, expect, it } from 'vitest';
import type { CompanyBranding } from '@/lib/branding';
import { parsePlainDate } from '@/domain/scheduling/plain-date';
import { renderTaskAssignedEmail } from './task-assigned';

const BRANDING: CompanyBranding = {
  name: 'Méridien Gulf',
  primary: 'oklch(0.55 0.14 42)',
  accent: 'oklch(0.70 0.12 200)',
  logoUrl: null,
};

describe('renderTaskAssignedEmail', () => {
  it('nomme la tache, l echeance et le beneficiaire du parcours', () => {
    const rendered = renderTaskAssignedEmail({
      ownerName: 'Ivan Informatique',
      taskTitle: 'Créer le compte IT',
      dueDate: parsePlainDate('2026-04-18'),
      journeyEmployeeName: 'Alice Arrivante',
      portalUrl: 'https://app.example.com/portail',
      branding: BRANDING,
    });

    expect(rendered.html).toContain('Créer le compte IT');
    expect(rendered.html).toContain('Alice Arrivante');
    expect(rendered.text).toContain('18 avril 2026');
    expect(rendered.text).not.toMatch(/<[^>]+>/);
  });
});
