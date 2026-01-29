const express = require('express');
const router = express.Router();

router.post('/login', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  res.json({ message: 'Login successful', user: { email } });
});

router.get('/me', (req, res) => {
  const userEmail = req.headers['x-user-email'];
  if (!userEmail) {
    return res.status(401).json({ error: 'User email required' });
  }
  res.json({ user: { email: userEmail } });
});

module.exports = router;
