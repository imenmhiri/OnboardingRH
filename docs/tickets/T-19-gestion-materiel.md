# T-19 — Écrans de gestion du matériel

**Couches** : app, components · **Agent** : ui-builder
**Dépend de** : T-03, T-15 · **État** : fait

## Pourquoi

Quatrième surface : elle sert trois personnes différentes — l'IT qui prépare, la RH qui suit,
l'employé qui accuse réception.

## Périmètre

- Demande de matériel depuis un parcours, à partir du catalogue de la société.
- File de préparation pour l'IT, groupée par arrivée et par échéance.
- Attribution d'un matériel identifié, puis remise.
- Accusé de réception par l'employé depuis son portail.

## Hors périmètre

- Gestion de stock, achats, amortissement.

## Ce qui a été décidé en chemin

**Le domaine et les migrations existaient déjà (T-15) ; cet écran est resté un écran.**
`domain/equipment/equipment.ts` (machine à états) et `domain/equipment/order-grouping.ts`
(regroupement de commande) étaient complets et testés avant ce ticket — aucun n'a été retouché.
Ce qui manquait était la couche application (ports, cas d'usage) et la couche infrastructure, sur le
même modèle que les documents (`task-document-repository.ts` / `task-documents.ts` /
`upload-task-document.ts`) : un port `EquipmentRepository`, une implémentation Supabase
(`infrastructure/supabase/equipment-requests.ts`), et deux cas d'usage —
`request-equipment.ts` (ouvrir une ou plusieurs demandes) et `transition-equipment-request.ts`
(faire avancer, reculer ou reprendre une demande, en rejouant `transitionEquipment` du domaine et en
traçant l'action dans l'audit). Les lectures, elles, vont droit aux tables depuis les Server
Components (`materiel/page.tsx`, section « Mon matériel » du portail) — même choix que le cockpit
(T-18) et le portail (T-17) : la RLS scope déjà tout, un repository de lecture n'aurait ajouté qu'une
couche à traverser.

**Une seule transition générique, pas cinq cas d'usage distincts.** Commander, attribuer, remettre,
reprendre et accuser réception sont tous des appels à `transitionEquipmentRequest(ports, { requestId,
to, actorId, unitReference? })` : le domaine sait déjà quelles transitions sont légales
(`ALLOWED_TRANSITIONS`) et pourquoi une transition est refusée (`EquipmentTransitionRefusal`), le cas
d'usage n'a donc rien à décider lui-même — il charge la ligne, rejoue le domaine, persiste, trace.
Le seul comportement ajouté au-dessus du domaine : un numéro de série repris (`isReclaim`) est effacé
plutôt que conservé, parce qu'il ne désigne plus rien tant qu'une nouvelle unité n'a pas été attribuée
— documenté dans le code, testé dans `transition-equipment-request.test.ts`.

**La RLS des parcours a dû s'ouvrir un cran à l'IT.** En lisant `journeys_select_visible`
(migration T-06), l'IT n'apparaissait nulle part : seuls l'employé, son manager et la RH pouvaient lire
un parcours. Or « une file groupée par arrivée » suppose de savoir *qui* arrive et *quand* — des
colonnes de `journeys`, pas de `equipment_requests`. Sans cette ouverture, l'écran aurait dû soit
cacher les noms et les dates (perdant tout l'intérêt du regroupement), soit passer par une fonction
`security definer` dédiée. La policy existante s'ouvrant déjà à un rôle entier pour d'autres tables
(`has_company_role(company_id, array['hr_admin'])`), l'étendre à `'it'` pour `journeys` est la même
figure, pas une nouvelle : migration `20260916100000_equipment_it_journey_visibility.sql`, qui
recrée la policy avec `array['hr_admin', 'it']`. Rien d'autre ne change : l'IT ne gagne aucun droit
d'écriture sur les parcours (`journeys_write_hr` reste réservée à la RH), et un manager continue de ne
voir que ses rattachés.

**L'IT atterrit sur `/materiel`, pas sur `/portail`, en arrivant sans destination précise.**
`landingArea` (domaine `companies/access`) ne connaissait que deux destinations : le cockpit (RH,
manager) ou le portail (tout le monde, par défaut). L'IT n'a pas de cockpit mais a maintenant sa
propre file de travail ; la laisser retomber sur le portail — pensé pour un nouvel arrivant, pas pour
un rôle interne — l'aurait affichée devant un écran sans rien à y faire. `landingArea` essaie
maintenant le cockpit, puis `equipment`, puis retombe sur le portail. `access.test.ts` et
`load-session-context.test.ts` sont mis à jour en conséquence ; `app/page.tsx` route les trois
destinations possibles.

**Commander est une étape à part de la file de préparation, groupée, jamais une action par ligne.**
La carte « Commandes à grouper » applique `groupRequestsForOrder` (T-15) directement aux demandes
`requested` de la société et propose un seul bouton « Marquer commandé » par groupe — c'est
explicitement le cas limite du ticket (« même matériel demandé pour plusieurs arrivées le même jour »)
qui aurait été invisible si chaque demande s'était commandée séparément. La file de préparation, elle,
n'affiche donc jamais d'action « Commander » ligne par ligne : une demande encore `requested` y porte
la mention « À grouper dans une commande ci-dessus », qui renvoie explicitement vers la bonne carte
plutôt que de dupliquer l'action.

**« Nouvelle demande » ne lie pas systématiquement une tâche.** Le domaine autorise `taskId: null` — un
matériel peut exister sans qu'aucune tâche n'en dépende directement (c'est déjà le cas du badge et de
l'ordinateur du jeu de démo, tous deux avec `task_id` nul). La création manuelle depuis l'écran suit la
même règle plutôt que d'obliger l'utilisateur à choisir une tâche qui n'a pas toujours de sens ; lier
une demande à une tâche précise reste possible en base mais n'est pas exposé dans ce formulaire — juger
que ce raffinement n'apportait rien à un cas déjà couvert (le seed lie déjà deux demandes à la tâche
« Accueil et remise du matériel » pour démontrer le blocage).

**L'employé ne fait qu'un seul geste, et une région vive l'annonce.** La section « Mon matériel » du
portail liste ce qui est `handed_over` pour le parcours de l'employé (`isAwaitingAcknowledgement`) et
n'offre qu'un bouton « Confirmer la réception ». La RLS (migration T-15) plafonne déjà la destination
possible à `acknowledged` ; le domaine vérifie en plus que la ligne est bien à `handed_over` avant
d'accepter — deux gardes indépendantes. Premier essai du bouton : la région `aria-live="polite"` était
rendue seulement dans la branche « pas encore confirmé » du composant, donc jamais mise à jour au
moment précis où elle aurait dû l'être (l'annonce n'existait plus une fois l'état bascule) — un défaut
trouvé par `equipment-a11y.mjs`, corrigé en gardant la région montée dans les deux états.

## Cas limites couverts

- **Même matériel demandé pour plusieurs arrivées le même jour** : Claire et Bruno (à venir, même
  jour d'arrivée) demandent chacun un « Ordinateur portable standard » — deux lignes
  `equipment_requests` distinctes en base, une seule carte « × 2 » dans « Commandes à grouper », un
  seul bouton « Marquer commandé » qui fait passer les deux à `ordered` en une action. L'ordinateur de
  Diego, arrivé trois semaines plus tôt, reste une commande à part — vérifié à l'écran avec le compte
  IT (`equipment-flow.mjs`) et en domaine (`groupRequestsForOrder`). Voir la correction ci-dessous :
  la première version de ce ticket regroupait aussi Diego.
- **Accusé de réception en retard : la tâche liée reste ouverte** : le badge de Diego est `handed_over`
  depuis le jeu de démo sans jamais avoir été accusé ; `blocksDependentTask` (domaine) continue de le
  compter comme bloquant tant que personne n'accuse réception, et le cockpit (T-18) le remonte déjà
  sans qu'aucune écriture de ce ticket n'ait eu besoin d'y toucher — vérifié en relisant
  `cockpit-flow.mjs` en régression après ce ticket (toujours vert) et en confirmant que la remise
  (T-19) ne touche jamais au statut de la tâche elle-même, seulement à celui de la demande.
- **Matériel repris avant l'arrivée** : le badge de Claire, dans le jeu de démo, est déjà le résultat
  d'une reprise (`assigned` → `requested`, tracée dans l'audit par le seed). Ce ticket rend ce même
  mouvement jouable depuis l'écran, pas seulement visible comme un état figé : un ordinateur attribué à
  Claire avec un numéro de série, puis repris via « Reprendre l'attribution », redevient une demande
  `requested` sans numéro, et réapparaît dans « Commandes à grouper » — vérifié à l'écran
  (`equipment-flow.mjs`), et l'effacement du numéro de série est testé isolément dans
  `transition-equipment-request.test.ts`.

## Définition de terminé

- [x] Les trois rôles voient uniquement ce qui les concerne, garanti par la RLS — vérifié par
      `supabase/tests/equipment-isolation.mjs` (nouveau, chaîné dans `npm run db:verify`) et par la
      section 13 déjà existante de `rls-isolation.mjs` (T-15) : l'IT et la RH seuls écrivent le cycle de
      vie (`equipment_requests_write_hr_or_it`), un manager ne le peut pas, une autre société ne voit ni
      ne touche rien, et l'employé ne peut jamais écrire ailleurs qu'`acknowledged` sur sa propre ligne.
      Rejoué à l'écran (pas seulement en base) dans `equipment-flow.mjs` : un manager et un employé qui
      naviguent directement vers `/materiel` sont redirigés vers `/portail`.
- [x] États vide, chargement et erreur dessinés — `EmptyState` pour « Commandes à grouper » vide, « File
      de préparation » vide (« Tout est prêt », pas une absence de fonctionnalité), « Mon matériel » vide
      côté portail ; `ErrorState` si la lecture des parcours, du catalogue ou des demandes échoue sur
      `/materiel`. Comme pour le cockpit (T-18), les branches d'erreur sont vérifiées en lisant le code
      plutôt qu'en simulant une panne réseau contre l'instance Supabase locale.
- [x] Parcours d'accusé de réception utilisable au clavier et sur mobile — `equipment-a11y.mjs` : le
      bouton « Confirmer la réception » est atteignable et activable au clavier seul (`Tab` puis
      `Enter`), la confirmation est annoncée par une région vive, et aucun défilement horizontal
      n'apparaît à 390 px ni sur `/materiel` ni sur `/portail`.

## Vérifié sur les données réelles

`scripts/ui-checks/equipment-flow.mjs`, sur la vraie base réinitialisée et un vrai navigateur :

- Connexion IT (`it@atelier-nord.demo`) : atterrit directement sur `/materiel` (nouvelle destination
  par défaut), l'ordinateur partagé par Claire et Diego apparaît groupé « × 2 » dans « Commandes à
  grouper », Diego apparaît dans la file avec son badge « Remis » et le texte « en attente de l'accusé
  de réception par l'employé ».
- Commande groupée : « Marquer commandé » fait passer les deux ordinateurs à « Commandé » en une seule
  action, le groupe disparaît de la carte de commande.
- Attribution : numéro de série saisi dans la fenêtre dédiée, apparaît ensuite à côté du matériel avec
  le statut « Attribué ».
- Reprise avant l'arrivée : « Reprendre l'attribution » sur l'ordinateur de Claire le fait redescendre
  à « Demandé », son numéro de série disparaît, le groupe de commande réapparaît.
- Remise : l'ordinateur de Diego, attribué puis remis, affiche « en attente de l'accusé de réception »
  comme son badge — deux matériels de la même arrivée, tous deux bloquants tant que rien n'est confirmé.
- Nouvelle demande : un casque ajouté pour Claire depuis le catalogue apparaît aussitôt dans la file,
  au statut « Demandé ».
- Connexion RH (`rh@atelier-nord.demo`) : atteint `/materiel` depuis le lien du cockpit, et inversement.
- Connexion manager et employé : tous deux redirigés hors de `/materiel` vers `/portail`.
- Connexion employé (`alice@atelier-nord.demo`) : le casque remis (ajouté au jeu de démo pour ce
  ticket, seul cas « remis, jamais accusé » avec un compte de connexion réel — Diego, l'autre cas du
  jeu de démo, n'a pas de compte) apparaît dans « Mon matériel » ; après confirmation, il disparaît de
  la liste sans rechargement de page.

`scripts/ui-checks/equipment-a11y.mjs`, sur la même base :

- Contraste AA mesuré sur `/materiel` et sur la section « Mon matériel » du portail, palettes Atelier
  Nord (bleu) et Méridien Gulf (or, via un compte IT de vérification installé hors RLS — le jeu de
  démo n'a pas de compte IT chez Méridien Gulf), clair et sombre : zéro problème sur 41, 16 et 46
  éléments selon l'écran et la palette.
- Premier `Tab` : atteint le lien d'évitement.
- Bouton « Confirmer la réception » atteint et activé au clavier seul ; confirmation annoncée par une
  région vive (`aria-live="polite"`).
- Aucun défilement horizontal à 390 px, sur `/materiel` comme sur `/portail`.

## Défauts trouvés en testant

**Dans le produit** : la région vive du bouton d'accusé de réception (`AcknowledgeEquipmentButton`)
n'était montée que dans la branche « pas encore confirmé » du composant ; au moment précis où l'état
passait à « confirmé », le nœud portant `aria-live` disparaissait du DOM avant d'avoir pu annoncer quoi
que ce soit — corrigé en gardant la région montée dans les deux états
(`src/app/(app)/portail/acknowledge-equipment-button.tsx`).

**Dans mes scripts, pas dans le produit** :
- Les premières versions de `equipment-flow.mjs` lisaient `page.url()` immédiatement après la connexion,
  avant que la seconde redirection serveur (`/` → `/materiel` ou `/` → `/portail`) n'ait eu le temps de
  se résoudre — corrigé en attendant explicitement l'URL finale avant de la lire, plutôt que de
  supposer que `waitForLoadState('networkidle')` suffisait à couvrir une chaîne de redirections.
- Les actions de cet écran redirigent toutes vers la même URL (`/materiel`) : `Promise.all([
  page.waitForURL('/materiel'), bouton.click() ])` se satisfaisait immédiatement puisque l'URL y était
  déjà, sans attendre la navigation réelle déclenchée par le clic — remplacé par une attente du
  prochain `framenavigated` combinée à `networkidle`.
- `page.locator(...).selectOption({ label: /regex/ })` n'accepte pas une expression régulière pour
  `label` (seulement une chaîne exacte) — corrigé en extrayant d'abord le texte exact de l'option
  voulue avant de la sélectionner.
- Une régression manuelle de `portal-flow.mjs` (T-17, non touché par ce ticket) a échoué faute d'un
  vrai fichier PDF disponible en argument de ligne de commande (`process.argv[1]`/`[2]`, non documentés
  dans `scripts/ui-checks/README.md`) — `cockpit-flow.mjs` et les deux scripts de ce ticket, qui ne
  dépendent d'aucun fichier externe, ont servi de garde-fou de régression à la place ; ce défaut de
  script préexistant est hors périmètre de ce ticket (aucun fichier de dépôt de document n'a été
  modifié ici).

## Correction après livraison : regroupement par semaine d'arrivée

Trouvé en test manuel : « Marquer commandé » faisait passer à la fois l'ordinateur de Claire (arrivée
le 28 septembre) et celui de Diego (arrivé le 8 septembre). `groupRequestsForOrder` regroupait
seulement par société et par modèle, sans regarder la date d'arrivée — contrairement à ce que ce
ticket et le commentaire du domaine annonçaient (« arrivées simultanées »). Une arrivée déjà en retard
et une autre trois semaines plus tard n'ont pas la même urgence ; les commander ensemble faisait
attendre l'une ou presser l'autre.

- **Règle retenue** : même société, même modèle **et même semaine d'arrivée** (lundi à dimanche,
  `mondayOf` ajouté à `domain/scheduling/plain-date.ts`). Une demande dont l'arrivée est inconnue
  forme son propre groupe, affiché « Date d'arrivée inconnue », sans être écartée.
- **Écran** : chaque commande affiche « Arrivées de la semaine du … » ; la description de la carte le
  précise.
- **Démo** : Bruno Binôme (`a0000000-…-005`) arrive le même jour que Claire avec le même ordinateur,
  pour que le cas « × 2 » reste visible ; Diego devient une commande « × 1 » à part.
- **Vérifié** : 6 tests ajoutés (`order-grouping.test.ts`, `plain-date.test.ts`), dont le cas exact
  Diego/Claire ; `equipment-flow.mjs` vérifie désormais les deux commandes séparées (3 passages sur 3,
  23 contrôles) ; `cockpit-flow`, `cockpit-a11y` et `equipment-a11y` restent verts.
- **Dans mes scripts, pas dans le produit** : deux attentes de `equipment-flow.mjs` lisaient la liste
  avant son rafraîchissement, et le clic « Confirmer la réception » pouvait partir avant l'hydratation
  du bouton en mode dev. Corrigé en attendant le texte attendu et la fin du chargement.
- **Limite restante** : la semaine est une règle fixe, pas un réglage par société. Si une filiale
  voulait une autre fenêtre (par exemple dix jours ouvrés), il faudrait en faire une donnée.

## Dette laissée derrière

- `scripts/ui-checks/portal-flow.mjs` attend deux chemins de fichiers en argument de ligne de commande
  sans que cela soit documenté dans `scripts/ui-checks/README.md` (lui-même déjà incomplet : il ne
  liste pas `cockpit-flow.mjs`, `cockpit-a11y.mjs`, `portal-flow.mjs`, `portal-a11y.mjs`, ni les deux
  scripts de ce ticket). Pas corrigé ici, hors périmètre de ce ticket et déjà une dette antérieure.
- La création d'une demande de matériel (« Nouvelle demande ») ne permet pas de choisir la tâche à lier
  ; seule une demande créée par le seed ou par un futur parcours instancié peut porter un `task_id`. Le
  domaine le permet (`taskId: string | null`), l'écran ne l'expose pas — jugé volontairement hors
  périmètre (voir la décision ci-dessus) plutôt qu'un oubli, mais un futur besoin réel (un matériel
  dont la remise doit bloquer explicitement une tâche créée après coup) demanderait d'ajouter ce champ
  au formulaire.
- Le retour (`returned`) et l'annulation (`cancelled`) sont des transitions légales du domaine
  (`ALLOWED_TRANSITIONS`) mais n'ont aucune action correspondante dans cet écran : le ticket ne les
  demandait pas explicitement (son périmètre s'arrête à la demande, la préparation, l'attribution, la
  remise et l'accusé), et le jeu de démo n'en a pas besoin. À ajouter si un futur ticket en a besoin.
