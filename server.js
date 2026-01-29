const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Google OAuth configuration
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI // Will be set after Railway deployment
);

// In-memory token storage (upgrade to DB later)
let storedTokens = null;

// Scopes for Calendar access
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
];

// Routes

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Google Calendar OAuth',
    version: '1.0.0',
    authenticated: !!storedTokens
  });
});

// 1. Start OAuth flow
app.get('/auth', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // Force consent screen to get refresh token
  });
  
  res.redirect(authUrl);
});

// 2. Handle OAuth callback
app.get('/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).json({ error: 'No authorization code received' });
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    storedTokens = tokens;
    
    res.json({
      success: true,
      message: 'Successfully authenticated with Google Calendar!',
      expiresAt: tokens.expiry_date
    });
  } catch (error) {
    console.error('Error during OAuth callback:', error);
    res.status(500).json({ error: 'Failed to authenticate' });
  }
});

// 3. Get calendar events
app.get('/events', async (req, res) => {
  if (!storedTokens) {
    return res.status(401).json({ error: 'Not authenticated. Call /auth first.' });
  }

  try {
    oauth2Client.setCredentials(storedTokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime'
    });

    res.json({
      success: true,
      events: response.data.items
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});
// 4. Create calendar event
app.post('/events', async (req, res) => {
  if (!storedTokens) {
    return res.status(401).json({ error: 'Not authenticated. Call /auth first.' });
  }

  const { summary, start, end, description } = req.body;

  if (!summary || !start || !end) {
    return res.status(400).json({ error: 'Missing required fields: summary, start, end' });
  }

  try {
    oauth2Client.setCredentials(storedTokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const event = {
      summary,
      description,
      start: {
        dateTime: start,
        timeZone: 'Asia/Seoul'
      },
      end: {
        dateTime: end,
        timeZone: 'Asia/Seoul'
      }
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event
    });

    res.json({
      success: true,
      event: response.data
    });
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// 5. Update calendar event
app.put('/events/:eventId', async (req, res) => {
  if (!storedTokens) {
    return res.status(401).json({ error: 'Not authenticated. Call /auth first.' });
  }

  const { eventId } = req.params;
  const { summary, start, end, description } = req.body;

  try {
    oauth2Client.setCredentials(storedTokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    const event = {
      summary,
      description,
      start: start ? {
        dateTime: start,
        timeZone: 'Asia/Seoul'
      } : undefined,
      end: end ? {
        dateTime: end,
        timeZone: 'Asia/Seoul'
      } : undefined
    };

    // Remove undefined fields
    Object.keys(event).forEach(key => event[key] === undefined && delete event[key]);

    const response = await calendar.events.update({
      calendarId: 'primary',
      eventId,
      resource: event
    });

    res.json({
      success: true,
      event: response.data
    });
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// 6. Delete calendar event
app.delete('/events/:eventId', async (req, res) => {
  if (!storedTokens) {
    return res.status(401).json({ error: 'Not authenticated. Call /auth first.' });
  }

  const { eventId } = req.params;

  try {
    oauth2Client.setCredentials(storedTokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    await calendar.events.delete({
      calendarId: 'primary',
      eventId
    });

    res.json({
      success: true,
      message: 'Event deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// Check authentication status
app.get('/status', (req, res) => {
  res.json({
    authenticated: !!storedTokens,
    tokenExpiry: storedTokens?.expiry_date || null
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Google Calendar OAuth service running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔐 Client ID: ${process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Not set'}`);
  console.log(`🔑 Client Secret: ${process.env.GOOGLE_CLIENT_SECRET ? 'Set' : 'Not set'}`);
  console.log(`🔗 Redirect URI: ${process.env.REDIRECT_URI || 'Not set'}`);
});
