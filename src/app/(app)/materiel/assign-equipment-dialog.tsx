'use client';

import { Tag } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';
import { assignEquipment, type AssignState } from './actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { LiveRegion } from '@/components/ui/live-region';

const ASSIGN_INITIAL: AssignState = { error: null };

/** Attribue une unite identifiee (numero de serie ou de badge) a une demande commandee. */
export function AssignEquipmentDialog({
  requestId,
  itemLabel,
}: {
  readonly requestId: string;
  readonly itemLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const boundAction = assignEquipment.bind(null, requestId);
  const [state, action, pending] = useActionState(boundAction, ASSIGN_INITIAL);
  // Cette action ne redirige jamais (contrairement au reste de l'ecran) : sans
  // fermeture explicite ici, la fenetre restait ouverte apres une attribution
  // reussie, sans aucune confirmation — defaut trouve en verifiant ce dialogue
  // au clavier pendant T-20.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!state.error) {
      setOpen(false);
      setAnnouncement(`Attribution enregistrée pour ${itemLabel}.`);
    }
  }, [state, itemLabel]);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary" size="sm">
            <Tag aria-hidden className="size-4" />
            Attribuer
          </Button>
        </DialogTrigger>
        <DialogContent
          title="Attribuer une unité"
          description={`Numéro de série ou de badge pour ${itemLabel}.`}
        >
          <form action={action} className="space-y-5">
            <Field label="Numéro de série ou de badge" required>
              <Input name="unitReference" required placeholder="ex. SN-00482" />
            </Field>

            {state.error ? (
              <p role="alert" className="rounded-[var(--radius)] bg-danger-soft px-3 py-2 text-sm text-danger">
                {state.error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Annuler
                </Button>
              </DialogClose>
              <Button type="submit" loading={pending}>
                Attribuer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <LiveRegion message={announcement} />
    </>
  );
}
