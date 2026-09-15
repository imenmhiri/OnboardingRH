# T-07 — Stockage privé et liens signés

**Couches** : domain/documents, application, infrastructure · **Agent** : db-architect
**Dépend de** : T-06 · **État** : fait

## Pourquoi

Contrainte non négociable : aucun document personnel dans un email ni dans un payload de webhook.
Seul circule un lien signé à durée limitée.

## Périmètre

- Bucket de stockage privé, policies scopées par tâche.
- Port `Storage` : dépôt, suppression, génération d'URL signée à expiration courte.
- Port `TaskDocumentRepository` et port `AuditTrail` (insertion seule).
- Trois cas d'usage : dépôt (`uploadTaskDocument`), génération de lien
  (`requestDocumentLink`), suppression (`removeTaskDocument`).
- Contrôle de type et de taille au dépôt, en double : domaine puis bucket.
- Traçabilité : chaque dépôt, génération de lien et suppression écrit dans `audit_events`.

## Ce qui a été décidé en chemin

**Un seul bucket, pas un par société.** Le chemin de stockage est partitionné par tâche
(`{task_id}/{document_id}-{nom}`), sans segment société distinct : `task_visible()` scope déjà une
tâche à sa société, et c'est cette même fonction que vérifie la policy de stockage. Un bucket par
société aurait dupliqué cette garantie sans rien ajouter, et aurait fait d'accueillir une filiale un
geste de plus qu'une insertion en base.

**Le contrôle de type et de taille est fait deux fois.** Le domaine (`document-policy.ts`) refuse vite
avec un message exploitable avant tout appel réseau ; le bucket porte les mêmes limites en défense en
profondeur, pour le jour où un appel contournerait le domaine.

**L'écriture d'audit ne chaîne jamais `.select()`.** Un membre non-RH a le droit d'insérer dans le
journal mais pas de le relire (décision de T-06) ; demander la représentation de la ligne insérée
échouerait pour lui exactement comme un `RETURNING` en SQL brut.

## Cas limites couverts

- **Lien expiré** : `requestDocumentLink` accepte de regénérer un lien à tout moment ; testé avec un
  vrai lien de 2 secondes, une vraie attente, un vrai refus HTTP puis une vraie régénération.
- **Document déposé sur le mauvais parcours** : `removeTaskDocument` supprime le fichier du stockage
  avant la ligne en base — jamais l'inverse, pour ne pas laisser une référence vers un fichier disparu
  — et trace le motif.

## Définition de terminé

- [x] Aucun bucket public — vérifié en base (`storage.buckets.public = false`).
- [x] Une URL signée expirée ne donne plus accès au fichier — vérifié par une vraie requête HTTP sur
      un vrai lien, avant (200) et après (400) expiration réelle.
- [ ] Aucune pièce jointe dans un email ni dans un webhook, vérifié sur un envoi réel — **non
      vérifiable ici** : aucun email ni webhook n'existe encore (T-21 à T-26). Ce que ce ticket
      garantit structurellement : le port `Storage` n'expose que `createSignedUrl`, jamais les octets
      du fichier — un appelant qui voudrait joindre un document à un email devrait contourner le port
      lui-même. La case se coche à T-24.

## Vérifié contre la vraie infrastructure

`npm run db:verify` inclut désormais `storage-isolation.mjs` : dépôt réel, lien signé réel, requête
HTTP réelle qui réussit puis échoue après une expiration réelle de 3 secondes, régénération réussie,
et RLS sur `storage.objects` confirmée sous deux identités — un membre qui voit la tâche voit l'objet,
un membre d'une autre société ne voit rien.

## Dette laissée derrière

- Pas d'antivirus ni de signature électronique, explicitement hors périmètre.
- Aucun écran de dépôt : les cas d'usage sont prêts, l'UI viendra avec T-16/T-17/T-19.
- La limite de taille (20 Mo) et les types acceptés sont des constantes du domaine, pas encore une
  donnée par société — à ouvrir si un besoin réel apparaît.
