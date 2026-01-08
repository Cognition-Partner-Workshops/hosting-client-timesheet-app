const express = require('express');
const { getDatabase } = require('../database/init');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateUser);

router.get('/stats', (req, res) => {
  const db = getDatabase();
  const userEmail = req.userEmail;
  
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const queries = {
    hoursToday: `SELECT COALESCE(SUM(hours), 0) as total FROM work_entries WHERE user_email = ? AND date = ?`,
    hoursThisWeek: `SELECT COALESCE(SUM(hours), 0) as total FROM work_entries WHERE user_email = ? AND date >= ?`,
    hoursThisMonth: `SELECT COALESCE(SUM(hours), 0) as total FROM work_entries WHERE user_email = ? AND date >= ?`,
    totalClients: `SELECT COUNT(*) as count FROM clients WHERE user_email = ?`,
    totalEntries: `SELECT COUNT(*) as count FROM work_entries WHERE user_email = ?`
  };
  
  const results = {};
  let completed = 0;
  const totalQueries = 5;
  
  const checkComplete = () => {
    completed++;
    if (completed === totalQueries) {
      res.json({
        timeStats: {
          hoursToday: results.hoursToday || 0,
          hoursThisWeek: results.hoursThisWeek || 0,
          hoursThisMonth: results.hoursThisMonth || 0
        },
        summary: {
          totalClients: results.totalClients || 0,
          totalEntries: results.totalEntries || 0
        }
      });
    }
  };
  
  db.get(queries.hoursToday, [userEmail, today], (err, row) => {
    if (!err && row) results.hoursToday = row.total;
    checkComplete();
  });
  
  db.get(queries.hoursThisWeek, [userEmail, weekAgo], (err, row) => {
    if (!err && row) results.hoursThisWeek = row.total;
    checkComplete();
  });
  
  db.get(queries.hoursThisMonth, [userEmail, monthAgo], (err, row) => {
    if (!err && row) results.hoursThisMonth = row.total;
    checkComplete();
  });
  
  db.get(queries.totalClients, [userEmail], (err, row) => {
    if (!err && row) results.totalClients = row.count;
    checkComplete();
  });
  
  db.get(queries.totalEntries, [userEmail], (err, row) => {
    if (!err && row) results.totalEntries = row.count;
    checkComplete();
  });
});

router.get('/defaulters', (req, res) => {
  const db = getDatabase();
  const userEmail = req.userEmail;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const query = `
    SELECT c.id, c.name, c.description, c.created_at,
           MAX(we.date) as last_entry_date,
           COALESCE(SUM(we.hours), 0) as total_hours
    FROM clients c
    LEFT JOIN work_entries we ON c.id = we.client_id
    WHERE c.user_email = ?
    GROUP BY c.id, c.name, c.description, c.created_at
    HAVING last_entry_date IS NULL OR last_entry_date < ?
    ORDER BY last_entry_date ASC NULLS FIRST
  `;
  
  db.all(query, [userEmail, weekAgo], (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
    
    const defaulters = rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      lastEntryDate: row.last_entry_date,
      totalHours: row.total_hours,
      daysSinceLastEntry: row.last_entry_date 
        ? Math.floor((Date.now() - new Date(row.last_entry_date).getTime()) / (24 * 60 * 60 * 1000))
        : null
    }));
    
    res.json({ 
      defaulters,
      count: defaulters.length
    });
  });
});

router.get('/due-dates', (req, res) => {
  const db = getDatabase();
  const userEmail = req.userEmail;
  const today = new Date().toISOString().split('T')[0];
  const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const recentEntriesQuery = `
    SELECT we.id, we.client_id, we.hours, we.description, we.date, 
           we.created_at, c.name as client_name
    FROM work_entries we
    JOIN clients c ON we.client_id = c.id
    WHERE we.user_email = ? AND we.date >= ?
    ORDER BY we.date DESC
    LIMIT 10
  `;
  
  const upcomingClientsQuery = `
    SELECT c.id, c.name, c.description,
           MAX(we.date) as last_entry_date,
           COALESCE(SUM(we.hours), 0) as total_hours,
           COUNT(we.id) as entry_count
    FROM clients c
    LEFT JOIN work_entries we ON c.id = we.client_id
    WHERE c.user_email = ?
    GROUP BY c.id, c.name, c.description
    ORDER BY last_entry_date DESC NULLS LAST
    LIMIT 5
  `;
  
  let results = {};
  let completed = 0;
  
  const checkComplete = () => {
    completed++;
    if (completed === 2) {
      res.json({
        recentEntries: results.recentEntries || [],
        upcomingClients: results.upcomingClients || []
      });
    }
  };
  
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  db.all(recentEntriesQuery, [userEmail, weekAgo], (err, rows) => {
    if (!err) {
      results.recentEntries = rows.map(row => ({
        id: row.id,
        clientId: row.client_id,
        clientName: row.client_name,
        hours: row.hours,
        description: row.description,
        date: row.date,
        createdAt: row.created_at
      }));
    }
    checkComplete();
  });
  
  db.all(upcomingClientsQuery, [userEmail], (err, rows) => {
    if (!err) {
      results.upcomingClients = rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        lastEntryDate: row.last_entry_date,
        totalHours: row.total_hours,
        entryCount: row.entry_count
      }));
    }
    checkComplete();
  });
});

module.exports = router;
