import { Timestamp } from 'firebase-admin/firestore';

// User
export interface User {
  userId: string;
  displayName: string;
  registeredAt: Timestamp;
  isActive: boolean;
  points: number;
}

// Configuration
export interface Config {
  id: string;
  teamMembers: string[];           // Slack user IDs
  rotationOrder: string[];         // Order of rotation
  availableSpots: number;          // 3
  dailyNotificationTime: string;   // "16:00"
  forfeitWindowHours: number;      // 2
  adminUserIds: string[];          // Admin Slack user IDs
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Rotation State
export interface RotationState {
  id: string;
  weekStartDate: string;           // ISO date "2026-02-23" (Monday)
  currentWeekOrder: string[];      // Active members this week (excludes vacations)
  currentRotationIndex: number;    // Current position in rotation
  lastAssignmentDate: string;      // ISO date of last assignment
  updatedAt: Timestamp;
}

// Vacation
export interface Vacation {
  id: string;
  userId: string;                  // Slack user ID
  startDate: string;               // ISO date
  endDate: string;                 // ISO date
  weeksCovered: string[];          // Monday dates of weeks covered
  createdAt: Timestamp;
  createdBy: string;               // User who created it
}

// Parking Assignment
export interface ParkingAssignment {
  id: string;                         // ISO date "2026-02-24"
  date: string;                       // ISO date (same as id)
  dayOfWeek: string;                  // "Monday", "Tuesday", etc.
  assignedUsers: string[];            // Current assigned users
  forfeitedUsers: string[];           // Users who forfeited
  confirmedUsers: string[];           // Users who explicitly confirmed their spot
  originalPrimaryUsers: string[];     // Set once at creation, never mutated
  secondaryList: string[];            // Ordered list of eligible secondaries at 16:00
  attendanceCheckSentAt?: Timestamp;  // When 12:00 message was sent
  attendedUsers: string[];            // Responded "Yes, I parked"
  absentUsers: string[];              // Responded "No, I didn't park"
  notificationSentAt?: Timestamp;     // When 16:00 message was sent
  notificationMessageTs?: string;     // Slack message timestamp for updates
  finalizedAt?: Timestamp;            // When forfeit window closed
  isFinalized: boolean;               // True after 18:00
  weekStartDate: string;              // "2026-02-23" - for grouping
}

// Parking History
export interface ParkingHistory {
  id: string;
  userId: string;                  // Slack user ID
  date: string;                    // ISO date
  parked: boolean;                 // True if they actually parked
  forfeited: boolean;              // True if they forfeited
  autoForfeited?: boolean;         // True if auto-forfeited at window close (not manual)
  weekStartDate: string;           // Monday date for aggregation
  createdAt: Timestamp;
}

// Weekly Schedule
export interface WeeklySchedule {
  weekStartDate: string;       // Monday ISO date "2026-03-02"
  primaryUserIds: string[];    // 3 userIds with lowest ratio
  announcedAt: Timestamp;
  announcedBy: string;         // "system" or admin userId
}

// Points History
export interface PointsHistoryEntry {
  id?: string;
  userId: string;
  delta: number;
  reason: string;
  newTotal: number;
  affectedDate?: string;
  timestamp: Timestamp;
}

// Audit Log
export interface AuditLog {
  id: string;
  timestamp: Timestamp;
  action: AuditAction;
  userId: string;                  // Actor
  details: Record<string, unknown>;
  affectedDate?: string;           // If relevant
}

export type AuditAction =
  | 'FORFEIT'
  | 'VACATION_ADDED'
  | 'VACATION_REMOVED'
  | 'ROTATION_OVERRIDE'
  | 'ROTATION_ADVANCED'
  | 'WEEK_RESET'
  | 'ASSIGNMENT_CREATED'
  | 'ASSIGNMENT_FINALIZED'
  | 'POINTS_AWARDED'
  | 'ATTENDANCE_CHECK_SENT'
  | 'ATTENDANCE_CLOSED';

// User Statistics
export interface UserStatistics {
  userId: string;
  userName?: string;               // Optional display name
  totalDaysAssigned: number;
  totalDaysParked: number;
  totalDaysForfeited: number;
  balanceScore: number;            // Negative means owes parking days
}

// Balance Report
export interface BalanceReport {
  generatedAt: Date;
  statistics: UserStatistics[];
  totalParkingDays: number;
  averageDaysPerUser: number;
}

// Slack Message Block (for type safety)
export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
  };
  elements?: unknown[];
  [key: string]: unknown;
}

// Environment Configuration
export interface EnvConfig {
  slackBotToken: string;
  slackSigningSecret: string;
  slackAppToken: string;
  notificationChannelId: string;
  firebaseProjectId: string;
  firebasePrivateKey: string;
  firebaseClientEmail: string;
  adminUserIds: string[];
  timezone: string;
  port: number;
  nodeEnv: string;
}
