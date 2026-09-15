/**
 * Port de stockage de fichiers. Aucune implementation Supabase ici : le domaine
 * et les cas d'usage ne connaissent que cette interface, et le detour par un
 * lien signe reste le seul moyen d'atteindre un fichier — jamais une URL
 * publique.
 */

export interface StorageUploadInput {
  readonly path: string;
  readonly contentType: string;
  readonly body: Uint8Array | Blob;
}

export interface SignedUrl {
  readonly url: string;
  readonly expiresAt: Date;
}

export interface Storage {
  upload(input: StorageUploadInput): Promise<void>;
  remove(path: string): Promise<void>;
  /** Renvoie null si le fichier n'existe pas ou n'est plus accessible. */
  createSignedUrl(path: string, ttlSeconds: number): Promise<SignedUrl | null>;
}
