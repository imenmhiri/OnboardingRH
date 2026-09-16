/**
 * Persiste les syntheses IA deja generees (T-26), pour que le cockpit lise
 * toujours un cache instantane et ne bloque jamais sur un appel IA en
 * direct (voir la DoD : "Service indisponible : le cockpit reste utilisable
 * sans la synthese").
 */

export interface SatisfactionSummaryRecord {
  readonly companyId: string;
  /** Identifiant de site, ou `'company'` pour une synthese a l'echelle de la societe entiere. */
  readonly groupKey: string;
  readonly summaryText: string;
  readonly generatedAt: string;
  readonly basedOnRespondentCount: number;
}

export interface SatisfactionSummaryRepository {
  /** Une ligne par (societe, groupe) : ecrit ou remplace la derniere synthese connue. */
  upsert(record: SatisfactionSummaryRecord): Promise<void>;
  listByCompany(companyId: string): Promise<readonly SatisfactionSummaryRecord[]>;
}
