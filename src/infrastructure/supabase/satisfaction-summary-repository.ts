import type { SatisfactionSummaryRecord, SatisfactionSummaryRepository } from '@/application/ports/satisfaction-summary-repository';
import { createSupabaseServiceClient } from './service-client';

type SupabaseClient = ReturnType<typeof createSupabaseServiceClient>;

interface SummaryRow {
  company_id: string;
  group_key: string;
  summary_text: string;
  generated_at: string;
  based_on_respondent_count: number;
}

function toRecord(row: SummaryRow): SatisfactionSummaryRecord {
  return {
    companyId: row.company_id,
    groupKey: row.group_key,
    summaryText: row.summary_text,
    generatedAt: row.generated_at,
    basedOnRespondentCount: row.based_on_respondent_count,
  };
}

export function supabaseSatisfactionSummaryRepository(client: SupabaseClient): SatisfactionSummaryRepository {
  return {
    async upsert(record: SatisfactionSummaryRecord): Promise<void> {
      const { error } = await client
        .from('ai_satisfaction_summaries')
        .upsert(
          {
            company_id: record.companyId,
            group_key: record.groupKey,
            summary_text: record.summaryText,
            generated_at: record.generatedAt,
            based_on_respondent_count: record.basedOnRespondentCount,
          },
          { onConflict: 'company_id,group_key' },
        );
      if (error) {
        throw new Error(`Ecriture de la synthese impossible pour ${record.companyId}/${record.groupKey} : ${error.message}`);
      }
    },

    async listByCompany(companyId: string): Promise<readonly SatisfactionSummaryRecord[]> {
      const { data, error } = await client
        .from('ai_satisfaction_summaries')
        .select('company_id, group_key, summary_text, generated_at, based_on_respondent_count')
        .eq('company_id', companyId);
      if (error || !data) {
        return [];
      }
      return (data as SummaryRow[]).map(toRecord);
    },
  };
}
