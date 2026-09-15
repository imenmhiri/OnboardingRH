export interface TaskDocumentRecord {
  readonly id: string;
  readonly companyId: string;
  readonly taskId: string;
  readonly storagePath: string;
  readonly fileName: string;
  readonly contentType: string | null;
  readonly sizeBytes: number | null;
  readonly uploadedBy: string | null;
}

export interface NewTaskDocument {
  readonly companyId: string;
  readonly taskId: string;
  readonly storagePath: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly uploadedBy: string;
}

export interface TaskDocumentRepository {
  insert(document: NewTaskDocument): Promise<TaskDocumentRecord>;
  findById(id: string): Promise<TaskDocumentRecord | null>;
  delete(id: string): Promise<void>;
}
