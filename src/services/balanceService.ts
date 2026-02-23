import {
  getAllParkingHistory,
  getUserParkingHistory,
  getConfig,
} from '../utils/firestoreUtils';
import { getBusinessDaysBetween, getCurrentDate } from '../utils/dateUtils';
import type { UserStatistics, BalanceReport, ParkingHistory } from '../models/types';

/**
 * Get parking statistics for all users
 */
export async function getStatistics(
  startDate?: Date,
  endDate?: Date
): Promise<UserStatistics[]> {
  const config = await getConfig();
  if (!config) {
    throw new Error('Configuration not found');
  }

  const history = await getAllParkingHistory();

  // Filter by date range if provided
  let filteredHistory = history;
  if (startDate || endDate) {
    filteredHistory = history.filter((record) => {
      const recordDate = new Date(record.date);
      if (startDate && recordDate < startDate) return false;
      if (endDate && recordDate > endDate) return false;
      return true;
    });
  }

  // Calculate statistics for each user
  const userStats: Map<string, UserStatistics> = new Map();

  // Initialize all users
  for (const userId of config.teamMembers) {
    userStats.set(userId, {
      userId,
      totalDaysAssigned: 0,
      totalDaysParked: 0,
      totalDaysForfeited: 0,
      balanceScore: 0,
    });
  }

  // Aggregate history
  for (const record of filteredHistory) {
    const stats = userStats.get(record.userId);
    if (!stats) continue;

    stats.totalDaysAssigned++;
    if (record.parked) {
      stats.totalDaysParked++;
    }
    if (record.forfeited) {
      stats.totalDaysForfeited++;
    }
  }

  // Calculate balance scores
  const totalTeamMembers = config.teamMembers.length;
  const totalParkingDays = filteredHistory.filter((r) => r.parked).length;
  const fairSharePerUser = totalParkingDays / totalTeamMembers;

  for (const stats of userStats.values()) {
    // Balance = actual parked days - fair share
    stats.balanceScore = Math.round(stats.totalDaysParked - fairSharePerUser);
  }

  return Array.from(userStats.values());
}

/**
 * Get statistics for a specific user
 */
export async function getUserStatistics(userId: string): Promise<UserStatistics> {
  const allStats = await getStatistics();
  const userStats = allStats.find((s) => s.userId === userId);

  if (!userStats) {
    return {
      userId,
      totalDaysAssigned: 0,
      totalDaysParked: 0,
      totalDaysForfeited: 0,
      balanceScore: 0,
    };
  }

  return userStats;
}

/**
 * Calculate balance report for all users
 */
export async function calculateBalance(): Promise<BalanceReport> {
  const stats = await getStatistics();
  const totalParkingDays = stats.reduce(
    (sum, s) => sum + s.totalDaysParked,
    0
  );
  const averageDaysPerUser =
    stats.length > 0 ? totalParkingDays / stats.length : 0;

  return {
    generatedAt: getCurrentDate(),
    statistics: stats,
    totalParkingDays,
    averageDaysPerUser: Math.round(averageDaysPerUser * 10) / 10,
  };
}

/**
 * Get parking history for a user
 */
export async function getUserHistory(
  userId: string,
  limit?: number
): Promise<ParkingHistory[]> {
  return await getUserParkingHistory(userId, limit);
}

/**
 * Get ranking of users by total parking days
 */
export async function getParkingRanking(): Promise<UserStatistics[]> {
  const stats = await getStatistics();
  return stats.sort((a, b) => b.totalDaysParked - a.totalDaysParked);
}

/**
 * Get users who have parked the least (for potential priority)
 */
export async function getUsersWithLeastParking(): Promise<string[]> {
  const stats = await getStatistics();
  const sorted = stats.sort((a, b) => a.totalDaysParked - b.totalDaysParked);

  // Return users in bottom quartile
  const quartileSize = Math.ceil(stats.length / 4);
  return sorted.slice(0, quartileSize).map((s) => s.userId);
}

/**
 * Calculate fairness score (0-100, higher is more fair)
 * Based on standard deviation of parking days
 */
export async function calculateFairnessScore(): Promise<number> {
  const stats = await getStatistics();

  if (stats.length === 0) {
    return 100;
  }

  const parkingDays = stats.map((s) => s.totalDaysParked);
  const mean = parkingDays.reduce((sum, days) => sum + days, 0) / stats.length;

  // Calculate standard deviation
  const variance =
    parkingDays.reduce((sum, days) => sum + Math.pow(days - mean, 2), 0) /
    stats.length;
  const stdDev = Math.sqrt(variance);

  // Convert to fairness score (lower std dev = more fair)
  // Perfect fairness (stdDev = 0) = 100
  // High variation (stdDev > 5) = lower score
  const fairnessScore = Math.max(0, 100 - stdDev * 10);

  return Math.round(fairnessScore);
}

/**
 * Get detailed statistics for a date range
 */
export async function getDetailedStatistics(
  startDate: Date,
  endDate: Date
): Promise<{
  stats: UserStatistics[];
  totalBusinessDays: number;
  utilizationRate: number;
}> {
  const stats = await getStatistics(startDate, endDate);
  const totalBusinessDays = getBusinessDaysBetween(startDate, endDate);
  const config = await getConfig();

  if (!config) {
    throw new Error('Configuration not found');
  }

  const totalParkingDays = stats.reduce(
    (sum, s) => sum + s.totalDaysParked,
    0
  );
  const maxPossibleDays = totalBusinessDays * config.availableSpots;
  const utilizationRate =
    maxPossibleDays > 0 ? (totalParkingDays / maxPossibleDays) * 100 : 0;

  return {
    stats,
    totalBusinessDays,
    utilizationRate: Math.round(utilizationRate * 10) / 10,
  };
}
