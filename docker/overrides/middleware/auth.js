const { getDatabase, validateSession } = require('../database/init');

// Session-based authentication middleware with timeout support
function authenticateUser(req, res, next) {
  const sessionToken = req.headers['x-session-token'];
  const userEmail = req.headers['x-user-email'];
  
  // If session token is provided, validate it
  if (sessionToken) {
    validateSession(sessionToken, (err, result) => {
      if (err) {
        console.error('AUTH_ERROR:', { error: err.message });
        return res.status(500).json({ error: 'Internal server error' });
      }
      
      if (!result.valid) {
        console.log('AUTH_SESSION_INVALID:', { 
          reason: result.reason, 
          code: result.code,
          sessionToken: sessionToken.substring(0, 8) + '...'
        });
        
        // Return specific error codes for session timeout
        if (result.code === 'SESSION_TIMEOUT' || result.code === 'SESSION_INACTIVITY_TIMEOUT') {
          return res.status(401).json({ 
            error: result.reason,
            code: result.code,
            message: 'Your session has expired. Please log in again.'
          });
        }
        
        return res.status(401).json({ 
          error: 'Invalid session',
          code: 'INVALID_SESSION',
          message: 'Session is invalid or has been revoked. Please log in again.'
        });
      }
      
      req.userEmail = result.userEmail;
      req.sessionToken = sessionToken;
      next();
    });
    return;
  }
  
  // Fallback to email-based auth for backward compatibility
  if (!userEmail) {
    console.log('AUTH_MISSING_CREDENTIALS:', { 
      hasSessionToken: !!sessionToken, 
      hasUserEmail: !!userEmail 
    });
    return res.status(401).json({ 
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
      message: 'Please provide a valid session token or user email'
    });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(userEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  const db = getDatabase();
  
  // Check if user exists, create if not (legacy behavior)
  db.get('SELECT email FROM users WHERE email = ?', [userEmail], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
    
    if (!row) {
      // Create new user
      db.run('INSERT INTO users (email) VALUES (?)', [userEmail], (err) => {
        if (err) {
          console.error('Error creating user:', err);
          return res.status(500).json({ error: 'Failed to create user' });
        }
        
        console.log('AUTH_LEGACY_USER_CREATED:', { userEmail });
        req.userEmail = userEmail;
        next();
      });
    } else {
      console.log('AUTH_LEGACY_LOGIN:', { userEmail });
      req.userEmail = userEmail;
      next();
    }
  });
}

module.exports = {
  authenticateUser
};
