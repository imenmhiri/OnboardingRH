'use client';

import { Upload } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';
import { uploadDocument, type UploadDocumentState } from './actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { LiveRegion } from '@/components/ui/live-region';

const INITIAL: UploadDocumentState = { error: null };

export function DocumentUploadDialog({
  taskId,
  journeyId,
  label,
}: {
  readonly taskId: string;
  readonly journeyId: string;
  readonly label: string;
}) {
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const boundAction = uploadDocument.bind(null, taskId, journeyId);
  const [state, action, pending] = useActionState(boundAction, INITIAL);
  // Cette action ne redirige jamais : sans fermeture explicite, la fenetre
  // restait ouverte apres un depot reussi, sans rien pour l'annoncer — meme
  // defaut que la fenetre d'attribution de materiel (materiel/assign-equipment-dialog.tsx),
  // corrigés ensemble pendant T-20.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!state.error) {
      setOpen(false);
      setAnnouncement(`Pièce « ${label} » déposée.`);
    }
  }, [state, label]);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary" size="sm">
            <Upload aria-hidden className="size-4" />
            Déposer
          </Button>
        </DialogTrigger>
        <DialogContent
          title={`Déposer : ${label}`}
          description="PDF, image ou document Word, 20 Mo maximum."
        >
          <form action={action} className="space-y-5">
            <Field label="Fichier" required>
              <Input
                name="file"
                type="file"
                required
                accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                className="h-auto border-0 bg-transparent p-0 file:mr-3 file:rounded-[var(--radius)] file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-text hover:file:brightness-110"
              />
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
                Déposer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <LiveRegion message={announcement} />
    </>
  );
}
