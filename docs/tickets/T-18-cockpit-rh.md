# T-18 — Cockpit RH

**Couches** : app, components · **Agent** : ui-builder
**Dépend de** : T-03, T-06, T-10, T-12, T-14 · **État** : fait

## Pourquoi

C'est l'écran de pilotage : il doit répondre d'un coup d'oeil à ce qui arrive, ce qui coince, et qui
doit agir.

## Périmètre

- Arrivées à venir, par site et par semaine.
- Tâches bloquées, avec la cause racine et son propriétaire affichés directement.
- Comptes non créés et matériel manquant avant une arrivée imminente.
- Satisfaction J+7 et J+30, avec les signaux faibles remontés.
- Filtres par site, par métier, par responsable.

## Hors périmètre

- Export comptable, tableau de bord multi-groupes.

## Ce qui a été décidé en chemin

**Les lectures vont droit aux tables, le calcul reste au domaine.** Comme pour le portail (T-17),
`page.tsx` et les quatre sections interrogent Supabase directement — la RLS scope déjà tout par
société et par rôle, un repository supplémentaire n'aurait ajouté qu'une couche à traverser. En
revanche, toute logique — blocage, résolution de responsable, seuils de satisfaction, cycle de vie du
matériel — reste dans `domain/`, jamais recalculée dans le composant. C'est le point que la définition
de terminé demande explicitement et que les scripts de vérification exercent.

**`owner_id` nul est réinterprété à l'affichage, pas fait confiance tel quel.** Une tâche sans
responsable nommé peut vouloir dire deux choses opposées : « portée par l'équipe, rien d'anormal » ou
« la chaîne de repli n'a trouvé personne, ça doit remonter ». Les deux s'écrivent identiquement en
base au moment de l'instanciation (T-11/T-12). Le cockpit ne devine pas : pour chaque cause racine
sans propriétaire, il rejoue `resolveTaskOwner` (T-12) via le port `AssignmentDirectory` déjà construit
en infrastructure, et affiche le résultat réel — « Équipe informatique » ou « Aucun responsable trouvé »
avec un badge « Non attribuable » distinct. Une même cause racine bloquant plusieurs tâches en aval
(le cas Diego, une tâche IT qui en bloque trois) n'est résolue qu'une fois, pas une fois par tâche
bloquée.

**Le cas de démonstration « Diego » est un task IT porté par l'équipe, pas un cas « non attribuable ».**
Le prompt d'origine parlait de la tâche « Créer le compte IT » de Diego comme du cas limite
« non attribuable ». En la rejouant avec `resolveTaskOwner` et la chaîne de repli réelle de la
démonstration (`it_team, hr_admin`), elle se résout en fait vers l'équipe informatique, sans
substitution : c'est le comportement correct du domaine, pas un défaut. Le cas limite « tâche non
attribuable faute de responsable résolu » (explicitement demandé par le ticket) reste couvert par le
code — `isUnassignable` produit bien le badge distinct dès qu'un `AssignmentOutcome` renvoie
`assignment: null` — mais aucune donnée du jeu de démo ne déclenche ce chemin aujourd'hui : la chaîne
de repli configurée pour Atelier Nord retombe toujours sur la RH en dernier recours. Documenté plutôt
que forcé une donnée artificielle dans le seed pour un cas que le code gère déjà correctement.

**Fenêtre « arrivée imminente » : dix jours ouvrés, dans les deux sens.** Le ticket parle d'une
arrivée « imminente » pour le matériel et les comptes IT. Une lecture strictement tournée vers l'avenir
aurait fait disparaître le cas Diego : son arrivée est passée, mais son badge est remis sans accusé de
réception six jours ouvrés après — c'est justement le cas le plus urgent des deux, pas celui qui
attend le moins. La fenêtre couvre donc dix jours ouvrés avant et après aujourd'hui plutôt que cinq
jours strictement à venir, documenté dans `src/app/(app)/cockpit/readiness.tsx`.

**Fenêtre « arrivées à venir » : quatre semaines glissantes.** Reprise du texte déjà présent dans la
maquette d'origine du cockpit ; au-delà, une arrivée n'a encore rien d'actionnable pour la RH.

**Filtres en formulaire GET natif, comme la bascule de société (T-05).** Site, métier et responsable
sont trois `<select>` natifs dans un `<form method="get">`, sans JavaScript client : l'état vit dans
l'URL, survit à un rechargement, et reste utilisable sans JS. Les options de site viennent de la table
`sites` ; celles de métier et de responsable sont dérivées des parcours réellement présents, pour ne
jamais proposer un filtre qui viderait tout.

**Un défaut trouvé dans le composant partagé `Button`, pas seulement dans cet écran.** `Button`
insérait toujours `{loading ? <Loader2/> : null}` avant `{children}`, y compris en mode `asChild`. Le
`Slot` de Radix (utilisé pour composer un bouton avec un `<Link>` ou un `<a>`) exige exactement un
enfant React valide ; lui passer `null` à côté de l'enfant réel le fait échouer avec *"Slot failed to
slot onto its children"*, une exception serveur qui casse toute la page. Ce chemin n'avait jamais été
exercé en navigateur avant ce ticket — le cockpit d'origine (T-05/shell) utilisait déjà
`<Button asChild><Link>…</Link></Button>` pour le lien vers le créateur de parcours, mais personne ne
l'avait ouvert dans un vrai navigateur. Corrigé dans `src/components/ui/button.tsx` : en mode
`asChild`, le spinner de chargement n'est plus injecté à côté de l'enfant délégué (combiner
« en chargement » et « délégué à un lien » n'a de toute façon pas de sens — un lien ne porte pas
`aria-busy`). Comportement du bouton normal inchangé.

## Cas limites couverts

- **Aucune arrivée à venir** : `UpcomingArrivalsCard` affiche un état vide qui annonce une bonne
  nouvelle (« Bonne nouvelle : rien d'imminent à préparer »), pas une absence de fonctionnalité —
  vérifié en filtrant sur un métier inexistant, qui vide toutes les sections sans rien casser.
- **Volume important, lisible et navigable au clavier** : chaque section est une liste HTML simple
  (`<ul>`/`<li>`), sans widget custom à gérer au clavier ; les seuls contrôles interactifs sont les
  trois `<select>` et deux boutons du formulaire de filtre, tous atteignables au Tab et activables au
  clavier — vérifié à l'écran (voir plus bas).
- **Tâche non attribuable faute de responsable résolu** : `isUnassignable` produit un badge « Non
  attribuable » distinct de « Équipe {rôle} », affiché à part du statut de la tâche elle-même (icône +
  texte, jamais la couleur seule). Voir la décision ci-dessus sur le jeu de démo actuel.
- **Contrat qui se termine avant J+30** : le questionnaire J+30 de Diego est annulé côté domaine
  (T-14) ; il n'apparaît donc jamais comme un signal faible manquant dans la carte satisfaction —
  vérifié en lisant les données réelles (`surveys.status = 'cancelled'` pour ce parcours).
- **Seuil d'anonymat des moyennes de satisfaction** : le site de Lille, avec deux réponses
  seulement, affiche « Trop peu de réponses pour publier une moyenne » plutôt qu'une moyenne calculée
  sur deux personnes — vérifié à l'écran avec le compte RH.

## Définition de terminé

- [x] Le blocage affiché vient de `domain/tasks`, il n'est pas recalculé dans le composant —
      `buildTaskGraph` et `explainBlocking` sont appelés tels quels dans `blocked-tasks.tsx`, la seule
      logique ajoutée est la résolution du responsable via `domain/tasks/owner-resolution` quand
      `owner_id` est nul.
- [x] Chaque statut combine icône et texte, jamais la couleur seule — `StatusBadge` (déjà comme ça
      depuis T-03) est utilisé partout ; les badges qui ne sont pas des statuts de tâche (« Non
      attribuable », « Accusé manquant », « Signal faible ») suivent le même composant.
- [x] États vide, chargement et erreur dessinés — `EmptyState` pour chaque section sans données,
      `ErrorState` pour chaque requête Supabase qui échoue (parcours, tâches, graphe invalide,
      calendrier société, tâches/matériel IT, questionnaires, réponses), testé en lisant le code de
      chaque branche d'erreur (pas simulé en base, faute de moyen simple de faire échouer Supabase
      localement sans casser le reste de la vérification).
- [x] Contraste AA vérifié sur deux palettes de sociétés — mesuré sur les pixels rendus, Atelier Nord
      (bleu) et Méridien Gulf (or), clair et sombre, 96 et 28 éléments respectivement, aucun sous le
      seuil.

## Vérifié sur les données réelles

`scripts/ui-checks/cockpit-flow.mjs`, en pilotant un vrai navigateur sur la vraie base réinitialisée :

- Connexion RH (`rh@atelier-nord.demo`) : titre du cockpit, Claire dans les arrivées à venir groupées
  par site (Siège de Lille), la tâche « Créer le compte IT » de Diego bloque trois tâches en aval
  affichées avec « Bloquée par : Créer le compte IT — Équipe informatique », le badge de Diego remis
  sans accusé de réception signalé en texte, le signal faible de Farida (note en baisse de 4/5 à 2/5
  entre J+7 et J+30) affiché avec son prénom.
- Filtre métier sans correspondance : les arrivées à venir affichent l'état vide informatif.
- Connexion manager (`manager@atelier-nord.demo`) : accès au cockpit confirmé (la RLS restreint déjà
  son périmètre à ses rattachés, aucun code applicatif n'a besoin de le refaire).
- Connexion employé (`alice@atelier-nord.demo`) : redirection vers `/portail`, le cockpit reste hors
  d'atteinte pour ce rôle.

`scripts/ui-checks/cockpit-a11y.mjs`, sur la même base :

- Contraste AA mesuré sur les deux palettes de démonstration, clair et sombre (Atelier Nord via
  `rh@atelier-nord.demo` ; Méridien Gulf via un compte RH de vérification installé pour l'occasion,
  hors RLS via la clé de service — le jeu de démo n'a aucun compte RH/manager chez Méridien Gulf,
  seule Nadia y est employée, donc rien n'y donnait accès au cockpit sans ce compte). Zéro problème
  sur 96 éléments (Nord) et 28 éléments (Gulf, écran quasiment vide faute de parcours).
- Premier `Tab` : atteint le lien d'évitement « Aller au contenu principal ».
- Filtre de site sélectionné et validé entièrement au clavier (`Tab`/flèches/`Enter`), l'URL reflète
  le filtre appliqué.
- État vide affiché pour un filtre sans correspondance.
- Aucun défilement horizontal à 390 px.

## Défauts trouvés en testant

**Dans le produit** : le bug de `Button asChild` décrit plus haut (`src/components/ui/button.tsx`) —
une exception serveur cassait entièrement toute page utilisant `<Button asChild>` autour d'un lien,
y compris le lien « Créateur de parcours » du cockpit lui-même. Corrigé avant tout script de
vérification.

**Dans mes scripts, pas dans le produit** : les premières versions de `cockpit-flow.mjs` cherchaient
« Diego » et « Lille » avec une casse exacte, alors que ces libellés sont transformés en majuscules
par CSS (`uppercase`) à l'affichage — `innerText` renvoie le texte tel que rendu, pas le texte source.
Corrigé en comparant sans tenir compte de la casse plutôt que de renoncer au style visuel qui, lui,
est correct.

**Une pollution de données observée, pas un défaut** : exécuter `npm run db:verify` juste après
`npm run db:reset` insère des lignes de test (préfixes `aaaaaaaa-…`, `dddddddd-…`) dans la même base
locale, qui se sont retrouvées mélangées aux parcours du jeu de démo lors d'une première vérification
manuelle. `scripts/seed/align-demo-dates.ts` reste scopé à `id::text like 'a0000000%'`, donc ce
n'est pas ce script qui est en cause — c'est l'ordre des commandes. Toutes les vérifications finales de
ce ticket ont été rejouées après un `db:reset` frais, sans `db:verify` intercalé avant les scripts
Playwright.

## Dette laissée derrière

- Aucune donnée du jeu de démo n'exerce le chemin « tâche réellement non attribuable » (voir la
  décision ci-dessus) ; le code le gère (`isUnassignable`), mais seul un futur scénario de seed
  (société sans chaîne de repli configurée pour un rôle, ou équipe entière absente) le rendrait visible
  à l'écran sans lire le code.
- Les erreurs Supabase (`ErrorState` par section) ne sont vérifiées que par lecture du code, faute
  d'un moyen simple de simuler une panne réseau contre l'instance Supabase locale sans perturber le
  reste des scripts de vérification.
- Un défaut préexistant, sans rapport avec ce ticket, a été observé en rejouant
  `scripts/ui-checks/journey-builder-flow.mjs` en régression : un sélecteur fragile (« La dépendance
  choisie est affichée sous forme de puce ») échoue de façon apparemment intermittente. Il n'est pas
  touché par ce ticket (aucun fichier de `parcours/` n'a été modifié ici) et n'entre pas dans la liste
  de vérification exigée par ce ticket (`db:reset`, `db:verify`, `typecheck`, `lint`, `vitest`,
  `build`) ; laissé tel quel plutôt que corrigé hors périmètre.
