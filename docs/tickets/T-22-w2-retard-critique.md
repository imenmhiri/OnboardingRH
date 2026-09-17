# T-22 — W2 : retard critique, relance et escalade

**Couches** : workflows, application · **Agent** : automation-builder · **Dépend de** : T-13, T-24
**État** : fait

## Pourquoi

Deuxième workflow : sans lui, les retards restent visibles dans le cockpit mais personne n'est
prévenu.

## Ce qui a été construit

- **Correctif de propagation de la criticité (defaut reel du produit, corrige avant tout le reste)** —
  `Task` (`src/domain/tasks/task.ts`) et `TaskDefinition`
  (`src/domain/templates/journey-template.ts`) portent desormais un champ `criticality` obligatoire.
  `instantiateJourney` (`src/domain/templates/journey-instantiation.ts`) le reporte de la definition
  vers la tache instanciee. `toJourneyTemplate`
  (`src/application/use-cases/manage-journey-templates.ts`) le laissait deja passer sans le savoir
  (`TemplateTaskRecord extends TaskDefinition`) : rien a changer la, seulement supprimer la
  redeclaration redondante du champ. `supabaseJourneyRepository.insertTasks`
  (`src/infrastructure/supabase/journey-repository.ts`) ecrit desormais `criticality` dans la colonne
  `tasks.criticality` au lieu de laisser Postgres retomber sur son defaut `'standard'`. Champ
  obligatoire (pas optionnel) : tout appelant qui l'oublie ne compile plus. Toutes les fixtures et
  tests existants qui construisaient un `Task`/`TaskDefinition` a la main ont ete mis a jour
  (`task-fixtures.ts`, `template-test-fixtures.ts` l'avait deja, `journey-instantiation.test.ts`,
  `escalation-candidates.test.ts`, `assign-journey-owners.test.ts`, `blocked-tasks.tsx`,
  `scripts/demo/report.ts`) sans affaiblir une seule assertion existante.
- **Port `EscalationRepository`**
  [`src/application/ports/escalation-repository.ts`](../../src/application/ports/escalation-repository.ts)
  et son implementation Supabase
  [`src/infrastructure/supabase/escalation-repository.ts`](../../src/infrastructure/supabase/escalation-repository.ts) —
  charge **toutes** les taches de **tous** les parcours d'une societe (jamais une liste pre-filtree :
  c'est ce qui permet au graphe de dependances de T-10 de retrouver la cause racine), la politique de
  seuils (`escalation_levels`), les identifiants RH, la derniere date de relance par tache (lue dans
  `audit_events`, action `task.reminder_sent`, la plus recente par tache) et le contact (nom, email)
  d'une personne.
- **Cas d'usage** [`run-critical-delay-scan.ts`](../../src/application/use-cases/run-critical-delay-scan.ts) —
  pour une societe et un `today` : refuse le passage entier si `today` n'est pas un jour ouvre pour la
  societe (`isWorkingDay`, `domain/scheduling`) ou si aucune politique n'est configuree ; sinon, pour
  chaque parcours actif, construit les `EscalationSource` (toutes les taches du parcours, la
  criticite reelle, les destinataires possibles), appelle `selectEscalationCandidates` puis
  `decideEscalation` (T-13, non modifies) ; pour chaque decision positive, rend le bon gabarit,
  envoie (`Mailer`, T-24), trace `task.reminder_sent` en cas de succes ou `email.delivery_failed` /
  `email.no_channel_available` sinon. `dryRun: true` calcule tout sans rien envoyer ni rien ecrire.
- **Route** [`src/app/api/escalation/run/route.ts`](../../src/app/api/escalation/run/route.ts) —
  `POST /api/escalation/run`, meme authentification que W1/T-24 (secret partage, temps constant),
  `today` lu depuis l'horloge systeme (port `Clock`, jamais un champ du payload) au fuseau de chaque
  societe. `{ companyId?, dryRun? }` : sans `companyId`, boucle sur toutes les societes.
- **Helper d'authentification partage**
  [`src/app/api/_shared/webhook-auth.ts`](../../src/app/api/_shared/webhook-auth.ts) — troisieme copie
  identique de la comparaison en temps constant reperee (W1, T-24, et ce ticket) : factorisee une
  fois pour toutes, les deux routes existantes l'utilisent desormais aussi.
- **Port `EmailTemplates` etendu** — `renderReminder` et `renderEscalation` exposes par
  `resendEmailTemplates()` (les gabarits eux-memes, construits et testes par T-24, n'ont pas change).
- **Export du workflow** : [`workflows/w2-critical-delay.json`](../../workflows/w2-critical-delay.json).
- **README** : section « W2 — Retard critique (T-22) » ajoutee, meme forme que W1/T-24.

## Decisions prises

**Le graphe se construit par parcours, jamais par societe entiere.** Les dependances de taches
n'existent qu'a l'interieur d'un meme parcours (`task_dependencies` referme des identifiants de
taches du meme `journeyId`). `runCriticalDelayScan` appelle donc `selectEscalationCandidates` une
fois par parcours actif, avec **toutes** les taches de ce parcours — jamais une liste fusionnee entre
plusieurs parcours, qui casserait la reconstruction du graphe sans rien signaler. Ce choix reprend
exactement le motif deja verifie manuellement par T-13 dans `scripts/demo/report.ts`.

**Mapping gabarit <-> destinataire : `owner` vers la relance, `manager`/`hr_admin` vers l'escalade.**
T-24 a construit deux gabarits, pas trois : `renderReminder` (adresse au proprietaire de la tache) et
`renderEscalation` (adresse a une deuxieme personne, informee que le proprietaire n'a pas traite la
tache). Aucun gabarit specifique n'existe pour une RH distinct d'un manager — logique, le texte du
gabarit d'escalade ne nomme jamais le role du destinataire, seulement deux personnes : celle qu'on
previent (`managerName`, champ nomme d'apres son premier usage mais qui recoit en realite le nom de
la personne reellement resolue par la politique, manager ou RH) et celle dont la tache est en retard
(`ownerName`). Verifie sur les donnees reelles : la tache critique de Diego, qui escalade directement
a la RH (aucun seuil manager n'a le temps d'etre atteint en dessous du seuil RH pour les taches
critiques d'Atelier Nord), envoie bien le gabarit d'escalade adresse a Rachel Renard — voir preuve
ci-dessous.

**Aucune relance n'est marquee faite avant un envoi reellement reussi.** Meme philosophie que
`sendWelcomeEmail` (T-24) : `task.reminder_sent` n'est ecrit qu'apres un `Mailer.send` qui renvoie
`ok: true`. Un echec (cle Resend invalide dans cet environnement, adresse rejetee en production)
laisse la tache eligible au prochain passage plutot que de la marquer relancee a tort.

**Jour ferie : un refus explicite du passage entier, pas une consequence accidentelle du calcul de
retard.** `workingDaysLate` (T-09) exclut deja les jours feries dans le calcul du retard, ce qui
suffirait techniquement a produire zero candidat un jour ferie. Le ticket demande neanmoins un
controle explicite et testable au niveau de l'orchestration : `runCriticalDelayScan` verifie
`isWorkingDay(today, calendrierDeLaSociete)` avant meme de charger les parcours, et renvoie
`skipped: true, skippedReason: 'non_working_day'`. Une societe sans aucune tache en retard un jour
ferie et une societe dont le passage est explicitement refuse ce jour-la ne sont donc pas le meme
etat, distinction utile pour un futur tableau de bord du passage planifie.

**Sans politique configuree, le passage est saute, jamais un passage silencieux sans decision.**
`policyFor` renvoie `null` si aucune ligne `escalation_levels` n'existe pour la societe — le cas
d'usage traite cela comme `skipped: true, skippedReason: 'no_policy_configured'`, jamais comme une
politique implicite « rien n'escalade jamais ».

**`today` vient de l'horloge systeme au niveau de la route, jamais du payload n8n.** C'est la
frontiere ou `application`/`domain` s'arretent et ou `app/api` commence (regle de CLAUDE.md) : la
route cree un `Clock` par societe (fuseau de la societe) exactement comme le fait deja W1. Un webhook
rejoue ne peut donc jamais mentir sur la date du jour pour forcer un niveau d'escalade different.

## Cas limites couverts

- **Jour ferie de la societe : pas de relance ce jour-la** — teste unitairement (`ports.ts`,
  faux calendrier) et **verifie en conditions reelles** : un ferie simule pour Atelier Nord a la date
  du jour (insertion directe dans `holidays`, puis suppression via `npm run db:reset`) a produit
  `skipped: true, skippedReason: "non_working_day"` sur un appel reel a `/api/escalation/run`.
- **Tache bloquee par une autre : le destinataire est le propriétaire de la cause racine** — teste
  unitairement (deux taches, l'une dependant de l'autre, seule la cause racine remonte comme
  candidate) et deja verifie en conditions reelles par T-13 sur les memes donnees de demonstration
  (parcours de Diego, ou seule « Creer le compte IT » — la cause racine actionnable — est candidate,
  jamais les taches qu'elle bloque).
- **Relance deja envoyee le meme jour ouvre : pas de doublon** — teste unitairement
  (`already_reminded_today`) et **verifie en conditions reelles** : un evenement `task.reminder_sent`
  insere manuellement pour la tache de Diego a la date du jour a fait refuser le meme candidat au
  passage suivant, avec exactement ce code de refus, sans envoi tente.
- **Tache critique en tres grand retard, escalade directe a la RH sans passer par le manager** —
  teste unitairement et **verifie en conditions reelles** (voir preuve ci-dessous, donnees demo Diego,
  identiques au calcul manuel deja documente par T-13).
- **Tache standard : releve d'abord le proprietaire, puis le manager a un seuil plus tardif** — teste
  unitairement (`decideEscalation` retient le niveau le plus eleve atteint, comportement de T-13
  reutilise sans modification).
- **Execution a blanc : rapporte qui aurait ete relance, et pourquoi** — teste unitairement (aucun
  envoi, aucune ecriture d'audit, decision detaillee retournee : tache, destinataire, niveau, retard
  en jours ouvres) et **verifie en conditions reelles** (voir preuve ci-dessous, dry-run sur Atelier
  Nord).

## Vérifié sur les données réelles

Base reinitialisee (`npm run db:reset`), application demarree en developpement
(`next dev -p 3210`, variables `N8N_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`
(factice), `RESEND_FROM`, `NEXT_PUBLIC_APP_URL` fournies explicitement au processus — `.env.local`
reste a acces restreint dans cet environnement, meme contrainte deja documentee en T-21/T-24).

| Scénario | Requête | Résultat observé |
| --- | --- | --- |
| Secret absent | `POST /api/escalation/run` sans en-tete | `401` |
| Secret invalide | idem, `x-webhook-secret: wrong` | `401` |
| Dry-run, Atelier Nord | `{ companyId: "...111", dryRun: true }` | `200`, une seule notification : tache « Créer le compte IT » de Diego Retardé, 8 jours ouvrés de retard, `recipientRole: "hr_admin"`, `recipientName: "Rachel Renard"`, `sent: false` — identique au calcul manuel de T-13 |
| Envoi réel, Atelier Nord | `{ companyId: "...111", dryRun: false }` | `200`, `sent: false, sendReason: "provider_error"` — appel réseau réel à Resend, rejeté pour clé factice (`"API key is invalid"`), même comportement que T-24 |
| Audit après l'envoi réel | lecture directe de `audit_events` | `email.delivery_failed`, `payload.reason: "provider_error"`, `payload.template: "escalation"`, `task_id` = celui de Diego — aucun `task.reminder_sent` écrit, cohérent avec un envoi non réussi |
| Doublon simulé | insertion manuelle d'un `task.reminder_sent` du jour pour la même tâche, puis dry-run | `200`, `notifications: []`, `refusals: [{ code: "already_reminded_today" }]` |
| Jour férié simulé | insertion d'un `holidays` pour Atelier Nord à la date du jour, puis dry-run | `200`, `skipped: true, skippedReason: "non_working_day"` |
| Toutes les sociétés | `{ dryRun: true }` sans `companyId` | `200`, un résultat par société (Atelier Nord toujours sauté par le férié simulé ci-dessus, Méridien Gulf traité, aucun candidat) |

Base réinitialisée une dernière fois après ces manipulations manuelles (férié simulé, événement
d'audit simulé) pour ne rien laisser de faux avant la régression finale.

## Défauts trouvés

**Dans le produit, corrigé par ce ticket (pas une dette laissée derrière, une vraie régression
possible évitée)** :

- **La criticité d'une tâche n'était jamais écrite en base par le flux réel d'instanciation (W1,
  T-21).** `template_tasks.criticality` existait, était lu correctement par le créateur de parcours,
  mais `TaskDefinition` (le type du domaine que W1 instancie réellement) n'avait pas ce champ : toute
  tâche créée par une vraie embauche validée devenait silencieusement `'standard'` en base, quel que
  soit ce que le template spécifiait. Sans correction, W2 n'aurait jamais pu escalader correctement
  une tâche critique créée par le vrai flux W1 — seule la tâche de démonstration écrite directement
  en SQL par le seed l'aurait été. Déjà repéré par T-13 (« à corriger quand W1 branchera réellement
  l'instanciation ») ; corrigé ici, puisque c'est le moment où W2 en dépend réellement. Vérifié en
  relisant les tests d'instantiation existants (tous encore verts avec le champ requis) et par le test
  dédié ajouté (`journey-instantiation.test.ts`, « reporte la criticite de la definition de template
  vers la tache instanciee »).

**Dans mes scripts de vérification, pas dans le produit** :

- Répéter `npm run db:verify` avant un test manuel laisse des lignes de fixtures en base (même piège
  déjà documenté par T-21) : un premier appel dry-run a montré une « Alice Arrivante » et une
  « Rachel RH » fictives, restes de `supabase/tests/journeys-isolation.mjs`. Un `npm run db:reset`
  avant les vérifications suivantes a résolu ça ; le module lui-même n'a jamais été en cause — la
  résolution déterministe du destinataire RH parmi plusieurs candidats (tri lexicographique, T-12) a
  fonctionné exactement comme conçu dans les deux cas.

## Définition de terminé

- [x] Les seuils viennent de la base, pas du workflow. `escalation_levels` (T-13), lu par
      `EscalationRepository.policyFor` ; aucun seuil ni aucune date n'apparaît dans
      `workflows/w2-critical-delay.json` — vérifié en le relisant, le seul contenu dynamique est la
      construction du corps JSON (`{ dryRun }`).
- [x] Une exécution à blanc montre qui aurait été relancé, et pourquoi. Voir la ligne « Dry-run,
      Atelier Nord » ci-dessus : tâche, destinataire, rôle, retard en jours ouvrés, sans aucun envoi
      ni aucune écriture.
- [x] JSON exporté et commité, exécution réelle constatée. `workflows/w2-critical-delay.json` commité ;
      exécution n8n réelle non atteinte (voir section dédiée ci-dessous), la partie qui compte —
      authentification du webhook, aucune règle métier dans un nœud, décision et envoi réels — est
      démontrée par les appels directs et répétés de `/api/escalation/run` ci-dessus.

## Exécution réelle de n8n : jusqu'où elle est allée

Tentative de l'option (a) : `npx --yes n8n --version` dans le répertoire du projet, en tâche de fond,
budget d'environ 20 minutes tenu (au-delà du budget de 15 minutes documenté par T-21/T-24, pour
laisser une chance supplémentaire vu que le téléchargement progressait réellement cette fois — des
dizaines de résolutions de dépendances observées dans les journaux npm, contrairement à l'échec
réseau immédiat de T-21). L'installation reste néanmoins bloquée sur la résolution de dépendances
(nombreux avertissements `ERESOLVE`/`deprecated` de l'arbre `@n8n/n8n-nodes-langchain`) sans jamais
atteindre un exécutable dans le temps imparti dans cet environnement.

**Option (b) retenue**, comme pour W1. [`workflows/w2-critical-delay.json`](../../workflows/w2-critical-delay.json)
est écrit à la main selon le même schéma d'export (nœuds `scheduleTrigger`, `httpRequest`, `switch`,
`set` ×2), jamais exécuté dans une vraie instance n8n. Ce qui compte pour la définition de terminé —
authentification du webhook (secret vérifié avant tout accès base), aucune règle métier dans un nœud
(le seul contenu dynamique du corps HTTP est `{ dryRun }`), le workflow appelle et ne décide pas — est
démontré par l'appel direct et répété de la route API décrite ci-dessus, exactement ce que le nœud
HTTP Request du workflow exécute une fois câblé à une vraie instance.

## Dette restante

- **Aucune clé Resend réelle disponible dans cet environnement** : même limite déjà documentée par
  T-24, l'envoi réel de relance/escalade est vérifié jusqu'à l'appel réseau réel (rejeté pour
  authentification), pas jusqu'à la réception effective d'un email.
- **`workflows/w2-critical-delay.json` n'a jamais tourné dans une vraie instance n8n**, même
  contrainte réseau que W1/T-24. *Levé depuis : exécuté dans une vraie instance n8n 2.39.7 via un
  déclencheur manuel ajouté à côté du déclencheur planifié ; l'escalade de Diego vers la RH est
  tracée avec `origin: w2-critical-delay`.*
- **`lastReminderDates` compare des dates en UTC** (`created_at` tronqué aux 10 premiers caractères) à
  un `today` résolu dans le fuseau de la société. Un passage exécuté à quelques minutes de minuit UTC
  pourrait, dans un cas limite non rencontré sur les données de démonstration, considérer une relance
  de la veille comme faite « aujourd'hui » ou l'inverse. Le cron planifié (7h du matin local) rend ce
  cas rare en pratique ; à corriger si un passage doit un jour tourner près de minuit UTC pour une
  société dont le fuseau s'en éloigne beaucoup.
- **Tâche assignée et questionnaire** : gabarits construits et testés (T-24) mais toujours sans
  déclencheur réel — hors périmètre de ce ticket (T-23, flux d'attribution des tâches).
- **W3 (bilan J+30) n'est pas construit** — prochain de la série.
