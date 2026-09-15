import { describe, expect, it } from 'vitest';
import {
  ALLOWED_CONTENT_TYPES,
  buildStoragePath,
  DEFAULT_SIGNED_URL_TTL_SECONDS,
  MAX_DOCUMENT_SIZE_BYTES,
  MAX_SIGNED_URL_TTL_SECONDS,
  resolveSignedUrlTtl,
  sanitizeFileName,
  validateDocumentUpload,
} from './document-policy';

describe('validateDocumentUpload', () => {
  it('accepte un depot ordinaire', () => {
    const result = validateDocumentUpload({
      fileName: 'contrat-signe.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1024,
    });
    expect(result.ok).toBe(true);
  });

  it('refuse un fichier vide', () => {
    const result = validateDocumentUpload({ fileName: 'vide.pdf', contentType: 'application/pdf', sizeBytes: 0 });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.refusal.code).toBe('empty_file');
  });

  it('refuse un fichier trop volumineux', () => {
    const result = validateDocumentUpload({
      fileName: 'gros.pdf',
      contentType: 'application/pdf',
      sizeBytes: MAX_DOCUMENT_SIZE_BYTES + 1,
    });
    expect(!result.ok && result.refusal.code).toBe('file_too_large');
    expect(!result.ok && result.refusal.code === 'file_too_large' && result.refusal.maxBytes).toBe(
      MAX_DOCUMENT_SIZE_BYTES,
    );
  });

  it('accepte exactement la taille limite', () => {
    const result = validateDocumentUpload({
      fileName: 'limite.pdf',
      contentType: 'application/pdf',
      sizeBytes: MAX_DOCUMENT_SIZE_BYTES,
    });
    expect(result.ok).toBe(true);
  });

  it('refuse un type non autorise', () => {
    const result = validateDocumentUpload({
      fileName: 'script.exe',
      contentType: 'application/x-msdownload',
      sizeBytes: 100,
    });
    expect(!result.ok && result.refusal.code).toBe('unsupported_type');
  });

  it('accepte tous les types de la liste autorisee', () => {
    for (const contentType of ALLOWED_CONTENT_TYPES) {
      const result = validateDocumentUpload({ fileName: 'x', contentType, sizeBytes: 10 });
      expect(result.ok, contentType).toBe(true);
    }
  });
});

describe('sanitizeFileName', () => {
  it('remplace les caracteres a risque', () => {
    expect(sanitizeFileName('mon fichier (2026).pdf')).toBe('mon-fichier-2026-.pdf');
  });

  it('supprime une tentative de traversee de repertoire', () => {
    const cleaned = sanitizeFileName('../../etc/passwd');
    expect(cleaned).not.toContain('/');
    expect(cleaned).not.toContain('..');
  });

  it('ne renvoie jamais une chaine vide', () => {
    expect(sanitizeFileName('***')).toBe('document');
    expect(sanitizeFileName('')).toBe('document');
  });

  it('tronque un nom demesure', () => {
    expect(sanitizeFileName('a'.repeat(500)).length).toBeLessThanOrEqual(150);
  });

  it('conserve un nom simple inchange', () => {
    expect(sanitizeFileName('cv-2026.pdf')).toBe('cv-2026.pdf');
  });
});

describe('buildStoragePath', () => {
  it('place la tache en tete, puis le document', () => {
    const path = buildStoragePath({
      taskId: 'task-1',
      documentId: 'doc-1',
      fileName: 'cv.pdf',
    });
    expect(path).toBe('task-1/doc-1-cv.pdf');
  });

  it('assainit le nom de fichier dans le chemin construit', () => {
    const path = buildStoragePath({
      taskId: 'task-1',
      documentId: 'doc-1',
      fileName: '../secret.pdf',
    });
    expect(path).toBe('task-1/doc-1-secret.pdf');
  });
});

describe('resolveSignedUrlTtl', () => {
  it('rend la duree par defaut quand rien n est demande', () => {
    expect(resolveSignedUrlTtl()).toBe(DEFAULT_SIGNED_URL_TTL_SECONDS);
  });

  it('brime une duree demesuree plutot que de la servir', () => {
    expect(resolveSignedUrlTtl(10_000_000)).toBe(MAX_SIGNED_URL_TTL_SECONDS);
  });

  it('remonte une duree trop courte a un minimum raisonnable', () => {
    expect(resolveSignedUrlTtl(1)).toBeGreaterThanOrEqual(60);
  });

  it('accepte une duree raisonnable telle quelle', () => {
    expect(resolveSignedUrlTtl(300)).toBe(300);
  });

  it('se rabat sur la duree par defaut si la valeur est invalide', () => {
    expect(resolveSignedUrlTtl(Number.NaN)).toBe(DEFAULT_SIGNED_URL_TTL_SECONDS);
  });
});
