const express = require('express');
const router = express.Router();

const clients = [];

router.get('/', (req, res) => {
  res.json({ clients });
});

router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid client ID' });
  }
  const client = clients.find(c => c.id === id);
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }
  res.json({ client });
});

router.post('/', (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  const client = { id: clients.length + 1, name, description };
  clients.push(client);
  res.status(201).json({ message: 'Client created', client });
});

router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid client ID' });
  }
  const index = clients.findIndex(c => c.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Client not found' });
  }
  clients[index] = { ...clients[index], ...req.body };
  res.json({ message: 'Client updated', client: clients[index] });
});

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid client ID' });
  }
  const index = clients.findIndex(c => c.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Client not found' });
  }
  clients.splice(index, 1);
  res.json({ message: 'Client deleted' });
});

module.exports = router;
