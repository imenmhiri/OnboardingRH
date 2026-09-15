import { resolveSignedUrlTtl } from '@/domain/documents/document-policy';
import type { AuditTrail } from '@/application/ports/audit-trail';
import type { SignedUrl, Storage } from '@/application/ports/storage';
import type { TaskDocumentRepository } from '@/application/ports/task-document-repository';

export interface RequestDocumentLinkInput {
  readonly documentId: string;
  readonly requestedBy: string;
  readonly ttlSeconds?: number;
}

export type RequestDocumentLinkResult =
  | { readonly ok: true; readonly signedUrl: SignedUrl }
  | { readonly ok: false; readonly reason: 'not_found' }
  | { readonly ok: false; readonly reason: 'storage_error' };

/**
 * Genere un lien signe pour une piece deja deposee, et trace qui l'a demande,
 * pour quel document, quand. C'est cette trace qui repond a l'exigence de
 * tracabilite du ticket — la RLS decide deja qui a le droit de voir la tache.
 */
export async function requestDocumentLink(
  ports: { storage: Storage; repository: TaskDocumentRepository; audit: AuditTrail },
  input: RequestDocumentLinkInput,
): Promise<RequestDocumentLinkResult> {
  const document = await ports.repository.findById(input.documentId);
  if (!document) {
    return { ok: false, reason: 'not_found' };
  }

  const ttl = resolveSignedUrlTtl(input.ttlSeconds);
  const signedUrl = await ports.storage.createSignedUrl(document.storagePath, ttl);
  if (!signedUrl) {
    return { ok: false, reason: 'storage_error' };
  }

  await ports.audit.record({
    companyId: document.companyId,
    actorId: input.requestedBy,
    action: 'document.link_generated',
    taskId: document.taskId,
    payload: { documentId: document.id, expiresAt: signedUrl.expiresAt.toISOString() },
  });

  return { ok: true, signedUrl };
}
