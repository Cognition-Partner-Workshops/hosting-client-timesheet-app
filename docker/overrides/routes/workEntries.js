const express = require('express');
const router = express.Router();

const workEntries = [];

router.get('/', (req, res) => {
  const { clientId } = req.query;
  let entries = workEntries;
  if (clientId) {
    const id = parseInt(clientId);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid client ID' });
    }
    entries = entries.filter(e => e.clientId === id);
  }
  res.json({ workEntries: entries });
});

router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid work entry ID' });
  }
  const entry = workEntries.find(e => e.id === id);
  if (!entry) {
    return res.status(404).json({ error: 'Work entry not found' });
  }
  res.json({ workEntry: entry });
});

router.post('/', (req, res) => {
  const { clientId, hours, description, date } = req.body;
  if (!clientId || !hours || !date) {
    return res.status(400).json({ error: 'clientId, hours, and date are required' });
  }
  const entry = { id: workEntries.length + 1, clientId, hours, description, date };
  workEntries.push(entry);
  res.status(201).json({ message: 'Work entry created', workEntry: entry });
});

router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid work entry ID' });
  }
  const index = workEntries.findIndex(e => e.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Work entry not found' });
  }
  workEntries[index] = { ...workEntries[index], ...req.body };
  res.json({ message: 'Work entry updated', workEntry: workEntries[index] });
});

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid work entry ID' });
  }
  const index = workEntries.findIndex(e => e.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Work entry not found' });
  }
  workEntries.splice(index, 1);
  res.json({ message: 'Work entry deleted' });
});

module.exports = router;
