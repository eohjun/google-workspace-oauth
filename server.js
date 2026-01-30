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
  process.env.REDIRECT_URI
);

// In-memory token storage (upgrade to DB later)
let storedTokens = null;

// Scopes for Google Workspace access
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly'
];

// ====================
// Health Check
// ====================
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Google Workspace OAuth',
    version: '2.0.0',
    authenticated: !!storedTokens
  });
});

// ====================
// OAuth
// ====================

// Start OAuth flow
app.get('/auth', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  res.redirect(authUrl);
});

// Handle OAuth callback
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
      message: 'Successfully authenticated with Google Workspace!',
      expiresAt: tokens.expiry_date
    });
  } catch (error) {
    console.error('Error during OAuth callback:', error);
    res.status(500).json({ error: 'Failed to authenticate' });
  }
});

// Check authentication status
app.get('/status', (req, res) => {
  res.json({
    authenticated: !!storedTokens,
    tokenExpiry: storedTokens?.expiry_date || null
  });
});

// ====================
// Google Calendar API
// ====================

// Get calendar events
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

// Event type to color mapping
const EVENT_COLOR_MAP = {
  자기계발: '2',      // 초록 (#0F9D58)
  개인: '1',         // 파랑 (#4285F4)
  업무: '6',        // 주황 (#F4511E)
  가족: '5'         // 노랑 (#F4B400)
};

// Pattern rules for type inference
const PATTERN_RULES = {
  가족: ['가족으로', '가족에', '가족과', '가족'],
  업무: ['업무로', '업무에', '업무', '회의', '사업', '업무로 등록'],
  자기계발: ['자기계발', '공부', '독서', '운동', '학습', '자기계발로'],
  개인: ['개인으로', '개인에', '개인적', '개인']
};

// Infer type from summary
function inferType(summary) {
  if (!summary) return null;
  for (const [type, patterns] of Object.entries(PATTERN_RULES)) {
    for (const pattern of patterns) {
      if (summary.includes(pattern)) {
        return type;
      }
    }
  }
  return null;
}

// Create calendar event
app.post('/events', async (req, res) => {
  if (!storedTokens) {
    return res.status(401).json({ error: 'Not authenticated. Call /auth first.' });
  }

  const { summary, start, end, description, type, reminders } = req.body;

  if (!summary || !start || !end) {
    return res.status(400).json({ error: 'Missing required fields: summary, start, end' });
  }

  try {
    oauth2Client.setCredentials(storedTokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Infer type from summary if not provided
    const inferredType = type || inferType(summary);

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

    // Apply color based on event type
    if (inferredType && EVENT_COLOR_MAP[inferredType]) {
      event.colorId = EVENT_COLOR_MAP[inferredType];
    }

    // Set reminders (keep default + add custom if provided)
    if (reminders && reminders.length > 0) {
      event.reminders = {
        useDefault: true,  // Keep default reminders
        overrides: reminders.map(r => ({
          method: r.method || 'popup',
          minutes: r.minutes
        }))
      };
    }

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

// Update calendar event
app.put('/events/:eventId', async (req, res) => {
  if (!storedTokens) {
    return res.status(401).json({ error: 'Not authenticated. Call /auth first.' });
  }

  const { eventId } = req.params;
  const { summary, start, end, description, type, reminders } = req.body;

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

    // Update color based on event type
    if (type !== undefined) {
      if (type === null) {
        // Remove color
        event.colorId = null;
      } else if (EVENT_COLOR_MAP[type]) {
        event.colorId = EVENT_COLOR_MAP[type];
      }
    }

    // Update reminders if provided
    if (reminders !== undefined) {
      if (reminders === null || reminders.length === 0) {
        // Use default reminders only
        event.reminders = {
          useDefault: true
        };
      } else {
        // Keep default + add custom reminders
        event.reminders = {
          useDefault: true,
          overrides: reminders.map(r => ({
            method: r.method || 'popup',
            minutes: r.minutes
          }))
        };
      }
    }

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

// Delete calendar event
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

// ====================
// Gmail API
// ====================

// Get recent emails
app.get('/mail', async (req, res) => {
  if (!storedTokens) {
    return res.status(401).json({ error: 'Not authenticated. Call /auth first.' });
  }

  const maxResults = parseInt(req.query.maxResults) || 20;

  try {
    oauth2Client.setCredentials(storedTokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      q: req.query.q // Search query (optional)
    });

    const messages = response.data.messages || [];
    const messageDetails = [];

    for (const message of messages) {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date']
      });
      messageDetails.push({
        id: detail.data.id,
        threadId: detail.data.threadId,
        snippet: detail.data.snippet,
        headers: detail.data.payload.headers
      });
    }

    res.json({
      success: true,
      messages: messageDetails
    });
  } catch (error) {
    console.error('Error fetching emails:', error);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

// Get email content by message ID
app.get('/mail/:messageId', async (req, res) => {
  if (!storedTokens) {
    return res.status(401).json({ error: 'Not authenticated. Call /auth first.' });
  }

  const { messageId } = req.params;

  try {
    oauth2Client.setCredentials(storedTokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    });

    // Parse email body
    const body = response.data.payload.body.data;
    const decodedBody = body ? Buffer.from(body, 'base64').toString('utf-8') : '';

    res.json({
      success: true,
      message: {
        id: response.data.id,
        threadId: response.data.threadId,
        snippet: response.data.snippet,
        headers: response.data.payload.headers,
        body: decodedBody
      }
    });
  } catch (error) {
    console.error('Error fetching email:', error);
    res.status(500).json({ error: 'Failed to fetch email' });
  }
});

// Get email thread
app.get('/mail/threads/:threadId', async (req, res) => {
  if (!storedTokens) {
    return res.status(401).json({ error: 'Not authenticated. Call /auth first.' });
  }

  const { threadId } = req.params;

  try {
    oauth2Client.setCredentials(storedTokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    const response = await gmail.users.threads.get({
      userId: 'me',
      id: threadId
    });

    res.json({
      success: true,
      thread: response.data
    });
  } catch (error) {
    console.error('Error fetching thread:', error);
    res.status(500).json({ error: 'Failed to fetch thread' });
  }
});

// ====================
// Google Drive API
// ====================

// Get files list
app.get('/drive/files', async (req, res) => {
  if (!storedTokens) {
    return res.status(401).json({ error: 'Not authenticated. Call /auth first.' });
  }

  const pageSize = parseInt(req.query.pageSize) || 20;
  const q = req.query.q || ''; // Search query (optional)

  try {
    oauth2Client.setCredentials(storedTokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    const response = await drive.files.list({
      pageSize,
      q,
      fields: 'files(id, name, mimeType, createdTime, modifiedTime, webViewLink, webContentLink)'
    });

    res.json({
      success: true,
      files: response.data.files
    });
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// Get file metadata
app.get('/drive/files/:fileId', async (req, res) => {
  if (!storedTokens) {
    return res.status(401).json({ error: 'Not authenticated. Call /auth first.' });
  }

  const { fileId } = req.params;

  try {
    oauth2Client.setCredentials(storedTokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    const response = await drive.files.get({
      fileId,
      fields: '*'
    });

    res.json({
      success: true,
      file: response.data
    });
  } catch (error) {
    console.error('Error fetching file:', error);
    res.status(500).json({ error: 'Failed to fetch file' });
  }
});

// ====================
// Google Docs API
// ====================

// Get document content
app.get('/docs/:documentId', async (req, res) => {
  if (!storedTokens) {
    return res.status(401).json({ error: 'Not authenticated. Call /auth first.' });
  }

  const { documentId } = req.params;

  try {
    oauth2Client.setCredentials(storedTokens);
    const docs = google.docs({ version: 'v1', auth: oauth2Client });
    
    const response = await docs.documents.get({
      documentId
    });

    res.json({
      success: true,
      document: response.data
    });
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// ====================
// Google Sheets API
// ====================

// Get spreadsheet metadata
app.get('/sheets/:spreadsheetId', async (req, res) => {
  if (!storedTokens) {
    return res.status(401).json({ error: 'Not authenticated. Call /auth first.' });
  }

  const { spreadsheetId } = req.params;

  try {
    oauth2Client.setCredentials(storedTokens);
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    
    const response = await sheets.spreadsheets.get({
      spreadsheetId
    });

    res.json({
      success: true,
      spreadsheet: response.data
    });
  } catch (error) {
    console.error('Error fetching spreadsheet:', error);
    res.status(500).json({ error: 'Failed to fetch spreadsheet' });
  }
});

// Get sheet data
app.get('/sheets/:spreadsheetId/:sheetId', async (req, res) => {
  if (!storedTokens) {
    return res.status(401).json({ error: 'Not authenticated. Call /auth first.' });
  }

  const { spreadsheetId, sheetId } = req.params;
  const range = req.query.range || 'A:Z';

  try {
    oauth2Client.setCredentials(storedTokens);
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetId}!${range}`
    });

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Error fetching sheet data:', error);
    res.status(500).json({ error: 'Failed to fetch sheet data' });
  }
});

// ====================
// Start Server
// ====================
app.listen(PORT, () => {
  console.log(`🚀 Google Workspace OAuth service running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔐 Client ID: ${process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Not set'}`);
  console.log(`🔑 Client Secret: ${process.env.GOOGLE_CLIENT_SECRET ? 'Set' : 'Not set'}`);
  console.log(`🔗 Redirect URI: ${process.env.REDIRECT_URI || 'Not set'}`);
});
