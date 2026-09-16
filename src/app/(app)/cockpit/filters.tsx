import { ListFilter, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CockpitSearchParams } from './types';

/**
 * Filtres par site, métier et responsable. Un simple formulaire GET : la
 * sélection survit à l'absence de JavaScript et se lit dans l'URL, comme le
 * reste de l'état de cette page — aucun état client à synchroniser.
 */
export function CockpitFilters({
  sites,
  jobFamilies,
  managers,
  values,
}: {
  readonly sites: readonly { id: string; name: string }[];
  readonly jobFamilies: readonly string[];
  readonly managers: readonly { id: string; name: string }[];
  readonly values: CockpitSearchParams;
}) {
  const hasActiveFilter = Boolean(values.site || values.metier || values.responsable);

  return (
    <form
      method="get"
      className="flex flex-wrap items-end gap-4 rounded-[calc(var(--radius)+2px)] border border-border bg-surface-raised p-4"
      aria-label="Filtrer le cockpit"
    >
      <div className="space-y-1.5">
        <label htmlFor="cockpit-filter-site" className="block text-sm font-medium text-text">
          Site
        </label>
        <select
          id="cockpit-filter-site"
          name="site"
          defaultValue={values.site ?? ''}
          className="h-10 w-48 rounded-[var(--radius)] border border-border bg-surface-raised px-3 text-sm text-text hover:border-border-strong"
        >
          <option value="">Tous les sites</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="cockpit-filter-metier" className="block text-sm font-medium text-text">
          Métier
        </label>
        <select
          id="cockpit-filter-metier"
          name="metier"
          defaultValue={values.metier ?? ''}
          className="h-10 w-48 rounded-[var(--radius)] border border-border bg-surface-raised px-3 text-sm text-text hover:border-border-strong"
        >
          <option value="">Tous les métiers</option>
          {jobFamilies.map((jobFamily) => (
            <option key={jobFamily} value={jobFamily}>
              {jobFamily}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="cockpit-filter-responsable" className="block text-sm font-medium text-text">
          Responsable
        </label>
        <select
          id="cockpit-filter-responsable"
          name="responsable"
          defaultValue={values.responsable ?? ''}
          className="h-10 w-56 rounded-[var(--radius)] border border-border bg-surface-raised px-3 text-sm text-text hover:border-border-strong"
        >
          <option value="">Tous les responsables</option>
          {managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <Button type="submit" variant="secondary" size="md">
          <ListFilter aria-hidden className="size-4" />
          Filtrer
        </Button>
        {hasActiveFilter ? (
          <Button asChild variant="ghost" size="md">
            <a href="/cockpit">
              <RotateCcw aria-hidden className="size-4" />
              Réinitialiser
            </a>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
