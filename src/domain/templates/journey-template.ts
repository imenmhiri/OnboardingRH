import type { Criticality, OwnerRole } from '../tasks/task';

/**
 * A journey template is a row, selected at runtime from the hire's company,
 * job family and site. Nothing here knows a company by name: a subsidiary that
 * needs its own journey inserts a template, it does not get a branch.
 */

export interface TemplateCriteria {
  /** Null means "any" — the criterion does not narrow the template. */
  readonly jobFamily: string | null;
  readonly siteId: string | null;
  readonly contractType: string | null;
}

export interface TaskDefinition {
  /** Stable within the template; dependencies are expressed with these keys. */
  readonly key: string;
  readonly title: string;
  readonly ownerRole: OwnerRole;
  /** Working days relative to the arrival date; negative happens before it. */
  readonly offsetInWorkingDays: number;
  readonly dependsOn: readonly string[];
  /** Document the owner is expected to attach, if any. */
  readonly expectedDocument: string | null;
  /** Set when the same work serves several arrivals at once. */
  readonly sharedKey: string | null;
  /** Carried to the instantiated task — drives escalation thresholds (T-13). */
  readonly criticality: Criticality;
}

export interface JourneyTemplate {
  readonly id: string;
  readonly companyId: string;
  readonly name: string;
  readonly criteria: TemplateCriteria;
  readonly taskDefinitions: readonly TaskDefinition[];
}

export interface HireContext {
  readonly companyId: string;
  readonly jobFamily: string;
  readonly siteId: string;
  readonly contractType: string;
}

export type TemplateSelection =
  | { readonly ok: true; readonly template: JourneyTemplate; readonly specificity: number }
  | { readonly ok: false; readonly reason: 'no_match' }
  | { readonly ok: false; readonly reason: 'ambiguous_match'; readonly templateIds: readonly string[] };

function matches(criteria: TemplateCriteria, context: HireContext): boolean {
  return (
    (criteria.jobFamily === null || criteria.jobFamily === context.jobFamily) &&
    (criteria.siteId === null || criteria.siteId === context.siteId) &&
    (criteria.contractType === null || criteria.contractType === context.contractType)
  );
}

/** How many criteria the template actually pins down. */
export function specificityOf(criteria: TemplateCriteria): number {
  return [criteria.jobFamily, criteria.siteId, criteria.contractType].filter(
    (criterion) => criterion !== null,
  ).length;
}

/**
 * Picks the most specific template matching the hire. Two templates equally
 * specific are reported as ambiguous rather than settled by insertion order:
 * silently picking one would make the journey depend on the order rows came
 * back, which nobody can debug six months later.
 */
export function selectTemplate(
  templates: readonly JourneyTemplate[],
  context: HireContext,
): TemplateSelection {
  const candidates = templates
    .filter((template) => template.companyId === context.companyId)
    .filter((template) => matches(template.criteria, context));

  if (candidates.length === 0) {
    return { ok: false, reason: 'no_match' };
  }

  const bestSpecificity = Math.max(...candidates.map((t) => specificityOf(t.criteria)));
  const best = candidates.filter((t) => specificityOf(t.criteria) === bestSpecificity);

  const [winner] = best;
  if (best.length > 1 || !winner) {
    return { ok: false, reason: 'ambiguous_match', templateIds: best.map((t) => t.id).sort() };
  }
  return { ok: true, template: winner, specificity: bestSpecificity };
}
