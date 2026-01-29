function errorHandler(err, req, res, next) {
  console.error('Error:', err);
  
  if (err.isJoi) {
    return res.status(400).json({ error: 'Validation error', details: err.details });
  }
  
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = {
  errorHandler
};
