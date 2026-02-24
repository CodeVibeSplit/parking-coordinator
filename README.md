# Parking Coordinator Slack App

A Slack app for coordinating office parking spots with automatic rotation, vacation management, and forfeit functionality.

## Features

- **Automatic Rotation**: Fair weekly rotation system among team members
- **Daily Notifications**: Automated messages at 16:00 showing tomorrow's parking assignments
- **Forfeit System**: 2-hour window to forfeit spots with automatic cascading to next person
- **Vacation Management**: Self-service vacation tracking that adjusts rotation
- **Statistics Tracking**: Balance and fairness metrics for all team members
- **Admin Override**: Manual assignment control for special circumstances

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Firebase project with Firestore enabled
- Slack workspace with admin access

### Installation

1. **Clone and install dependencies:**
```bash
npm install
```

2. **Set up Firebase:**
   - Create a Firebase project at https://console.firebase.google.com
   - Enable Firestore database (Native mode)
   - Generate a service account key:
     - Go to Project Settings → Service Accounts
     - Click "Generate New Private Key"
     - Save the JSON file

3. **Create Slack app:**
   - Go to https://api.slack.com/apps
   - Click "Create New App" → "From scratch"
   - Name it (e.g., "Parking Coordinator") and select your workspace
   - Configure OAuth scopes (see Slack App Configuration section below)
   - **Important:** After adding scopes, click "Install to Workspace" at the top

4. **Find your Slack IDs:**

   **Channel ID** (where notifications will be posted):
   - Right-click on the channel in Slack → "View channel details"
   - Scroll down to find "Channel ID" (starts with `C` like `C01ABC123DE`)
   - Make sure the channel is created and your bot is invited: `/invite @YourBotName`

   **User IDs** (for team members):
   - Click on a user's profile in Slack
   - Click "More" → "Copy member ID" (starts with `U` like `U01ABC123DE`)

5. **Configure environment variables:**
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
- `SLACK_BOT_TOKEN`: From Slack app OAuth page (starts with `xoxb-`)
- `SLACK_SIGNING_SECRET`: From Slack app Basic Information page
- `SLACK_APP_TOKEN`: From Slack app Basic Information page (starts with `xapp-`)
- `NOTIFICATION_CHANNEL_ID`: Your channel ID (starts with `C`)
- `ADMIN_USER_IDS`: Comma-separated user IDs who can use admin commands
- Firebase credentials from the JSON file you downloaded
- `PORT`: 3333 (or your preferred port)

6. **Update team members:**

Edit `scripts/initializeFirestore.ts` and replace the team member IDs with your actual user IDs:
```typescript
const teamMembers = [
  'U01ABC123', // Replace with actual user IDs
  'U01DEF456',
  'U01GHI789',
  'U01JKL012',
  'U01MNO345',
];
```

7. **Initialize Firestore:**
```bash
npm run init-db
```

8. **Create required Firestore index:**

When you first run the app, you'll see an error about a missing index. Click the URL in the error message or manually create a composite index:
- Collection: `vacations`
- Fields: `endDate` (Ascending), `startDate` (Ascending)

9. **Start the application:**
```bash
npm run dev
```

10. **Expose to Slack (for local development):**

Install and run ngrok:
```bash
brew install ngrok  # or download from ngrok.com
ngrok http 3333
```

Copy the `https://` URL (e.g., `https://abc123.ngrok-free.app`) and update your Slack app:
- Go to https://api.slack.com/apps → Your App
- Update all slash command URLs to: `https://your-ngrok-url.ngrok-free.app/slack/events`
- Update Interactivity URL to: `https://your-ngrok-url.ngrok-free.app/slack/events`

11. **Test the setup:**
```bash
npm run test-notification
```

This will send a test parking notification to your channel. Check Slack to verify it works!

## Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_SIGNING_SECRET=your-signing-secret-here
SLACK_APP_TOKEN=xapp-your-app-token-here
NOTIFICATION_CHANNEL_ID=C01ABC123DE  # Channel ID (starts with C)

# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com

# App Configuration
ADMIN_USER_IDS=U01ABC123,U01DEF456  # Comma-separated Slack user IDs
TIMEZONE=Europe/Zagreb
PORT=3333
NODE_ENV=development
```

### Team Members

The rotation order is defined during initialization in `scripts/initializeFirestore.ts`:
```typescript
const teamMembers = [
  'U06MU0GR1S8',
  'UQ6BDGF8W',
  'UP2A93ZRC',
  'U07MG81CV9D',
  'U01EHTVEGQG',
];
```

## Slack App Configuration

### OAuth Scopes

Add these Bot Token Scopes in your Slack app settings (OAuth & Permissions):

**Required Scopes:**
- `chat:write` - Send messages to channels
- `chat:write.public` - Send messages to channels without joining
- `commands` - Add slash commands
- `users:read` - View people in workspace

### Slash Commands

Create these slash commands in your Slack app (Slash Commands section):

1. `/parking-schedule`
   - Request URL: `https://your-server.com/slack/events`
   - Short Description: View upcoming parking assignments

2. `/parking-vacation`
   - Request URL: `https://your-server.com/slack/events`
   - Short Description: Manage your vacation periods

3. `/parking-stats`
   - Request URL: `https://your-server.com/slack/events`
   - Short Description: View parking statistics

4. `/parking-admin-override`
   - Request URL: `https://your-server.com/slack/events`
   - Short Description: Admin only - manually override assignments

5. `/parking-admin-reorder`
   - Request URL: `https://your-server.com/slack/events`
   - Short Description: Admin only - reorder team rotation

### Event Subscriptions

Enable Event Subscriptions and set Request URL to: `https://your-server.com/slack/events`

Subscribe to bot events:
- `message.channels` (if you want the bot to respond to messages)

### Interactivity

Enable Interactivity & Shortcuts:
- Request URL: `https://your-server.com/slack/events`

## Usage

### Daily Workflow

1. **16:00 (4 PM)**: App posts tomorrow's parking assignments to the channel
2. **16:00 - 18:00 (6 PM)**: Users can forfeit their spots via button
3. **18:00**: Forfeit window closes, assignments finalized, rotation advances

### Commands

#### View Parking Schedule
```
/parking-schedule [days]
```
Shows parking assignments starting from today (default: 7 days including today)

**Examples:**
- `/parking-schedule` - 7 days starting today
- `/parking-schedule 14` - 14 days starting today

#### Manage Vacations
```
/parking-vacation add <YYYY-MM-DD> <YYYY-MM-DD>
/parking-vacation list
/parking-vacation remove <vacation-id>
```

**Examples:**
- `/parking-vacation add 2026-03-01 2026-03-07` - Add week vacation
- `/parking-vacation list` - View your vacations
- `/parking-vacation remove abc123` - Remove vacation by ID

#### View Statistics
```
/parking-stats [user-id]
/parking-stats all
```

**Examples:**
- `/parking-stats` - Your statistics
- `/parking-stats U123456` - Specific user's statistics
- `/parking-stats all` - All users' statistics

#### Admin Override
```
/parking-admin-override <YYYY-MM-DD> <user1> [user2] [user3]
```

**Example:**
- `/parking-admin-override 2026-02-24 U123 U456 U789`

#### Admin Reorder (Admin Only)
```
/parking-admin-reorder
```

Opens an interactive modal where admins can reorder the parking assignment for a specific day using up/down buttons.

**Usage:**
1. Run `/parking-admin-reorder`
2. A date picker modal opens - select the date you want to reorder
3. Click "Next" to see the assigned users for that date with team member names (not IDs)
4. Use ⬆️ and ⬇️ buttons to move team members up or down in the assignment order
5. Click "Save Order" to apply the changes

**Example:**
- `/parking-admin-reorder` - Opens the date selection modal

**Note:** This only reorders the assignment for a specific date, not the global rotation order.

### Forfeiting a Spot

1. Wait for the 16:00 daily notification
2. Click "Forfeit My Spot" button
3. Confirmation message appears
4. Next person in rotation is automatically notified
5. They can also forfeit if needed (cascade continues)

## Architecture

### Services

- **rotationService**: Core rotation algorithm and assignment calculation
- **vacationService**: Vacation period management
- **forfeitService**: Forfeit cascade logic with transactions
- **schedulerService**: Cron jobs for daily tasks
- **balanceService**: Statistics and fairness calculations
- **notificationService**: Slack message formatting

### Data Model

**Config** (singleton):
- Team members and rotation order
- Available spots (3)
- Notification time and forfeit window

**RotationState** (singleton):
- Current week start date
- Active members for this week
- Current rotation index

**Vacations**:
- User ID, start/end dates
- Weeks covered

**ParkingAssignments**:
- Date, assigned users, forfeited users
- Notification timestamp
- Finalization status

**ParkingHistory**:
- Individual parking records
- Used for statistics and balancing

## Development

### Running Tests
```bash
npm test
npm run test:watch
```

### Linting
```bash
npm run lint
npm run lint:fix
```

### Building
```bash
npm run build
npm start
```

### Manual Testing

**Test daily notification:**
```bash
npm run test-notification
```

This sends tomorrow's parking assignment to your Slack channel with the forfeit button.

**Test Slack commands:**
```
/parking-schedule        # View upcoming assignments
/parking-stats          # View your statistics
/parking-vacation list  # List your vacations
```

**Programmatic testing:**
```typescript
import { triggerDailyNotification, triggerForfeitWindowClose } from './src/services/schedulerService';

// Send today's notification
await triggerDailyNotification();

// Close forfeit window and advance rotation
await triggerForfeitWindowClose();
```

## Deployment

### Production Deployment Checklist

Before deploying to production:

1. **Get a server with a fixed domain** (Heroku, Railway, DigitalOcean, AWS, etc.)
2. **Update Slack app URLs** from ngrok to your production domain
3. **Set all environment variables** on your server (never commit .env to git)
4. **Ensure Firestore indexes** are created
5. **Verify timezone** is correct for your team
6. **Test all commands** in production environment
7. **Monitor logs** for the first few days

### Using Node.js Server

1. Build the application:
```bash
npm run build
```

2. Set environment variables on your server

3. Run the built application:
```bash
npm start
```

### Using Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
CMD ["node", "dist/index.js"]
```

Build and run:
```bash
docker build -t parking-coordinator .
docker run -p 3333:3333 --env-file .env parking-coordinator
```

### Using PM2

```bash
npm install -g pm2
npm run build
pm2 start dist/index.js --name parking-coordinator
pm2 save
pm2 startup
```

View logs:
```bash
pm2 logs parking-coordinator
```

### Hosting Options

**Easy options for small teams:**
- **Railway.app**: Simple deployment, free tier available
- **Render.com**: Free tier with auto-deploy from Git
- **Fly.io**: Free tier, good for Node.js apps

**Traditional cloud:**
- **Heroku**: Easy setup, paid plans
- **DigitalOcean**: $5/month droplet
- **AWS EC2/ECS**: More complex but scalable

**Important**: After deploying, update your Slack app URLs:
1. Go to https://api.slack.com/apps → Your App
2. Update all slash command Request URLs
3. Update Interactivity Request URL
4. Update Event Subscriptions Request URL (if enabled)

## Troubleshooting

### "channel_not_found" error
- **Cause**: Invalid channel ID or bot not invited to channel
- **Fix**:
  1. Verify channel ID starts with `C` (not `D` which is for DMs)
  2. Right-click channel → View channel details → Copy Channel ID
  3. Invite bot to channel: `/invite @YourBotName`

### "dispatch_failed" when running slash commands
- **Cause**: Slack can't reach your server
- **Fix**:
  1. Ensure server is running (`npm run dev`)
  2. Ensure ngrok is running (`ngrok http 3333`)
  3. Update all Slack command URLs with your ngrok URL
  4. Restart both server and ngrok if URLs changed

### "The query requires an index" error
- **Cause**: Missing Firestore composite index
- **Fix**:
  1. Click the URL in the error message (opens Firebase Console)
  2. Click "Create Index" button
  3. Wait 1-2 minutes for index to build
  4. Retry the operation

### Notifications not sending
- Check scheduler is initialized (logs should show "Scheduler initialized")
- Verify timezone is correct in `.env`
- Ensure Slack bot token has `chat:write` scope
- Verify bot is invited to the notification channel
- Check server logs for errors at 16:00

### Forfeit button not working
- Check Interactivity is enabled in Slack app settings
- Verify Request URL is accessible from Slack servers (test with ngrok)
- Ensure ngrok session hasn't expired (free tier times out)
- Check Firestore transactions aren't timing out

### Rotation not advancing
- Check 18:00 cron job is running (logs at 18:00)
- Verify assignments are being finalized
- Check for errors in audit log
- Ensure server hasn't been restarted (cron jobs reset)

### Vacations not excluding users
- Verify vacation dates are in correct format (YYYY-MM-DD)
- Check vacation spans the entire week
- Review `weeksCovered` calculation in database
- Run `/parking-vacation list` to verify vacation was added

### ngrok URL keeps changing
- **Cause**: Free ngrok tier generates new URL on each restart
- **Fix**:
  1. Get a paid ngrok account for fixed domains
  2. Or update Slack URLs each time ngrok restarts
  3. For production, deploy to a server with a fixed domain

## Support

For issues or questions, check:
- Application logs: `pm2 logs parking-coordinator` (if using PM2)
- Firestore audit log for action history
- Slack app event logs at https://api.slack.com/apps

## License

MIT