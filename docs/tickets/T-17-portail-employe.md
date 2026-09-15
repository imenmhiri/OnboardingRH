# T-17 — Portail employé

**Couches** : app, components, application, infrastructure · **Agent** : ui-builder
**Dépend de** : T-03, T-05, T-06, T-07 · **État** : fait

## Pourquoi

C'est la seule surface que voit la personne qu'on intègre. C'est aussi celle qui donne le ton :
elle doit rassurer avant d'informer.

## Périmètre

- Accueil personnalisé aux couleurs de la société, avec le nom du manager et de l'équipe.
- Documents à lire et à fournir, avec dépôt de pièce et accusé de lecture.
- Contacts utiles, avec rôle et moyen de contact.
- Agenda de la première semaine.
- Progression du parcours, lisible sans jargon interne.

## Ce qui a été décidé en chemin

**« À lire » et « à fournir » vivent sur le même modèle de données, distingués par une seule
question : qui a déposé le fichier ?** Aucun nouveau sous-système de gestion documentaire n'a été
créé. Un document déposé par quelqu'un d'autre que l'employé (la RH, typiquement) est « à lire » ; une
tâche que l'employé possède, avec une pièce attendue et rien encore déposé **par lui**, est « à
fournir ». Cette distinction s'est révélée nécessaire en cours de route : un premier filtre qui
vérifiait seulement « une pièce jointe existe-t-elle pour cette tâche » aurait fait disparaître à tort
une tâche « à fournir » dès que la RH y aurait attaché un document de référence à lire. Corrigé avant
tout test — le filtre vérifie maintenant que c'est l'employé lui-même qui a déposé.

**Consulter un document est l'accusé de lecture.** Aucune case à cocher séparée : le cas d'usage de
T-07 qui génère le lien signé trace déjà qui l'a demandé, pour quel document, quand. Réutiliser cette
trace évite d'inventer un deuxième mécanisme pour la même preuve.

**Le lien signé ne passe jamais par `redirect()` côté serveur.** Il pointe vers le stockage, un
domaine que les routes typées de Next ne connaissent pas. Le cas d'usage renvoie l'URL au client, qui
s'y rend lui-même — le calcul et la trace restent serveur, seule la navigation finale est cliente.

**L'agenda de la première semaine est une liste, pas une intégration calendrier.** T-25 fera
l'intégration réelle ; ici, les tâches de la semaine d'arrivée suffisent à répondre à la question
que la personne se pose vraiment : qu'est-ce qui m'attend cette semaine.

## Cas limites couverts

- **Aucun document attendu** : l'écran affiche « Aucune pièce à fournir pour le moment » plutôt
  qu'une section vide sans explication — vérifié à l'écran.
- **Arrivée reportée** : aucune date n'est mise en cache ; chaque affichage relit `journeys` et
  `tasks` directement, donc un report déjà écrit en base apparaît immédiatement, sans incohérence
  possible entre deux sections de l'écran.
- **Employé sans parcours du tout** (aucune embauche encore liée à son compte) : message explicite
  déjà construit en T-05, vérifié de nouveau ici pour confirmer qu'il tient toujours.

## Définition de terminé

- [x] Aucun document personnel accessible sans lien signé à durée limitée — vérifié en lisant le
      HTML rendu : aucun chemin de stockage n'y figure, seul le nom du fichier.
- [x] Lisible et utilisable sur mobile — aucun défilement horizontal à 390 px.
- [x] Progression compréhensible par quelqu'un qui découvre l'entreprise — une barre de progression
      annoncée (`role="progressbar"`) et une liste de tâches avec leur statut en texte, pas de jargon
      de développeur (pas de « FSM », pas d'identifiant technique).
- [x] Contraste AA et navigation clavier vérifiés — mesuré sur les pixels rendus, clair et sombre (41
      éléments, aucun sous le seuil) ; ouverture du dépôt au clavier, focus qui y entre puis qui
      revient sur le déclencheur à la fermeture.

## Vérifié sur les données réelles

Neuf contrôles en pilotant un vrai navigateur sur la vraie base, avec le compte `alice@atelier-nord.demo` :
accueil personnalisé, barre de progression, agenda de la semaine, manager dans les contacts, un vrai
livret déposé par la RH visible en « à lire », dépôt réel d'un PDF qui fait disparaître la tâche de
« à fournir » après rechargement, refus d'un type de fichier non accepté, et surtout : **consulter le
livret mène à une vraie URL de lien signé**, hors de l'application, sur le port du stockage local —
la chaîne T-07 complète, exercée depuis un écran pour la première fois.

## Deux défauts trouvés en testant, dans le seed et dans mes scripts — pas dans l'écran

**Dans le jeu de démonstration** : aucune tâche du template standard n'appartient réellement à
l'employé avec une pièce attendue — toutes les tâches à document sont portées par la RH ou l'IT. La
section « à fournir » aurait donc toujours été vide dans la démo. Corrigé en ajoutant une tâche
(« signer le règlement intérieur ») possédée par Alice elle-même, dans le script de seed déjà en
place pour T-08/T-14.

**Dans mes scripts de vérification**, trois bugs distincts : un sélecteur qui remontait la mauvaise
branche du DOM (`CardHeader` et `CardBody` sont des éléments frères, pas imbriqués — un piège déjà
rencontré en préparant ce ticket, corrigé avec un vrai sélecteur de frère suivant plutôt qu'une
remontée à l'aveugle) ; une vérification lue avant que l'état d'un formulaire client n'ait fini de se
mettre à jour ; et une lecture du focus trop tôt après la fermeture d'une fenêtre, avant que Radix
n'ait fini de le restaurer. Aucun des trois ne touchait au produit.

## Dette laissée derrière

- Le moyen de contact affiché est le nom seul, pas un email ni un téléphone : `profiles` ne porte pas
  ces champs aujourd'hui. À ouvrir si un canal de contact direct devient nécessaire.
- Aucune intégration calendrier réelle (T-25) : l'agenda reste une liste de tâches de la semaine.
- La tâche « règlement intérieur » ajoutée pour la démonstration n'existe que pour Alice, pas dans le
  template standard : un futur ticket qui retouche le créateur de parcours (T-16) pourrait l'y intégrer
  proprement plutôt que de la laisser en donnée ad hoc.
