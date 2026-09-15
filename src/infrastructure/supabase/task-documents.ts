import type {
  NewTaskDocument,
  TaskDocumentRecord,
  TaskDocumentRepository,
} from '@/application/ports/task-document-repository';
import { createSupabaseServerClient } from './server-client';

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

interface TaskDocumentRow {
  readonly id: string;
  readonly company_id: string;
  readonly task_id: string;
  readonly storage_path: string;
  readonly file_name: string;
  readonly content_type: string | null;
  readonly size_bytes: number | null;
  readonly uploaded_by: string | null;
}

function toRecord(row: TaskDocumentRow): TaskDocumentRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    taskId: row.task_id,
    storagePath: row.storage_path,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    uploadedBy: row.uploaded_by,
  };
}

export function supabaseTaskDocumentRepository(client: SupabaseClient): TaskDocumentRepository {
  return {
    async insert(document: NewTaskDocument): Promise<TaskDocumentRecord> {
      const { data, error } = await client
        .from('task_documents')
        .insert({
          company_id: document.companyId,
          task_id: document.taskId,
          storage_path: document.storagePath,
          file_name: document.fileName,
          content_type: document.contentType,
          size_bytes: document.sizeBytes,
          uploaded_by: document.uploadedBy,
        })
        .select('id, company_id, task_id, storage_path, file_name, content_type, size_bytes, uploaded_by')
        .single();

      if (error || !data) {
        throw new Error(`Enregistrement du document impossible : ${error?.message ?? 'inconnu'}`);
      }
      return toRecord(data as TaskDocumentRow);
    },

    async findById(id: string): Promise<TaskDocumentRecord | null> {
      const { data, error } = await client
        .from('task_documents')
        .select('id, company_id, task_id, storage_path, file_name, content_type, size_bytes, uploaded_by')
        .eq('id', id)
        .maybeSingle();

      if (error || !data) {
        return null;
      }
      return toRecord(data as TaskDocumentRow);
    },

    async delete(id: string): Promise<void> {
      const { error } = await client.from('task_documents').delete().eq('id', id);
      if (error) {
        throw new Error(`Suppression du document impossible : ${error.message}`);
      }
    },

    async listByJourney(journeyId: string): Promise<readonly TaskDocumentRecord[]> {
      const { data, error } = await client
        .from('task_documents')
        .select('id, company_id, task_id, storage_path, file_name, content_type, size_bytes, uploaded_by, tasks!inner(journey_id)')
        .eq('tasks.journey_id', journeyId);

      if (error || !data) {
        return [];
      }
      return (data as TaskDocumentRow[]).map(toRecord);
    },
  };
}
