import * as Calendar from "expo-calendar";
import { getSetting, setSetting, SETTINGS } from "../db/database";
import { isoDate } from "../logic/derive";

/**
 * Device calendar overlay — read-only, on-demand.
 *
 * Reads events from calendars already synced on the device (Google, Apple,
 * Outlook, …) via expo-calendar to give context for gaps in the play
 * calendar. Nothing is stored locally except the list of linked calendar
 * IDs; events are fetched fresh whenever the calendar screen renders.
 */

export interface DeviceCalendarInfo {
  id: string;
  title: string;
  color?: string;
  source?: string;
}

export interface DayEvent {
  title: string;
  allDay: boolean;
}

/** Linked calendar IDs from settings. Empty array = overlay disabled. */
export function getLinkedCalendarIds(): string[] {
  try {
    const arr = JSON.parse(getSetting(SETTINGS.deviceCalendarIds, "[]"));
    return Array.isArray(arr)
      ? arr.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export function setLinkedCalendarIds(ids: string[]): void {
  setSetting(SETTINGS.deviceCalendarIds, JSON.stringify(ids));
}

/** Prompt for read access. Returns true when granted. */
export async function requestCalendarAccess(): Promise<boolean> {
  const res = await Calendar.requestCalendarPermissions();
  return res.granted;
}

/** All event calendars on the device (requires granted permission). */
export async function listDeviceCalendars(): Promise<DeviceCalendarInfo[]> {
  const cals = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  return cals
    .map((c) => ({
      id: c.id,
      title: c.title,
      color: c.color,
      source: c.source?.name ?? undefined,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Events from the linked calendars, grouped by ISO day (YYYY-MM-DD).
 * Multi-day events appear on every day they span. Fails soft: returns {}
 * when nothing is linked, permission was revoked, or the fetch errors.
 */
export async function eventsByDay(
  fromISO: string,
  toISO: string
): Promise<Record<string, DayEvent[]>> {
  const ids = getLinkedCalendarIds();
  if (ids.length === 0) return {};

  try {
    const perm = await Calendar.getCalendarPermissions();
    if (!perm.granted) return {};

    const start = new Date(`${fromISO}T00:00:00`);
    const end = new Date(`${toISO}T23:59:59.999`);
    const events = await Calendar.listEvents(ids, start, end);

    const byDay: Record<string, DayEvent[]> = {};
    for (const ev of events) {
      const title = (ev.title ?? "").trim();
      if (!title) continue;

      const allDay = !!ev.allDay;
      let s = new Date(ev.startDate as any);
      let e = new Date(ev.endDate as any);
      if (allDay) {
        // All-day events are anchored to UTC midnight and use an exclusive
        // end — naive local conversion shifts them by a day in most
        // timezones. Re-anchor the UTC date parts to local midnight and
        // pull the exclusive end back into the last covered day.
        s = new Date(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
        e = new Date(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate());
        if (e.getTime() > s.getTime()) e = new Date(e.getTime() - 1);
      }

      const first = s < start ? start : s;
      const lastT = e > end ? end : e;
      for (
        let d = new Date(first.getFullYear(), first.getMonth(), first.getDate());
        d <= lastT;
        d.setDate(d.getDate() + 1)
      ) {
        const key = isoDate(d);
        const list = (byDay[key] ??= []);
        if (!list.some((x) => x.title === title)) list.push({ title, allDay });
      }
    }
    // All-day events (trips, holidays) first — they're the useful context.
    for (const list of Object.values(byDay))
      list.sort((a, b) => Number(b.allDay) - Number(a.allDay));
    return byDay;
  } catch {
    return {};
  }
}
