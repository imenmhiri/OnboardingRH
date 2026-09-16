# T-25 — Agenda de la première semaine

**Couches** : infrastructure/calendar, application · **Agent** : automation-builder
**Dépend de** : T-11, T-17 · **État** : fait

## Pourquoi

L'agenda est ce qui rend l'intégration concrète pour l'employé et pour son équipe.

## Périmètre

- Port `Calendar` et implémentation Google Calendar ou Outlook.
- Création des évènements de la première semaine à partir du parcours.
- Mise à jour et annulation lorsque les dates changent.
- Affichage de l'agenda dans le portail employé.

## Hors périmètre

- Synchronisation bidirectionnelle, gestion des disponibilités.

## Cas limites à couvrir

- **Date d'arrivée reportée** : les évènements déjà créés sont déplacés, pas dupliqués.
- Participant sans compte agenda d'entreprise.
- Fuseau horaire différent entre le site et le siège.

## Ce qui a été construit

- **Port `Calendar`** [`src/application/ports/calendar.ts`](../../src/application/ports/calendar.ts)
  — `createEvent` / `updateEvent` / `cancelEvent`, résultat qui distingue succès et `provider_error`.
  Même discipline que `Mailer` (T-24) : le domaine et les cas d'usage ne connaissent que l'interface.
- **Implémentation Google Calendar**
  [`src/infrastructure/calendar/google-calendar.ts`](../../src/infrastructure/calendar/google-calendar.ts)
  — appelle réellement l'API REST Google Calendar (échange d'un jeton de rafraîchissement OAuth2 puis
  `POST`/`PATCH`/`DELETE` sur `/calendars/{id}/events`), avec un client `fetch` injecté
  (`FetchLike`) pour rester testable sans réseau ni jeton réel, exactement comme `ResendLikeClient`
  en T-24. `createGoogleCalendarFromEnv()` lit les quatre variables d'environnement et, si l'une
  manque, renvoie un **calendrier dégradé** qui échoue proprement (`provider_error`) à chaque appel
  plutôt que de lever une exception — décision volontaire, voir plus bas.
- **Persistance locale** : table `calendar_events`
  (`supabase/migrations/20260916150000_calendar_events.sql`), port
  [`CalendarEventRepository`](../../src/application/ports/calendar-event-repository.ts) et son
  implémentation Supabase
  [`src/infrastructure/supabase/calendar-events.ts`](../../src/infrastructure/supabase/calendar-events.ts).
  Une tâche porte au plus un évènement (`unique (task_id)`), ce qui permet de savoir, avant un report
  de date, s'il faut déplacer une ligne existante ou en créer une nouvelle.
- **Résolution de contexte**
  [`CalendarEventContextDirectory`](../../src/application/ports/calendar-event-context.ts) — fuseau
  horaire (site en priorité, société en repli) et adresse d'un responsable, via
  [`src/infrastructure/supabase/calendar-event-context.ts`](../../src/infrastructure/supabase/calendar-event-context.ts).
- **Domaine** :
  - [`domain/companies/time-zone-resolution.ts`](../../src/domain/companies/time-zone-resolution.ts)
    — précédence site > société > `UTC`, pure et testée sans mock.
  - [`domain/scheduling/first-week.ts`](../../src/domain/scheduling/first-week.ts) — extrait la règle
    « première semaine = arrivée + 6 jours civils », déjà utilisée par T-17 mais recalculée en dur
    dans l'écran : centralisée ici pour que le portail et la création d'évènements ne divergent
    jamais.
  - [`domain/scheduling/event-window.ts`](../../src/domain/scheduling/event-window.ts) — un créneau
    d'une heure (9h–10h) en heure locale **naïve**, sans jamais passer par `Date` : Google interprète
    `dateTime` dans le `timeZone` fourni à côté, ce qui évite de réimplémenter une table de fuseaux
    horaires côté application.
- **Cas d'usage** :
  - [`create-first-week-calendar-events.ts`](../../src/application/use-cases/create-first-week-calendar-events.ts)
    — un évènement par tâche de la première semaine, idempotent (une tâche déjà pourvue d'un
    évènement planifié n'est jamais recréée), jamais bloquant (une création qui échoue est tracée et
    le lot continue).
  - [`reschedule-journey.ts`](../../src/application/use-cases/reschedule-journey.ts) — **la pièce
    manquante que ce ticket devait combler** (voir « Défaut produit corrigé » plus bas) : recalcule
    les échéances des tâches encore ouvertes via `rescheduleForArrivalDate` (T-09, jamais modifiée),
    écrit la nouvelle `arrival_date`, puis déplace (jamais ne duplique) chaque évènement déjà créé, et
    retente une création pour les tâches nouvellement entrées dans la première semaine.
  - [`cancel-journey-calendar-events.ts`](../../src/application/use-cases/cancel-journey-calendar-events.ts)
    — annule tous les évènements planifiés d'un parcours. Utilisable directement ; voir « Dette
    restante » pour l'absence de déclencheur réel.
- **Point d'accroche W1** : `create-journey-from-validated-hire.ts` appelait jusqu'ici
  `journey.calendar_events_pending` et s'arrêtait là (déféré à ce ticket). La création est maintenant
  **synchrone**, exactement à cet endroit — contrairement à l'email de bienvenue (T-24), rien n'exige
  de différer un évènement d'agenda dans le temps.
- **Route** [`src/app/api/journeys/reschedule/route.ts`](../../src/app/api/journeys/reschedule/route.ts)
  — `POST /api/journeys/reschedule`, même authentification que les autres webhooks (`x-webhook-secret`,
  `isAuthorizedWebhookRequest` réutilisé tel quel, pas recopié).
- **Portail employé** — `src/app/(app)/portail/page.tsx` lit désormais `calendar_events` (filtré
  `status = 'scheduled'`) en plus des tâches, affiche l'heure réelle quand un évènement existe pour
  une tâche de la semaine, et retombe sur le rendu simple (date seule) sinon — le rendu d'origine de
  T-17, jamais retiré.
- **Migration** `supabase/migrations/20260916150000_calendar_events.sql` — table, RLS scoped par
  société avec la même visibilité que les tâches (`journey_visible`), écriture réservée à la RH.
- **Isolation RLS** `supabase/tests/calendar-events-isolation.mjs`, ajoutée à `npm run db:verify`.
- `.env.example` — `GOOGLE_CALENDAR_REFRESH_TOKEN` et `GOOGLE_CALENDAR_CALENDAR_ID` ajoutées (les deux
  autres, `CLIENT_ID`/`CLIENT_SECRET`, existaient déjà en placeholder, inutilisées jusqu'ici).

## Défaut produit corrigé (pas de la dette pré-existante — un vrai gap fermé par ce ticket)

En construisant `reschedule-journey.ts`, la vérification réelle (voir plus bas) a révélé que
**`journeys.insertTasks` n'écrivait jamais `tasks.offset_working_days`** : la colonne existe depuis
T-06 mais `journey-repository.ts` ne la renseignait pas à l'insertion, et `domain/tasks/task.ts` ne
garde de toute façon que l'échéance déjà calculée, pas le décalage qui l'a produite. Conséquence
observée en base réelle : toutes les tâches recalculées par un report d'arrivée atterrissaient sur
**le même jour**, celui de la nouvelle arrivée, quel que soit leur décalage d'origine (-5, -2, 0, +5
jours ouvrés) — `rescheduleForArrivalDate` (T-09) lisait un décalage de `0` pour toutes, faute de
donnée.

Corrigé en élargissant `JourneyRepository.insertTasks` d'un quatrième paramètre
`offsetsByTaskId: ReadonlyMap<string, number>`, construit dans `create-journey-from-validated-hire.ts`
à partir des `template.taskDefinitions` déjà en mémoire (aucune requête supplémentaire), et écrit dans
la colonne existante. C'est ce ticket qui l'a trouvé parce que c'est le premier appelant réel de
`rescheduleForArrivalDate` en production — le cas d'usage T-09 était fondé, seul le chemin
d'alimentation manquait. Test de régression explicite dans
`create-journey-from-validated-hire.test.ts`, et vérifié en base réelle ci-dessous.

## Décisions prises

**`calendar_events` en local, jamais un appel direct à Google pour afficher le portail.** Le DoD du
ticket l'exige explicitement (« échec d'intégration dégradé proprement : le portail reste utilisable »).
`starts_at`/`ends_at` sont du **texte**, pas `timestamptz` : c'est l'heure locale naïve envoyée telle
quelle à Google avec `time_zone` à côté (Google interprète `dateTime` dans le fuseau fourni). Les
convertir en instant UTC aurait exigé de réimplémenter une table de fuseaux horaires côté application
— exactement ce que ce projet évite ailleurs (`domain/scheduling` ne connaît que des dates civiles).

**Création synchrone à la création du parcours, jamais différée.** Contrairement à l'email de
bienvenue (T-24, différé de trois jours ouvrés avant l'arrivée par construction), rien n'exige de
retarder un évènement d'agenda : les responsables et les échéances sont déjà résolus au même instant.
Câblée directement dans `create-journey-from-validated-hire.ts`, au point d'accroche
`journey.calendar_events_pending` que W1 (T-21) avait laissé en place.

**Un webhook de report, pas un workflow n8n planifié.** Un changement de date d'arrivée est un
évènement ponctuel décidé côté SIRH/ATS, pas une tâche récurrente (contrairement à W2/W3, scannées
périodiquement). `POST /api/journeys/reschedule` suit donc le même schéma que `/api/hires/validated` :
un webhook synchrone, authentifié par le même secret partagé, appelé quand le SIRH apprend le
changement — pas d'export `workflows/*.json` pour ce ticket, le périmètre ne le demande pas (seuls
W1/W2/W3 sont des workflows n8n numérotés).

**Fuseau horaire : le site l'emporte, la société est le repli.**
`domain/companies/time-zone-resolution.ts` — une seule règle, testée sans mock, jamais un
`if (site.slug === '...')`.

**Titre et description génériques, jamais de donnée personnelle.** L'évènement reprend le titre de la
tâche tel quel (« Créer le compte IT », « Accueil et remise du matériel ») — déjà un texte de gabarit,
jamais un nom, un email ou une référence de document. La description est une phrase fixe qui renvoie
au portail, jamais composée à partir de données de l'employé.

**Participant sans compte agenda d'entreprise : l'évènement se crée quand même.** Si le responsable
d'une tâche n'a pas encore de compte (email introuvable), l'évènement se crée sans participant nommé
plutôt que d'échouer pour toute l'équipe. Ce n'est un échec complet que si l'appel à Google lui-même
échoue (jeton, réseau, quota) — tracé, jamais avalé.

**Calendrier dégradé plutôt qu'un échec au démarrage.** À la différence de
`createResendMailerFromEnv()` (T-24), qui lève une exception si une variable manque,
`createGoogleCalendarFromEnv()` renvoie un calendrier qui échoue proprement à chaque appel. Une
variable manquante ne doit jamais faire échouer la création d'un parcours (W1) : c'est exactement le
cas « échec d'intégration dégradé proprement » du DoD, étendu à la configuration absente, pas
seulement à une panne réseau en cours de route.

## Cas limites couverts

- **Date d'arrivée reportée** — `reschedule-journey.test.ts` : les échéances des tâches ouvertes sont
  recalculées (jamais simplement décalées par le même nombre de jours civils, voir T-09) et les
  évènements déjà créés sont **déplacés** (même `id` de ligne, même `external_event_id`) plutôt que
  dupliqués. Vérifié aussi en base réelle (voir preuve ci-dessous) : un évènement inséré manuellement
  pour simuler une création antérieure a été retrouvé, ciblé par un `PATCH` réel (rejeté pour jeton
  factice), et **n'a jamais été dupliqué** — une seule ligne, même identifiant, avant et après.
- **Participant sans compte agenda d'entreprise** — `create-first-week-calendar-events.test.ts` :
  l'évènement se crée sans participant plutôt que d'échouer. Vérifié en base réelle : la tâche « Créer
  le compte IT » (responsable non encore résolu) a bien tenté un appel Google, sans jamais bloquer les
  tâches suivantes du même lot.
- **Fuseau horaire différent entre le site et le siège** — `time-zone-resolution.test.ts` (site
  Europe/Paris en repli, site Asia/Dubai qui l'emporte) et vérifié en base réelle : un site temporaire
  déclaré `Asia/Dubai` sous une société dont le fuseau par défaut est `Europe/Paris` a produit un
  évènement demandé à Google avec `timeZone: "Asia/Dubai"`, jamais celui de la société.

## Vérifié sur les données réelles

Base réinitialisée (`npm run db:reset`), application démarrée en développement
(`next dev -p 3100`, variables `N8N_WEBHOOK_SECRET`, `GOOGLE_CALENDAR_CLIENT_ID/SECRET/REFRESH_TOKEN/CALENDAR_ID`
(factices), `NEXT_PUBLIC_SUPABASE_*` fournies explicitement au processus — `.env.local` a un accès en
lecture restreint dans cet environnement, même contrainte que celle documentée en T-21/T-24).

| Étape | Requête | Résultat observé |
| --- | --- | --- |
| Création d'un parcours (arrivée 2026-09-28, site déclarant `Asia/Dubai`) | `POST /api/hires/validated` | `201`, 6 tâches créées, `offset_working_days` correctement `-5, -2, -2, -1, 0, 5` (voir défaut corrigé ci-dessus) |
| Création des évènements de la première semaine | (synchrone, dans le même appel) | Deux tâches tombaient dans la fenêtre ; deux tentatives réelles à `oauth2.googleapis.com/token`, rejetées `"The OAuth client was not found."` — tracées `calendar.event_creation_failed`, aucune ligne `calendar_events` créée (cohérent : la création côté Google a réellement échoué) |
| Report d'arrivée | `POST /api/journeys/reschedule` avec une nouvelle date | `200`, `movedTaskCount: 6` — les 6 échéances recalculées, réparties sur des jours différents (`2026-10-11, 10-14, 10-14, 10-15, 10-18, 10-25`), jamais toutes identiques |
| Déplacement d'un évènement existant | Une ligne `calendar_events` insérée manuellement (simulant une création antérieure réussie) puis un second report | `movedEventCount: 0`, `failedEventTaskIds` porte la tâche — tentative réelle de `PATCH` sur l'API Google, rejetée pour jeton factice, **tracée** `calendar.event_move_failed`, et surtout : **une seule ligne `calendar_events` avant et après**, même `id`, même `external_event_id` — le critère « déplacé, jamais dupliqué » tient même en échec réseau |
| Lecture du portail | requête répliquant exactement la lecture de `src/app/(app)/portail/page.tsx` (jointure `tasks` + `calendar_events` filtrés `scheduled`, fenêtre `domain/scheduling/first-week`) sur le parcours d'Alice avec un évènement inséré pour une tâche de sa semaine d'arrivée | La tâche pourvue d'un évènement affiche `"2026-09-10 à 09:00"`, celle sans évènement affiche `"2026-09-17"` seul — les deux rendus coexistent sur le même écran, confirmant le repli |

Ce que ça prouve honnêtement : la résolution du fuseau (site avant société), la construction du
payload Google (titre/description génériques, fenêtre horaire), l'appel réseau réel
(`oauth2.googleapis.com` puis, s'il avait réussi, `www.googleapis.com/calendar/v3`), le
« déplacé jamais dupliqué » et le recalcul des échéances sont tous exercés jusqu'au bout côté
application et base ; l'authentification OAuth2 réelle contre un compte Google existant n'a **jamais**
été exercée, faute d'identifiants réels dans cet environnement — même limite honnête que Resend (T-24)
et n8n (T-21).

**Limite de cette dernière preuve** : faute de `playwright` installé dans cet environnement (absent de
`node_modules`, contrairement à ce que les scripts `scripts/ui-checks/portal-*.mjs` supposent), la
vérification du portail n'a pas été faite par un vrai navigateur piloté mais en **rejouant exactement
la même requête et la même logique de fenêtre/repli** que `page.tsx` contre la base réelle — la
donnée et la logique sont vérifiées de bout en bout, le rendu DOM ne l'est pas. Signalé comme limite
ci-dessous plutôt que présenté comme une preuve à l'écran.

## Défauts trouvés

**Dans le produit**, en plus du défaut déjà détaillé plus haut (`offset_working_days` jamais écrit) :
aucun autre.

**Dans mes scripts de vérification, pas dans le produit** :

- `.env.local` non lisible par les outils de cette session (même restriction que T-21/T-24) :
  variables fournies explicitement au processus `next dev`.
- Playwright absent de `node_modules` dans cet environnement (ni dépendance du projet ni installé
  globalement) — la vérification du portail a donc pris la forme d'une requête répliquant la logique
  de la page plutôt qu'un vrai test de navigateur, voir ci-dessus.
- Les scripts de vérification manuels (fichiers temporaires `scripts/ui-checks/_t25-*.mjs`, journeys
  `t25-verif-001`/`t25-verif-002`, site temporaire `lille-decale`) ont été supprimés/nettoyés par un
  `npm run db:reset` avant la régression finale et la fusion.

## Définition de terminé

- [x] **Un report de date ne laisse aucun évènement orphelin.** `reschedule-journey.ts` retrouve
      chaque évènement existant par sa tâche (`findByTask`/`listByJourney`) et le déplace ; aucun
      chemin du code ne supprime ni ne recrée une ligne pour une tâche qui en a déjà une. Vérifié en
      base réelle ci-dessus (une ligne, avant et après).
- [x] **Aucune donnée sensible dans le titre ou la description des évènements.** Titre = texte de
      gabarit de la tâche (jamais un nom, un email, une référence de document) ; description = phrase
      fixe (`EVENT_DESCRIPTION` dans `create-first-week-calendar-events.ts`). Vérifié par
      `google-calendar.test.ts` (`buildGoogleEventBody`) et par la lecture directe des payloads
      envoyés en vérification réelle.
- [x] **Échec d'intégration dégradé proprement : le portail reste utilisable.** Trois niveaux vérifiés :
      identifiants absents (`createGoogleCalendarFromEnv` renvoie un calendrier dégradé, jamais une
      exception), appel réseau qui échoue (tracé, la création du parcours n'échoue jamais à cause de
      ça — vérifié en réel), lecture du portail qui ne dépend d'aucun appel Google (`calendar_events`
      local uniquement, repli sur la liste simple si absent — vérifié par la requête répliquée
      ci-dessus).

## Dette restante

- **Aucun identifiant Google Calendar réel disponible dans cet environnement** : le chemin est vérifié
  jusqu'à l'appel réseau réel (rejeté pour authentification), jamais jusqu'à un évènement qui apparaît
  réellement dans un vrai agenda Google. Même limite honnête que Resend (T-24) et n8n (T-21).
- **Aucun déclencheur produit ne fait passer un parcours au statut `cancelled`** aujourd'hui (vérifié :
  `updateJourneyStatus('cancelled')` n'est appelé nulle part dans `src/`, seul `'completed'` l'est,
  par T-23). `cancel-journey-calendar-events.ts` est prêt, testé, et utilisable directement, mais reste
  sans point d'accroche produit réel — signalé ici plutôt que déguisé en flux déjà branché.
- **Pas de vérification par navigateur réel du portail** (Playwright absent de cet environnement) :
  la donnée et la logique de rendu sont vérifiées de bout en bout contre la base réelle, pas le DOM
  final. À refaire avec un vrai navigateur dès que l'environnement le permet, en suivant le même
  schéma que `scripts/ui-checks/portal-flow.mjs`.
- **`GOOGLE_CALENDAR_CALENDAR_ID` suppose un calendrier d'entreprise unique par déploiement**, pas un
  calendrier par société : correct pour ce projet de démonstration à deux sociétés partageant la même
  configuration d'environnement, mais à revisiter si plusieurs sociétés doivent un jour écrire dans
  des calendriers Google distincts (une colonne `companies.google_calendar_id`, résolue comme le
  fuseau horaire, plutôt qu'une variable d'environnement globale).
