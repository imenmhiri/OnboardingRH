# T-11 — Sélection du template et instanciation du parcours

**Couches** : domain/templates · **Agent** : domain-expert · **Dépend de** : T-09, T-10
**État** : fait

## Pourquoi

C'est le point où société × métier × site devient un parcours concret — et le premier endroit où la
tentation d'une condition par société apparaît.

## Périmètre

- Sélection du template le plus spécifique parmi les lignes de la société.
- Instanciation : échéances calculées, dépendances réécrites, pièce attendue reportée.
- Refus explicite d'un template circulaire, incomplet ou ambigu.

## Ce qui a été décidé en chemin

**Deux templates également spécifiques sont un refus, jamais un choix silencieux.** Départager par
l'ordre des lignes ferait dépendre le parcours d'un employé de l'ordre de retour d'un `SELECT` —
indébogable six mois plus tard. `selectTemplate` renvoie `ambiguous_match` avec les deux identifiants
plutôt que d'en choisir un.

**Les identifiants de tâches viennent d'une fonction injectée**, jamais d'un aléa interne au module :
`instantiateJourney` accepte un `idFor` optionnel, ce qui rend le domaine déterministe et testable
sans dépendre de la façon dont l'appelant nomme ses lignes.

**Un template invalide est détecté avant la création du parcours**, pas après : clé de tâche dupliquée,
dépendance vers une clé inconnue, ou cycle — chacun est un défaut nommé dans le résultat, retourné
avant qu'aucune tâche ne soit produite.

## Cas limites couverts

- Deux templates également spécifiques : `ambiguous_match`, jamais départagé par l'ordre des lignes
  (test nommé).
- Aucun template correspondant : `no_match` (test nommé).
- Template d'une autre société : jamais sélectionné, même si les critères correspondraient sinon
  (test nommé).
- Template circulaire : refusé avant instanciation plutôt que de produire un parcours infinissable.

## Définition de terminé

- [x] Aucune condition sur l'identité d'une société — la sélection ne compare que `companyId` à
      l'égalité, jamais de branche sur un nom ou un slug.
- [x] Les identifiants de tâches viennent d'une fonction injectée, pas d'un aléa interne.
- [x] Un template invalide est refusé avant création du parcours, avec le défaut nommé.

## Vérifié sur les données réelles

Le vrai template `Parcours standard` posé par le jeu de démonstration (T-08) a été chargé depuis la
base, sélectionné pour une embauche fictive chez Atelier Nord, puis instancié pour une arrivée le 7
avril 2026 :

```
Contrat signé                      echeance=2026-03-30  role=hr_admin  piece=contrat-signe
Créer le compte IT                 echeance=2026-04-02  role=it
Commander le badge d'accès         echeance=2026-04-02  role=it
Préparer le poste de travail       echeance=2026-04-03  role=it
Accueil et remise du matériel      echeance=2026-04-07  role=manager  piece=accuse-reception
Point de fin de première semaine   echeance=2026-04-14  role=manager

La derniere tache est bloquee par : Contrat signé
```

Trois points confirmés en une seule exécution, sur la vraie base et non sur des fixtures : l'échéance
du contrat (-5 jours ouvrés) traverse correctement le lundi de Pâques férié et tombe le 30 mars — la
même date que le test unitaire de T-09 pour un décalage identique ; la pièce attendue (`contrat-signe`,
`accuse-reception`) descend bien du template jusqu'à la tâche ; et le graphe produit est immédiatement
consommable par `domain/tasks` — `explainBlocking` remonte correctement toute la chaîne jusqu'au
contrat, seule tâche sans dépendance.

## Une dette de T-10 comblée au passage

Le type `Task` ne portait pas encore `expectedDocument`, alors que la table le prévoit depuis T-06 —
c'était la dette explicitement notée en clôturant T-10. Ajouté ici, puisque c'est ce ticket qui fait
descendre la pièce attendue du template jusqu'à la tâche instanciée.

## Dette laissée derrière

- Aucun repository ne charge un template depuis la base pour le compte d'un cas d'usage : la
  vérification ci-dessus l'a fait à la main, le branchement réel viendra avec T-16 (créateur de
  parcours) ou l'automatisation W1 (T-21).
- La résolution du responsable réel à partir du rôle relatif (`ownerId` reste `null` à
  l'instanciation) est le sujet de T-12.
