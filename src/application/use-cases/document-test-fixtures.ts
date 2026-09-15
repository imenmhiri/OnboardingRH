import type { AuditEvent, AuditTrail } from '@/application/ports/audit-trail';
import type { Storage, StorageUploadInput } from '@/application/ports/storage';
import type {
  NewTaskDocument,
  TaskDocumentRecord,
  TaskDocumentRepository,
} from '@/application/ports/task-document-repository';

/** Doublures en memoire, pas des mocks : de vraies implementations des ports. */

export function fakeStorage(overrides: Partial<Storage> = {}) {
  const uploaded: StorageUploadInput[] = [];
  const removed: string[] = [];
  const storage: Storage = {
    async upload(input) {
      uploaded.push(input);
    },
    async remove(path) {
      removed.push(path);
    },
    async createSignedUrl(path, ttlSeconds) {
      return { url: `https://storage.test/${path}?ttl=${ttlSeconds}`, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
    },
    ...overrides,
  };
  return { storage, uploaded, removed };
}

export function fakeRepository(seed: readonly TaskDocumentRecord[] = []) {
  const records = new Map(seed.map((doc) => [doc.id, doc]));
  let nextId = 1;
  const repository: TaskDocumentRepository = {
    async insert(document: NewTaskDocument) {
      const record: TaskDocumentRecord = { id: `doc-${nextId++}`, ...document };
      records.set(record.id, record);
      return record;
    },
    async findById(id) {
      return records.get(id) ?? null;
    },
    async delete(id) {
      records.delete(id);
    },
    async listByJourney() {
      // Aucun cas d'usage n'orchestre encore cette methode : la page du
      // portail interroge le vrai depot directement, comme T-16 le fait deja
      // pour ses lectures. Rien a exercer ici, seulement satisfaire le type.
      return [...records.values()];
    },
  };
  return { repository, records };
}

export function fakeAudit() {
  const events: AuditEvent[] = [];
  const audit: AuditTrail = {
    async record(event) {
      events.push(event);
    },
  };
  return { audit, events };
}

export function documentRecord(overrides: Partial<TaskDocumentRecord> = {}): TaskDocumentRecord {
  return {
    id: 'doc-1',
    companyId: 'company-1',
    taskId: 'task-1',
    storagePath: 'task-1/doc-1-cv.pdf',
    fileName: 'cv.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1024,
    uploadedBy: 'user-1',
    ...overrides,
  };
}
