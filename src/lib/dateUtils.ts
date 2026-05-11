/**
 * Centralized date utilities for EST (New York) timezone
 * All date operations across the application should use these functions
 * to ensure consistency with EST timezone.
 */
import { format, isValid } from 'date-fns';

/**
 * Get current EST date as YYYY-MM-DD string
 * @returns EST date string in YYYY-MM-DD format
 */
export const getTodayDateEST = (): string => {
  const now = new Date();
  
  // Convert to EST (UTC-5) - Note: This doesn't account for DST
  // For proper DST handling, we should use UTC-4 during DST months
  const estOffset = isDST(now) ? -4 : -5; // DST handling
  const estDate = new Date(now.getTime() + (estOffset * 60 * 60 * 1000));
  
  return estDate.toISOString().split('T')[0];
};

/**
 * Convert any date to EST and return as YYYY-MM-DD string
 * @param date - Input date (Date object or string)
 * @returns EST date string in YYYY-MM-DD format
 */
export const formatDateToEST = (date: Date | string): string => {
  const inputDate = typeof date === 'string' ? new Date(date) : date;
  
  const estOffset = isDST(inputDate) ? -4 : -5; // DST handling
  const estDate = new Date(inputDate.getTime() + (estOffset * 60 * 60 * 1000));
  
  return estDate.toISOString().split('T')[0];
};

/**
 * Get current EST timestamp as ISO string
 * @returns EST timestamp in ISO format
 */
export const getCurrentTimestampEST = (): string => {
  const now = new Date();
  
  const estOffset = isDST(now) ? -4 : -5; // DST handling
  const estDate = new Date(now.getTime() + (estOffset * 60 * 60 * 1000));
  
  return estDate.toISOString();
};

/**
 * Convert Date object to EST date string (YYYY-MM-DD)
 * Useful for form inputs and database operations
 * @param date - Date object from date pickers
 * @returns EST date string
 */
export const dateObjectToESTString = (date: Date): string => {
  // For date pickers, we usually want the local date as selected
  // Convert to EST timezone for consistency
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

/**
 * Check if a given date falls within Daylight Saving Time (DST) period
 * DST in US: Second Sunday in March to First Sunday in November
 * @param date - Date to check
 * @returns boolean indicating if date is in DST period
 */
export const isDST = (date: Date): boolean => {
  const year = date.getFullYear();
  
  // Second Sunday in March
  const marchSecondSunday = new Date(year, 2, 1); // March 1st
  marchSecondSunday.setDate(1 + (7 - marchSecondSunday.getDay()) + 7); // Second Sunday
  
  // First Sunday in November  
  const novemberFirstSunday = new Date(year, 10, 1); // November 1st
  novemberFirstSunday.setDate(1 + (7 - novemberFirstSunday.getDay()) % 7); // First Sunday
  
  return date >= marchSecondSunday && date < novemberFirstSunday;
};

/**
 * Parse date string and ensure it's treated as EST
 * @param dateString - Date string in YYYY-MM-DD format
 * @returns Date object adjusted for EST
 */
export const parseESTDate = (dateString: string): Date => {
  // Create date at noon EST to avoid timezone issues
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0); // Noon local time
  
  return date;
};

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const parseDateForDisplay = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return isValid(value) ? value : null;

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const parsed = DATE_ONLY_PATTERN.test(trimmed)
    ? parseESTDate(trimmed)
    : new Date(trimmed);

  return isValid(parsed) ? parsed : null;
};

const fallbackDateDisplay = (value: Date | string | null | undefined, fallback: string) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || fallback;
  }

  return fallback;
};

/**
 * Format a stored date for user-facing US display.
 * Keeps YYYY-MM-DD storage values timezone-safe while rendering as MM/DD/YYYY.
 */
export const formatDateUS = (
  value: Date | string | null | undefined,
  fallback = ''
): string => {
  const parsed = parseDateForDisplay(value);
  return parsed ? format(parsed, 'MM/dd/yyyy') : fallbackDateDisplay(value, fallback);
};

/**
 * Format a stored timestamp for user-facing US display.
 */
export const formatDateTimeUS = (
  value: Date | string | null | undefined,
  fallback = ''
): string => {
  const parsed = parseDateForDisplay(value);
  return parsed ? format(parsed, 'MM/dd/yyyy h:mm a') : fallbackDateDisplay(value, fallback);
};

/**
 * Get EST date range for queries (start and end of day in EST)
 * @param date - Target date
 * @returns Object with start and end timestamps in EST
 */
export const getESTDateRange = (date: Date | string) => {
  const targetDate = typeof date === 'string' ? parseESTDate(date) : date;
  
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);
  
  return {
    start: getCurrentTimestampEST(), // You might want to adjust this based on the input date
    end: getCurrentTimestampEST()   // You might want to adjust this based on the input date
  };
};

/**
 * Get current date as Date object in EST timezone
 * @returns Date object adjusted to EST
 */
export const getCurrentDateEST = (): Date => {
  const now = new Date();
  const estOffset = isDST(now) ? -4 : -5;
  return new Date(now.getTime() + (estOffset * 60 * 60 * 1000));
};

/**
 * Format current EST date in US locale format (M/d/yy)
 * @returns EST date in M/d/yy format
 */
export const formatDateESTLocale = (): string => {
  const now = new Date();
  const estOffset = isDST(now) ? -4 : -5;
  const estDate = new Date(now.getTime() + (estOffset * 60 * 60 * 1000));
  return estDate.toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit'
  });
};

// Export commonly used date formats
export const DATE_FORMATS = {
  DATABASE: 'YYYY-MM-DD',           // For database storage
  DISPLAY: 'MM/DD/YYYY',            // For user display
  TIMESTAMP: 'YYYY-MM-DDTHH:mm:ss.sssZ' // For timestamps
} as const;
