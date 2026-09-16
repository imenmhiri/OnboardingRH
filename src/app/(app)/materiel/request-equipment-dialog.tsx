'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { createEquipmentRequest } from './actions';
import type { CatalogItemRow, JourneyRow } from './types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';

const CATEGORY_LABEL: Record<CatalogItemRow['category'], string> = {
  computer: 'Ordinateur',
  badge: 'Badge',
  accessory: 'Accessoire',
};

/** Ouvre une ou plusieurs demandes de materiel pour un parcours, depuis le catalogue de la société. */
export function RequestEquipmentDialog({
  journeys,
  catalogItems,
}: {
  readonly journeys: readonly JourneyRow[];
  readonly catalogItems: readonly CatalogItemRow[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden className="size-4" />
          Nouvelle demande
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Demander du matériel"
        description="Choisissez le parcours concerné et les articles du catalogue."
      >
        <form action={createEquipmentRequest} className="space-y-5">
          <Field label="Parcours" required>
            <select
              id="materiel-journey"
              name="journeyId"
              required
              className="h-10 w-full rounded-[var(--radius)] border border-border bg-surface-raised px-3 text-sm text-text hover:border-border-strong"
            >
              <option value="">Choisissez un parcours</option>
              {journeys.map((journey) => (
                <option key={journey.id} value={journey.id}>
                  {journey.employee_name} — arrivée le {journey.arrival_date}
                </option>
              ))}
            </select>
          </Field>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-text">
              Articles du catalogue<span className="ml-1 text-danger" aria-hidden>*</span>
              <span className="sr-only"> (obligatoire, au moins un article)</span>
            </legend>
            {catalogItems.length === 0 ? (
              <p className="text-sm text-text-muted">Aucun article actif dans le catalogue.</p>
            ) : (
              <ul className="space-y-1.5">
                {catalogItems.map((item) => (
                  <li key={item.id} className="flex items-center gap-2">
                    <input
                      id={`catalog-${item.id}`}
                      type="checkbox"
                      name="catalogItemIds"
                      value={item.id}
                      className="size-4 rounded border-border text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    />
                    <label htmlFor={`catalog-${item.id}`} className="text-sm text-text">
                      {item.name} <span className="text-text-muted">({CATEGORY_LABEL[item.category]})</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Annuler
              </Button>
            </DialogClose>
            <Button type="submit">Demander</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
