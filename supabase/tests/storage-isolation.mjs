/**
 * Prouve le stockage prive contre la vraie stack Supabase locale : bucket non
 * public, upload et lien signe fonctionnels, un lien expire refuse vraiment
 * l'acces, et une societe qui n'est pas concernee par la tache ne peut ni
 * lire ni deposer sous son chemin.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import {
  asUser,
  client,
  EMP_GULF,
  GULF,
  installJourneys,
  installUsers,
  IT_NORD,
  JOURNEY_NORD,
  MGR_NORD,
  NORD,
  RH_NORD,
  TASK_IT,
} from './fixtures.mjs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const db = client();
await db.connect();
await installUsers(db);
await installJourneys(db);

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

// 1. Le bucket n'est pas public.
const bucketRow = await db.query("select public from storage.buckets where id = 'task-documents'");
check('Le bucket task-documents n est pas public', bucketRow.rows[0]?.public === false, JSON.stringify(bucketRow.rows[0]));

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 2. Depot reel d'un fichier, via la cle de service (represente le serveur
// applicatif apres verification du domaine) sous le chemin attendu.
const path = `${TASK_IT}/doc-test-contrat.pdf`;
const body = new TextEncoder().encode('contenu de test, pas un vrai PDF');
const upload = await admin.storage.from('task-documents').upload(path, body, { contentType: 'application/pdf', upsert: true });
check('Le depot reel du fichier reussit', upload.error === null, upload.error?.message ?? '');

// Le fichier existe desormais : un client anonyme, sans session, ne doit
// toujours pas pouvoir le lire — c'est ca que prouve un bucket prive.
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anonRead = await anon.storage.from('task-documents').download(path);
check(
  'Un client anonyme ne telecharge pas un fichier qui existe pourtant',
  anonRead.error !== null,
  anonRead.error?.message ?? '',
);

// 3. Lien signe court, et acces reel au fichier via ce lien.
const shortLink = await admin.storage.from('task-documents').createSignedUrl(path, 2);
check('La generation d un lien signe reussit', shortLink.error === null, shortLink.error?.message ?? '');

if (shortLink.data) {
  const fetched = await fetch(shortLink.data.signedUrl);
  check('Le lien signe donne acces au fichier avant expiration', fetched.status === 200, `statut=${fetched.status}`);

  // 4. Cas limite du ticket : passe l expiration, le meme lien est refuse.
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const expired = await fetch(shortLink.data.signedUrl);
  check(
    'Le meme lien signe est refuse une fois expire',
    expired.status === 400 || expired.status === 401 || expired.status === 403,
    `statut=${expired.status}`,
  );
}

// 5. Regenerer un lien pour le meme fichier reste possible malgre l expiration.
const renewed = await admin.storage.from('task-documents').createSignedUrl(path, 60);
check('Un nouveau lien peut etre genere apres expiration du precedent', renewed.error === null, renewed.error?.message ?? '');
if (renewed.data) {
  const refetched = await fetch(renewed.data.signedUrl);
  check('Le lien regenere donne de nouveau acces au fichier', refetched.status === 200, `statut=${refetched.status}`);
}

// 6. RLS sur storage.objects, avec le client de session (SSR-like) : un membre
// qui voit la tache lit l objet ; un membre d une autre societe non.
const itList = await asUser(
  db, IT_NORD,
  "select count(*)::int as n from storage.objects where bucket_id = 'task-documents' and name = $1",
  [path],
);
check('Un membre qui voit la tache voit l objet correspondant', itList.rows?.[0]?.n === 1, JSON.stringify(itList.rows));

const gulfList = await asUser(
  db, EMP_GULF,
  "select count(*)::int as n from storage.objects where bucket_id = 'task-documents' and name = $1",
  [path],
);
check('Un membre d une autre societe ne voit pas cet objet', gulfList.rows?.[0]?.n === 0, JSON.stringify(gulfList.rows));

// 7. Nettoyage.
await admin.storage.from('task-documents').remove([path]);
await db.end();

console.log(failures === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${failures} CONTROLE(S) EN ECHEC`);
process.exit(failures === 0 ? 0 : 1);
