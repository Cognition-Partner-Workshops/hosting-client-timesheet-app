const express = require('express');
const { getDatabase, createSession, invalidateSession, getSessionTimeoutMs, getSessionInactivityTimeoutMs } = require('../database/init');
const { emailSchema } = require('../validation/schemas');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();

// Login endpoint - creates user if doesn't exist and creates a session
router.post('/login', async (req, res, next) => {
  try {
    const { error, value } = emailSchema.validate(req.body);
    if (error) {
      return next(error);
    }

    const { email } = value;
    const db = getDatabase();

    // Check if user exists
    db.get('SELECT email, created_at FROM users WHERE email = ?', [email], (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      const createSessionAndRespond = (user, isNewUser) => {
        createSession(email, (sessionErr, sessionData) => {
          if (sessionErr) {
            console.error('SESSION_CREATE_FAILED:', { email, error: sessionErr.message });
            return res.status(500).json({ error: 'Failed to create session' });
          }

          console.log('LOGIN_SUCCESS:', { 
            email, 
            isNewUser, 
            sessionToken: sessionData.sessionToken.substring(0, 8) + '...',
            expiresAt: sessionData.expiresAt
          });

          const response = {
            message: isNewUser ? 'User created and logged in successfully' : 'Login successful',
            user: {
              email: user.email,
              createdAt: user.createdAt
            },
            session: {
              token: sessionData.sessionToken,
              expiresAt: sessionData.expiresAt,
              timeoutMs: getSessionTimeoutMs(),
              inactivityTimeoutMs: getSessionInactivityTimeoutMs()
            }
          };

          res.status(isNewUser ? 201 : 200).json(response);
        });
      };

      if (row) {
        // User exists
        createSessionAndRespond({ email: row.email, createdAt: row.created_at }, false);
      } else {
        // Create new user
        db.run('INSERT INTO users (email) VALUES (?)', [email], function(insertErr) {
          if (insertErr) {
            console.error('Error creating user:', insertErr);
            return res.status(500).json({ error: 'Failed to create user' });
          }

          createSessionAndRespond({ email: email, createdAt: new Date().toISOString() }, true);
        });
      }
    });
  } catch (error) {
    next(error);
  }
});

// Logout endpoint - invalidates the current session
router.post('/logout', authenticateUser, (req, res) => {
  const sessionToken = req.sessionToken;
  
  if (!sessionToken) {
    console.log('LOGOUT_NO_SESSION:', { userEmail: req.userEmail });
    return res.json({ message: 'Logged out successfully' });
  }

  invalidateSession(sessionToken, (err) => {
    if (err) {
      console.error('LOGOUT_ERROR:', { error: err.message });
      return res.status(500).json({ error: 'Failed to logout' });
    }

    console.log('LOGOUT_SUCCESS:', { 
      userEmail: req.userEmail, 
      sessionToken: sessionToken.substring(0, 8) + '...' 
    });
    res.json({ message: 'Logged out successfully' });
  });
});

// Get current user info
router.get('/me', authenticateUser, (req, res) => {
  const db = getDatabase();
  
  db.get('SELECT email, created_at FROM users WHERE email = ?', [req.userEmail], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (!row) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        email: row.email,
        createdAt: row.created_at
      },
      session: req.sessionToken ? {
        timeoutMs: getSessionTimeoutMs(),
        inactivityTimeoutMs: getSessionInactivityTimeoutMs()
      } : null
    });
  });
});

// Refresh session endpoint - extends the session expiration
router.post('/refresh', authenticateUser, (req, res) => {
  const sessionToken = req.sessionToken;
  
  if (!sessionToken) {
    console.log('REFRESH_NO_SESSION:', { userEmail: req.userEmail });
    return res.status(400).json({ 
      error: 'No session to refresh',
      message: 'Please log in to create a new session'
    });
  }

  // Session is already refreshed by the authenticateUser middleware (last_activity updated)
  // Just return success with session info
  console.log('SESSION_REFRESHED:', { 
    userEmail: req.userEmail, 
    sessionToken: sessionToken.substring(0, 8) + '...' 
  });

  res.json({
    message: 'Session refreshed successfully',
    session: {
      timeoutMs: getSessionTimeoutMs(),
      inactivityTimeoutMs: getSessionInactivityTimeoutMs()
    }
  });
});

// Get session status endpoint
router.get('/session-status', authenticateUser, (req, res) => {
  const db = getDatabase();
  const sessionToken = req.sessionToken;

  if (!sessionToken) {
    return res.json({
      hasSession: false,
      message: 'Using legacy email-based authentication'
    });
  }

  db.get(
    'SELECT created_at, last_activity, expires_at FROM sessions WHERE session_token = ?',
    [sessionToken],
    (err, session) => {
      if (err) {
        console.error('SESSION_STATUS_ERROR:', { error: err.message });
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!session) {
        return res.json({
          hasSession: false,
          message: 'Session not found'
        });
      }

      const now = new Date();
      const expiresAt = new Date(session.expires_at);
      const lastActivity = new Date(session.last_activity);
      const timeUntilExpiry = expiresAt.getTime() - now.getTime();
      const timeSinceLastActivity = now.getTime() - lastActivity.getTime();
      const inactivityTimeoutMs = getSessionInactivityTimeoutMs();

      res.json({
        hasSession: true,
        session: {
          createdAt: session.created_at,
          lastActivity: session.last_activity,
          expiresAt: session.expires_at,
          timeUntilExpiryMs: Math.max(0, timeUntilExpiry),
          timeSinceLastActivityMs: timeSinceLastActivity,
          inactivityTimeoutMs: inactivityTimeoutMs,
          timeUntilInactivityTimeoutMs: Math.max(0, inactivityTimeoutMs - timeSinceLastActivity)
        }
      });
    }
  );
});

module.exports = router;
