    // Discord Oauth Proxy
    // Copyright (C) 2025  shigbeard <shigbeard@shigbeard.xyz> (https://ozfortress.com)

    // This program is free software: you can redistribute it and/or modify
    // it under the terms of the GNU General Public License as published by
    // the Free Software Foundation, either version 3 of the License, or
    // (at your option) any later version.

    // This program is distributed in the hope that it will be useful,
    // but WITHOUT ANY WARRANTY; without even the implied warranty of
    // MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    // GNU General Public License for more details.

    // You should have received a copy of the GNU General Public License
    // along with this program.  If not, see <https://www.gnu.org/licenses/>.

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3004;

// Trust proxy to get real IP addresses
app.set('trust proxy', true);

// Track failed login attempts
const failedAttempts = new Map(); // userId -> { count, username, lastAttempt }
const ipCooldowns = new Map(); // IP -> lastAttempt timestamp
const attemptsFilePath = path.join(__dirname, 'failed_attempts.json');

// Load persisted failed attempts on startup
function loadFailedAttempts() {
  try {
    if (fs.existsSync(attemptsFilePath)) {
      const data = fs.readFileSync(attemptsFilePath, 'utf8');
      const attempts = JSON.parse(data);

      // Only load attempts from the last 24 hours to prevent permanent bans
      const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);

      for (const [userId, attemptData] of Object.entries(attempts)) {
        if (attemptData.lastAttempt > twentyFourHoursAgo) {
          failedAttempts.set(userId, attemptData);
        }
      }

      console.log(`Loaded ${failedAttempts.size} persisted failed attempts`);
    }
  } catch (error) {
    console.error('Error loading failed attempts:', error.message);
  }
}

// Save failed attempts to file
function saveFailedAttempts() {
  try {
    const attemptsObj = {};
    for (const [userId, attemptData] of failedAttempts.entries()) {
      attemptsObj[userId] = attemptData;
    }
    fs.writeFileSync(attemptsFilePath, JSON.stringify(attemptsObj, null, 2));
  } catch (error) {
    console.error('Error saving failed attempts:', error.message);
  }
}

// Load failed attempts on startup
loadFailedAttempts();

// Cleanup old attempts every hour (older than 24 hours)
setInterval(() => {
  const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
  let cleanedCount = 0;

  for (const [userId, attemptData] of failedAttempts.entries()) {
    if (attemptData.lastAttempt < twentyFourHoursAgo) {
      failedAttempts.delete(userId);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(`Cleaned up ${cleanedCount} old failed attempts`);
    saveFailedAttempts();
  }
}, 60 * 60 * 1000); // Run every hour

// Function to check if IP is on cooldown (to prevent Discord rate limiting)
function getIpCooldownInfo(ip) {
  const lastAttempt = ipCooldowns.get(ip);
  if (!lastAttempt) return { onCooldown: false, remainingTime: 0 };

  const cooldownTime = 30 * 1000; // 30 seconds cooldown
  const timeSinceLastAttempt = Date.now() - lastAttempt;
  const remainingTime = cooldownTime - timeSinceLastAttempt;

  return {
    onCooldown: remainingTime > 0,
    remainingTime: Math.max(0, Math.ceil(remainingTime / 1000)) // Convert to seconds
  };
}

// Function to send Discord webhook notification
async function sendWebhookNotification(type, userId, username, attempts = null, accessGranted = null) {
  const webhookLevel = parseInt(process.env.WEBHOOK_LEVEL) || 1;

  // Check if webhook should be sent based on level and type
  if (webhookLevel === 0) return; // Webhooks disabled
  if (type === 'rate_limit' && webhookLevel < 1) return;
  if (type === 'successful_login' && webhookLevel < 2) return;
  if (type === 'failed_attempt' && webhookLevel < 3) return;

  console.log(`Attempting to send webhook notification (${type}) for user ${username} (${userId})`);

  if (!process.env.DISCORD_WEBHOOK_URL) {
    console.log('No webhook URL configured, skipping notification');
    return;
  }

  console.log(`Webhook URL found, sending ${type} notification...`);

  try {
    let embed = {};

    switch (type) {
      case 'rate_limit':
        embed = {
          title: "🚫 Rate Limit Triggered",
          description: `User **${username}** (ID: \`${userId}\`) has triggered rate limiting after ${attempts} failed login attempts.`,
          color: 0xff6b6b, // Red color
          timestamp: new Date().toISOString(),
          footer: { text: "Discord OAuth Proxy Auth" },
          fields: [
            { name: "User ID", value: userId, inline: true },
            { name: "Username", value: username, inline: true },
            { name: "Failed Attempts", value: attempts.toString(), inline: true }
          ]
        };
        break;

      case 'successful_login':
        embed = {
          title: "✅ Successful Login",
          description: `User **${username}** (ID: \`${userId}\`) has successfully authenticated.`,
          color: 0x4ecdc4, // Green/teal color
          timestamp: new Date().toISOString(),
          footer: { text: "Discord OAuth Proxy Auth" },
          fields: [
            { name: "User ID", value: userId, inline: true },
            { name: "Username", value: username, inline: true },
            { name: "Status", value: "Access Granted", inline: true }
          ]
        };
        break;

      case 'failed_attempt':
        embed = {
          title: "❌ Failed Login Attempt",
          description: `User **${username}** (ID: \`${userId}\`) failed authentication (attempt ${attempts}).`,
          color: 0xffa500, // Orange color
          timestamp: new Date().toISOString(),
          footer: { text: "Discord OAuth Proxy Auth" },
          fields: [
            { name: "User ID", value: userId, inline: true },
            { name: "Username", value: username, inline: true },
            { name: "Attempt Count", value: attempts.toString(), inline: true }
          ]
        };
        break;
    }

    const response = await axios.post(process.env.DISCORD_WEBHOOK_URL, {
      embeds: [embed]
    });

    console.log(`Webhook notification (${type}) sent successfully for user ${username} (${userId}). Status: ${response.status}`);
  } catch (error) {
    console.error(`Failed to send webhook notification (${type}):`, error.response?.data || error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
    }
  }
}

// Session configuration
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'fallback-secret-key',
  resave: false,
  saveUninitialized: false,
  name: 'discord.oauth.sid', // Custom session name
  cookie: {
    secure: false, // Set to false for now to allow HTTP testing
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax' // Important for OAuth redirects
  }
};

// Session store configuration (Redis > File > Memory)
if (process.env.REDIS_HOST) {
  console.log('Using Redis for session storage');
  const redis = require('redis');
  const RedisStore = require('connect-redis').default;

  const redisClient = redis.createClient({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD
  });

  redisClient.connect().catch(console.error);
  sessionConfig.store = new RedisStore({ client: redisClient });
} else if (process.env.NODE_ENV === 'production') {
  console.log('Using file-based session storage for production');
  const session = require('express-session');
  const FileStore = require('session-file-store')(session);
  sessionConfig.store = new FileStore({
    path: './sessions',
    ttl: 86400, // 24 hours
    retries: 0
  });
} else {
  console.log('Using memory-based session storage for development');
}

app.use(session(sessionConfig));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static('public'));

// Passport Discord Strategy
passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: process.env.DISCORD_CALLBACK_URL,
  scope: ['identify', 'guilds']
}, async (accessToken, refreshToken, profile, done) => {
  console.log('Authenticating user:', profile.username);
  try {
    // Check if user is in the required guild with the required role
    const hasAccess = await checkUserAccess(profile.id, accessToken);

    if (hasAccess) {
      console.log('Access granted for user:', profile.username);
      // Clear failed attempts on successful login
      failedAttempts.delete(profile.id);
      saveFailedAttempts();

      // Send successful login webhook if level 2 or 3
      sendWebhookNotification('successful_login', profile.id, profile.username);

      return done(null, {
        id: profile.id,
        username: profile.username,
        discriminator: profile.discriminator,
        avatar: profile.avatar,
        accessToken: accessToken
      });
    } else {
      console.log('Access denied for user:', profile.username);

      // Track failed attempts
      const currentAttempts = failedAttempts.get(profile.id) || { count: 0, username: profile.username, lastAttempt: 0 };
      currentAttempts.count++;
      currentAttempts.username = profile.username;
      currentAttempts.lastAttempt = Date.now();
      failedAttempts.set(profile.id, currentAttempts);

      // Save failed attempts to file
      saveFailedAttempts();

      // Send webhook notifications based on level
      if (currentAttempts.count >= 3) {
        console.log(`User ${profile.username} (${profile.id}) has reached ${currentAttempts.count} failed attempts - triggering rate limit webhook`);
        sendWebhookNotification('rate_limit', profile.id, profile.username, currentAttempts.count);
      } else {
        console.log(`User ${profile.username} (${profile.id}) has ${currentAttempts.count} failed attempts - not yet at threshold`);
        // Send failed attempt webhook if level 3 (all attempts)
        sendWebhookNotification('failed_attempt', profile.id, profile.username, currentAttempts.count);
      }

      return done(null, false, {
        message: 'User does not have required guild membership or role',
        userId: profile.id,
        username: profile.username,
        attempts: currentAttempts.count
      });
    }
  } catch (error) {
    console.error('Error during authentication:', error.message);
    return done(error, null);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  // In a real application, you might want to store user data in a database
  // For now, we'll just pass the ID
  done(null, { id });
});

// Helper function to check if user has access
async function checkUserAccess(userId, accessToken) {
  try {
    // Check if user is in the required guild
    const guildsResponse = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const isInGuild = guildsResponse.data.some(guild => guild.id === process.env.DISCORD_GUILD_ID);

    if (!isInGuild) {
      console.log(`User ${userId} not in required guild`);
      return false;
    }

    // Check if user has the required role using bot token
    if (process.env.DISCORD_BOT_TOKEN) {
      const memberResponse = await axios.get(
        `https://discord.com/api/guilds/${process.env.DISCORD_GUILD_ID}/members/${userId}`,
        {
          headers: {
            'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`
          }
        }
      );

      const hasRequiredRole = memberResponse.data.roles.includes(process.env.DISCORD_ROLE_ID);

      if (!hasRequiredRole) {
        console.log(`User ${userId} does not have required role`);
        return false;
      }
    }

    console.log(`User ${userId} access granted`);
    return true;
  } catch (error) {
    console.error('Error checking user access:', error.response?.data || error.message);
    return false;
  }
}

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).send('Unauthorized');
}

// Routes

// Auth endpoint for nginx auth_request
app.get('/auth', (req, res) => {
  if (req.isAuthenticated()) {
    res.status(200).send('OK');
  } else {
    res.status(401).send('Unauthorized');
  }
});

// Login endpoint
app.get('/login', (req, res) => {
  if (req.isAuthenticated()) {
    // Already logged in, redirect to original URL or home
    const originalUrl = req.query.rd || '/';
    return res.redirect(originalUrl);
  }

  // Check for error messages
  let errorMessage = null;
  if (req.query.error === 'auth_failed') {
    errorMessage = 'Authentication failed. You may not have the required role or guild membership.';
  } else if (req.query.error === 'too_many_attempts' && req.query.username) {
    errorMessage = `Stop trying to log in ${decodeURIComponent(req.query.username)} 😤`;
  } else if (req.query.error === 'rate_limited' && req.query.remaining) {
    const remainingTime = parseInt(req.query.remaining);
    errorMessage = `Hey, you're trying too quickly! Please try again in ${remainingTime} second${remainingTime !== 1 ? 's' : ''}.`;
  }
  // Load CSS from styles.css - injected directly for simplicity
  const css = fs.readFileSync(path.join(__dirname, 'view', 'style.css'), 'utf8');
  var page = fs.readFileSync(path.join(__dirname, 'view', 'page.html'), 'utf8');
  if (errorMessage) {
    page = page.replace('<!-- ERROR_PLACEHOLDER -->', `<div class="error-notice">${errorMessage}</div>`);
  }
  page = page.replace('/* CSS_PLACEHOLDER */', css);
  // Serve login page
  res.send(page);
});

// Discord OAuth routes
app.get('/auth/discord', (req, res, next) => {
  const clientIp = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
  console.log(`Starting Discord OAuth flow for IP: ${clientIp}`);

  // Check if this IP is on cooldown to prevent Discord rate limiting
  const cooldownInfo = getIpCooldownInfo(clientIp);
  if (cooldownInfo.onCooldown) {
    console.log(`IP ${clientIp} is on cooldown, rejecting OAuth attempt (${cooldownInfo.remainingTime}s remaining)`);
    return res.redirect(`/login?error=rate_limited&remaining=${cooldownInfo.remainingTime}`);
  }

  // Track this IP's attempt
  ipCooldowns.set(clientIp, Date.now());

  passport.authenticate('discord')(req, res, next);
});

app.get('/callback', (req, res, next) => {
  console.log('Discord callback received');
  passport.authenticate('discord', (err, user, info) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      // Authentication failed, check if we have attempt info
      let redirectUrl = '/login?error=auth_failed';
      if (info && info.attempts >= 3) {
        redirectUrl = `/login?error=too_many_attempts&username=${encodeURIComponent(info.username)}`;
      }
      return res.redirect(redirectUrl);
    }
    // Authentication successful
    req.logIn(user, (err) => {
      if (err) {
        return next(err);
      }
      const originalUrl = req.session.returnTo || '/';
      delete req.session.returnTo;
      return res.redirect(originalUrl);
    });
  })(req, res, next);
});

// Logout endpoint
app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    req.session.destroy(() => {
      res.redirect('/login');
    });
  });
});

// Status endpoint for debugging
app.get('/status', isAuthenticated, (req, res) => {
  res.json({
    authenticated: true,
    user: req.user,
    session: req.sessionID
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).send('Internal Server Error');
});

// Start server
app.listen(PORT, () => {
  console.log(`Discord OAuth Proxy Auth server running on port ${PORT}`);
  console.log(`Required Guild ID: ${process.env.DISCORD_GUILD_ID}`);
  console.log(`Required Role ID: ${process.env.DISCORD_ROLE_ID}`);
  console.log(`Discord Client ID: ${process.env.DISCORD_CLIENT_ID}`);
  console.log(`Callback URL: ${process.env.DISCORD_CALLBACK_URL}`);
  console.log(`Bot Token configured: ${process.env.DISCORD_BOT_TOKEN ? 'Yes' : 'No'}`);
  console.log(`Webhook URL configured: ${process.env.DISCORD_WEBHOOK_URL ? 'Yes' : 'No'}`);
  console.log(`Webhook Level: ${process.env.WEBHOOK_LEVEL || '1'} (0=off, 1=rate limit only, 2=+successful logins, 3=all attempts)`);
  console.log(`Failed attempts persistence: Enabled (${attemptsFilePath})`);
  if (process.env.DISCORD_WEBHOOK_URL) {
    console.log(`Webhook URL: ${process.env.DISCORD_WEBHOOK_URL.substring(0, 50)}...`);
  }
});
