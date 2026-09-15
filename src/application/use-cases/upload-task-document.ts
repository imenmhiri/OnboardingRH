import { v4 as uuidv4 } from 'uuid';
import { buildStoragePath, validateDocumentUpload } from '@/domain/documents/document-policy';
import type { AuditTrail } from '@/application/ports/audit-trail';
import type { Storage } from '@/application/ports/storage';
import type { NewTaskDocument, TaskDocumentRecord, TaskDocumentRepository } from '@/application/ports/task-document-repository';

export interface UploadTaskDocumentInput {
  readonly companyId: string;
  readonly taskId: string;
  readonly journeyId?: string;
  readonly uploadedBy: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly body: Uint8Array | Blob;
}

export type UploadTaskDocumentResult =
  | { readonly ok: true; readonly document: TaskDocumentRecord }
  | { readonly ok: false; readonly reason: 'validation'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'storage_error' };

/**
 * Depose une piece jointe : validee dans le domaine avant tout appel reseau,
 * ecrite dans le bucket sous un chemin qui partitionne par tache, enregistree
 * dans task_documents, puis tracee dans l'audit.
 */
export async function uploadTaskDocument(
  ports: { storage: Storage; repository: TaskDocumentRepository; audit: AuditTrail },
  input: UploadTaskDocumentInput,
): Promise<UploadTaskDocumentResult> {
  const validation = validateDocumentUpload({
    fileName: input.fileName,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
  });
  if (!validation.ok) {
    return { ok: false, reason: 'validation', detail: validation.refusal.code };
  }

  const documentId = uuidv4();
  const path = buildStoragePath({
    taskId: input.taskId,
    documentId,
    fileName: input.fileName,
  });

  try {
    await ports.storage.upload({ path, contentType: input.contentType, body: input.body });
  } catch {
    return { ok: false, reason: 'storage_error' };
  }

  const record: NewTaskDocument = {
    companyId: input.companyId,
    taskId: input.taskId,
    storagePath: path,
    fileName: input.fileName,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    uploadedBy: input.uploadedBy,
  };
  const document = await ports.repository.insert(record);

  await ports.audit.record({
    companyId: input.companyId,
    actorId: input.uploadedBy,
    action: 'document.uploaded',
    ...(input.journeyId !== undefined ? { journeyId: input.journeyId } : {}),
    taskId: input.taskId,
    payload: { documentId: document.id, fileName: input.fileName },
  });

  return { ok: true, document };
}
