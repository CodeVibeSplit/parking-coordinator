import {
  toISODate,
  fromISODate,
  getWeekStart,
  getDayOfWeek,
  isWeekday,
  getWeekdays,
  isDateInRange,
  getWeeksCovered,
  isDateInWeek,
  formatDateDisplay,
  getBusinessDaysBetween,
  isValidISODate,
} from '../../src/utils/dateUtils';

describe('dateUtils', () => {
  describe('toISODate and fromISODate', () => {
    it('should convert date to ISO string format', () => {
      const date = new Date('2026-02-24T10:00:00Z');
      const isoDate = toISODate(date);
      expect(isoDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should parse ISO date string correctly', () => {
      const isoDate = '2026-02-24';
      const date = fromISODate(isoDate);
      expect(date).toBeInstanceOf(Date);
      expect(toISODate(date)).toBe(isoDate);
    });
  });

  describe('getWeekStart', () => {
    it('should return Monday for any day in the week', () => {
      // Wednesday, February 26, 2026
      const wednesday = new Date('2026-02-25');
      const weekStart = getWeekStart(wednesday);
      const dayOfWeek = getDayOfWeek(weekStart);
      expect(dayOfWeek).toBe('Monday');
    });

    it('should return same date if input is already Monday', () => {
      const monday = new Date('2026-02-23');
      const weekStart = getWeekStart(monday);
      expect(toISODate(weekStart)).toBe('2026-02-23');
    });
  });

  describe('getDayOfWeek', () => {
    it('should return correct day names', () => {
      expect(getDayOfWeek(new Date('2026-02-23'))).toBe('Monday');
      expect(getDayOfWeek(new Date('2026-02-24'))).toBe('Tuesday');
      expect(getDayOfWeek(new Date('2026-02-25'))).toBe('Wednesday');
      expect(getDayOfWeek(new Date('2026-02-26'))).toBe('Thursday');
      expect(getDayOfWeek(new Date('2026-02-27'))).toBe('Friday');
      expect(getDayOfWeek(new Date('2026-02-28'))).toBe('Saturday');
      expect(getDayOfWeek(new Date('2026-03-01'))).toBe('Sunday');
    });
  });

  describe('isWeekday', () => {
    it('should return true for Monday through Friday', () => {
      expect(isWeekday(new Date('2026-02-23'))).toBe(true); // Monday
      expect(isWeekday(new Date('2026-02-24'))).toBe(true); // Tuesday
      expect(isWeekday(new Date('2026-02-25'))).toBe(true); // Wednesday
      expect(isWeekday(new Date('2026-02-26'))).toBe(true); // Thursday
      expect(isWeekday(new Date('2026-02-27'))).toBe(true); // Friday
    });

    it('should return false for Saturday and Sunday', () => {
      expect(isWeekday(new Date('2026-02-28'))).toBe(false); // Saturday
      expect(isWeekday(new Date('2026-03-01'))).toBe(false); // Sunday
    });
  });

  describe('getWeekdays', () => {
    it('should return 5 weekdays starting from Monday', () => {
      const monday = new Date('2026-02-23');
      const weekdays = getWeekdays(monday);

      expect(weekdays).toHaveLength(5);
      expect(getDayOfWeek(weekdays[0])).toBe('Monday');
      expect(getDayOfWeek(weekdays[1])).toBe('Tuesday');
      expect(getDayOfWeek(weekdays[2])).toBe('Wednesday');
      expect(getDayOfWeek(weekdays[3])).toBe('Thursday');
      expect(getDayOfWeek(weekdays[4])).toBe('Friday');
    });
  });

  describe('isDateInRange', () => {
    it('should return true for dates within range', () => {
      const start = new Date('2026-02-23');
      const end = new Date('2026-02-27');
      const middle = new Date('2026-02-25');

      expect(isDateInRange(middle, start, end)).toBe(true);
      expect(isDateInRange(start, start, end)).toBe(true);
      expect(isDateInRange(end, start, end)).toBe(true);
    });

    it('should return false for dates outside range', () => {
      const start = new Date('2026-02-23');
      const end = new Date('2026-02-27');
      const before = new Date('2026-02-22');
      const after = new Date('2026-02-28');

      expect(isDateInRange(before, start, end)).toBe(false);
      expect(isDateInRange(after, start, end)).toBe(false);
    });
  });

  describe('getWeeksCovered', () => {
    it('should return single week for dates in same week', () => {
      const start = new Date('2026-02-23');
      const end = new Date('2026-02-27');
      const weeks = getWeeksCovered(start, end);

      expect(weeks).toHaveLength(1);
      expect(weeks[0]).toBe('2026-02-23');
    });

    it('should return multiple weeks for dates spanning weeks', () => {
      const start = new Date('2026-02-23');
      const end = new Date('2026-03-06');
      const weeks = getWeeksCovered(start, end);

      expect(weeks).toHaveLength(2);
      expect(weeks[0]).toBe('2026-02-23');
      expect(weeks[1]).toBe('2026-03-02');
    });

    it('should handle vacation spanning 3 weeks', () => {
      const start = new Date('2026-02-23');
      const end = new Date('2026-03-13');
      const weeks = getWeeksCovered(start, end);

      expect(weeks).toHaveLength(3);
    });
  });

  describe('isDateInWeek', () => {
    it('should return true for dates in the specified week', () => {
      const weekStart = '2026-02-23';

      expect(isDateInWeek(new Date('2026-02-23'), weekStart)).toBe(true);
      expect(isDateInWeek(new Date('2026-02-25'), weekStart)).toBe(true);
      expect(isDateInWeek(new Date('2026-02-28'), weekStart)).toBe(true);
    });

    it('should return false for dates outside the week', () => {
      const weekStart = '2026-02-23';

      expect(isDateInWeek(new Date('2026-02-22'), weekStart)).toBe(false);
      expect(isDateInWeek(new Date('2026-03-02'), weekStart)).toBe(false);
    });
  });

  describe('getBusinessDaysBetween', () => {
    it('should count weekdays only', () => {
      const monday = new Date('2026-02-23');
      const friday = new Date('2026-02-27');

      expect(getBusinessDaysBetween(monday, friday)).toBe(5);
    });

    it('should exclude weekends', () => {
      const monday = new Date('2026-02-23');
      const nextMonday = new Date('2026-03-02');

      expect(getBusinessDaysBetween(monday, nextMonday)).toBe(6);
    });
  });

  describe('isValidISODate', () => {
    it('should return true for valid ISO dates', () => {
      expect(isValidISODate('2026-02-24')).toBe(true);
      expect(isValidISODate('2026-12-31')).toBe(true);
      expect(isValidISODate('2026-01-01')).toBe(true);
    });

    it('should return false for invalid ISO dates', () => {
      expect(isValidISODate('2026-13-01')).toBe(false); // Invalid month
      expect(isValidISODate('2026-02-30')).toBe(false); // Invalid day
      expect(isValidISODate('02-24-2026')).toBe(false); // Wrong format
      expect(isValidISODate('2026/02/24')).toBe(false); // Wrong separator
      expect(isValidISODate('invalid')).toBe(false);
      expect(isValidISODate('')).toBe(false);
    });
  });

  describe('formatDateDisplay', () => {
    it('should format date for display', () => {
      const date = new Date('2026-02-24');
      const formatted = formatDateDisplay(date);

      expect(formatted).toMatch(/Tuesday/);
      expect(formatted).toMatch(/February/);
    });
  });
});
