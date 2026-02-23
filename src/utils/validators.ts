import { isValidISODate, fromISODate } from './dateUtils';
import { isBefore, isAfter } from 'date-fns';

/**
 * Validates a date string in ISO format (YYYY-MM-DD)
 */
export function validateISODate(dateString: string): {
  valid: boolean;
  error?: string;
} {
  if (!dateString) {
    return { valid: false, error: 'Date is required' };
  }

  if (!isValidISODate(dateString)) {
    return {
      valid: false,
      error: 'Invalid date format. Please use YYYY-MM-DD',
    };
  }

  return { valid: true };
}

/**
 * Validates a date range
 */
export function validateDateRange(
  startDateStr: string,
  endDateStr: string
): {
  valid: boolean;
  error?: string;
} {
  const startValidation = validateISODate(startDateStr);
  if (!startValidation.valid) {
    return { valid: false, error: `Start date: ${startValidation.error}` };
  }

  const endValidation = validateISODate(endDateStr);
  if (!endValidation.valid) {
    return { valid: false, error: `End date: ${endValidation.error}` };
  }

  const startDate = fromISODate(startDateStr);
  const endDate = fromISODate(endDateStr);

  if (isAfter(startDate, endDate)) {
    return {
      valid: false,
      error: 'Start date must be before or equal to end date',
    };
  }

  return { valid: true };
}

/**
 * Validates a Slack user ID
 */
export function validateSlackUserId(userId: string): {
  valid: boolean;
  error?: string;
} {
  if (!userId) {
    return { valid: false, error: 'User ID is required' };
  }

  if (!userId.startsWith('U') || userId.length < 9) {
    return {
      valid: false,
      error: 'Invalid Slack user ID format (should start with U)',
    };
  }

  return { valid: true };
}

/**
 * Validates multiple Slack user IDs
 */
export function validateSlackUserIds(userIds: string[]): {
  valid: boolean;
  error?: string;
} {
  if (!userIds || userIds.length === 0) {
    return { valid: false, error: 'At least one user ID is required' };
  }

  for (const userId of userIds) {
    const validation = validateSlackUserId(userId);
    if (!validation.valid) {
      return {
        valid: false,
        error: `Invalid user ID ${userId}: ${validation.error}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validates a vacation period is in the future or current week
 */
export function validateVacationPeriod(
  startDateStr: string,
  endDateStr: string
): {
  valid: boolean;
  error?: string;
} {
  const rangeValidation = validateDateRange(startDateStr, endDateStr);
  if (!rangeValidation.valid) {
    return rangeValidation;
  }

  const endDate = fromISODate(endDateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (isBefore(endDate, today)) {
    return {
      valid: false,
      error: 'Vacation end date cannot be in the past',
    };
  }

  return { valid: true };
}

/**
 * Validates a number input
 */
export function validateNumber(
  value: unknown,
  min?: number,
  max?: number
): {
  valid: boolean;
  error?: string;
} {
  if (typeof value !== 'number' || isNaN(value)) {
    return { valid: false, error: 'Value must be a number' };
  }

  if (min !== undefined && value < min) {
    return { valid: false, error: `Value must be at least ${min}` };
  }

  if (max !== undefined && value > max) {
    return { valid: false, error: `Value must be at most ${max}` };
  }

  return { valid: true };
}
