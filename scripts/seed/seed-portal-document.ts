/**
 * Complete le jeu de demonstration pour le portail employe (T-17) :
 *
 * - un livret d'accueil, depose par la RH sur la tache d'accueil d'Alice, pour
 *   qu'un vrai « document a lire » apparaisse a l'ecran (une ligne inseree en
 *   SQL sans fichier reel casserait la generation de lien signe de T-07) ;
 * - une tache possedee par Alice elle-meme, avec une piece encore attendue :
 *   aucune tache du template standard n'appartient a l'employe, donc « a
 *   fournir » resterait toujours vide sans cet ajout.
 *
 * Usage : tsx scripts/seed/seed-portal-document.ts
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

// Les variables du process (utiles pour rejouer ce script une fois contre une
// base de production, T-27) completent celles de .env.local sans les ecraser.
const fileEnv = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);
const env = { ...fileEnv, ...process.env };

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL ?? '', env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ALICE_JOURNEY = 'a0000000-0000-4000-8000-000000000002';
const ALICE_ID = 'e0000000-0000-4000-8000-000000000004';
const RH_NORD = 'e0000000-0000-4000-8000-000000000001';

async function main(): Promise<void> {
  const { data: task } = await admin
    .from('tasks')
    .select('id')
    .eq('journey_id', ALICE_JOURNEY)
    .eq('template_key', 'welcome')
    .single();
  if (!task) {
    console.log('Tâche d’accueil introuvable pour Alice : rien à faire.');
    return;
  }

  const path = `${task.id}/livret-accueil-atelier-nord.pdf`;
  const content = new TextEncoder().encode(
    '%PDF-1.4\nLivret d’accueil — Atelier Nord\nBienvenue dans l’équipe.',
  );

  const { error: uploadError } = await admin.storage
    .from('task-documents')
    .upload(path, content, { contentType: 'application/pdf', upsert: true });
  if (uploadError) {
    throw new Error(`Dépôt du livret impossible : ${uploadError.message}`);
  }

  const { error: rowError } = await admin.from('task_documents').upsert(
    {
      company_id: '11111111-1111-4111-8111-111111111111',
      task_id: task.id,
      storage_path: path,
      file_name: 'Livret d’accueil — Atelier Nord.pdf',
      content_type: 'application/pdf',
      size_bytes: content.byteLength,
      uploaded_by: RH_NORD,
    },
    { onConflict: 'storage_path' },
  );
  if (rowError) {
    throw new Error(`Enregistrement du livret impossible : ${rowError.message}`);
  }

  console.log('Livret d’accueil déposé pour Alice Arrivante.');

  const { error: taskError } = await admin.from('tasks').upsert(
    {
      id: 'b2000000-0000-4000-8000-000000000007',
      company_id: '11111111-1111-4111-8111-111111111111',
      journey_id: ALICE_JOURNEY,
      title: 'Signer et retourner le règlement intérieur',
      owner_role: 'employee',
      owner_id: ALICE_ID,
      due_on: '2026-09-25',
      offset_working_days: 10,
      status: 'pending',
      expected_document: 'reglement-interieur-signe',
    },
    { onConflict: 'id' },
  );
  if (taskError) {
    throw new Error(`Création de la tâche « règlement intérieur » impossible : ${taskError.message}`);
  }
  console.log('Tâche « règlement intérieur » ajoutée pour Alice Arrivante.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
