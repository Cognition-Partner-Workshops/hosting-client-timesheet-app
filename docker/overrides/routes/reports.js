const express = require('express');
const router = express.Router();

router.get('/client/:clientId', (req, res) => {
  const clientId = parseInt(req.params.clientId);
  if (isNaN(clientId)) {
    return res.status(400).json({ error: 'Invalid client ID' });
  }
  res.json({
    client: { id: clientId, name: 'Test Client' },
    workEntries: [],
    totalHours: 0,
    entryCount: 0
  });
});

router.get('/export/csv/:clientId', (req, res) => {
  const clientId = parseInt(req.params.clientId);
  if (isNaN(clientId)) {
    return res.status(400).json({ error: 'Invalid client ID' });
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="report.csv"');
  res.send('date,hours,description\n');
});

router.get('/export/pdf/:clientId', (req, res) => {
  const clientId = parseInt(req.params.clientId);
  if (isNaN(clientId)) {
    return res.status(400).json({ error: 'Invalid client ID' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="report.pdf"');
  res.send(Buffer.from('PDF content'));
});

module.exports = router;
