import { describe, expect, it } from 'vitest';
import type { CompanyBranding } from '@/lib/branding';
import { parsePlainDate } from '@/domain/scheduling/plain-date';
import { renderWelcomeEmail } from './welcome';

const BRANDING: CompanyBranding = {
  name: 'Atelier Nord',
  primary: 'oklch(0.48 0.16 264)',
  accent: 'oklch(0.74 0.13 162)',
  logoUrl: null,
};

describe('renderWelcomeEmail', () => {
  it('accueille l employe directement quand le canal est personnel ou professionnel', () => {
    const rendered = renderWelcomeEmail({
      employeeName: 'Alice Arrivante',
      arrivalDate: parsePlainDate('2026-04-20'),
      portalUrl: 'https://app.example.com/portail',
      branding: BRANDING,
      channel: 'personal',
      managerName: null,
    });

    expect(rendered.subject).toContain('Atelier Nord');
    expect(rendered.html).toContain('Alice Arrivante');
    expect(rendered.html).toContain('20 avril 2026');
    expect(rendered.text).toContain('Alice Arrivante');
    expect(rendered.text).not.toMatch(/<[^>]+>/);
  });

  it('cas limite : bascule vers le manager, le message explique la remise en main propre', () => {
    const rendered = renderWelcomeEmail({
      employeeName: 'Alice Arrivante',
      arrivalDate: parsePlainDate('2026-04-20'),
      portalUrl: 'https://app.example.com/portail',
      branding: BRANDING,
      channel: 'manager',
      managerName: 'Marc Manceau',
    });

    expect(rendered.html).toContain('Marc Manceau');
    // Le HTML echappe les apostrophes (&#39;) pour rester du HTML valide : on
    // verifie le texte brut, non echappe, qui porte le meme message.
    expect(rendered.text).toContain('n\'a pas encore d\'adresse email joignable');
    expect(rendered.text).toContain('remise en main propre');
  });
});
