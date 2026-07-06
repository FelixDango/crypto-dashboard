import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
  marketCycleSettings,
  type MarketCycleSettingsRow,
  type NewMarketCycleSettingsRow
} from '$lib/server/db/schema';

const DAY_MS = 24 * 60 * 60 * 1000;

export type CyclePhase = 'bull' | 'bear';

export type CycleSettings = {
  id: number | null;
  name: string;
  firstBullStartDate: string;
  firstBullEndDateExclusive: string;
  firstBearStartDate: string;
  firstBearEndDateExclusive: string;
  recurrenceStartDate: string;
  recurringBullDurationDays: number;
  recurringBearDurationDays: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CycleWindow = {
  phase: CyclePhase;
  phaseStart: string;
  phaseEndExclusive: string;
  visibleEndDate: string;
  durationDays: number;
};

export type CycleTransition = {
  date: string;
  phase: CyclePhase;
  label: string;
};

export type CycleProgress = CycleWindow & {
  date: string;
  daysElapsed: number;
  daysRemaining: number;
  progressPercent: number;
  nextTransition: CycleTransition;
  previousTransition: CycleTransition;
};

export const DEFAULT_CYCLE_SETTINGS: CycleSettings = {
  id: null,
  name: 'Custom crypto cycle model',
  firstBullStartDate: '2022-11-08',
  firstBullEndDateExclusive: '2025-10-06',
  firstBearStartDate: '2025-10-06',
  firstBearEndDateExclusive: '2026-10-06',
  recurrenceStartDate: '2026-10-06',
  recurringBullDurationDays: 1064,
  recurringBearDurationDays: 365,
  isActive: true,
  createdAt: '2026-07-06T00:00:00.000Z',
  updatedAt: '2026-07-06T00:00:00.000Z'
};

function rowToSettings(row: MarketCycleSettingsRow): CycleSettings {
  return {
    id: row.id,
    name: row.name,
    firstBullStartDate: row.firstBullStartDate,
    firstBullEndDateExclusive: row.firstBullEndDateExclusive,
    firstBearStartDate: row.firstBearStartDate,
    firstBearEndDateExclusive: row.firstBearEndDateExclusive,
    recurrenceStartDate: row.recurrenceStartDate,
    recurringBullDurationDays: row.recurringBullDurationDays,
    recurringBearDurationDays: row.recurringBearDurationDays,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function defaultInsert(now = new Date().toISOString()): NewMarketCycleSettingsRow {
  return {
    name: DEFAULT_CYCLE_SETTINGS.name,
    firstBullStartDate: DEFAULT_CYCLE_SETTINGS.firstBullStartDate,
    firstBullEndDateExclusive: DEFAULT_CYCLE_SETTINGS.firstBullEndDateExclusive,
    firstBearStartDate: DEFAULT_CYCLE_SETTINGS.firstBearStartDate,
    firstBearEndDateExclusive: DEFAULT_CYCLE_SETTINGS.firstBearEndDateExclusive,
    recurrenceStartDate: DEFAULT_CYCLE_SETTINGS.recurrenceStartDate,
    recurringBullDurationDays: DEFAULT_CYCLE_SETTINGS.recurringBullDurationDays,
    recurringBearDurationDays: DEFAULT_CYCLE_SETTINGS.recurringBearDurationDays,
    isActive: true,
    createdAt: now,
    updatedAt: now
  };
}

export function getActiveCycleSettings(): CycleSettings {
  const existing = db
    .select()
    .from(marketCycleSettings)
    .where(eq(marketCycleSettings.isActive, true))
    .limit(1)
    .get();

  if (existing) return rowToSettings(existing);

  db.insert(marketCycleSettings).values(defaultInsert()).run();
  const created = db
    .select()
    .from(marketCycleSettings)
    .where(eq(marketCycleSettings.isActive, true))
    .limit(1)
    .get();

  return created ? rowToSettings(created) : DEFAULT_CYCLE_SETTINGS;
}

function assertDateOnly(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Expected YYYY-MM-DD date, received ${value}.`);
  }
}

function dateOnlyFromDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toDateOnly(value: Date | string): string {
  if (value instanceof Date) return dateOnlyFromDate(value);
  const dateOnly = value.slice(0, 10);
  assertDateOnly(dateOnly);
  return dateOnly;
}

function epochDay(value: Date | string): number {
  const dateOnly = toDateOnly(value);
  const [year, month, day] = dateOnly.split('-').map(Number);
  return Math.trunc(Date.UTC(year, month - 1, day) / DAY_MS);
}

function fromEpochDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  return fromEpochDay(epochDay(value) + days);
}

function daysBetween(start: string, end: string): number {
  return epochDay(end) - epochDay(start);
}

function windowFor(phase: CyclePhase, start: string, endExclusive: string): CycleWindow {
  return {
    phase,
    phaseStart: start,
    phaseEndExclusive: endExclusive,
    visibleEndDate: addDays(endExclusive, -1),
    durationDays: daysBetween(start, endExclusive)
  };
}

function overlaps(window: CycleWindow, start: string, endExclusive: string): boolean {
  return window.phaseStart < endExclusive && window.phaseEndExclusive > start;
}

function fixedWindows(settings: CycleSettings): CycleWindow[] {
  return [
    windowFor('bull', settings.firstBullStartDate, settings.firstBullEndDateExclusive),
    windowFor('bear', settings.firstBearStartDate, settings.firstBearEndDateExclusive)
  ];
}

function recurringWindowAt(settings: CycleSettings, cycleIndex: number): CycleWindow[] {
  const cycleDuration = settings.recurringBullDurationDays + settings.recurringBearDurationDays;
  const bullStart = addDays(settings.recurrenceStartDate, cycleIndex * cycleDuration);
  const bullEnd = addDays(bullStart, settings.recurringBullDurationDays);
  const bearEnd = addDays(bullEnd, settings.recurringBearDurationDays);

  return [windowFor('bull', bullStart, bullEnd), windowFor('bear', bullEnd, bearEnd)];
}

export function generateCycleWindows(startDate: Date, endDate: Date): CycleWindow[] {
  const settings = getActiveCycleSettings();
  const start = toDateOnly(startDate);
  const endExclusive = toDateOnly(endDate);
  if (endExclusive <= start) return [];

  const windows = fixedWindows(settings).filter((window) => overlaps(window, start, endExclusive));

  if (endExclusive <= settings.recurrenceStartDate) {
    return windows;
  }

  const cycleDuration = settings.recurringBullDurationDays + settings.recurringBearDurationDays;
  const recurrenceStartDay = epochDay(settings.recurrenceStartDate);
  const generationStartDay = Math.max(epochDay(start), recurrenceStartDay);
  const firstCycleIndex = Math.max(
    0,
    Math.floor((generationStartDay - recurrenceStartDay) / cycleDuration) - 1
  );

  for (let cycleIndex = firstCycleIndex; ; cycleIndex += 1) {
    const recurring = recurringWindowAt(settings, cycleIndex);
    if (recurring[0].phaseStart >= endExclusive) break;
    windows.push(...recurring.filter((window) => overlaps(window, start, endExclusive)));
  }

  return windows.sort((a, b) => a.phaseStart.localeCompare(b.phaseStart));
}

function windowContaining(date: Date | string): CycleWindow | null {
  const dateOnly = toDateOnly(date);
  const searchEnd = addDays(dateOnly, 1);
  return (
    generateCycleWindows(
      new Date(`${dateOnly}T00:00:00.000Z`),
      new Date(`${searchEnd}T00:00:00.000Z`)
    ).find((window) => window.phaseStart <= dateOnly && dateOnly < window.phaseEndExclusive) ?? null
  );
}

export function getCurrentCyclePhase(date: Date): CycleWindow | null {
  return windowContaining(date);
}

export function getNextCycleTransition(date: Date): CycleTransition | null {
  const current = getCurrentCyclePhase(date);
  if (!current) {
    const settings = getActiveCycleSettings();
    const dateOnly = toDateOnly(date);
    if (dateOnly < settings.firstBullStartDate) {
      return { date: settings.firstBullStartDate, phase: 'bull', label: 'Bull starts' };
    }
    return null;
  }

  const nextPhase: CyclePhase = current.phase === 'bull' ? 'bear' : 'bull';
  return {
    date: current.phaseEndExclusive,
    phase: nextPhase,
    label: `${nextPhase === 'bull' ? 'Bull' : 'Bear'} starts`
  };
}

export function getPreviousCycleTransition(date: Date): CycleTransition | null {
  const current = getCurrentCyclePhase(date);
  if (!current) return null;
  return {
    date: current.phaseStart,
    phase: current.phase,
    label: `${current.phase === 'bull' ? 'Bull' : 'Bear'} starts`
  };
}

export function getCycleProgress(date: Date): CycleProgress | null {
  const current = getCurrentCyclePhase(date);
  const nextTransition = getNextCycleTransition(date);
  const previousTransition = getPreviousCycleTransition(date);
  if (!current || !nextTransition || !previousTransition) return null;

  const dateOnly = toDateOnly(date);
  const daysElapsed = Math.max(0, daysBetween(current.phaseStart, dateOnly));
  const daysRemaining = Math.max(0, daysBetween(dateOnly, current.phaseEndExclusive));
  const progressPercent =
    current.durationDays > 0
      ? Math.min(100, Math.max(0, (daysElapsed / current.durationDays) * 100))
      : 0;

  return {
    ...current,
    date: dateOnly,
    daysElapsed,
    daysRemaining,
    progressPercent: Math.round(progressPercent * 100) / 100,
    nextTransition,
    previousTransition
  };
}

export function cycleWindowLabel(window: CycleWindow): string {
  return `${window.phase === 'bull' ? 'Bull' : 'Bear'}: ${window.phaseStart} -> ${window.visibleEndDate}`;
}
