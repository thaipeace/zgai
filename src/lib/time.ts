import { config } from "./config";

const dayFmt = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone, year: "numeric", month: "2-digit", day: "2-digit" });

const stampFmt = () =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: config.timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/** YYYY-MM-DD theo múi giờ của app. */
export function dayKey(ts: number): string {
  return dayFmt().format(new Date(ts));
}

export function todayKey(): string {
  return dayKey(Date.now());
}

/** Ví dụ: "T5, 29/10/2026 14:05" — có thứ để AI quy đổi "thứ 6 này", "mai"... */
export function stamp(ts: number): string {
  return stampFmt().format(new Date(ts));
}

export function timeOnly(ts: number): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: config.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ts));
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const YEAR_RE = /^\d{4}$/;

export const isDay = (s: string) => DAY_RE.test(s);
export const isMonth = (s: string) => MONTH_RE.test(s);
export const isYear = (s: string) => YEAR_RE.test(s);

