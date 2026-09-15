'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { canAccess } from '@/domain/companies/access';
import type { PlainDate } from '@/domain/scheduling/plain-date';
import { parsePlainDate } from '@/domain/scheduling/plain-date';
import { resolveWorkingCalendar, type HolidayRecord } from '@/domain/companies/working-calendar-resolution';
import type { InstantiationResult } from '@/domain/templates/journey-instantiation';
import type { OwnerRole } from '@/domain/tasks/task';
import {
  deleteTemplateTask,
  duplicateTemplate,
  loadTemplateForEditing,
  previewTemplateSchedule,
  saveTemplateTask,
} from '@/application/use-cases/manage-journey-templates';
import { supabaseTemplateRepository } from '@/infrastructure/supabase/template-repository';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server-client';
import { currentSession } from '@/lib/session';

/**
 * Garde commune a toutes les actions de cet ecran : la RH seule cree des
 * parcours. La RLS refuserait de toute facon l'ecriture, mais un refus
 * explicite ici evite un aller-retour reseau pour rien et nomme la raison.
 */
async function requireJourneyBuilderAccess() {
  const session = await currentSession();
  if (!session.ok) {
    redirect('/connexion');
  }
  if (!canAccess(session.context.membership.role, 'journey_builder')) {
    redirect('/');
  }
  return session.context;
}

export async function createTemplate(formData: FormData): Promise<void> {
  const session = await requireJourneyBuilderAccess();
  const name = String(formData.get('name') ?? '').trim();
  if (!name) {
    redirect('/parcours?erreur=nom_requis');
  }

  const repository = supabaseTemplateRepository(await createSupabaseServerClient());
  const templateId = await repository.create({
    companyId: session.membership.companyId,
    name,
    criteria: {
      jobFamily: emptyToNull(formData.get('jobFamily')),
      siteId: emptyToNull(formData.get('siteId')),
      contractType: emptyToNull(formData.get('contractType')),
    },
  });

  revalidatePath('/parcours');
  redirect(`/parcours/${templateId}`);
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

export async function saveTask(templateId: string, formData: FormData): Promise<void> {
  await requireJourneyBuilderAccess();
  const repository = supabaseTemplateRepository(await createSupabaseServerClient());

  const taskId = emptyToNull(formData.get('taskId'));
  const dependsOn = formData.getAll('dependsOn').map(String);
  const offset = Number.parseInt(String(formData.get('offsetInWorkingDays') ?? '0'), 10);
  const position = Number.parseInt(String(formData.get('position') ?? '0'), 10);

  await saveTemplateTask(
    repository,
    templateId,
    taskId,
    {
      key: String(formData.get('key') ?? '').trim(),
      title: String(formData.get('title') ?? '').trim(),
      ownerRole: String(formData.get('ownerRole') ?? 'hr_admin') as OwnerRole,
      offsetInWorkingDays: Number.isFinite(offset) ? offset : 0,
      dependsOn,
      expectedDocument: emptyToNull(formData.get('expectedDocument')),
      sharedKey: emptyToNull(formData.get('sharedKey')),
      criticality: formData.get('criticality') === 'critical' ? 'critical' : 'standard',
    },
    Number.isFinite(position) ? position : 0,
  );

  revalidatePath(`/parcours/${templateId}`);
  redirect(`/parcours/${templateId}`);
}

export async function removeTask(templateId: string, taskId: string): Promise<void> {
  await requireJourneyBuilderAccess();
  const repository = supabaseTemplateRepository(await createSupabaseServerClient());
  await deleteTemplateTask(repository, taskId);
  revalidatePath(`/parcours/${templateId}`);
  redirect(`/parcours/${templateId}`);
}

export async function duplicate(templateId: string, formData: FormData): Promise<void> {
  const session = await requireJourneyBuilderAccess();
  const repository = supabaseTemplateRepository(await createSupabaseServerClient());
  const name = String(formData.get('name') ?? '').trim();

  const newId = await duplicateTemplate(repository, templateId, name || 'Parcours dupliqué', {
    jobFamily: emptyToNull(formData.get('jobFamily')),
    siteId: emptyToNull(formData.get('siteId')),
    contractType: emptyToNull(formData.get('contractType')),
  });
  void session;

  revalidatePath('/parcours');
  redirect(`/parcours/${newId}`);
}

export interface PreviewState {
  readonly result: InstantiationResult | null;
  readonly arrivalDate: string | null;
  readonly error: string | null;
}

export async function previewSchedule(templateId: string, _previous: PreviewState, formData: FormData): Promise<PreviewState> {
  const session = await requireJourneyBuilderAccess();
  const rawDate = String(formData.get('arrivalDate') ?? '');
  let arrivalDate: PlainDate;
  try {
    arrivalDate = parsePlainDate(rawDate);
  } catch {
    return { result: null, arrivalDate: null, error: 'Choisissez une date valide.' };
  }

  const client = await createSupabaseServerClient();
  const repository = supabaseTemplateRepository(client);
  const detail = await loadTemplateForEditing(repository, templateId);
  if (!detail) {
    return { result: null, arrivalDate: rawDate, error: 'Template introuvable.' };
  }

  const { data: company } = await client.from('companies').select('weekend').eq('id', session.membership.companyId).single();
  const { data: siteRow } = detail.criteria.siteId
    ? await client.from('sites').select('id, weekend').eq('id', detail.criteria.siteId).maybeSingle()
    : { data: null };
  const { data: holidayRows } = await client
    .from('holidays')
    .select('observed_on, site_id, label')
    .eq('company_id', session.membership.companyId);

  const holidays: HolidayRecord[] = (holidayRows ?? []).map((h: { observed_on: string; site_id: string | null; label: string }) => ({
    observedOn: parsePlainDate(h.observed_on),
    siteId: h.site_id,
    label: h.label,
  }));
  const calendar = resolveWorkingCalendar(
    { id: session.membership.companyId, weekend: asWeekdayArray(company?.weekend) },
    siteRow ? { id: siteRow.id, weekend: siteRow.weekend ? asWeekdayArray(siteRow.weekend) : null } : null,
    holidays,
  );

  const result = previewTemplateSchedule(detail, arrivalDate, calendar);
  return { result, arrivalDate: rawDate, error: null };
}

function asWeekdayArray(value: unknown): readonly ('sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday')[] {
  if (Array.isArray(value)) return value;
  return String(value ?? '').replace(/^\{|\}$/g, '').split(',').filter(Boolean) as never;
}
