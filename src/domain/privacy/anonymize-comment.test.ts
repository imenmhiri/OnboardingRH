import { describe, expect, it } from 'vitest';
import { anonymizeComment, type KnownIdentifiers } from './anonymize-comment';

const ROSTER: KnownIdentifiers = {
  names: ['Alice Arrivante', 'Marc Manager', 'Rachel RH'],
  emails: ['alice.perso@example.com'],
  teamLabels: ['Atelier Nord', 'Lille'],
};

describe('anonymizeComment', () => {
  it('redacts a comment containing a known full name', () => {
    const result = anonymizeComment('Alice Arrivante a ete tres bien accueillie.', ROSTER);
    expect(result).toBe('[personne] a ete tres bien accueillie.');
  });

  it('redacts a comment containing an email address', () => {
    const result = anonymizeComment('Contactez-moi a jean.dupont@exemple.fr si besoin.', ROSTER);
    expect(result).toBe('Contactez-moi a [email] si besoin.');
  });

  it('leaves a comment with no identifying information unchanged', () => {
    const comment = 'Le poste de travail etait pret a temps, merci beaucoup.';
    expect(anonymizeComment(comment, ROSTER)).toBe(comment);
  });

  it('does not over-redact a name that is a substring of another word', () => {
    // "Ana" est un prenom plausible mais ne doit pas casser "Analyse".
    const roster: KnownIdentifiers = { names: ['Ana'], emails: [], teamLabels: [] };
    const comment = "L'analyse du dossier a pris du retard.";
    expect(anonymizeComment(comment, roster)).toBe(comment);
  });

  it('is case-insensitive', () => {
    const result = anonymizeComment('ALICE ARRIVANTE a pose une question.', ROSTER);
    expect(result).toBe('[personne] a pose une question.');
  });

  it('redacts multiple different known names in a single comment', () => {
    const result = anonymizeComment('Marc Manager et Rachel RH ont ete tres reactifs.', ROSTER);
    expect(result).toBe('[personne] et [personne] ont ete tres reactifs.');
  });

  it('redacts a known first name mentioned alone, not just the full name', () => {
    const result = anonymizeComment("Alice m'a beaucoup aide pendant la premiere semaine.", ROSTER);
    expect(result).toBe("[personne] m'a beaucoup aide pendant la premiere semaine.");
  });

  it('redacts a site name mentioned by its short form when the roster only has the full label', () => {
    const roster: KnownIdentifiers = { names: [], emails: [], teamLabels: ['Siège de Lille', 'Atelier Nord'] };
    const result = anonymizeComment("Merci a l'equipe de Lille pour l'accueil.", roster);
    expect(result).not.toContain('Lille');
    expect(result).toContain('[site]');
  });

  it('does not redact common short words found inside a multi-word site label', () => {
    const roster: KnownIdentifiers = { names: [], emails: [], teamLabels: ['Siège de Lille'] };
    const comment = 'De nombreuses personnes ont apprecie la journee.';
    expect(anonymizeComment(comment, roster)).toBe(comment);
  });

  it('redacts mentions of the site and the company name', () => {
    const result = anonymizeComment("L'equipe de Lille chez Atelier Nord est tres accueillante.", ROSTER);
    expect(result).toBe("L'equipe de [site] chez [site] est tres accueillante.");
  });

  it('redacts a known email even in a different casing', () => {
    const result = anonymizeComment('Ecrivez a ALICE.PERSO@EXAMPLE.COM pour suivre.', ROSTER);
    expect(result).toBe('Ecrivez a [email] pour suivre.');
  });

  it('does not touch a lone capitalized word at the start of a sentence', () => {
    const comment = 'Le materiel est arrive avec un jour de retard.';
    expect(anonymizeComment(comment, ROSTER)).toBe(comment);
  });

  describe('unlisted proper name (edge case of the ticket)', () => {
    it('redacts a two-word proper name that is not on the roster at all', () => {
      const result = anonymizeComment("Jean Dupont m'a beaucoup aide pendant mon arrivee.", ROSTER);
      expect(result).not.toContain('Jean');
      expect(result).not.toContain('Dupont');
      expect(result).toContain('[personne]');
    });

    it('documented limit: a single-word unlisted name with no roster match can slip through', () => {
      // Cas honnetement documente : aucun garde-fou deterministe ne peut
      // attraper un nom isole, hors roster, sans generer un nombre
      // inacceptable de faux positifs sur des mots ordinaires en debut de
      // phrase. C'est pourquoi le seuil minimal de repondants et la synthese
      // groupee restent la protection de dernier recours (voir le use-case).
      const result = anonymizeComment('Kevin a beaucoup aide cette semaine.', {
        names: [],
        emails: [],
        teamLabels: [],
      });
      expect(result).toContain('Kevin');
    });
  });

  it('handles an empty roster without throwing', () => {
    const comment = 'Tout va bien, rien a signaler.';
    expect(anonymizeComment(comment, { names: [], emails: [], teamLabels: [] })).toBe(comment);
  });
});
