# Parking Coordinator — Feature Planning

## Feature: Ratio-Based Weekly Parking Scheduler

### Context
Replace the current round-robin rotation with a ratio-based weekly system. Every Friday at 16:00, 3 primaries are selected for the following week based on who has the lowest `primaryDays / daysSinceRegistration` ratio. This keeps allocation fair and self-balancing over time.

---

### Decisions

| Question | Decision |
|---|---|
| Weekly model | All 3 primaries get a spot every day Mon–Fri |
| Partial vacation counting | Count only days actually assigned (vacation days excluded) |
| Forfeited days | Count toward ratio (user was assigned the spot) |
| Daily 16:00 reminder | Kept — reminds primaries for that specific day |
| Vacation gap coverage | Pull in backup (next lowest ratio, non-primary, not on vacation that day) |
| New member starting ratio | Start at 0, self-corrects naturally |
| Registration date tracking | New `users` Firestore collection |

---

### Ratio Formula
```
ratio = parkingHistoryCount(userId) / daysSinceRegistration(userId)
```
- `parkingHistoryCount` = number of `parkingHistory` docs for the user (any entry = was assigned)
- `daysSinceRegistration` = calendar days since `users.registeredAt`
- New member ratio = 0 → picked first, then naturally falls back into rotation

---

### New Data Model

#### `users/{userId}` (new collection)
```ts
{
  userId: string
  displayName: string
  registeredAt: Timestamp
  isActive: boolean
}
```

#### `weeklySchedule/{weekStartDate}` (new collection, key = Monday ISO date)
```ts
{
  weekStartDate: string       // "2026-03-02"
  primaryUserIds: string[]    // 3 userIds with lowest ratio
  announcedAt: Timestamp
  announcedBy: string         // "system" or admin userId
}
```

#### Deprecated (stop writing, keep in Firestore)
- `rotationState` collection
- `config.rotationOrder` and `config.currentRotationIndex`

---

### Weekly Selection Algorithm (runs every Friday)
1. Fetch all active users with their ratios
2. Exclude users on full-week vacation next week (vacation covers all 5 weekdays)
3. Sort ascending by ratio
4. Pick top N (where N = `config.availableSpots`, currently 3) → weekly primaries
5. Store in `weeklySchedule/{nextMondayDate}`
6. Send announcement to notification channel with full Mon–Fri preview

### Daily Assignment Logic (modified)
1. Load `weeklySchedule` for current week
2. Filter primaries — remove anyone on vacation today
3. For each gap, find the next lowest ratio person not already assigned and not on vacation
4. Write to `parkingAssignments/{date}`
5. Record in `parkingHistory` (backups included — counts toward their ratio)

---

### Scheduler Changes

| Job | Cron | Change |
|---|---|---|
| Friday announcement | `0 16 * * 5` | **New** — selects primaries, sends weekly preview |
| Daily reminder | `0 16 * * 1-5` | **Modified** — uses weeklySchedule instead of rotation |
| Monday fallback | `1 0 * * 1` | **Modified** — generates weeklySchedule if Friday job missed |

---

### Files to Create
- `src/services/weeklyScheduleService.ts`
  - `calculateWeeklyPrimaries(weekStartDate)` — ratio algorithm, returns N userIds
  - `getWeeklySchedule(weekStartDate)`
  - `createWeeklySchedule(weekStartDate, primaryUserIds)`
  - `getDailyAssignees(date)` — primaries + backups for a specific day

### Files to Modify
- `src/models/types.ts` — add `User`, `WeeklySchedule` interfaces
- `src/models/constants.ts` — add `USERS`, `WEEKLY_SCHEDULE` to `COLLECTIONS`
- `src/utils/firestoreUtils.ts` — add user CRUD, weeklySchedule CRUD
- `src/services/balanceService.ts` — update ratio to new formula
- `src/services/rotationService.ts` — replace round-robin with weeklySchedule lookup
- `src/services/schedulerService.ts` — add Friday job, update daily and Monday jobs
- `src/services/notificationService.ts` — add weekly announcement formatter
- `src/handlers/commandHandlers.ts` — add `/parking-admin-add-member`, `/parking-admin-remove-member`

### New Admin Commands
- `/parking-admin-add-member @user` — creates user doc with `registeredAt = today`
- `/parking-admin-remove-member @user` — sets `isActive = false`

---

### Migration
Create `scripts/initializeUsers.ts`:
- Read `config.teamMembers`
- For each userId, create `users/{userId}` with `registeredAt = config.createdAt`
- Skip if doc already exists

Add to `package.json`:
```json
"init-users": "tsx scripts/initializeUsers.ts"
```

Run once after deploy:
```bash
npm run init-users
```

---

### Verification Checklist
- [ ] Run `init-users` — check `users` collection populated in Firestore
- [ ] Manually trigger Friday job — verify `weeklySchedule/{nextMonday}` created with 3 userIds
- [ ] Confirm ratio ordering: user with 0 history appears first
- [ ] Add full-week vacation for a top-3 user — verify 4th person promoted
- [ ] Add single-day vacation for a primary — verify backup fills that day only
- [ ] Daily 16:00 notification still sends with correct users
- [ ] `/parking-stats` shows correct ratios after the change

---

## Feature: Points System & Secondary Priority Queue

### Context
When a primary forfeits their spot, the replacement is currently chosen by rotation order.
This feature adds a points-based secondary queue: users with the most points are offered
forfeited spots first. Points reward responsible primary behavior and penalize no-shows.
Vacation users are excluded from the secondary list.

Points do **not** affect primary selection — that remains ratio-based.

---

### Points Rules

| Event | Delta | Who |
|---|---|---|
| Confirms spot before 18:00 | +1 | Original primary only |
| Forfeits spot before 18:00 | +1 | Original primary only |
| No-show (clicks "No" to attendance check) | -5 | All final assigned users — applied immediately on click |
| No response to attendance check by 18:00 | -1 | All final assigned users — applied at 18:00 |
| Secondary confirms/forfeits offered spot | 0 | No change |

---

### Updated Data Model

#### `users/{userId}` — updated
```ts
{
  userId: string
  displayName: string
  registeredAt: Timestamp
  isActive: boolean
  points: number        // NEW — defaults to 0
}
```

#### `parkingAssignments/{date}` — new fields
```ts
{
  originalPrimaryUsers: string[]    // immutable — set once at creation
  secondaryList: string[]           // ordered list computed at 16:00
  attendanceCheckSentAt?: Timestamp // when 12:00 message was sent
  attendedUsers: string[]           // responded "Yes, I parked"
  absentUsers: string[]             // responded "No, I didn't park"
}
```

---

### Scheduler Changes (additions to existing table)

| Job | Cron | Change |
|---|---|---|
| Daily notification | `0 16 * * 1-5` | **Modified** — compute + store + publish `secondaryList` |
| Attendance check | `0 12 * * 1-5` | **New** — sends ephemeral "Did you park today?" to today's assignees |
| Forfeit window close | `0 18 * * 1-5` | **Modified** — also closes attendance, applies -5/-1 penalties |

---

### Files to Create
- `src/services/pointsService.ts`
  - `awardPoints(userId, delta, reason)` — updates `users/{userId}.points`, logs audit
  - `getSecondaryList(date, excludeUserIds)` — active non-vacation users sorted by points desc

### Files to Modify
- `src/models/types.ts` — add `points` to `User` interface; update `ParkingAssignment` and `AuditAction`
- `src/models/constants.ts` — add `PARKED_YES`, `PARKED_NO` to `SLACK_ACTIONS`
- `src/utils/firestoreUtils.ts` — add `getUser`, `setUser`, `updateUserPoints`
- `src/services/forfeitService.ts` — award +1 to original primaries; use `secondaryList` for replacement order
- `src/services/notificationService.ts` — publish secondary list in channel message; add `sendAttendanceCheck`
- `src/services/schedulerService.ts` — add 12:00 job; extend 18:00 job to close attendance
- `src/handlers/actionHandlers.ts` — handle `PARKED_YES` / `PARKED_NO` actions

---

### Verification Checklist
- [ ] Trigger daily notification — secondary list appears in channel message sorted by points
- [ ] Primary confirms → +1 points in Firestore `users` doc
- [ ] Primary forfeits → +1 points; secondary #1 in queue receives ephemeral offer
- [ ] Secondary accepts forfeited spot — no points change
- [ ] Trigger 12:00 attendance check — assigned users receive ephemeral "Did you park today?"
- [ ] Click "No, I didn't park" — -5 applied to that user at 18:00
- [ ] Non-response by 18:00 — -1 applied to that user
- [ ] Vacation user excluded from secondary list
