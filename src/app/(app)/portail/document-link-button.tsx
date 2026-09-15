'use client';

import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { openDocumentLink } from './actions';
import { Button } from '@/components/ui/button';

/**
 * Genere un lien signe a duree limitee puis s'y rend : jamais une URL fixe ou
 * publique. Ce clic est lui-meme l'accuse de lecture, trace dans l'audit par
 * le cas d'usage qui genere le lien (T-07).
 */
export function DocumentLinkButton({ documentId }: { readonly documentId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (url) {
      window.location.href = url;
    }
  }, [url]);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={pending}
        onClick={() => {
          setPending(true);
          setError(null);
          openDocumentLink(documentId)
            .then((state) => {
              if (state.url) {
                setUrl(state.url);
              } else {
                setError(state.error ?? 'Lien indisponible.');
              }
            })
            .finally(() => setPending(false));
        }}
      >
        <ExternalLink aria-hidden className="size-4" />
        Consulter
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
