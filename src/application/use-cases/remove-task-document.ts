import type { AuditTrail } from '@/application/ports/audit-trail';
import type { Storage } from '@/application/ports/storage';
import type { TaskDocumentRepository } from '@/application/ports/task-document-repository';

export interface RemoveTaskDocumentInput {
  readonly documentId: string;
  readonly removedBy: string;
  /** Motif de la suppression, pour la trace — ex. "deposee sur le mauvais parcours". */
  readonly reason: string;
}

export type RemoveTaskDocumentResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'not_found' };

/**
 * Cas limite du ticket : un document depose sur le mauvais parcours doit
 * pouvoir etre retire, avec une trace de pourquoi. On supprime le fichier du
 * stockage avant la ligne en base, jamais l'inverse — sinon une ligne orpheline
 * pourrait encore generer un lien vers un fichier qui n'existe plus.
 */
export async function removeTaskDocument(
  ports: { storage: Storage; repository: TaskDocumentRepository; audit: AuditTrail },
  input: RemoveTaskDocumentInput,
): Promise<RemoveTaskDocumentResult> {
  const document = await ports.repository.findById(input.documentId);
  if (!document) {
    return { ok: false, reason: 'not_found' };
  }

  await ports.storage.remove(document.storagePath);
  await ports.repository.delete(document.id);

  await ports.audit.record({
    companyId: document.companyId,
    actorId: input.removedBy,
    action: 'document.removed',
    taskId: document.taskId,
    payload: { documentId: document.id, fileName: document.fileName, reason: input.reason },
  });

  return { ok: true };
}
