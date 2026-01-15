const express = require('express');
const { getDatabase } = require('../database/init');
const { emailSchema, mobileNumberSchema, authCodeSchema } = require('../validation/schemas');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();

function generateAuthCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

router.post('/login', async (req, res, next) => {
  try {
    const { error, value } = emailSchema.validate(req.body);
    if (error) {
      return next(error);
    }

    const { email } = value;
    const db = getDatabase();

    db.get('SELECT email, mobile_number, created_at FROM users WHERE email = ?', [email], (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (row) {
        return res.json({
          message: 'Login successful',
          user: {
            email: row.email,
            mobileNumber: row.mobile_number,
            createdAt: row.created_at
          }
        });
      } else {
        db.run('INSERT INTO users (email) VALUES (?)', [email], function(err) {
          if (err) {
            console.error('Error creating user:', err);
            return res.status(500).json({ error: 'Failed to create user' });
          }

          res.status(201).json({
            message: 'User created and logged in successfully',
            user: {
              email: email,
              mobileNumber: null,
              createdAt: new Date().toISOString()
            }
          });
        });
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/request-code', async (req, res, next) => {
  try {
    const { error, value } = mobileNumberSchema.validate(req.body);
    if (error) {
      return next(error);
    }

    const { mobileNumber } = value;
    const db = getDatabase();
    const authCode = generateAuthCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    db.get('SELECT email FROM users WHERE mobile_number = ?', [mobileNumber], (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (row) {
        db.run(
          'UPDATE users SET auth_code = ?, auth_code_expires_at = ? WHERE mobile_number = ?',
          [authCode, expiresAt, mobileNumber],
          function(err) {
            if (err) {
              console.error('Error updating auth code:', err);
              return res.status(500).json({ error: 'Failed to generate auth code' });
            }

            console.log(`Auth code for ${mobileNumber}: ${authCode}`);
            res.json({
              message: 'Auth code sent successfully',
              authCode: authCode
            });
          }
        );
      } else {
        const tempEmail = `mobile_${mobileNumber.replace(/[^0-9]/g, '')}@temp.local`;
        
        db.run(
          'INSERT INTO users (email, mobile_number, auth_code, auth_code_expires_at) VALUES (?, ?, ?, ?)',
          [tempEmail, mobileNumber, authCode, expiresAt],
          function(err) {
            if (err) {
              console.error('Error creating user:', err);
              return res.status(500).json({ error: 'Failed to create user' });
            }

            console.log(`Auth code for ${mobileNumber}: ${authCode}`);
            res.status(201).json({
              message: 'Auth code sent successfully',
              authCode: authCode
            });
          }
        );
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/verify-code', async (req, res, next) => {
  try {
    const { error, value } = authCodeSchema.validate(req.body);
    if (error) {
      return next(error);
    }

    const { mobileNumber, authCode } = value;
    const db = getDatabase();

    db.get(
      'SELECT email, mobile_number, auth_code, auth_code_expires_at, created_at FROM users WHERE mobile_number = ?',
      [mobileNumber],
      (err, row) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Internal server error' });
        }

        if (!row) {
          return res.status(404).json({ error: 'Mobile number not found. Please request a new auth code.' });
        }

        if (!row.auth_code) {
          return res.status(400).json({ error: 'No auth code found. Please request a new auth code.' });
        }

        const expiresAt = new Date(row.auth_code_expires_at);
        if (expiresAt < new Date()) {
          return res.status(400).json({ error: 'Auth code has expired. Please request a new auth code.' });
        }

        if (row.auth_code !== authCode) {
          return res.status(400).json({ error: 'Invalid auth code. Please try again.' });
        }

        db.run(
          'UPDATE users SET auth_code = NULL, auth_code_expires_at = NULL WHERE mobile_number = ?',
          [mobileNumber],
          function(err) {
            if (err) {
              console.error('Error clearing auth code:', err);
            }

            res.json({
              message: 'Login successful',
              user: {
                email: row.email,
                mobileNumber: row.mobile_number,
                createdAt: row.created_at
              }
            });
          }
        );
      }
    );
  } catch (error) {
    next(error);
  }
});

router.get('/me', authenticateUser, (req, res) => {
  const db = getDatabase();
  
  db.get('SELECT email, mobile_number, created_at FROM users WHERE email = ?', [req.userEmail], (err, row) => {
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
        mobileNumber: row.mobile_number,
        createdAt: row.created_at
      }
    });
  });
});

module.exports = router;
