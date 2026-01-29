const { errorHandler } = require('../../docker/overrides/middleware/errorHandler');

describe('Error Handler Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();
    console.error = jest.fn();
  });

  test('should handle Joi validation errors', () => {
    const joiError = {
      isJoi: true,
      details: [{ message: 'Validation failed' }]
    };

    errorHandler(joiError, mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Validation error',
      details: joiError.details
    });
  });

  test('should handle generic errors with 500 status', () => {
    const genericError = new Error('Something went wrong');

    errorHandler(genericError, mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Internal server error'
    });
  });

  test('should log errors to console', () => {
    const error = new Error('Test error');

    errorHandler(error, mockReq, mockRes, mockNext);

    expect(console.error).toHaveBeenCalledWith('Error:', error);
  });
});
