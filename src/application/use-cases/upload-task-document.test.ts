import { describe, expect, it } from 'vitest';
import { fakeAudit, fakeRepository, fakeStorage } from './document-test-fixtures';
import { uploadTaskDocument } from './upload-task-document';

const baseInput = {
  companyId: 'company-1',
  taskId: 'task-1',
  journeyId: 'journey-1',
  uploadedBy: 'user-1',
  fileName: 'cv.pdf',
  contentType: 'application/pdf',
  sizeBytes: 1024,
  body: new Uint8Array([1, 2, 3]),
};

describe('uploadTaskDocument', () => {
  it('depose le fichier, enregistre la ligne et trace le depot', async () => {
    const { storage, uploaded } = fakeStorage();
    const { repository } = fakeRepository();
    const { audit, events } = fakeAudit();

    const result = await uploadTaskDocument({ storage, repository, audit }, baseInput);

    expect(result.ok).toBe(true);
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]?.path).toMatch(new RegExp('^task-1/[0-9a-f-]+-cv.pdf$'));
    expect(result.ok && result.document.fileName).toBe('cv.pdf');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: 'document.uploaded', taskId: 'task-1' });
  });

  it('refuse un depot invalide sans jamais appeler le stockage', async () => {
    const { storage, uploaded } = fakeStorage();
    const { repository } = fakeRepository();
    const { audit, events } = fakeAudit();

    const result = await uploadTaskDocument(
      { storage, repository, audit },
      { ...baseInput, contentType: 'application/x-msdownload' },
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe('validation');
    expect(uploaded).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('ne trace ni n enregistre quand le stockage echoue', async () => {
    const { storage } = fakeStorage({
      upload: async () => {
        throw new Error('indisponible');
      },
    });
    const { repository, records } = fakeRepository();
    const { audit, events } = fakeAudit();

    const result = await uploadTaskDocument({ storage, repository, audit }, baseInput);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe('storage_error');
    expect(records.size).toBe(0);
    expect(events).toHaveLength(0);
  });
});
