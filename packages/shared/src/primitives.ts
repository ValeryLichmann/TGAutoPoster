import { z } from "zod";

/** ISO-8601 timestamp string. */
export const IsoDate = z.string().datetime({ offset: true });
export type IsoDate = z.infer<typeof IsoDate>;

/** Days of the week, 0 = Sunday … 6 = Saturday (matches JS Date.getUTCDay). */
export const Weekday = z.number().int().min(0).max(6);
export type Weekday = z.infer<typeof Weekday>;

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** A 0–1 confidence score produced by the analysis engine or AI layer. */
export const Confidence = z.number().min(0).max(1);
export type Confidence = z.infer<typeof Confidence>;

/** Telegram numeric id (kept as string to avoid 53-bit precision issues). */
export const TelegramId = z.string().regex(/^-?\d+$/);
export type TelegramId = z.infer<typeof TelegramId>;
