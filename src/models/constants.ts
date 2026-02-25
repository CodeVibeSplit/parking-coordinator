// Firestore collection names
export const COLLECTIONS = {
  CONFIG: 'config',
  ROTATION_STATE: 'rotationState',
  VACATIONS: 'vacations',
  PARKING_ASSIGNMENTS: 'parkingAssignments',
  PARKING_HISTORY: 'parkingHistory',
  AUDIT_LOG: 'auditLog',
  USERS: 'users',
  POINTS_HISTORY: 'pointsHistory',
  WEEKLY_SCHEDULE: 'weeklySchedule',
} as const;

// Document IDs for singleton documents
export const SINGLETON_IDS = {
  CONFIG: 'main',
  ROTATION_STATE: 'current',
} as const;

// Day of week constants
export const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
] as const;

// Time constants
export const NOTIFICATION_TIME = '16:00';
export const FORFEIT_WINDOW_CLOSE_TIME = '18:00';
export const WEEK_BOUNDARY_CHECK_TIME = '00:01';

// Default configuration values
export const DEFAULT_AVAILABLE_SPOTS = 3;
export const DEFAULT_FORFEIT_WINDOW_HOURS = 2;

// Slack command names
export const SLACK_COMMANDS = {
  SCHEDULE: '/parking-schedule',
  VACATION: '/parking-vacation',
  STATS: '/parking-stats',
  ADMIN_OVERRIDE: '/parking-admin-override',
  ADMIN_REORDER: '/parking-admin-reorder',
} as const;

// Slack action IDs
export const SLACK_ACTIONS = {
  FORFEIT_SPOT: 'forfeit_spot',
  CONFIRM_PARKING: 'confirm_parking',
  REORDER_MOVE: 'reorder_move',
  PARKED_YES: 'parked_yes',
  PARKED_NO: 'parked_no',
} as const;

// Error messages
export const ERROR_MESSAGES = {
  NOT_ASSIGNED: 'You are not assigned a parking spot for this day.',
  FORFEIT_WINDOW_CLOSED: 'The forfeit window has closed. You can no longer forfeit your spot.',
  ALREADY_FORFEITED: 'You have already forfeited your spot for this day.',
  ALREADY_CONFIRMED: 'You have already confirmed your spot.',
  INVALID_DATE_FORMAT: 'Invalid date format. Please use YYYY-MM-DD.',
  VACATION_NOT_FOUND: 'Vacation not found.',
  UNAUTHORIZED: 'You are not authorized to perform this action.',
  NO_SPOTS_AVAILABLE: 'No parking spots available for this day.',
  DATABASE_ERROR: 'A database error occurred. Please try again later.',
  INVALID_VACATION_DATES: 'Invalid vacation dates. End date must be after start date.',
} as const;

// Success messages
export const SUCCESS_MESSAGES = {
  FORFEIT_SUCCESS: 'Your parking spot has been forfeited.',
  CONFIRM_SUCCESS: 'Your parking spot has been confirmed!',
  VACATION_ADDED: 'Vacation has been added successfully.',
  VACATION_REMOVED: 'Vacation has been removed successfully.',
  OVERRIDE_SUCCESS: 'Parking assignment has been overridden.',
} as const;
