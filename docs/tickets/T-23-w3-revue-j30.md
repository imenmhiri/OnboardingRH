# T-23 — W3 : revue J+30

**Couches** : workflows, application · **Agent** : automation-builder · **Dépend de** : T-14, T-24
**État** : fait

## Pourquoi

Troisième workflow : il ferme le parcours et alimente la mesure de satisfaction. C'est aussi le
premier appelant réel de `planSurveys` / `resolveSurveyChannel` (T-14) — jusqu'ici construits, testés,
jamais déclenchés en production, comme sa propre clôture le disait explicitement.

## Ce qui a été construit

- **Port `SurveyRepository`**
  [`src/application/ports/survey-repository.ts`](../../src/application/ports/survey-repository.ts)
  et son implémentation Supabase
  [`src/infrastructure/supabase/survey-repository.ts`](../../src/infrastructure/supabase/survey-repository.ts) —
  charge les parcours actifs d'une société avec ce dont `planSurveys`/`resolveSurveyChannel` ont
  besoin (arrivée, fin de contrat, adresse professionnelle lue dans `auth.users`, adresse
  personnelle), réconcilie une ligne planifiée (crée si absente, ne réécrit **jamais** une ligne déjà
  `sent`/`answered`, recale une ligne encore `scheduled` — voir plus bas), liste les questionnaires
  échus et ceux dus à une relance.
- **Colonne `surveys.reminder_sent_at`**
  ([migration `20260916140000_survey_reminder_sent_at.sql`](../../supabase/migrations/20260916140000_survey_reminder_sent_at.sql)) —
  additive, sur une table déjà couverte par la RLS de T-14 (aucune policy nouvelle nécessaire :
  `surveys_write_hr` et le contournement RLS du rôle de service couvrent déjà cette colonne). Une
  colonne dédiée plutôt qu'une recherche dans `audit_events` (l'approche de T-22 pour les tâches) :
  la requête « quels questionnaires sont dus à une relance » reste une seule table, sans jointure.
- **Méthode `JourneyRepository.updateJourneyStatus`**
  ([`src/application/ports/journey-repository.ts`](../../src/application/ports/journey-repository.ts)) —
  n'existait pas avant ce ticket ; aucun cas d'usage ne faisait avancer le statut d'un parcours après
  sa création.
- **Jeton d'accès signé** [`src/application/security/survey-access-token.ts`](../../src/application/security/survey-access-token.ts) —
  HMAC-SHA256, sans état, `{ surveyId, exp }` encodé en base64url, secret `SURVEY_LINK_SECRET`
  distinct de `N8N_WEBHOOK_SECRET` (deux périmètres différents : un webhook entrant n8n n'est pas un
  lien envoyé à une personne extérieure). Cinq tests unitaires
  ([`survey-access-token.test.ts`](../../src/application/security/survey-access-token.test.ts)) :
  vérifie un jeton qu'il vient de signer, rejette un jeton expiré, un jeton altéré (payload changé,
  signature d'origine conservée), un jeton signé avec un autre secret, un jeton malformé.
- **Cas d'usage** [`run-day-30-review-scan.ts`](../../src/application/use-cases/run-day-30-review-scan.ts) —
  pour une société et un `today` : (1) réconcilie les deux jalons (`day_7`, `day_30`) de chaque
  parcours actif via `planSurveys`, (2) envoie les questionnaires échus (`resolveSurveyChannel`,
  gabarit T-24, jeton signé, trace `survey.sent` ou `email.delivery_failed`), (3) relance une fois les
  questionnaires envoyés sans réponse depuis au moins 3 jours ouvrés, (4) clôt les parcours dont le
  jalon J+30 a atteint son état terminal. `dryRun: true` calcule tout sans rien écrire ni rien
  envoyer, même philosophie que T-22.
- **Route** [`src/app/api/surveys/run/route.ts`](../../src/app/api/surveys/run/route.ts) —
  `POST /api/surveys/run`, même authentification que W1/W2/T-24 (secret partagé, temps constant, via
  `webhook-auth.ts` de T-22), `today` lu depuis l'horloge système par société. `{ companyId?, dryRun? }`.
- **Gabarit questionnaire branché** — `EmailTemplates.renderQuestionnaire` exposé par
  `resendEmailTemplates()` ; le gabarit lui-même (T-24) n'a pas changé, seul son commentaire
  « pas encore appelé » est retiré.
- **Export du workflow** : [`workflows/w3-day-30-review.json`](../../workflows/w3-day-30-review.json).
- **README** : section « W3 — Bilan J+30 (T-23) » ajoutée, même forme que W1/W2.

## Décisions prises

**Relance unique : 3 jours ouvrés après l'envoi.** Aucune règle n'existait avant ce ticket. Trois
jours ouvrés laisse le temps de voir l'email (le week-end n'y compte pas), sans laisser un
questionnaire traîner des semaines sans qu'on ne relance jamais. Suivi par `reminder_sent_at`, jamais
réécrit une deuxième fois — testé (« relance une seule fois : la deuxième passe ne renvoie rien ») et
vérifié en base réelle (voir plus bas).

**Clôture du parcours : trois conditions terminales pour le J+30, jamais à l'instant de l'envoi.**
Un parcours se clôt (`journeys.status = 'completed'`) quand son jalon J+30 est :
- `answered` — la personne a répondu, la boucle est fermée ;
- `cancelled` (fin de contrat avant l'échéance) — rien à attendre, mais le parcours doit quand même
  atteindre un état terminal plutôt que rester `in_progress` indéfiniment (« clos autrement », le
  texte du ticket) ;
- `sent` depuis au moins 5 jours ouvrés **après sa relance** — une vraie fenêtre de réponse après le
  rappel, jamais une clôture au moment même de l'envoi.
`completed` est l'état d'archivage : l'enum `journey_status` en a déjà un qui convient
(`draft, scheduled, in_progress, completed, cancelled`), pas besoin d'en ajouter un. « Archivage »
s'interprète donc comme « statut `completed`, plus jamais retouché par ce passage » — le filtre
`activeJourneySources` n'inclut que `draft/scheduled/in_progress`, un parcours clos sort
définitivement du champ de W3.

**Réconciliation d'un parcours reporté : seule une ligne encore `scheduled` se recale.** Une ligne
`sent` ou `answered` ne se réécrit jamais, même si `planSurveys` recalculerait une autre date à partir
de la nouvelle arrivée — la personne a déjà reçu, ou déjà répondu, changer la date après coup n'aurait
aucun sens. Testé (« recale la date planifiée... sans toucher un questionnaire déjà envoyé ») avec
deux surveys du même parcours dans des états différents.

**Jeton signé plutôt qu'une table d'accès.** Le besoin ressemble à `Storage.createSignedUrl` (T-07)
mais porte sur une ressource qui n'est pas un fichier Supabase Storage. Un HMAC sans état évite une
table à purger et reste vérifiable sans lecture base — au prix de ne pas être révocable
individuellement avant expiration (compromis documenté en dette ci-dessous). TTL choisi à 30 jours :
assez long pour qu'une personne en vacances au moment de l'envoi puisse encore répondre, court par
rapport à la durée de vie d'un secret compromis.

**Canal `portal_link` : pas d'envoi actif, un `sent_at` qui marque la disponibilité.** Interprétation
du domaine (T-14) : sans adresse, il n'y a rien à pousser activement ; `markSent(surveyId,
'portal_link')` pose quand même `status = 'sent'` et un horodatage, qui documente « visible depuis
cet instant », pas « poussé activement ». Une relance sur ce canal n'a donc rien à renvoyer non plus
(`sendReminder` renvoie `sent: false` sans appeler `Mailer`) — le questionnaire reste en attente, pas
en échec.

**`today` en application, jamais un `Date` lu directement.** Le TTL du jeton (30 jours) se calcule à
partir de `toEpochDay(today)` (arithmétique pure sur la date civile injectée), jamais de
`Date.now()` — CLAUDE.md l'interdit dans `domain/`/`application/`. Les horodatages `sent_at` /
`reminder_sent_at`, eux, sont posés côté infrastructure (`new Date().toISOString()`), exactement comme
`markWelcomeEmailSent` (T-21) le fait déjà pour l'email de bienvenue.

## Cas limites couverts

- **Fin de contrat avant J+30 : aucun envoi, parcours clos autrement** — testé unitairement (« cas
  Diego ») et **vérifié en conditions réelles** sur le jeu de démonstration : après `POST
  /api/surveys/run` avec `dryRun: false` sur Atelier Nord, le J+30 de Diego Retardé reste `cancelled`
  / `contract_ended_before` (posé par le seed, confirmé inchangé), aucun email n'est tenté pour lui, et
  son parcours passe de `in_progress` à `completed` avec un événement `journey.closed`
  (`reason: "day30_cancelled_contract_ended"`) dans `audit_events`.
- **Employé sans email personnel : canal alternatif** — testé unitairement (bascule vers
  `portal_link`, `status` posé à `sent` quand même, jamais un abandon silencieux).
- **Parcours reporté après l'échéance initiale de J+30** — testé unitairement, voir la décision de
  réconciliation ci-dessus.
- **Relance unique, jamais deux fois** — testé unitairement et **vérifié en conditions réelles** :
  un questionnaire d'Alice Arrivante marqué `sent` avec un `sent_at` de plusieurs jours ouvrés, puis un
  `reminder_sent_at` posé manuellement, ne relance plus au passage suivant (`reminded: []`).
- **Exécution à blanc** — testé unitairement (aucune écriture, aucun envoi) et vérifié en conditions
  réelles (`reconciledMilestones: 0`, aucun envoi, aucune clôture).

## Vérifié sur les données réelles

Base réinitialisée (`npm run db:reset`), application démarrée en développement (`next dev -p 3210`),
`N8N_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` (factice), `RESEND_FROM`,
`NEXT_PUBLIC_APP_URL`, `SURVEY_LINK_SECRET` fournis explicitement au processus.

| Scénario | Requête | Résultat observé |
| --- | --- | --- |
| Secret absent | `POST /api/surveys/run` sans en-tête | `401` |
| Secret invalide | idem, `x-webhook-secret: wrong` | `401` |
| Dry-run, Atelier Nord | `{ companyId: "...111", dryRun: true }` | `200`, `reconciledMilestones: 0`, aucun envoi, aucune clôture |
| Envoi réel, Atelier Nord | `{ companyId: "...111", dryRun: false }` | `200`, Diego clos (`day30_cancelled_contract_ended`), aucun email tenté pour lui ; deux tentatives réelles vers Resend pour une fixture de test résiduelle (`Claire Collègue`, id `cccccccc-...`), rejetées pour clé factice (`"API key is invalid"`) |
| Audit après l'envoi réel | lecture directe de `audit_events` | `journey.closed` × 2 (Diego et une fixture résiduelle), `email.delivery_failed` × 2, aucun `survey.sent` (cohérent : aucun envoi n'a réellement réussi dans cet environnement) |
| Envoi réel avec adresse valide | `arrival_date` d'Alice avancée manuellement pour rendre son J+7 échu, puis `dryRun: false` | `200`, tentative d'envoi réelle vers `alice@atelier-nord.demo`, rejetée pour clé factice — même comportement que T-22/T-24, appel réseau réel constaté |
| Relance, premier passage | `sent_at` d'Alice posé manuellement à 5 jours ouvrés dans le passé, `reminder_sent_at` null, puis `dryRun: false` | `200`, `reminded: [{ ..., sent: false, sendReason: "provider_error" }]` — tentative réelle, `reminder_sent_at` **non** posé (l'envoi a échoué, cohérent avec « jamais marqué avant un succès réel ») |
| Relance, doublon simulé | `reminder_sent_at` posé manuellement (simulant un envoi réussi), puis nouveau passage | `200`, `reminded: []` — aucune deuxième tentative |

Base réinitialisée une dernière fois après ces manipulations manuelles pour ne rien laisser de faux
avant la régression finale.

## Défauts trouvés

**Dans mes scripts de vérification, pas dans le produit** :

- Même piège déjà documenté en T-21/T-22 : des lignes de fixtures résiduelles de
  `supabase/tests/journeys-isolation.mjs` (préfixe `cccccccc-...`) apparaissent dans un premier passage
  réel si `npm run db:verify` a tourné juste avant sans `npm run db:reset` entre les deux — une
  « Alice Arrivante » et une « Claire Collègue » fictives ont ainsi reçu de vraies tentatives d'envoi
  Resend (rejetées, sans conséquence) pendant la vérification. Reset entre les deux, cause identifiée,
  aucune conséquence sur le code lui-même.
- Aucun défaut trouvé dans le produit lors de cette vérification (contrairement à T-22, qui avait
  découvert la propagation manquante de la criticité) : le chemin `planSurveys` → `resolveSurveyChannel`
  → envoi → clôture s'est comporté exactement comme prévu sur le premier passage réel.

## Définition de terminé

- [x] Aucun questionnaire envoyé à un contrat terminé, vérifié sur le jeu de démonstration. Voir la
      ligne « Envoi réel, Atelier Nord » ci-dessus : Diego Retardé, aucun email tenté, parcours clos.
- [x] Le lien du questionnaire est signé et limité dans le temps. Mécanisme réel (HMAC, TTL 30 jours),
      prouvé par cinq tests unitaires (signature valide, expiration, altération, mauvais secret,
      jeton malformé) — voir « dette restante » pour ce que ce point ne couvre **pas** (la page qui
      consommerait ce lien).
- [x] JSON exporté et commité, exécution réelle constatée. `workflows/w3-day-30-review.json` commité ;
      exécution n8n réelle non atteinte (voir section dédiée ci-dessous) ; ce qui compte — secret de
      webhook vérifié avant tout accès base, aucune règle métier dans un nœud, décision et envoi réels
      — est démontré par les appels directs et répétés de `/api/surveys/run` ci-dessus.

## Exécution réelle de n8n : jusqu'où elle est allée

Même tentative que W1/W2 : `npx --yes n8n --version` en tâche de fond, budget d'environ 5 minutes tenu
avant d'arrêter (les avertissements `ERESOLVE`/`deprecated` de l'arbre `@n8n/n8n-nodes-langchain`
étaient déjà identiques à ceux rencontrés par T-22, sans raison de croire qu'une attente plus longue
changerait l'issue dans cet environnement). **Option (b) retenue**, comme pour W1/W2 :
[`workflows/w3-day-30-review.json`](../../workflows/w3-day-30-review.json) écrit à la main selon le
même schéma d'export (`scheduleTrigger`, `httpRequest`, `switch`, `set` ×2), jamais exécuté dans une
vraie instance n8n. Ce qui compte pour la définition de terminé est démontré par l'appel direct et
répété de la route API, exactement ce que le nœud HTTP Request exécuterait une fois câblé.

## Dette restée derrière

- **Aucune page employé ne consomme le lien signé du questionnaire.** Le ticket lui-même déclare ses
  couches comme « workflows, application » — pas « app » — donc construire l'écran de réponse était
  explicitement hors périmètre. Mais c'est une vraie conséquence produit à noter honnêtement : le lien
  envoyé (`{portalUrl}/questionnaires/{surveyId}?token=...`) ne mène aujourd'hui nulle part de réel.
  Aucun numéro de ticket n'est réservé pour cette page dans `docs/BACKLOG.md` — un vrai trou à
  combler, pas un raccourci pris sciemment dans ce ticket.
- **Jeton non révocable individuellement avant expiration** — un HMAC sans état ne peut pas être
  invalidé un par un (contrairement à une table `survey_access_tokens` qu'on aurait pu purger).
  Acceptable pour un TTL de 30 jours sur une ressource déjà protégée par RLS côté réponse
  (`survey_is_open`), mais à reconsidérer si un besoin de révocation immédiate apparaît.
- **Aucune clé Resend réelle disponible dans cet environnement** — même limite déjà documentée par
  T-22/T-24 : l'envoi est vérifié jusqu'à l'appel réseau réel (rejeté pour authentification), pas
  jusqu'à la réception effective d'un email.
- **`workflows/w3-day-30-review.json` n'a jamais tourné dans une vraie instance n8n**, même contrainte
  réseau que W1/W2/T-24.
- **Le calendrier utilisé pour le seuil de relance/clôture est celui du site du parcours**, résolu à
  chaque itération (`ports.calendar.calendarFor(companyId, siteId)`) — cohérent avec W2, mais un
  passage sur une société avec beaucoup de parcours répète cet appel plutôt que de le mettre en cache
  par site ; sans impact mesuré sur le jeu de démonstration, à surveiller si le volume grossit.
- **Scoring et signaux faibles (T-14) et synthèse IA anonymisée (T-26)** restent hors périmètre, comme
  déclaré par ce ticket dès le départ.
