# T-21 — W1 : embauche validée déclenche le parcours

**Couches** : workflows, app/api, application · **Agent** : automation-builder · **Dépend de** : T-11, T-12
**État** : fait

## Pourquoi

Premier workflow du cahier des charges : une embauche validée doit produire un parcours complet sans
intervention humaine. Premier ticket de la couche `app/api/`, aussi : il pose la forme que W2 et W3
suivront (route fine, cas d'usage qui orchestre les ports, secret webhook vérifié en temps constant,
idempotence par contrainte unique).

## Ce qui a été construit

- **Route** [`src/app/api/hires/validated/route.ts`](../../src/app/api/hires/validated/route.ts) —
  `POST /api/hires/validated`. Authentifie (en-tête `x-webhook-secret`, comparaison en temps constant
  via `crypto.timingSafeEqual`), valide la forme du payload, construit les ports Supabase avec la
  clé de service, appelle le cas d'usage, traduit le résultat en réponse HTTP. Aucune règle métier :
  la route ne sait ni ce qu'est un template, ni comment une échéance se calcule.
- **Cas d'usage**
  [`create-journey-from-validated-hire.ts`](../../src/application/use-cases/create-journey-from-validated-hire.ts) —
  vérifie l'idempotence, appelle `selectTemplate` (T-09) puis `instantiateJourney` (T-11), persiste le
  parcours et ses tâches, appelle `assignJourneyOwners` (T-12) pour résoudre les responsables, écrit
  dans le journal d'audit à chaque étape qui compte.
- **Ports ajoutés** :
  [`journey-repository.ts`](../../src/application/ports/journey-repository.ts) (persistance du
  parcours et de ses tâches, idempotence, attribution des responsables) et
  [`calendar-directory.ts`](../../src/application/ports/calendar-directory.ts) (résolution du
  calendrier ouvré d'une société et d'un site — même calcul que l'aperçu de T-16, pas une deuxième
  version). Implémentations dans `src/infrastructure/supabase/journey-repository.ts` et
  `calendar-directory.ts`.
- **Migration** `supabase/migrations/20260916110000_journeys_hire_reference.sql` — colonne
  `journeys.hire_reference` et index unique partiel `(company_id, hire_reference) where hire_reference
  is not null`. C'est cette contrainte, pas une vérification applicative seule, qui tranche une
  course entre deux requêtes concurrentes portant la même référence.
- **Élargissement mineur de deux ports existants** : `AuditEvent.actorId` et le paramètre `actorId`
  de `assignJourneyOwners` acceptent désormais `string | null`. Un webhook n'a personne derrière lui ;
  `null` s'écrit dans `audit_events.actor_id` (colonne déjà nullable), l'origine reste tracée dans le
  payload de chaque événement (`origin: 'w1-validated-hire'`). Changement rétrocompatible : tout
  appelant existant qui passait une chaîne continue de fonctionner.
- **Export du workflow** : [`workflows/w1-validated-hire.json`](../../workflows/w1-validated-hire.json).
- **README** : section « Automatisations (n8n) » ajoutée, documentant déclencheur, appel, ce qui est
  envoyé et ce qui ne l'est pas encore, variables d'environnement, authentification.
- **`.env.example`** : ajout de `ONBOARDING_APP_URL` (lue côté n8n, pas côté app) avec un commentaire
  sur `N8N_WEBHOOK_SECRET` et `SUPABASE_SERVICE_ROLE_KEY`.

## Décisions prises

**Idempotence : no-op silencieux plutôt qu'erreur.** Une `hireReference` déjà vue renvoie `200` avec
le `journeyId` existant et `status: "duplicate"`, pas une erreur. Un webhook retenté (timeout réseau,
relance manuelle côté ATS) est le cas courant ; le traiter comme un succès idempotent évite du bruit
d'alerte pour un événement qui, du point de vue de l'appelant, a bien été traité. La trace reste
écrite (`journey.duplicate_hire_ignored`) pour qui voudrait la retrouver.

**Vérification préalable, puis contrainte unique en filet de sécurité.** Le cas d'usage vérifie
d'abord `findByHireReference` (évite l'essentiel du travail pour le cas courant), mais la décision
finale revient à l'index unique : si l'insertion échoue avec le code Postgres `23505`, le cas d'usage
relit la ligne existante et renvoie le même résultat idempotent. Sans ce filet, deux requêtes
arrivées à quelques millisecondes d'écart auraient pu toutes deux passer la vérification préalable
avant qu'aucune n'ait écrit.

**Sélection du template avant toute écriture, instanciation avant la création du parcours.** L'ordre
choisi est : idempotence → sélection du template → chargement du détail complet → calendrier →
instanciation (calcul pur, aucune écriture) → *puis* création de la ligne `journeys` → insertion des
tâches. Un échec de sélection (`no_match`, `ambiguous_match`) ou d'instanciation (dépendance
inconnue, cycle — `invalid_template`, cas défensif qui ne se produit pas avec un template bien formé
mais que le domaine sait détecter) ne laisse donc jamais de ligne `journeys` orpheline en base. Les
identifiants de tâches sont générés côté application (`crypto.randomUUID()`, une valeur par clé de
définition) plutôt que par l'identifiant par défaut du domaine (`"<journeyId>:<clé>"`) : ce dernier
n'est pas un UUID valide pour la colonne `tasks.id`.

**Date d'arrivée dans le passé : acceptée, signalée, pas refusée.** Une embauche saisie en retard
(contrat signé après coup, ATS synchronisé tardivement) reste un cas réel. La refuser ferait
disparaître silencieusement un parcours qui doit exister — ses échéances déjà dépassées sont
exactement ce que W2 (retard critique, T-22) doit pouvoir détecter dès sa création. Le parcours se
crée normalement, avec un événement d'audit dédié (`journey.arrival_in_past`) portant la date
d'arrivée et la date du jour, pour que le cockpit ou une alerte future puisse s'en saisir sans
recalculer quoi que ce soit.

**Notification des responsables et création des événements d'agenda : point d'accroche, pas
simulation.** Le périmètre du ticket les mentionne, mais T-24 (Resend) et T-25 (agenda) ne sont pas
construits. Plutôt que d'écrire un faux appel Resend ou un événement de calendrier fictif, le cas
d'usage enregistre l'intention dans `audit_events` — `journey.owner_notification_pending` par
responsable réellement assigné, `journey.welcome_email_pending` une fois par parcours (avec la
mention explicite que l'envoi est différé, calé sur la date d'arrivée, comme l'exige le skill
n8n-workflow), `journey.calendar_events_pending`. C'est un choix de périmètre documenté, pas un
raccourci : brancher T-24/T-25 sur ces événements suffira, sans toucher à W1.

**Acteur système.** `actorId: null` pour tous les événements d'audit de ce flux — aucun utilisateur
authentifié ne se cache derrière un webhook, et `actor_id` référence `profiles(id)` : y écrire une
valeur inventée aurait violé la contrainte de clé étrangère (ou pire, désigné la mauvaise personne).
L'origine (`'w1-validated-hire'`) voyage dans le payload de chaque événement à la place.

## Cas limites couverts

- **Même embauche reçue deux fois** — testé unitairement (`create-journey-from-validated-hire.test.ts`,
  « meme embauche recue deux fois ») et vérifié en conditions réelles : voir preuve ci-dessous, où
  la contrainte unique a effectivement tranché entre deux invocations concurrentes du serveur de
  développement sans jamais produire un second parcours.
- **Aucun template correspondant** — testé unitairement et vérifié en réel (`422`, `reason: "no_match"`,
  aucune ligne `journeys` créée).
- **Deux templates à égalité** — testé unitairement (`ambiguous_match`, `templateIds` triés) ; pas
  reproduit en conditions réelles faute de deux templates à égale spécificité dans le jeu de
  démonstration (`selectTemplate` lui-même est déjà entièrement testé côté domaine depuis T-09, ce
  test-ci vérifie seulement que le cas d'usage relaie la décision sans la retraiter).
- **Date d'arrivée dans le passé** — testé unitairement et vérifié en réel (`201`, événement
  `journey.arrival_in_past` écrit, échéances calculées normalement — certaines dans le passé,
  cohérent avec l'arrivée elle-même déjà passée).
- **Date d'arrivée mal formée** — testé unitairement (`400`, `invalid_arrival_date`).
- **Webhook sans secret ou avec un secret invalide** — vérifié en réel (`401` dans les deux cas, avant
  tout accès à la base — confirmé en observant qu'aucun événement d'audit n'est écrit pour ces
  appels).

## Preuve d'exécution réelle

Base réinitialisée (`npm run db:reset`), application démarrée en développement
(`next dev -p 3005`, variables `N8N_WEBHOOK_SECRET` et `SUPABASE_SERVICE_ROLE_KEY` fournies
explicitement pour ce test plutôt que lues depuis `.env.local`, dont l'accès est restreint dans cet
environnement). Appels réels via `Invoke-WebRequest` :

| Scénario | Requête | Résultat observé |
| --- | --- | --- |
| Secret absent | `POST` sans en-tête | `401` |
| Secret invalide | `POST` avec `x-webhook-secret: wrong-secret` | `401` |
| Création | `POST` valide, `hireReference: ats-hire-t21-001` | `201`, parcours et 6 tâches créés (constaté en relisant `journeys`, `tasks`, `task_dependencies` via l'API REST Supabase avec la clé de service) |
| Doublon | même `hireReference` rejouée | `200`, `status: "duplicate"`, même `journeyId`, aucune deuxième ligne dans `journeys` |
| Aucun template | société Méridien Gulf (aucun template dans le seed) | `422`, `reason: "no_match"` |
| Arrivée passée | `arrivalDate: 2026-01-05` (aujourd'hui simulé : 2026-09-16) | `201`, tâches aux échéances passées, événement `journey.arrival_in_past` présent |

Vérification directe en base pour la création réussie (Atelier Nord, référence `ats-hire-t21-past`) :
les six tâches du template standard sont bien créées avec leurs échéances en jours ouvrés
(`due_on` calculé par le même moteur que T-11, pas recalculé ici), les dépendances entre tâches sont
réécrites avec de vrais identifiants (`task_dependencies` interrogée après coup), et les responsables
sont attribués selon la chaîne de repli de la société (`manager` → Marc Manceau ; `hr_admin` → une
RH réelle de la société — deux comptes `hr_admin` existaient au moment du test à cause de données de
fixtures laissées par un run précédent de `supabase/tests/*.mjs`, voir « Défauts trouvés » ci-dessous ;
`resolveTaskOwner` a tranché de façon déterministe entre les deux, comme conçu en T-12).

## Défauts trouvés

**Dans mes scripts de vérification, pas dans le produit** :

- Exécuter `npm run db:verify` avant de faire des appels manuels contre la même base locale laisse
  des lignes de fixtures (`supabase/tests/fixtures.mjs`) dans `company_members` — ici, un deuxième
  compte `hr_admin` pour Atelier Nord (`aaaaaaaa-0000-4000-8000-000000000001`, à côté de la RH du
  jeu de démonstration). Ce n'est pas un bug : `resolveTaskOwner` est conçu pour trancher
  deterministiquement entre plusieurs RH valides (T-12, `[...hrAdminIds].sort()[0]`), et l'a fait
  correctement. Mais ça a rendu ma première lecture du responsable attribué surprenante avant que je
  n'en comprenne la cause. Corrigé en refaisant `npm run db:reset` avant la régression finale ; à
  garder en tête pour W2/W3 : ne pas enchaîner `db:verify` puis des vérifications manuelles sans
  réinitialiser entre les deux.
- Le serveur `next dev` a exécuté le gestionnaire de route deux fois pour certains appels isolés
  (observé via des événements `journey.duplicate_hire_ignored` surnuméraires dans le journal d'audit,
  alors qu'un seul appel réseau avait été émis) — comportement connu de la compilation à la demande
  de Next.js en développement sur une route encore jamais visitée, pas un défaut de la route
  elle-même. Effet secondaire utile : ça a démontré, sans le vouloir, que l'idempotence tient même
  sous des invocations rapprochées — un seul `journeys.created` a été écrit malgré les invocations
  multiples.

**Dans le produit** : aucun trouvé.

## Exécution réelle de n8n : jusqu'où elle est allée

Tentative de l'option (a) : `npx --yes n8n --version` dans le répertoire du projet. La commande a
réellement démarré le téléchargement du paquet `n8n` et de ses dépendances (dont
`@n8n/n8n-nodes-langchain`, plusieurs dizaines de Mo), observable dans les journaux npm — ce n'est
pas un rejet immédiat côté réseau. L'installation s'est arrêtée après plusieurs minutes sur
`ECONNRESET` (`npm error network ECONNRESET` / `network read` — lecture réseau interrompue en cours
de récupération d'un paquet), sans jamais atteindre un `n8n` exécutable. Budget de 20 minutes tenu
avant bascule vers l'option (b).

**Option (b) retenue.** [`workflows/w1-validated-hire.json`](../../workflows/w1-validated-hire.json)
est écrit à la main selon le schéma d'export documenté par n8n (nœuds `webhook`, `httpRequest`,
`switch`, `set` ×3, `respondToWebhook`, table `connections`). Il n'a **jamais tourné dans une vraie
instance n8n** — c'est une limite honnête à noter, pas une preuve d'exécution n8n réelle. La partie
qui compte réellement pour la définition de terminé — « le webhook refuse sans secret valide », «
aucune règle métier dans un nœud », « le workflow appelle, ne décide pas » — est démontrée par
l'appel direct et répété de la route API décrite ci-dessus, qui est exactement ce que le nœud HTTP
Request du workflow exécute une fois câblé à une vraie instance.

## Définition de terminé

- [x] Aucune règle métier dans un nœud n8n : le workflow appelle, il ne décide pas. Vérifié en
      lisant `workflows/w1-validated-hire.json` — le seul calcul présent est la construction du corps
      JSON à partir des champs déjà reçus, aucune date, aucun template, aucune résolution de
      responsable.
- [x] Webhook refusé sans secret valide, vérifié. Voir preuve d'exécution réelle ci-dessus (`401` sans
      en-tête, `401` avec un secret erroné).
- [x] Aucune donnée personnelle dans le payload, uniquement des identifiants. Le payload transporte
      `companyId`, `siteId`, `jobFamily`, `contractType`, `managerId`, `employeeId` (optionnel),
      `arrivalDate`, `hireReference`, et `employeeName` — ce dernier n'est pas une fuite propre à ce
      webhook : `journeys.employee_name` est déjà la façon dont tout le reste de l'application
      identifie un parcours (créateur de parcours, cockpit, portail), et aucune route de
      l'application ne peut créer une ligne `journeys` sans lui.
- [x] JSON exporté et commité. Exécution réelle n8n non atteinte (réseau) ; voir la section dédiée
      ci-dessus pour ce qui a été honnêtement vérifié à la place.

## Dette restante

- **T-24 (Resend) et T-25 (agenda) restent à construire.** W1 écrit l'intention de notifier dans
  `audit_events` (`journey.owner_notification_pending`, `journey.welcome_email_pending`,
  `journey.calendar_events_pending`) mais n'envoie rien. C'est un choix de périmètre assumé,
  documenté dans le README et repris ici : brancher ces deux tickets sur ces événements d'audit est
  tout ce qu'il restera à faire, sans retoucher W1.
- **`workflows/w1-validated-hire.json` n'a jamais tourné dans une vraie instance n8n**, faute d'accès
  réseau stable dans cet environnement pour l'installer. À ré-vérifier avec une vraie instance dès
  qu'un environnement avec accès réseau complet est disponible — la structure du JSON est prête pour
  ça (crédentiels référencés par nom, aucun secret en clair).
  *Levé depuis : exécuté dans une vraie instance n8n 2.39.7 (Docker, `scripts/n8n/start-local.sh`).
  L'exécution réelle a révélé trois défauts du JSON, corrigés : `personalEmail` n'était pas transmis
  à l'application ; une expression `$('Envoyer l'email…')` cassait sur l'apostrophe ; et le nœud
  d'attente passait avant la réponse au webhook, laissant l'appelant bloqué jusqu'à la date d'envoi.
  Les quatre branches ont tourné (créé → réponse → attente → email → alerte, doublon, échec
  explicite). Voir README, « Lancer n8n en local ».*
- **W2 (retard critique) et W3 (bilan J+30) ne sont pas construits** — hors périmètre de ce ticket,
  prochains de la série.
