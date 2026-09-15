# Vérifications d'interface

Quatre scripts qui pilotent un vrai navigateur pour contrôler ce qu'une relecture de code ne peut
pas voir. Ils ont trouvé trois défauts de contraste réels lors de T-03.

| Script | Ce qu'il vérifie |
| --- | --- |
| `keyboard.mjs` | lien d'évitement, noms accessibles, contour de focus, piège de focus des fenêtres, onglets aux flèches, absence de défilement horizontal à 390 px |
| `contrast.mjs` | contraste **mesuré sur les pixels rendus** de chaque élément textuel, en thème clair et sombre |
| `forms.mjs` | erreur liée à son champ et annoncée, focus rendu au déclencheur, hiérarchie des titres |
| `screenshots.mjs` | captures pleine page en clair, sombre et mobile |

## Utilisation

```bash
npm run build && npm start        # dans un terminal
node scripts/ui-checks/contrast.mjs
```

Prérequis : Playwright et Google Chrome installé sur la machine.

```bash
npm install --no-save playwright
```

Les scripts utilisent `channel: 'chrome'` plutôt que le Chromium de Playwright : son CDN est
inaccessible depuis le réseau de développement actuel.

Non branchés sur la CI à ce stade — ils demandent un navigateur et l'application démarrée. C'est le
sujet de T-20.
