# T-16 — Créateur de parcours

**Couches** : app, components, application, infrastructure · **Agent** : ui-builder
**Dépend de** : T-03, T-06, T-11 · **État** : fait

## Pourquoi

Première surface produit : c'est là que la RH décrit un parcours sans passer par un développeur.

## Périmètre

- Liste des templates de la société, avec leurs critères de sélection.
- Édition d'une tâche de template : titre, responsable relatif, délai en jours ouvrés,
  dépendances, pièce attendue.
- Visualisation de l'enchaînement des dépendances et détection visuelle d'un cycle.
- Aperçu : pour une date d'arrivée donnée, les échéances réelles que le template produirait.
- Duplication d'un template vers un autre métier ou un autre site.

## Ce qui a été décidé en chemin

**L'aperçu rejoue `instantiateJourney` (T-11), il ne réimplémente rien.** Même fonction, même
calendrier de société résolu depuis la base : une échéance affichée dans cet écran est exactement
celle qu'une vraie embauche produirait, pas une approximation. La détection de cycle vient du même
appel — aucune logique de validation écrite à part.

**L'enchaînement des dépendances est une liste de puces textuelles, pas un graphe dessiné.** Un
graphe en canevas se navigue mal au clavier et ne se décrit pas à un lecteur d'écran ; une liste
« Dépend de : Contrat signé » l'un et l'autre. Écart assumé au texte littéral du ticket
(« visualisation de l'enchaînement »), au profit de l'accessibilité que le projet exige par ailleurs.

**Le responsable est un rôle, jamais une personne dans ce formulaire.** La résolution vers une
personne réelle est le travail de T-12 ; mélanger les deux ferait dépendre un template d'un
organigramme qui change indépendamment de lui.

## Cas limites couverts

- **Template sans aucune tâche** : état vide explicite avec une action pour ajouter la première
  tâche, vérifié à l'écran.
- **Dépendance supprimée alors qu'une autre tâche s'y réfère** : la base retirerait la ligne de
  dépendance en silence ; l'écran avertit et nomme les tâches concernées avant toute confirmation,
  vérifié à l'écran.
- **Délai négatif** : accepté et affiché explicitement (« N jours ouvrés avant l'arrivée »), vérifié
  par un aperçu qui place réellement la tâche avant la date d'arrivée simulée.

## Définition de terminé

- [x] États vide, chargement et erreur dessinés — liste et détail.
- [x] Formulaires navigables au clavier, chaque contrôle porte un label explicite — vérifié en
      pilotant un vrai navigateur sans souris : ouverture de la fenêtre au clavier, focus qui y entre,
      Échap qui l'annule, focus qui revient sur le déclencheur.
- [x] Les erreurs de validation sont annoncées aux lecteurs d'écran — `role="alert"` sur l'avertissement
      de suppression et sur le message d'aperçu invalide, pas seulement une couleur.
- [x] Contraste AA vérifié sur deux palettes de sociétés — mesuré sur les pixels rendus, clair et
      sombre, liste et détail : 4 mesures, aucun texte sous le seuil.

## Un défaut trouvé en testant, dans le composant de fenêtre modale partagé

Le formulaire d'ajout de tâche, avec tous ses champs, dépasse la hauteur de l'écran. `DialogContent`
n'avait pas de défilement interne : le bouton de validation sortait de la zone visible et devenait
inatteignable, y compris au clavier. Ce n'est pas un défaut propre à cet écran — c'est le composant
`components/ui/dialog.tsx` utilisé depuis T-03, T-05 et maintenant T-16 — donc toute fenêtre modale du
projet en aurait hérité dès qu'un formulaire dépasserait une certaine longueur. Corrigé une fois pour
toutes : la fenêtre plafonne à 85 % de la hauteur visible, l'en-tête et le pied restent fixes, le
corps défile.

## Vérifié

- `npm run db:verify` : 61 contrôles, sans régression (les policies RLS de T-06 suffisaient déjà —
  aucune nouvelle table).
- Parcours complet piloté par navigateur, sur base réelle : création, template sans tâche, ajout
  d'une tâche à délai négatif, ajout d'une tâche dépendante, aperçu traversant le lundi de Pâques
  (échéance calculée au 30 mars, cohérent avec T-09), avertissement de suppression nommant la tâche
  dépendante, duplication avec ses tâches recopiées. 12 contrôles.
- Un rôle non-RH (`it@atelier-nord.demo`) est renvoyé hors de l'écran.
- Trois bugs trouvés dans mes propres scripts de vérification pendant cette passe — pas dans le
  produit — tous dus au même piège : `waitForLoadState('networkidle')` après un clic peut se résoudre
  avant qu'une navigation n'ait eu lieu, surtout quand l'URL de départ correspond déjà au motif
  attendu. Corrigés en attendant un changement d'URL explicite ou un contenu précis, jamais une
  simple absence d'activité réseau.

## Dette laissée derrière

- Aucune réorganisation par glisser-déposer des tâches : l'ordre suit celui de création. À ouvrir si
  la démonstration en a besoin.
- Le champ « métier » et « type de contrat » des critères restent du texte libre, sans liste fermée
  — cohérent avec le schéma (colonnes `text`), mais rien n'empêche une faute de frappe de rendre un
  template inatteignable par une vraie embauche.
