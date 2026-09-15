/**
 * Regles pures sur les pieces jointes : ce qui est accepte au depot, comment
 * un chemin de stockage est construit, combien de temps un lien signe reste
 * valide. Aucune de ces regles ne touche au reseau ni au disque — l'upload et
 * la generation du lien restent le travail du port Storage.
 */

export const MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024; // 20 Mo

/**
 * Types acceptes pour une piece jointe RH : formats courants de document et
 * d'image scannee. Une societe qui a besoin d'un type de plus est une donnee a
 * ajouter ici, jamais une branche par societe.
 */
export const ALLOWED_CONTENT_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export const DEFAULT_SIGNED_URL_TTL_SECONDS = 15 * 60;
export const MAX_SIGNED_URL_TTL_SECONDS = 60 * 60;
const MIN_SIGNED_URL_TTL_SECONDS = 60;

export interface DocumentUploadInput {
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

export type UploadRefusal =
  | { readonly code: 'empty_file' }
  | { readonly code: 'file_too_large'; readonly maxBytes: number }
  | { readonly code: 'unsupported_type'; readonly contentType: string };

export type UploadValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly refusal: UploadRefusal };

export function validateDocumentUpload(input: DocumentUploadInput): UploadValidation {
  if (input.sizeBytes <= 0) {
    return { ok: false, refusal: { code: 'empty_file' } };
  }
  if (input.sizeBytes > MAX_DOCUMENT_SIZE_BYTES) {
    return { ok: false, refusal: { code: 'file_too_large', maxBytes: MAX_DOCUMENT_SIZE_BYTES } };
  }
  if (!ALLOWED_CONTENT_TYPES.has(input.contentType)) {
    return { ok: false, refusal: { code: 'unsupported_type', contentType: input.contentType } };
  }
  return { ok: true };
}

/**
 * Un nom de fichier tel quel dans un chemin de stockage est une porte ouverte :
 * separateurs de repertoire, espaces, caracteres qui cassent une URL signee.
 * On ne garde que ce qui est sans risque, et jamais une chaine vide.
 */
export function sanitizeFileName(fileName: string): string {
  const cleaned = fileName
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');
  return cleaned.length > 0 ? cleaned.slice(0, 150) : 'document';
}

/**
 * Chemin de stockage deterministe : la tache en seul segment de dossier, puis
 * l'identifiant du document pour eviter toute collision entre deux depots du
 * meme nom. Pas de segment societe distinct : task_visible() scope deja par
 * societe via la tache elle-meme, et c'est lui que verifie la policy de
 * stockage sur ce meme premier segment.
 */
export function buildStoragePath(params: {
  readonly taskId: string;
  readonly documentId: string;
  readonly fileName: string;
}): string {
  return `${params.taskId}/${params.documentId}-${sanitizeFileName(params.fileName)}`;
}

/**
 * Ramene une duree demandee dans les bornes autorisees. Un appelant qui ne
 * precise rien recoit la duree par defaut ; un appelant qui demande une duree
 * demesuree est brime plutot que servi, pour qu'un lien signe reste toujours
 * "a duree limitee" au sens du cahier des charges.
 */
export function resolveSignedUrlTtl(requestedSeconds?: number): number {
  if (requestedSeconds === undefined) {
    return DEFAULT_SIGNED_URL_TTL_SECONDS;
  }
  if (!Number.isFinite(requestedSeconds)) {
    return DEFAULT_SIGNED_URL_TTL_SECONDS;
  }
  return Math.min(MAX_SIGNED_URL_TTL_SECONDS, Math.max(MIN_SIGNED_URL_TTL_SECONDS, Math.trunc(requestedSeconds)));
}
