# T-08 — Jeu de données de démonstration

**Couches** : supabase/seed · **Agent** : db-architect · **Dépend de** : T-04, T-06 · **État** : fait

## Pourquoi

C'est le jeu qui sera à l'écran le jour de la démonstration, et la preuve que le multi-sociétés
tient par la donnée. Il est aussi un livrable listé.

## Périmètre

- Deux sociétés volontairement dissemblables : palette, semaine de travail, sites, fériés (déjà en
  place depuis T-04).
- Comptes de démonstration pour les quatre rôles, plus un compte membre des deux sociétés.
- Un template de parcours avec sa chaîne de dépendances.
- Quatre parcours à des stades différents : à venir, en cours, bloqué, terminé.
- Une tâche mutualisée entre deux arrivées, une tâche en retard (compte IT jamais créé), les tâches
  qui en dépendent bloquées à la chaîne.

## Ce qui a été décidé en chemin

**Les dates sont relatives à `current_date`, pas figées.** Un parcours « à venir » écrit avec une
date en dur serait dans le passé le jour de la démonstration réelle, des mois après l'écriture de ce
seed. Chaque date est un décalage (`current_date + 10`, `current_date - 45`), ce qui garde le jeu
pertinent quelle que soit la date à laquelle `supabase db reset` est rejoué.

**Le mot de passe est haché avec `pgcrypto` (bcrypt), pas inventé.** GoTrue vérifie un hash bcrypt
standard ; `extensions.crypt(password, extensions.gen_salt('bf'))` produit exactement ce format, donc
les comptes de démonstration se connectent pour de vrai, pas seulement en apparence dans la table.

**Un compte membre des deux sociétés, avec un rôle différent dans chacune.** C'est le seul moyen de
démontrer que la bascule de société change à la fois le rôle et la marque, sans dépendre de deux
connexions distinctes pendant une démonstration en direct.

## Cas limites couverts

- Tâche commune à plusieurs arrivées : la commande de badge sert l'arrivée à venir et l'arrivée
  bloquée — vérifié par requête, deux lignes partagent la même clé.
- Compte IT non créé : tâche en retard, avec deux tâches qui en dépendent également en retard —
  vérifié par requête, la chaîne remonte correctement.

## Définition de terminé

- [x] `supabase db reset` rejoue migrations et seed sans erreur — vérifié à partir d'une base
      recréée de zéro.
- [ ] Chaque écran a quelque chose d'intéressant à montrer, y compris ses états d'erreur —
      **partiellement vérifiable**. Les données sont prêtes et vérifiées par requête directe :
      quatre parcours aux bons stades, la tâche mutualisée, la chaîne de blocage. Mais le cockpit et
      le portail sont encore des coquilles qui n'interrogent pas `journeys`/`tasks` (T-17, T-18 non
      faits) : aucun écran ne montre ces données aujourd'hui. La case se coche à T-17/T-18.
- [x] Aucune donnée personnelle réelle — noms et emails fictifs, domaine `.demo`.

## Vérifié

- Connexion réelle testée avec `rh@atelier-nord.demo` et le mot de passe du jeu : réussie, via
  l'API Supabase Auth.
- `npm run db:verify` (isolation, parcours, stockage) repasse sans régression avec le jeu de
  démonstration présent — une assertion du test d'isolation comptait un nombre exact de lignes et
  s'est cassée en ajoutant ces données ; corrigée pour vérifier l'appartenance de chaque ligne
  plutôt que leur nombre, comme la même classe de défaut déjà rencontrée à T-05.
- Comptes de démonstration et leur mot de passe documentés dans le README.

## Dette laissée derrière

- Aucun document réel déposé dans le bucket de stockage pour ces tâches : la génération d'un lien
  signé de démonstration attend un écran de dépôt (T-16/T-19).
- Le jeu ne couvre que Atelier Nord pour les parcours ; Méridien Gulf n'a que ses sociétés, sites et
  fériés (T-04), pas encore de parcours. À étoffer si la démonstration en a besoin.
