# T-17 — Portail employé

**Couches** : app, components · **Agent** : ui-builder · **Dépend de** : T-03, T-05, T-06, T-07

## Pourquoi

C'est la seule surface que voit la personne qu'on intègre. C'est aussi celle qui donne le ton :
elle doit rassurer avant d'informer.

## Périmètre

- Accueil personnalisé aux couleurs de la société, avec le nom du manager et de l'équipe.
- Documents à lire et à fournir, avec dépôt de pièce et accusé de lecture.
- Contacts utiles, avec rôle et moyen de contact.
- Agenda de la première semaine.
- Progression du parcours, lisible sans jargon interne.

## Hors périmètre

- Messagerie, notifications poussées.

## Cas limites à couvrir

- **Employé sans email personnel** : accès par lien signé remis par la RH, sans compte préalable.
- Arrivée reportée : le portail affiche les nouvelles dates sans incohérence.
- Aucun document attendu : l'écran reste utile au lieu d'afficher une section vide.

## Définition de terminé

- [ ] Aucun document personnel accessible sans lien signé à durée limitée.
- [ ] Lisible et utilisable sur mobile.
- [ ] Progression compréhensible par quelqu'un qui découvre l'entreprise.
- [ ] Contraste AA et navigation clavier vérifiés.
