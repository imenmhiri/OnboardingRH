import { describe, expect, it } from 'vitest';
import { documentRecord, fakeAudit, fakeRepository, fakeStorage } from './document-test-fixtures';
import { removeTaskDocument } from './remove-task-document';

describe('cas limite : document depose sur le mauvais parcours', () => {
  it('supprime le fichier et la ligne, et trace le motif', async () => {
    const doc = documentRecord();
    const { storage, removed } = fakeStorage();
    const { repository, records } = fakeRepository([doc]);
    const { audit, events } = fakeAudit();

    const result = await removeTaskDocument({ storage, repository, audit }, {
      documentId: doc.id,
      removedBy: 'user-rh',
      reason: 'deposee sur le mauvais parcours',
    });

    expect(result.ok).toBe(true);
    expect(removed).toEqual([doc.storagePath]);
    expect(records.has(doc.id)).toBe(false);
    expect(events[0]).toMatchObject({ action: 'document.removed', actorId: 'user-rh' });
    expect(events[0]?.payload).toMatchObject({ reason: 'deposee sur le mauvais parcours' });
  });

  it('supprime le fichier avant la ligne, pour ne jamais laisser une reference orpheline', async () => {
    const doc = documentRecord();
    const order: string[] = [];
    const { storage } = fakeStorage({
      remove: async () => {
        order.push('storage');
      },
    });
    const { repository } = fakeRepository([doc]);
    const trackedRepository = {
      ...repository,
      delete: async (id: string) => {
        order.push('repository');
        return repository.delete(id);
      },
    };
    const { audit } = fakeAudit();

    await removeTaskDocument({ storage, repository: trackedRepository, audit }, {
      documentId: doc.id,
      removedBy: 'user-rh',
      reason: 'test',
    });

    expect(order).toEqual(['storage', 'repository']);
  });

  it('refuse un document introuvable sans rien tracer', async () => {
    const { storage, removed } = fakeStorage();
    const { repository } = fakeRepository([]);
    const { audit, events } = fakeAudit();

    const result = await removeTaskDocument({ storage, repository, audit }, {
      documentId: 'inconnu',
      removedBy: 'user-rh',
      reason: 'test',
    });

    expect(result.ok).toBe(false);
    expect(removed).toHaveLength(0);
    expect(events).toHaveLength(0);
  });
});
