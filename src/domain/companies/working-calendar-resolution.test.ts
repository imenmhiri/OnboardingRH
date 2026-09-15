import { describe, expect, it } from 'vitest';
import { parsePlainDate, type PlainDate } from '../scheduling/plain-date';
import { addWorkingDays, isWorkingDay } from '../scheduling/working-calendar';
import {
  type CompanyCalendarConfig,
  explainNonWorkingDay,
  type HolidayRecord,
  resolveWorkingCalendar,
  type SiteCalendarConfig,
} from './working-calendar-resolution';

const d = (iso: string): PlainDate => parsePlainDate(iso);

const atelierNord: CompanyCalendarConfig = { id: 'company-nord', weekend: ['saturday', 'sunday'] };
const meridienGulf: CompanyCalendarConfig = { id: 'company-gulf', weekend: ['friday', 'saturday'] };

const lille: SiteCalendarConfig = { id: 'site-lille', weekend: null };
const strasbourg: SiteCalendarConfig = { id: 'site-strasbourg', weekend: null };

const holidays: readonly HolidayRecord[] = [
  { observedOn: d('2026-04-06'), siteId: null, label: 'Lundi de Pâques' },
  { observedOn: d('2026-05-01'), siteId: null, label: 'Fête du Travail' },
  { observedOn: d('2026-04-03'), siteId: 'site-strasbourg', label: 'Vendredi saint (Alsace-Moselle)' },
];

describe('resolveWorkingCalendar', () => {
  it('applique les feries societe a tous les sites', () => {
    const calendar = resolveWorkingCalendar(atelierNord, lille, holidays);
    expect(isWorkingDay(d('2026-04-06'), calendar)).toBe(false);
    expect(isWorkingDay(d('2026-05-01'), calendar)).toBe(false);
  });

  it('n applique un ferie de site qu a ce site', () => {
    const aLille = resolveWorkingCalendar(atelierNord, lille, holidays);
    const aStrasbourg = resolveWorkingCalendar(atelierNord, strasbourg, holidays);

    expect(isWorkingDay(d('2026-04-03'), aLille)).toBe(true);
    expect(isWorkingDay(d('2026-04-03'), aStrasbourg)).toBe(false);
  });

  it('decale l echeance d une meme tache selon le site, sans code specifique', () => {
    const aLille = resolveWorkingCalendar(atelierNord, lille, holidays);
    const aStrasbourg = resolveWorkingCalendar(atelierNord, strasbourg, holidays);
    const arrivee = d('2026-04-02');

    expect(addWorkingDays(arrivee, 2, aLille)).toBe('2026-04-07');
    expect(addWorkingDays(arrivee, 2, aStrasbourg)).toBe('2026-04-08');
  });

  it('prend la semaine de travail de la societe quand le site ne la surcharge pas', () => {
    const calendar = resolveWorkingCalendar(meridienGulf, { id: 'site-dubai', weekend: null }, []);
    expect(isWorkingDay(d('2026-03-06'), calendar)).toBe(false);
    expect(isWorkingDay(d('2026-03-08'), calendar)).toBe(true);
  });

  it('laisse un site surcharger la semaine de travail de sa societe', () => {
    const calendar = resolveWorkingCalendar(meridienGulf, { id: 'site-paris', weekend: ['saturday', 'sunday'] }, []);
    expect(isWorkingDay(d('2026-03-06'), calendar)).toBe(true);
    expect(isWorkingDay(d('2026-03-08'), calendar)).toBe(false);
  });

  it('ignore les feries des autres sites quand aucun site n est precise', () => {
    const calendar = resolveWorkingCalendar(atelierNord, null, holidays);
    expect(isWorkingDay(d('2026-04-03'), calendar)).toBe(true);
    expect(isWorkingDay(d('2026-04-06'), calendar)).toBe(false);
  });
});

describe('explainNonWorkingDay', () => {
  it('nomme le ferie pour que l interface explique le report', () => {
    expect(explainNonWorkingDay(d('2026-04-06'), holidays)).toBe('Lundi de Pâques');
    expect(explainNonWorkingDay(d('2026-04-07'), holidays)).toBeNull();
  });
});
