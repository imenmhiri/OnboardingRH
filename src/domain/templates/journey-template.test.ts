import { describe, expect, it } from 'vitest';
import type { HireContext, JourneyTemplate, TemplateCriteria } from './journey-template';
import { selectTemplate, specificityOf } from './journey-template';

function template(
  id: string,
  companyId: string,
  criteria: Partial<TemplateCriteria> = {},
): JourneyTemplate {
  return {
    id,
    companyId,
    name: `Parcours ${id}`,
    criteria: { jobFamily: null, siteId: null, contractType: null, ...criteria },
    taskDefinitions: [],
  };
}

const context: HireContext = {
  companyId: 'company-nord',
  jobFamily: 'atelier',
  siteId: 'site-lille',
  contractType: 'cdi',
};

describe('selectTemplate', () => {
  it('retient le parcours par defaut quand rien de plus precis n existe', () => {
    const result = selectTemplate([template('default', 'company-nord')], context);
    expect(result.ok && result.template.id).toBe('default');
    expect(result.ok && result.specificity).toBe(0);
  });

  it('prefere le parcours le plus specifique', () => {
    const result = selectTemplate(
      [
        template('default', 'company-nord'),
        template('atelier', 'company-nord', { jobFamily: 'atelier' }),
        template('atelier-lille', 'company-nord', { jobFamily: 'atelier', siteId: 'site-lille' }),
      ],
      context,
    );
    expect(result.ok && result.template.id).toBe('atelier-lille');
    expect(result.ok && result.specificity).toBe(2);
  });

  it('ecarte un parcours dont un critere ne correspond pas', () => {
    const result = selectTemplate(
      [
        template('default', 'company-nord'),
        template('bureau', 'company-nord', { jobFamily: 'bureau' }),
      ],
      context,
    );
    expect(result.ok && result.template.id).toBe('default');
  });

  it('ne traverse jamais la frontiere d une societe', () => {
    const result = selectTemplate(
      [template('gulf-default', 'company-gulf', { jobFamily: 'atelier' })],
      context,
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe('no_match');
  });

  it('signale une ambiguite au lieu de trancher par l ordre des lignes', () => {
    const result = selectTemplate(
      [
        template('par-metier', 'company-nord', { jobFamily: 'atelier' }),
        template('par-site', 'company-nord', { siteId: 'site-lille' }),
      ],
      context,
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe('ambiguous_match');
    expect(!result.ok && result.reason === 'ambiguous_match' && result.templateIds).toEqual([
      'par-metier',
      'par-site',
    ]);
  });

  it('distingue deux types de contrat', () => {
    const templates = [
      template('cdi', 'company-nord', { contractType: 'cdi' }),
      template('stage', 'company-nord', { contractType: 'stage' }),
    ];
    expect(selectTemplate(templates, context).ok && selectTemplate(templates, context)).toMatchObject({
      template: { id: 'cdi' },
    });
    const intern = selectTemplate(templates, { ...context, contractType: 'stage' });
    expect(intern.ok && intern.template.id).toBe('stage');
  });
});

describe('specificityOf', () => {
  it('compte les criteres reellement fixes', () => {
    expect(specificityOf({ jobFamily: null, siteId: null, contractType: null })).toBe(0);
    expect(specificityOf({ jobFamily: 'atelier', siteId: 'site-lille', contractType: 'cdi' })).toBe(3);
  });
});
