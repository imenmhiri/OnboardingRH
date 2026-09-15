import { describe, expect, it } from 'vitest';
import { MAX_SIGNED_URL_TTL_SECONDS } from '@/domain/documents/document-policy';
import { documentRecord, fakeAudit, fakeRepository, fakeStorage } from './document-test-fixtures';
import { requestDocumentLink } from './request-document-link';

describe('requestDocumentLink', () => {
  it('genere un lien signe et trace qui l a demande, pour quel document', async () => {
    const doc = documentRecord();
    const { storage } = fakeStorage();
    const { repository } = fakeRepository([doc]);
    const { audit, events } = fakeAudit();

    const result = await requestDocumentLink({ storage, repository, audit }, {
      documentId: doc.id,
      requestedBy: 'user-2',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.signedUrl.url).toContain(doc.storagePath);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: 'document.link_generated', actorId: 'user-2', taskId: doc.taskId });
  });

  it('brime une duree demesuree avant de generer le lien', async () => {
    const doc = documentRecord();
    const { storage } = fakeStorage();
    const { repository } = fakeRepository([doc]);
    const { audit } = fakeAudit();

    const result = await requestDocumentLink({ storage, repository, audit }, {
      documentId: doc.id,
      requestedBy: 'user-2',
      ttlSeconds: 100_000_000,
    });

    expect(result.ok).toBe(true);
    const expectedMaxMs = MAX_SIGNED_URL_TTL_SECONDS * 1000;
    expect(result.ok && result.signedUrl.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(expectedMaxMs + 1000);
  });

  it('refuse un document introuvable', async () => {
    const { storage } = fakeStorage();
    const { repository } = fakeRepository([]);
    const { audit, events } = fakeAudit();

    const result = await requestDocumentLink({ storage, repository, audit }, {
      documentId: 'inconnu',
      requestedBy: 'user-2',
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe('not_found');
    expect(events).toHaveLength(0);
  });

  it('ne trace rien quand le stockage ne peut pas generer de lien', async () => {
    const doc = documentRecord();
    const { storage } = fakeStorage({ createSignedUrl: async () => null });
    const { repository } = fakeRepository([doc]);
    const { audit, events } = fakeAudit();

    const result = await requestDocumentLink({ storage, repository, audit }, {
      documentId: doc.id,
      requestedBy: 'user-2',
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe('storage_error');
    expect(events).toHaveLength(0);
  });
});
