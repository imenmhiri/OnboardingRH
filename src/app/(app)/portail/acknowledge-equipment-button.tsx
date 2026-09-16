'use client';

import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { acknowledgeEquipment } from './actions';
import { Button } from '@/components/ui/button';

/**
 * Confirme la reception d'un materiel deja remis. Un accuse en retard laisse
 * la tache liee ouverte cote domaine (T-15) ; ce bouton est la seule facon
 * pour l'employe de la refermer lui-meme.
 */
export function AcknowledgeEquipmentButton({
  requestId,
  itemName,
}: {
  readonly requestId: string;
  readonly itemName: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div className="flex flex-col items-end gap-1">
      {acknowledged ? (
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
          <CheckCircle2 aria-hidden className="size-4" />
          Réception confirmée
        </span>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={pending}
          onClick={() => {
            setPending(true);
            setError(null);
            acknowledgeEquipment(requestId)
              .then((state) => {
                if (state.ok) {
                  setAcknowledged(true);
                } else {
                  setError(state.error ?? 'Échec de la confirmation.');
                }
              })
              .finally(() => setPending(false));
          }}
        >
          <CheckCircle2 aria-hidden className="size-4" />
          Confirmer la réception
          <span className="sr-only"> de {itemName}</span>
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
      {/* Live region : la confirmation change l'affichage sans navigation, elle
          doit donc etre annoncee explicitement plutot que seulement visible.
          Reste montee dans les deux etats, sinon l'annonce ne se produit
          jamais — defaut trouve en verifiant ce script au clavier. */}
      <p role="status" aria-live="polite" className="sr-only">
        {acknowledged ? `Réception de ${itemName} confirmée.` : ''}
      </p>
    </div>
  );
}
