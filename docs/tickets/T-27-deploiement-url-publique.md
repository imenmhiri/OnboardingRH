# T-27 — Déploiement et URL publique stable

**Couches** : outillage · **Agent** : — · **Dépend de** : T-02, T-05

## Pourquoi

Livrable noté indépendamment du code, et qui se perd toujours en fin de projet. Déployer tôt évite
de découvrir les écarts entre local et production la veille de la remise.

## Périmètre

- Déploiement continu depuis `main`, aperçu par pull request.
- Variables d'environnement de production, aucune dans le dépôt.
- Projet Supabase de production, migrations appliquées.
- Comptes de démonstration accessibles depuis l'URL publique.

## Hors périmètre

- Domaine personnalisé, supervision avancée.

## Définition de terminé

- [ ] URL publique stable, atteignable sans VPN ni compte préalable pour la page d'accueil.
- [ ] `.env.example` à jour et sans aucun secret.
- [ ] Les quatre rôles peuvent être démontrés depuis l'URL publique.
