import type { SignedUrl, Storage, StorageUploadInput } from '@/application/ports/storage';
import { createSupabaseServerClient } from './server-client';

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const BUCKET = 'task-documents';

/**
 * Implementation Supabase Storage du port Storage. Le bucket est prive (voir la
 * migration qui le cree) ; l'unique moyen d'atteindre un fichier depuis
 * l'exterieur est createSignedUrl, jamais une URL construite a la main.
 */
export function supabaseStorage(client: SupabaseClient): Storage {
  return {
    async upload(input: StorageUploadInput): Promise<void> {
      const { error } = await client.storage.from(BUCKET).upload(input.path, input.body, {
        contentType: input.contentType,
        upsert: false,
      });
      if (error) {
        throw new Error(`Depot impossible pour ${input.path} : ${error.message}`);
      }
    },

    async remove(path: string): Promise<void> {
      const { error } = await client.storage.from(BUCKET).remove([path]);
      if (error) {
        throw new Error(`Suppression impossible pour ${path} : ${error.message}`);
      }
    },

    async createSignedUrl(path: string, ttlSeconds: number): Promise<SignedUrl | null> {
      const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, ttlSeconds);
      if (error || !data) {
        return null;
      }
      return { url: data.signedUrl, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
    },
  };
}
