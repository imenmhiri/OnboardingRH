# Vérifications d'interface

Des scripts qui pilotent un vrai navigateur pour contrôler ce qu'une relecture de code ne peut pas
voir. Ils ont trouvé trois défauts de contraste réels lors de T-03, un défaut de fenêtre modale
partagée lors de T-16, un défaut de bouton partagé lors de T-18, et une région vive mal montée lors
de T-19.

| Script | Ce qu'il vérifie |
| --- | --- |
| `keyboard.mjs` | lien d'évitement, noms accessibles, contour de focus, piège de focus des fenêtres, onglets aux flèches, absence de défilement horizontal à 390 px |
| `contrast.mjs` | contraste **mesuré sur les pixels rendus** de chaque élément textuel, en thème clair et sombre |
| `forms.mjs` | erreur liée à son champ et annoncée, focus rendu au déclencheur, hiérarchie des titres |
| `screenshots.mjs` | captures pleine page en clair, sombre et mobile |
| `journey-builder-flow.mjs` | créateur de parcours (T-16) : création, cas limites, aperçu réel des échéances, duplication, garde de rôle |
| `journey-builder-a11y.mjs` | créateur de parcours (T-16) : contraste sur deux palettes, piège et restitution de focus des fenêtres |
| `portal-flow.mjs` | portail employé (T-17) : accueil, progression, agenda, dépôt réel d'une pièce, type refusé, lien signé — **prend deux chemins de fichiers en argument**, voir plus bas |
| `portal-a11y.mjs` | portail employé (T-17) : contraste, clavier bout en bout du dépôt |
| `cockpit-flow.mjs` | cockpit RH (T-18) : arrivées, blocages avec cause racine, matériel/comptes IT avant une arrivée imminente, signaux faibles, garde de rôle |
| `cockpit-a11y.mjs` | cockpit RH (T-18) : contraste sur les deux palettes de démonstration, filtres au clavier, état vide |
| `equipment-flow.mjs` | gestion du matériel (T-19) : commande groupée, attribution, remise, reprise, accusé de réception, garde de rôle |
| `equipment-a11y.mjs` | gestion du matériel (T-19) : contraste sur `/materiel` et sur « Mon matériel » du portail, région vive de l'accusé de réception |

## Utilisation

```bash
npm run build && npm start        # dans un terminal
node scripts/ui-checks/contrast.mjs
```

`portal-flow.mjs` a besoin de deux fichiers réels, dans cet ordre : un type non accepté (test du
refus), puis un PDF valide (test du dépôt réel qui fait disparaître la tâche de « à fournir »).

```bash
node scripts/ui-checks/portal-flow.mjs chemin/vers/fichier.exe chemin/vers/fichier.pdf
```

Les autres scripts n'ont besoin d'aucun argument : ils s'appuient uniquement sur le jeu de démo
issu de `npm run db:reset`.

Prérequis : Playwright et Google Chrome installé sur la machine.

```bash
npm install --no-save playwright
```

Les scripts utilisent `channel: 'chrome'` plutôt que le Chromium de Playwright : son CDN est
inaccessible depuis le réseau de développement actuel.

Non branchés sur la CI à ce stade — ils demandent un navigateur, une base réinitialisée et
l'application démarrée en production (`npm run build && npm start`). À chaque script correspond un
écran déjà couvert ; relancer l'ensemble après un changement transverse (composant partagé,
`components/ui/*`) est le seul moyen fiable de savoir s'il a une conséquence sur un autre écran —
c'est ce que fait la passe T-20.
