# T-20 — Passe d'accessibilité et cohérence visuelle

**Couches** : app, components · **Agent** : ui-builder · **Dépend de** : T-16, T-17, T-18, T-19
**État** : fait

## Pourquoi

L'accessibilité vérifiée écran par écran (T-16 à T-19) laisse passer les incohérences entre écrans.
Ce ticket regarde le produit comme un tout, une fois les quatre surfaces en place : `parcours/`,
`portail/`, `cockpit/`, `materiel/`, et les primitives partagées de `components/ui/`.

## Méthode

Lecture complète des quatre écrans et de leurs dialogues, avec une attention particulière aux
« dette laissée derrière » de T-16 à T-19 (pour ne pas relitiger ce qui était déjà assumé), puis
vérification réelle : base réinitialisée (`npm run db:reset`), application construite et démarrée en
production (`npm run build && npm start`), et les huit scripts de `scripts/ui-checks/` rejoués avec
un vrai Chrome (`chromium.launch({ channel: 'chrome' })`) — quatre paires flow/a11y, une par écran.

## Défauts d'accessibilité trouvés et corrigés, dans le produit

**Deux fenêtres modales restaient ouvertes après une action réussie, sans rien pour l'annoncer.**
`AssignEquipmentDialog` (matériel) et `DocumentUploadDialog` (portail) utilisent toutes deux
`useActionState` sans redirection derrière une action réussie — contrairement au reste des écrans, où
une action redirige et referme le dialogue en remplaçant toute la page. Sans fermeture explicite, la
fenêtre restait affichée, couvrant la ligne déjà mise à jour derrière elle, sans aucun signal — ni
visuel, ni pour un lecteur d'écran — que l'action avait réussi. Un utilisateur au clavier n'avait
aucun moyen de savoir que l'attribution ou le dépôt avait fonctionné sans fermer lui-même la fenêtre
et vérifier la liste. Corrigé dans les deux composants : la fenêtre se ferme d'elle-même dès que
l'état ne porte plus d'erreur, et une région vive (`role="status" aria-live="polite"`, montée en
permanence, jamais démontée au moment précis de l'annonce — le piège déjà documenté dans
`AcknowledgeEquipmentButton` depuis T-19) annonce le résultat en français : « Attribution enregistrée
pour … », « Pièce « … » déposée. ».

**Les transitions de matériel qui redirigent vers la même URL ne disaient jamais rien.**
`markGroupOrdered`, `transitionRequest` (remettre, reprendre) et `createEquipmentRequest`
redirigent toutes vers `/materiel`, sans changement d'URL perceptible. Contrairement à une navigation
vers une page différente (créateur de parcours : `saveTask`, `duplicate`, `removeTask` changent
d'URL, ce que l'App Router annonce déjà), rien n'indiquait explicitement qu'une action avait eu lieu —
seul un badge de statut changeait de mot et d'icône, sans qu'aucune région vive ne le porte à
l'attention d'un lecteur d'écran. Corrigé sur le même principe que le paramètre `erreur` déjà en
place : un paramètre `succes` porte un message par action (« Commande marquée… », « Matériel marqué
comme remis… », « Attribution reprise… », « Nouvelle demande de matériel enregistrée. »), affiché en
`role="status" aria-live="polite"` à côté du bandeau d'erreur existant — même position, même
composant de ton (`bg-success-soft` / `text-success`, symétrique de `bg-danger-soft` / `text-danger`).

## Incohérence entre écrans trouvée et corrigée

**Le même petit composant de région vive était réécrit à la main trois fois.**
`AcknowledgeEquipmentButton` (portail, déjà en place depuis T-19), et les deux fenêtres corrigées
ci-dessus, portaient chacune leur propre `<p role="status" aria-live="polite" className="sr-only">`.
Extrait en `src/components/ui/live-region.tsx` (`LiveRegion`), un seul composant partagé pour « une
confirmation qui change l'affichage sans navigation », réutilisé aux trois endroits. C'est
exactement le genre d'écart que ce ticket est censé attraper : trois écrans qui résolvent le même
problème chacun à sa façon plutôt qu'avec le même composant.

**Vérifié pour le reste, sans changement nécessaire** : les quatre écrans utilisent déjà partout
`StatusBadge` pour tout statut (jamais une pastille de couleur seule réimplémentée), `Card` /
`CardHeader` / `CardBody` pour la même structure de section, `EmptyState` / `ErrorState` pour les
mêmes états vide et erreur, et le même vocabulaire pour les mêmes actions (« Annuler » pour fermer un
formulaire sans valider, jamais « Retour » ailleurs ; « Fermer la fenêtre » pour le bouton × des
dialogues). Aucune incohérence de formulation ou de composant supplémentaire trouvée en relisant les
quatre écrans côte à côte.

## Défauts trouvés dans les scripts de vérification, pas dans le produit

**`journey-builder-flow.mjs` comptait une tâche ou une puce de dépendance immédiatement après avoir
vu le dialogue se fermer.** Le formulaire redirige vers la même URL après enregistrement ; Radix
retire le dialogue du DOM dès qu'il détecte le changement, ce qui peut précéder de peu la fin du
remplacement du contenu de la page par la nouvelle liste de tâches. Un `count()` immédiat pouvait
donc lire zéro par pur hasard de timing — le défaut « La dépendance choisie est affichée sous forme
de puce » que T-18 avait déjà rencontré et documenté comme intermittent, sans le corriger (hors
périmètre à l'époque). Corrigé ici en attendant l'apparition réelle de l'élément avant de le compter,
au même endroit et à l'endroit voisin qui portait le même défaut non encore observé (l'apparition de
la première tâche).

**`equipment-a11y.mjs` cherchait la région vive avec `document.querySelector('[aria-live="polite"]')`,
qui ne renvoie que la première du DOM.** Une fois `DocumentUploadDialog` équipé de sa propre région
vive (ci-dessus), le portail en porte deux : celle, vide, du dépôt de document (plus haut dans la
page), et celle de l'accusé de réception de matériel (plus bas), qui, elle, porte le message attendu.
Le script lisait la première — vide — et échouait alors que le produit fonctionnait. Corrigé en
cherchant le message dans l'ensemble des régions vives de la page, pas seulement la première :
correction plus robuste de toute façon, puisque plusieurs régions vives par écran deviennent la norme
avec `LiveRegion` partagé.

**`portal-flow.mjs` lisait `process.argv[1]` et `process.argv[2]` pour ses deux fichiers.** Sous
Node, `process.argv[1]` est le chemin du script lui-même (`node script.mjs a b` donne
`argv = [node, script.mjs, a, b]`) : le premier argument utilisateur est `process.argv[2]`, le second
`process.argv[3]`. Ce décalage, déjà signalé comme dette non documentée dans T-19 (« a échoué faute
d'un vrai fichier PDF disponible »), n'avait jamais été réellement exercé faute d'argument documenté
nulle part. Corrigé (décalage des index) et documenté dans `scripts/ui-checks/README.md` ; le script
a été rejoué avec deux fichiers réels (un `.exe` refusé, un PDF minimal valide) et passe de bout en
bout, y compris le dépôt réel qui ferme désormais la fenêtre et fait disparaître la tâche de
« à fournir » — la première fois que ce chemin complet est vérifié par un script depuis T-17.

## `scripts/ui-checks/README.md` mis à jour

Le README des scripts listait quatre scripts génériques (`keyboard.mjs`, `contrast.mjs`, `forms.mjs`,
`screenshots.mjs`) mais pas les huit scripts flow/a11y ajoutés depuis T-16 — dette explicitement
signalée dans T-19 (« lui-même déjà incomplet »). Complété avec les huit scripts, ce qu'ils vérifient,
et les arguments requis par `portal-flow.mjs`.

## Vérifié sur les données réelles

Base réinitialisée (`npm run db:reset`), application construite et démarrée en production
(`npm run build && npm start`), un vrai Chrome piloté par Playwright pour chacun des huit scripts,
**chacun rejoué après un `db:reset` frais et isolé des autres** (`equipment-flow.mjs` confirme la
réception du casque d'Alice, ce que `equipment-a11y.mjs` a aussi besoin de trouver en attente — les
deux scripts ne peuvent pas partager un état sans réinitialisation entre les deux) :

- `journey-builder-flow.mjs` / `journey-builder-a11y.mjs` : 12 + 10 contrôles, tous au vert.
- `cockpit-flow.mjs` / `cockpit-a11y.mjs` : 13 + 10 contrôles, tous au vert (contraste Atelier Nord et
  Méridien Gulf, clair et sombre).
- `equipment-flow.mjs` / `equipment-a11y.mjs` : 21 + 14 contrôles, tous au vert — y compris la région
  vive de l'accusé de réception, désormais retrouvée sans ambiguïté malgré la deuxième région vive
  ajoutée par ce ticket.
- `portal-a11y.mjs` / `portal-flow.mjs` (avec deux fichiers réels) : 8 + 9 contrôles, tous au vert —
  y compris, pour la première fois, le dépôt réel de bout en bout avec fermeture de fenêtre.

Puis, sur `main` après la fusion, régression complète à froid : `npm run db:reset`,
`npm run db:verify` (61 contrôles RLS/isolation répartis sur quatre scripts, tous au vert, aucune
migration touchée par ce ticket), `npm run typecheck`, `npm run lint`, `npx vitest run` (267 tests,
inchangé — ce ticket ne touche aucune règle de domaine), `npm run build`.

## Définition de terminé

- [x] Chaque écran est utilisable sans souris, du début à la fin d'une tâche réelle — vérifié par les
      quatre scripts *-flow.mjs, qui pilotent chacun un scénario complet représentatif (cockpit :
      filtrer par site au clavier et lire la cause racine d'une tâche bloquée ; portail : déposer une
      pièce et accuser réception d'un matériel ; parcours : créer un template, ajouter une tâche
      dépendante, dupliquer ; matériel : commander groupé, attribuer, remettre, reprendre) — et par les
      quatre scripts *-a11y.mjs pour le clavier pur (premier Tab sur le lien d'évitement, piège et
      restitution de focus des fenêtres, activation au clavier seul).
- [x] Aucun contrôle sans nom accessible en français — relu écran par écran ; les deux dialogues
      corrigés portent désormais une région vive nommée en français, cohérente avec le reste du
      produit.
- [x] Aucune information portée par la couleur seule — déjà garanti par `StatusBadge` (icône + texte)
      utilisé sans exception sur les quatre écrans ; aucune régression introduite.
- [x] Les écarts restants sont écrits dans le README plutôt que tus — voir
      [README.md](../../README.md#écarts-daccessibilité-et-de-cohérence-assumés-t-20).

## Correction après livraison : contraste des bordures

Retour utilisateur : les séparations entre cartes, entre le titre et le corps d'une carte, et entre
les blocs d'une même liste (ex. les arrivées dans « Tâches bloquées ») étaient trop peu visibles.
Mesure faite : `--border` ne tenait que 1.27:1 à 1.40:1 selon le fond, et `--border-strong` 1.75:1 à
2.00:1 — très en dessous du minimum WCAG AA de 3:1 pour les limites de composants non textuels. Ce
n'était pas qu'une question de goût, c'était un vrai défaut d'accessibilité qui n'avait pas été
détecté par la passe T-20 initiale (le contraste des *bordures*, par opposition au texte, n'était pas
mesuré).

- **`--border` et `--border-strong`** assombris dans `globals.css`, clair et sombre, chacun revérifié
  ≥ 3:1 (`border`) et ≥ 4.5:1 (`border-strong`) contre les deux fonds de carte possibles.
- **Les blocs par personne/arrivée** (tâches bloquées, comptes/matériel avant une arrivée imminente,
  file de préparation matériel) portent désormais un fond légèrement teinté et une bordure gauche de
  4px dans la couleur de la société — un repère visuel de plus, pas une information supplémentaire
  encodée uniquement par la couleur (le nom reste le repère principal).
- Vérifié : mesure de contraste sur pixels réellement rendus, société Atelier Nord et Méridien Gulf,
  clair et sombre (`cockpit-a11y.mjs`, `equipment-a11y.mjs`), plus une relecture visuelle par capture
  d'écran. Aucune régression sur les huit scripts de `scripts/ui-checks/`.

## Dette laissée derrière

Reprise, sans y ajouter d'élément nouveau propre à ce ticket, dans le README plutôt que dans ce
document : le retour/l'annulation de matériel sans action à l'écran, le choix de tâche absent du
formulaire « Nouvelle demande », l'absence de glisser-déposer pour réordonner les tâches d'un
template, les erreurs Supabase par section vérifiées par lecture de code plutôt que par panne
simulée, et le moyen de contact du portail limité à un nom. Ce sont toutes des dettes déjà
documentées dans T-16 à T-19 ; ce ticket les a relues, confirmé qu'elles restent hors de son
périmètre (accessibilité et cohérence, pas fonctionnalités), et les a rassemblées à un seul endroit
plutôt que de les laisser dispersées dans quatre documents de ticket différents.
