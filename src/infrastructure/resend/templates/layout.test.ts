import { describe, expect, it } from 'vitest';
import { FALLBACK_BRANDING, type CompanyBranding } from '@/lib/branding';
import { renderEmail, renderEmailText, formatFrenchDate } from './layout';

const BRAND_WITH_LOGO: CompanyBranding = {
  name: 'Atelier Nord',
  primary: 'oklch(0.48 0.16 264)',
  accent: 'oklch(0.74 0.13 162)',
  logoUrl: 'https://cdn.example.com/atelier-nord.png',
};

const BRAND_WITHOUT_LOGO: CompanyBranding = {
  name: 'Méridien Gulf',
  primary: 'oklch(0.55 0.14 42)',
  accent: 'oklch(0.70 0.12 200)',
  logoUrl: null,
};

describe('renderEmail', () => {
  it('inclut une image de marque quand un logo existe', () => {
    const rendered = renderEmail('Sujet', BRAND_WITH_LOGO, {
      heading: 'Titre',
      paragraphs: ['Paragraphe.'],
      footerNote: 'Pied de page.',
    });
    expect(rendered.html).toContain('<img src="https://cdn.example.com/atelier-nord.png"');
  });

  it('cas limite : societe sans logo, le gabarit reste presentable avec le nom en texte', () => {
    const rendered = renderEmail('Sujet', BRAND_WITHOUT_LOGO, {
      heading: 'Titre',
      paragraphs: ['Paragraphe.'],
      footerNote: 'Pied de page.',
    });
    expect(rendered.html).not.toContain('<img');
    expect(rendered.html).toContain('Méridien Gulf');
  });

  it('convertit la couleur de marque oklch en hexadecimal, seule notation fiable en email', () => {
    const rendered = renderEmail('Sujet', BRAND_WITH_LOGO, {
      heading: 'Titre',
      paragraphs: ['Paragraphe.'],
      footerNote: 'Pied de page.',
    });
    expect(rendered.html).not.toMatch(/oklch/);
    expect(rendered.html).toMatch(/#[0-9a-f]{6}/);
  });

  it('echappe le contenu utilisateur pour eviter une injection HTML', () => {
    const rendered = renderEmail('Sujet', BRAND_WITH_LOGO, {
      heading: '<script>alert(1)</script>',
      paragraphs: ['<b>gras</b>'],
      footerNote: 'note',
    });
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;script&gt;');
  });

  it('produit une alternative texte brut lisible, sans balise', () => {
    const rendered = renderEmail('Sujet', BRAND_WITH_LOGO, {
      heading: 'Titre',
      paragraphs: ['Premier paragraphe.', 'Second paragraphe.'],
      cta: { label: 'Voir', url: 'https://app.example.com/portail' },
      footerNote: 'Pied de page.',
    });
    expect(rendered.text).not.toMatch(/<[^>]+>/);
    expect(rendered.text).toContain('Titre');
    expect(rendered.text).toContain('Premier paragraphe.');
    expect(rendered.text).toContain('Voir : https://app.example.com/portail');
    expect(rendered.text).toContain('Pied de page.');
  });

  it('fonctionne avec le branding de repli quand la societe n a pas ete resolue', () => {
    const rendered = renderEmail('Sujet', FALLBACK_BRANDING, {
      heading: 'Titre',
      paragraphs: ['Paragraphe.'],
      footerNote: 'Pied de page.',
    });
    expect(rendered.html).toContain('OnboardingRH');
  });
});

describe('renderEmailText', () => {
  it('omet le bloc CTA quand aucun lien n est fourni', () => {
    const text = renderEmailText({ heading: 'Titre', paragraphs: ['Un.'], footerNote: 'Fin.' });
    expect(text).not.toContain(' : ');
  });
});

describe('formatFrenchDate', () => {
  it('formate une date ISO en francais lisible', () => {
    expect(formatFrenchDate('2026-04-20')).toBe('20 avril 2026');
  });
});
