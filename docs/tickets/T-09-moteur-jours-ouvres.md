# T-09 — Moteur de jours ouvrés et d'échéances

**Couches** : domain/scheduling, domain/companies, application/ports, infrastructure
**Agent** : domain-expert · **Dépend de** : T-01 · **État** : fait

## Pourquoi

Toutes les échéances du produit en dépendent. Une erreur ici se voit partout, et une échéance
calculée avec l'horloge système n'est pas testable.

## Périmètre

- `PlainDate` : date civile sans fuseau, arithmétique sur les jours epoch.
- `WorkingCalendar` : week-end configurable et jours fériés, résolus par société **et** par site.
- Ajout et retrait de jours ouvrés, comptage entre deux dates, retard en jours ouvrés.
- Échéances d'un parcours à partir d'offsets relatifs à l'arrivée, et recalcul sur report.
- Port `Clock` et son implémentation système, seule autorisée à lire l'heure.

## Ce qui a été décidé en chemin

**Une échéance est un jour civil, pas un instant.** Représentée en horodatage, la même échéance
tomberait un jour différent selon le fuseau du lecteur. L'arithmétique se fait donc sur des numéros
de jours, sans jamais toucher à `Date`.

**Un report d'arrivée recalcule, il ne translate pas.** Le décalage en jours *ouvrés* est constant
par construction, mais le décalage *calendaire* varie : une tâche déjà au-delà d'un pont férié ne
glisse pas du même nombre de jours que l'arrivée. Un test le prouve — arrivée reportée de 4 jours
calendaires, échéance décalée d'un seul.

**« Aujourd'hui » dépend du fuseau de la société.** Une arrivée à Dubaï a changé de date quand il est
encore la veille à Lille : le port `Clock` prend donc un fuseau, qui est une donnée.

## Cas limites couverts

- **Date d'arrivée reportée** : recalcul de l'ensemble des échéances (test nommé).
- Échéance antérieure à l'arrivée : compte IT à J-2, y compris à travers un pont férié.
- Pont férié traversé, changement d'année, année bissextile, 29 février non existant.
- Société dont le week-end est vendredi/samedi, et site qui surcharge celui de sa société.
- Férié rattaché à un seul site : la même tâche échoit un jour plus tard à Strasbourg qu'à Lille.

## Définition de terminé

- [x] Aucun `new Date()` ni `Date.now()` dans `src/domain/` ou `src/application/` — garanti par
      ESLint, et vérifié par recherche.
- [x] Chaque cas limite ci-dessus est un test nommé.
- [x] Le module se teste sans aucun mock : fonctions pures, dates passées en paramètre.
- [x] `npm run test:run` : 85 tests. `--passWithNoTests` retiré, comme prévu à T-02.

## Dette laissée derrière

- La lecture des jours fériés en base n'est pas branchée : le résolveur prend des lignes déjà
  chargées. Le repository viendra avec le premier écran qui en a besoin.
- `countWorkingDaysBetween` parcourt les jours un à un : suffisant pour un parcours d'intégration,
  à revoir si un agrégat devait porter sur plusieurs années.
