'use client';

import { Copy } from 'lucide-react';
import { useState } from 'react';
import { duplicate } from '../actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import type { CompanySite } from '@/application/ports/site-directory';

export function DuplicateTemplateDialog({
  templateId,
  templateName,
  sites,
}: {
  readonly templateId: string;
  readonly templateName: string;
  readonly sites: readonly CompanySite[];
}) {
  const [open, setOpen] = useState(false);
  const boundAction = duplicate.bind(null, templateId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Copy aria-hidden className="size-4" />
          Dupliquer
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Dupliquer ce template"
        description="Les tâches et leurs dépendances sont copiées ; seuls les critères changent."
      >
        <form action={boundAction} className="space-y-5">
          <Field label="Nom du nouveau template" required>
            <Input name="name" required defaultValue={`${templateName} (copie)`} />
          </Field>
          <Field label="Métier" description="Laissez vide pour « n’importe lequel ».">
            <Input name="jobFamily" placeholder="ex. atelier" />
          </Field>
          <Field label="Site" description="Laissez vide pour « n’importe lequel ».">
            <select
              name="siteId"
              className="h-10 w-full rounded-[var(--radius)] border border-border bg-surface-raised px-3 text-sm text-text hover:border-border-strong"
            >
              <option value="">N’importe lequel</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type de contrat" description="Laissez vide pour « n’importe lequel ».">
            <Input name="contractType" placeholder="ex. cdi" />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Annuler
              </Button>
            </DialogClose>
            <Button type="submit">Dupliquer</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
