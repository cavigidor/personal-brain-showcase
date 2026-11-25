import { addDays, format, parseISO } from "date-fns";
import type { CalendarEvent } from "./types.ts";

export const CATEGORIES = [
  "Workout",
  "Project Work",
  "Study",
  "Personal",
  "Meeting / Appointment",
  "Task Work Session",
] as const;
export type CalendarOccurrence = CalendarEvent & {
  occurrenceDate: string;
  instanceId: string;
  recurring: boolean;
};
export const minutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const timeFromMinutes = (value: number) =>
  String(Math.floor(value / 60)).padStart(2, "0") +
  ":" +
  String(value % 60).padStart(2, "0");
export function occursOn(event: CalendarEvent, date: string): boolean {
  if (date < event.date || event.excludedDates?.includes(date)) return false;
  if (!event.recurrence) return event.date === date;
  const start = parseISO(event.date),
    current = parseISO(date);
  const days = Math.round((current.getTime() - start.getTime()) / 86400000);
  if (event.recurrence.type === "daily") return true;
  if (event.recurrence.type === "weekly") return days % 7 === 0;
  return event.recurrence.weekdays.includes(current.getDay());
}
export function occurrencesOn(
  events: CalendarEvent[],
  date: string,
): CalendarOccurrence[] {
  return events
    .filter((event) => occursOn(event, date))
    .map((event) => ({
      ...event,
      occurrenceDate: date,
      instanceId: event.id + "@" + date,
      recurring: !!event.recurrence,
    }))
    .sort(
      (a, b) =>
        a.startTime.localeCompare(b.startTime) ||
        a.endTime.localeCompare(b.endTime),
    );
}
export function occurrencesBetween(
  events: CalendarEvent[],
  start: string,
  end: string,
): CalendarOccurrence[] {
  const result: CalendarOccurrence[] = [];
  for (
    let date = parseISO(start);
    date <= parseISO(end);
    date = addDays(date, 1)
  )
    result.push(...occurrencesOn(events, format(date, "yyyy-MM-dd")));
  return result;
}
export function freeSlots(
  events: CalendarEvent[],
  date: string,
  duration: number,
  maxResults = 4,
): { start: string; end: string }[] {
  const busy = occurrencesOn(events, date)
    .filter((event) => event.checkIn !== "skipped")
    .map((event) => [minutes(event.startTime), minutes(event.endTime)]);
  const slots: { start: string; end: string }[] = [];
  const now = new Date();
  const earliest =
    date === format(now, "yyyy-MM-dd")
      ? Math.max(
          8 * 60,
          Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) * 30,
        )
      : 8 * 60;
  for (let start = earliest; start + duration <= 20 * 60; start += 30) {
    if (busy.every(([from, to]) => start + duration <= from || start >= to))
      slots.push({
        start: timeFromMinutes(start),
        end: timeFromMinutes(start + duration),
      });
    if (slots.length === maxResults) break;
  }
  return slots;
}
/** Assign columns within each overlapping cluster; interval end is exclusive. */
export function layoutOccurrences(items: CalendarOccurrence[]) {
  const sorted = [...items].sort(
    (a, b) =>
      minutes(a.startTime) - minutes(b.startTime) ||
      minutes(a.endTime) - minutes(b.endTime),
  );
  const layouts = new Map<string, { column: number; columns: number }>();
  let cluster: CalendarOccurrence[] = [];
  let clusterEnd = 0;
  const flush = () => {
    const ends: number[] = [];
    const assigned = cluster.map((item) => {
      let column = ends.findIndex((end) => end <= minutes(item.startTime));
      if (column < 0) {
        column = ends.length;
        ends.push(0);
      }
      ends[column] = minutes(item.endTime);
      return { item, column };
    });
    assigned.forEach(({ item, column }) =>
      layouts.set(item.instanceId, { column, columns: ends.length }),
    );
    cluster = [];
  };
  for (const item of sorted) {
    if (cluster.length && minutes(item.startTime) >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, minutes(item.endTime));
  }
  if (cluster.length) flush();
  return layouts;
}
