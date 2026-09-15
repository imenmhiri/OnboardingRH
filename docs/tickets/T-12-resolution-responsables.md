# T-12 — Résolution des responsables et responsable de repli

**Couches** : domain/tasks, application · **Agent** : domain-expert · **Dépend de** : T-10, T-11

## Pourquoi

Un template désigne un rôle relatif : le manager de l'employé. Si personne ne répond à ce rôle, la
tâche reste orpheline et le parcours s'arrête sans que personne ne le sache.

## Périmètre

- Résolution d'un responsable relatif vers une personne, à partir des rattachements.
- Chaîne de repli configurée en base : manager, puis manager du manager, puis RH.
- Marquage explicite des tâches non attribuables, remontées au cockpit.

## Hors périmètre

- Notification du responsable (T-24), écran (T-18).

## Cas limites à couvrir

- **Manager absent** : la chaîne de repli s'applique et le remplacement est tracé.
- Manager en congé à la date d'échéance, et non au moment de la création.
- Rôle IT porté par une équipe plutôt que par une personne.

## Définition de terminé

- [ ] La chaîne de repli est une donnée, pas une constante du code.
- [ ] Toute substitution est tracée : qui remplace qui, et pourquoi.
- [ ] Le cas limite manager absent est un test nommé.
