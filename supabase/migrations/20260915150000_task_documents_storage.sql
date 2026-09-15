-- Bucket de stockage prive pour les pieces jointes de taches, et ses policies.
--
-- Un seul bucket, partitionne par le chemin (tache/document), plutot qu'un
-- bucket par societe : accueillir une filiale reste une insertion dans
-- companies, pas une creation de bucket. La confidentialite par societe passe
-- par task_visible(), qui scope deja une tache a sa societe — un segment de
-- chemin dedie a la societe serait redondant.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'task-documents',
  'task-documents',
  false,
  20971520, -- 20 Mo — doit rester aligne avec MAX_DOCUMENT_SIZE_BYTES cote domaine.
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

-- Le controle de type et de taille est fait deux fois : ici en defense en
-- profondeur, et dans src/domain/documents/document-policy.ts pour echouer
-- vite avec un message exploitable avant meme l'appel reseau.

-- Chemin attendu : {task_id}/{document_id}-{nom}. Le deuxieme segment du nom
-- d'objet est le premier ici car storage.foldername ne compte que les
-- repertoires : task_id est le seul segment de dossier, document_id fait
-- partie du nom de fichier.
create function public.storage_task_id(object_name text)
returns uuid
language sql
immutable
as $$
  select ((storage.foldername(object_name))[1])::uuid;
$$;

create policy task_documents_bucket_select
  on storage.objects for select to authenticated
  using (bucket_id = 'task-documents' and public.task_visible(public.storage_task_id(name)));

create policy task_documents_bucket_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'task-documents' and public.task_visible(public.storage_task_id(name)));

-- Suppression : le deposant ou la RH de la societe de la tache. "owner" est la
-- colonne native de storage.objects, posee automatiquement a l'upload.
create policy task_documents_bucket_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'task-documents'
    and (
      owner = auth.uid()
      or exists (
        select 1 from public.tasks t
        where t.id = public.storage_task_id(name)
          and public.has_company_role(t.company_id, array['hr_admin']::public.app_role[])
      )
    )
  );
