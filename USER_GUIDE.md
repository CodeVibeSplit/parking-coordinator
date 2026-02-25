# Parking Coordinator — User Guide

## What is this?

Parko is a Slack bot that manages the 3 available parking spots in the office. It automatically selects who parks each week based on fairness, handles forfeits, tracks attendance, and maintains a reputation score that determines priority access to freed-up spots.

---

## How it works day-to-day

### Every Friday at 16:00 — Weekly announcement

Parko posts the **primary team for the following week** — the 3 people with the lowest ratio of days parked to days on the team and are not on vacation the entire week. These 3 have a spot every day Monday–Friday.

If one of the 3 primaries is on vacation on a specific day, their spot goes to the top person on the waiting list for that day — the same way a forfeited spot would be filled.

### Every weekday at 16:00 — Daily reminder

Parko posts a reminder for **tomorrow's** parking spots. The message shows:
- The 3 assigned users for that day
- The waiting list — people eligible to claim a forfeited spot, ordered by reputation score
- **Confirm** and **Forfeit** buttons for assigned users

### 16:00–18:00 — Forfeit window

If you have a spot but won't use it, click **Forfeit** before 18:00. Parko offers your spot to the next person on the waiting list and notifies them.

If you're keeping your spot, click **Confirm**. Both actions earn you **+1 reputation point**.

> If you neither confirm nor forfeit by 18:00, your spot is automatically forfeited. You receive no points.

### Every weekday at 12:00 — Attendance check

On the day of parking, Parko sends you a message asking whether you actually parked.

- **"Yes, I parked"** — noted, no penalty
- **"No, I didn't park"** — **−5 points**, applied immediately

If you don't respond by 18:00 — **−1 point**.

---

## How spots are assigned

Each week, Parko picks the 3 team members with the **lowest parking ratio**:

```
ratio = days parked / days since registration
```

The lower your ratio, the less you've parked relative to how long you've been on the team — so you get priority. New members start at 0 and are picked first, then naturally fall into the regular cycle.

Users on **full-week vacation** are excluded from that week's selection entirely. If a primary is only on vacation for part of the week, they are simply skipped on those days and the top person from the waiting list fills their spot — exactly like a forfeit replacement.

---

## Reputation score

Your reputation score determines your position on the **waiting list** when someone forfeits a spot. Higher score = higher priority.

| Event | Points |
|-------|--------|
| Confirmed parking before 18:00 | **+1** |
| Forfeited spot before 18:00 | **+1** |
| Didn't park (answered "No") | **−5** |
| No response to attendance check | **−1** |

Points only apply to **primary assigned users**. If you picked up a forfeited spot from the waiting list, confirming or forfeiting it does not change your score.

---

## Slack commands

All commands are ephemeral — only you can see the response.

### `/parking-stats`
Shows your personal stats:
- Days since registration
- Vacation days logged
- Total days parked
- Primary attendance ratio
- Current reputation score
- Last 3 points activity entries

### `/parking-stats all`
Shows stats for the entire team.

### `/parking-schedule`
Shows upcoming parking assignments.

```
/parking-schedule        → next 7 days
/parking-schedule 14     → next 14 days (max 30)
```

### `/parking-vacation add <start> <end>`
Register a vacation. You will be excluded from weekly selection and the waiting list for those dates. Dates use `YYYY-MM-DD` format.

```
/parking-vacation add 2026-03-10 2026-03-14
```

### `/parking-vacation list`
Lists your upcoming vacations.

### `/parking-vacation remove <id>`
Removes a vacation. Get the ID from `/parking-vacation list`.

---

## Admin commands

These commands are restricted to admins only.

### `/parking-admin-add-member @user`
Adds a new team member. Their registration date is set to today and their ratio starts at 0 — they will be picked in the next weekly selection.

### `/parking-admin-remove-member @user`
Removes a team member. They are marked inactive and excluded from all future selections and waiting lists.

### `/parking-admin-override <YYYY-MM-DD> @user1 @user2 @user3`
Manually overrides the parking assignment for a specific date.

---

## FAQ

**When will I know if I have a spot next week?**
Every Friday at 16:00, Parko announces the 3 primary users for the following week.

**What if I'm on the waiting list and get a spot?**
You'll receive a message from Parko with Confirm and Forfeit buttons. The same 16:00–18:00 window applies.

**What if I forget to respond to the attendance check?**
A −1 point penalty is applied at 18:00. Consistent non-responses lower your waiting list position over time.

**What if I didn't park but the system thinks I did?**
Use the attendance check buttons at 12:00. If the window has passed, contact an admin.

**What happens if I don't confirm or forfeit by 18:00?**
Your spot is automatically forfeited and given to the next person on the waiting list. You receive no points.

**I'm going on vacation — do I need to do anything?**
Yes — register it with `/parking-vacation add` before it starts. If your vacation covers the full week (Mon–Fri), you won't be picked as a primary that week. If it's only a few days, you'll still be a primary but skipped on your vacation days — the top person from the waiting list fills in for those days.

**I just joined the team — when will I get my first spot?**
Your ratio starts at 0, which is the lowest possible. You'll be selected in the very next weekly announcement.
