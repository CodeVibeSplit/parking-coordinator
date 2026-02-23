import {
  format,
  startOfWeek,
  addDays,
  isWeekend,
  isBefore,
  isAfter,
  isSameDay,
  parseISO,
  differenceInDays,
  addWeeks,
} from 'date-fns';

// Re-export addDays for use in other modules
export { addDays };
import { utcToZonedTime, zonedTimeToUtc, format as formatTz } from 'date-fns-tz';
import { env } from '../config/environment';
import { DAYS_OF_WEEK } from '../models/constants';

/**
 * Get current date in configured timezone
 */
export function getCurrentDate(): Date {
  return utcToZonedTime(new Date(), env.timezone);
}

/**
 * Convert date to ISO string (YYYY-MM-DD)
 */
export function toISODate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Parse ISO date string to Date object
 */
export function fromISODate(dateString: string): Date {
  return parseISO(dateString);
}

/**
 * Get start of week (Monday) for a given date
 */
export function getWeekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 }); // 1 = Monday
}

/**
 * Get start of current week (Monday)
 */
export function getCurrentWeekStart(): Date {
  return getWeekStart(getCurrentDate());
}

/**
 * Get day of week name (e.g., "Monday", "Tuesday")
 */
export function getDayOfWeek(date: Date): string {
  return DAYS_OF_WEEK[date.getDay()];
}

/**
 * Check if a date is a weekday (Monday-Friday)
 */
export function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5; // Monday = 1, Friday = 5
}

/**
 * Get next weekday (if date is weekend, return next Monday)
 */
export function getNextWeekday(date: Date): Date {
  let nextDay = addDays(date, 1);
  while (isWeekend(nextDay)) {
    nextDay = addDays(nextDay, 1);
  }
  return nextDay;
}

/**
 * Get all weekdays in a given week (Monday-Friday)
 */
export function getWeekdays(weekStart: Date): Date[] {
  const weekdays: Date[] = [];
  for (let i = 0; i < 5; i++) {
    weekdays.push(addDays(weekStart, i));
  }
  return weekdays;
}

/**
 * Check if a date falls within a date range (inclusive)
 */
export function isDateInRange(
  date: Date,
  startDate: Date,
  endDate: Date
): boolean {
  return (
    (isSameDay(date, startDate) || isAfter(date, startDate)) &&
    (isSameDay(date, endDate) || isBefore(date, endDate))
  );
}

/**
 * Get all Monday dates (week starts) covered by a date range
 */
export function getWeeksCovered(startDate: Date, endDate: Date): string[] {
  const weeks: string[] = [];
  let currentWeekStart = getWeekStart(startDate);
  const endWeekStart = getWeekStart(endDate);

  while (
    isBefore(currentWeekStart, endWeekStart) ||
    isSameDay(currentWeekStart, endWeekStart)
  ) {
    weeks.push(toISODate(currentWeekStart));
    currentWeekStart = addWeeks(currentWeekStart, 1);
  }

  return weeks;
}

/**
 * Check if a week includes a specific date
 */
export function isDateInWeek(date: Date, weekStartDate: string): boolean {
  const weekStart = fromISODate(weekStartDate);
  const weekEnd = addDays(weekStart, 6);
  return isDateInRange(date, weekStart, weekEnd);
}

/**
 * Format time in HH:mm format for the configured timezone
 */
export function formatTime(date: Date): string {
  return formatTz(utcToZonedTime(date, env.timezone), 'HH:mm', {
    timeZone: env.timezone,
  });
}

/**
 * Parse time string (HH:mm) and combine with date
 */
export function parseTime(date: Date, timeString: string): Date {
  const [hours, minutes] = timeString.split(':').map(Number);
  const combined = new Date(date);
  combined.setHours(hours, minutes, 0, 0);
  return zonedTimeToUtc(combined, env.timezone);
}

/**
 * Check if current time is within a time window
 */
export function isWithinTimeWindow(
  date: Date,
  startTime: string,
  endTime: string
): boolean {
  const now = getCurrentDate();
  const end = parseTime(date, endTime);

  return (
    (isSameDay(now, date) || isAfter(now, date)) &&
    (isSameDay(now, date) || isBefore(now, end))
  );
}

/**
 * Add hours to a date
 */
export function addHours(date: Date, hours: number): Date {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
}

/**
 * Format date for display (e.g., "Monday, February 24")
 */
export function formatDateDisplay(date: Date): string {
  return format(date, 'EEEE, MMMM d');
}

/**
 * Format date for display with year (e.g., "Monday, February 24, 2026")
 */
export function formatDateDisplayLong(date: Date): string {
  return format(date, 'EEEE, MMMM d, yyyy');
}

/**
 * Get the number of business days between two dates (inclusive)
 */
export function getBusinessDaysBetween(
  startDate: Date,
  endDate: Date
): number {
  let count = 0;
  let current = new Date(startDate);

  while (
    isBefore(current, endDate) ||
    isSameDay(current, endDate)
  ) {
    if (isWeekday(current)) {
      count++;
    }
    current = addDays(current, 1);
  }

  return count;
}

/**
 * Check if a date string is valid ISO format (YYYY-MM-DD)
 */
export function isValidISODate(dateString: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) {
    return false;
  }

  try {
    const date = parseISO(dateString);
    return !isNaN(date.getTime());
  } catch {
    return false;
  }
}

/**
 * Get tomorrow's date
 */
export function getTomorrow(): Date {
  return addDays(getCurrentDate(), 1);
}

/**
 * Get next weekday from today (if today is Friday, returns Monday)
 */
export function getNextWorkday(): Date {
  return getNextWeekday(getCurrentDate());
}

/**
 * Calculate the difference in days between two dates
 */
export function daysDifference(date1: Date, date2: Date): number {
  return Math.abs(differenceInDays(date1, date2));
}
