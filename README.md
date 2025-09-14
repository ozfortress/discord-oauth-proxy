# Discord OAuth Proxy

A Discord OAuth proxy for use with nginx. Checks if a user has a role in a server. Pretty barebones.

You may have to modify the nginx config to suit your application. We assume you're injecting this proxy in front of an existing reverse proxy configuration. This shouldn't be too difficult to do.

## Features

- **Role-Based Access**: Only users with a specific role in a specified guild can authenticate
- **Rate Limiting**: Prevents abuse with IP-based cooldowns and persistent failed attempts tracking.

For security reasons, you should make the contents of the public folder read-only. Not that I can conceive of any attack vector for getting malicious code into this folder, but it's better that any folder with static assets be read-only.

The folder itself needs execute permissions but the files inside do not. And the folder should not be writable.

Note - we use a static route for the logo asset. You will need to replace the route for this in nginx if you change the filename or location.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Copy `.env.example` to `.env` and configure your Discord application settings:

```bash
cp .env.example .env
```

Edit `.env` with your Discord application settings:

```env
# Discord OAuth App Settings
DISCORD_CLIENT_ID=your_discord_client_id_here
DISCORD_CLIENT_SECRET=your_discord_client_secret_here
DISCORD_CALLBACK_URL=https://yourdomain.com/callback

# Required Guild and Role
DISCORD_GUILD_ID=your_discord_guild_id_here
DISCORD_ROLE_ID=your_discord_role_id_here

# Session Configuration
SESSION_SECRET=your_super_secret_session_key_here

# Optional: Webhook notifications
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your_webhook_id/your_webhook_token
WEBHOOK_LEVEL=1
```
- `DISCORD_ROLE_ID` - Required role ID
- `DISCORD_BOT_TOKEN` - Discord bot token for API calls
- `SESSION_SECRET` - Secret key for session encryption
- `REDIS_HOST` - (Optional) Redis host for session storage

### 3. Discord Application Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to OAuth2 settings and add redirect URI: `https://yourdomain.com/callback`
4. Copy the Client ID and Client Secret to your `.env` file
5. Create a bot and copy the bot token to your `.env` file

### 4. nginx Configuration

Copy the provided `nginx.conf` to your nginx sites directory and update it:

```bash
# Copy the example configuration
sudo cp nginx.conf /etc/nginx/sites-available/your-site

# Edit the configuration
sudo nano /etc/nginx/sites-available/your-site

# Update server_name to your domain
# Update SSL certificate paths if using HTTPS

# Enable the site
sudo ln -s /etc/nginx/sites-available/your-site /etc/nginx/sites-enabled/

# Test and reload nginx
sudo nginx -t
sudo systemctl reload nginx
```

### 5. Running the Application

```bash
# Start the application
npm run pm2:start

# View logs
npm run pm2:logs

# Restart the application
npm run restart
# or
npm run pm2:restart

# Stop the application
npm run pm2:stop

# View status
npm run pm2:status
```

## Configuration Options

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DISCORD_CLIENT_ID` | Discord OAuth app client ID | - | Yes |
| `DISCORD_CLIENT_SECRET` | Discord OAuth app client secret | - | Yes |
| `DISCORD_CALLBACK_URL` | OAuth callback URL | - | Yes |
| `DISCORD_GUILD_ID` | Required Discord guild ID | - | Yes |
| `DISCORD_ROLE_ID` | Required Discord role ID | - | Yes |
| `DISCORD_BOT_TOKEN` | Discord bot token for API calls | - | Yes |
| `SESSION_SECRET` | Secret key for session encryption | - | Yes |
| `PORT` | Application port | 3004 | No |
| `NODE_ENV` | Environment mode | development | No |
| `REDIS_HOST` | Redis host for session storage | - | No |
| `REDIS_PORT` | Redis port | 6379 | No |
| `REDIS_PASSWORD` | Redis password | - | No |
| `DISCORD_WEBHOOK_URL` | Discord webhook for notifications | - | No |
| `WEBHOOK_LEVEL` | Webhook notification level (0-3) | 1 | No |

### Webhook Levels

- **0**: Disabled - No webhook notifications
- **1**: Rate limit only - Notifications when users hit 3+ failed attempts
- **2**: Rate limit + successful logins - Above + successful authentications
- **3**: All attempts - Every authentication attempt (failed, successful, rate limited)

## Session Storage

The application supports multiple session storage options:

- **Development**: Memory-based sessions (default for NODE_ENV=development)
- **Production**: File-based sessions (default for NODE_ENV=production)
- **Redis**: Configure REDIS_HOST to use Redis for session storage

## Rate Limiting & Security

- **IP Cooldowns**: 30-second cooldown between OAuth attempts per IP
- **Failed Attempt Tracking**: Persistent tracking of failed login attempts
- **Automatic Cleanup**: Old attempts (24+ hours) are automatically removed
- **Funny Messages**: Custom rate limit messages after 3+ failed attempts

## Webhook Notifications

Configure Discord webhooks to monitor authentication events:

```env
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your_webhook_id/your_webhook_token
WEBHOOK_LEVEL=1
```

## Custom Branding

Replace `public/logo.jpg` with your own logo to customize the login page branding.

### Logs

```bash
# View PM2 logs
npm run pm2:logs

# View specific log files
tail -f logs/error.log
tail -f logs/out.log
```
