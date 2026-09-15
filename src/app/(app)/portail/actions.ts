'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { uploadTaskDocument } from '@/application/use-cases/upload-task-document';
import { requestDocumentLink } from '@/application/use-cases/request-document-link';
import { supabaseTaskDocumentRepository } from '@/infrastructure/supabase/task-documents';
import { supabaseStorage } from '@/infrastructure/supabase/storage';
import { supabaseAuditTrail } from '@/infrastructure/supabase/audit-trail';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server-client';
import { currentSession } from '@/lib/session';

function ports(client: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  return {
    storage: supabaseStorage(client),
    repository: supabaseTaskDocumentRepository(client),
    audit: supabaseAuditTrail(client),
  };
}

export interface UploadDocumentState {
  readonly error: string | null;
}

/**
 * Depose la piece qu'une tache attend. L'employe ne peut deposer que sur ses
 * propres taches : la RLS de task_documents_insert_visible verifie deja que la
 * tache lui est visible, mais on verifie ici le proprietaire pour donner un
 * message exploitable plutot qu'un refus brut de la base.
 */
export async function uploadDocument(
  taskId: string,
  journeyId: string,
  _previous: UploadDocumentState,
  formData: FormData,
): Promise<UploadDocumentState> {
  const session = await currentSession();
  if (!session.ok) {
    redirect('/connexion');
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choisissez un fichier avant de déposer.' };
  }

  const client = await createSupabaseServerClient();
  const body = new Uint8Array(await file.arrayBuffer());

  const result = await uploadTaskDocument(ports(client), {
    companyId: session.context.membership.companyId,
    taskId,
    journeyId,
    uploadedBy: session.context.user.id,
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    body,
  });

  if (!result.ok) {
    const messages: Record<string, string> = {
      empty_file: 'Le fichier est vide.',
      file_too_large: 'Ce fichier dépasse la taille autorisée (20 Mo).',
      unsupported_type: 'Ce type de fichier n’est pas accepté (PDF, image ou document Word).',
    };
    return {
      error:
        result.reason === 'validation'
          ? (messages[result.detail] ?? 'Ce fichier ne peut pas être déposé.')
          : 'Le dépôt a échoué. Réessayez dans un instant.',
    };
  }

  revalidatePath('/portail');
  return { error: null };
}

export interface DocumentLinkState {
  readonly url: string | null;
  readonly error: string | null;
}

/**
 * Genere un lien signe vers une piece deja deposee. C'est le seul moyen
 * d'atteindre un document personnel, jamais une URL publique ni fixe — et
 * cette generation elle-meme est l'accuse de lecture, trace dans l'audit.
 *
 * Renvoie l'URL au lieu d'y rediriger cote serveur : elle pointe vers le
 * stockage, un domaine externe que `redirect()` ne peut pas cibler avec les
 * routes typees de Next. C'est au client de s'y rendre une fois l'URL connue.
 */
export async function openDocumentLink(documentId: string): Promise<DocumentLinkState> {
  const session = await currentSession();
  if (!session.ok) {
    redirect('/connexion');
  }

  const client = await createSupabaseServerClient();
  const result = await requestDocumentLink(ports(client), {
    documentId,
    requestedBy: session.context.user.id,
  });

  if (!result.ok) {
    return { url: null, error: 'Ce lien n’est plus disponible. Réessayez.' };
  }
  return { url: result.signedUrl.url, error: null };
}
