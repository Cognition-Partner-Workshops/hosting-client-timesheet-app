/**
 * DynamoDB database adapter for cloud deployments.
 *
 * Implements the same CRUD interface as the SQLite adapter (sqlite.js) so the
 * two can be swapped transparently via the database abstraction layer (index.js).
 *
 * Table names are read from environment variables with sensible defaults:
 *   - USERS_TABLE        (default: 'client-timesheet-app-users')
 *   - CLIENTS_TABLE      (default: 'client-timesheet-app-clients')
 *   - WORK_ENTRIES_TABLE  (default: 'client-timesheet-app-work-entries')
 *
 * @module database/dynamodb
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
  DynamoDBDocumentClient, 
  GetCommand, 
  PutCommand, 
  UpdateCommand, 
  DeleteCommand, 
  QueryCommand, 
  ScanCommand 
} = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

// Initialise the low-level DynamoDB client and wrap it with the higher-level
// Document client, which marshals JavaScript types to/from DynamoDB attributes.
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

/** Mapping of logical table names to their DynamoDB table names. */
const TABLES = {
  users: process.env.USERS_TABLE || 'client-timesheet-app-users',
  clients: process.env.CLIENTS_TABLE || 'client-timesheet-app-clients',
  workEntries: process.env.WORK_ENTRIES_TABLE || 'client-timesheet-app-work-entries'
};

// ---------------------------------------------------------------------------
// User operations
// ---------------------------------------------------------------------------

/**
 * Fetches a user record by primary key (email).
 *
 * @param {string} email - The user's email address.
 * @returns {Promise<object|undefined>} The user item, or undefined if not found.
 */
async function getUser(email) {
  const result = await docClient.send(new GetCommand({
    TableName: TABLES.users,
    Key: { email }
  }));
  return result.Item;
}

/**
 * Creates a new user record.
 *
 * @param {string} email - The user's email address (used as partition key).
 * @returns {Promise<object>} The newly created user item.
 */
async function createUser(email) {
  const user = {
    email,
    created_at: new Date().toISOString()
  };
  await docClient.send(new PutCommand({
    TableName: TABLES.users,
    Item: user
  }));
  return user;
}

// ---------------------------------------------------------------------------
// Client operations
// ---------------------------------------------------------------------------

/**
 * Returns all clients owned by the given user.
 * Uses the `user_email-index` GSI for an efficient query.
 *
 * @param {string} userEmail - Owner's email address.
 * @returns {Promise<object[]>} Array of client items (may be empty).
 */
async function getClientsByUser(userEmail) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.clients,
    IndexName: 'user_email-index',
    KeyConditionExpression: 'user_email = :email',
    ExpressionAttributeValues: { ':email': userEmail }
  }));
  return result.Items || [];
}

/**
 * Fetches a single client by its unique ID.
 *
 * @param {string} id - Client UUID.
 * @returns {Promise<object|undefined>} The client item, or undefined if not found.
 */
async function getClientById(id) {
  const result = await docClient.send(new GetCommand({
    TableName: TABLES.clients,
    Key: { id }
  }));
  return result.Item;
}

/**
 * Persists a new client record in DynamoDB.
 *
 * @param {object} data - Client fields (name, description, department, email, user_email).
 * @returns {Promise<object>} The created client item including generated id and timestamps.
 */
async function createClient(data) {
  const client = {
    id: uuidv4(),
    name: data.name,
    description: data.description || null,
    department: data.department || null,
    email: data.email || null,
    user_email: data.user_email,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  await docClient.send(new PutCommand({
    TableName: TABLES.clients,
    Item: client
  }));
  return client;
}

/**
 * Partially updates a client record. Only the fields present in `data` are
 * modified; `updated_at` is always refreshed.
 *
 * Note: `name` is a DynamoDB reserved word, so it is aliased via
 * ExpressionAttributeNames (#name).
 *
 * @param {string} id   - Client UUID.
 * @param {object} data - Fields to update (name, description, department, email).
 * @returns {Promise<object>} The full updated client item (ALL_NEW).
 */
async function updateClient(id, data) {
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};

  if (data.name !== undefined) {
    updateExpressions.push('#name = :name');
    expressionAttributeNames['#name'] = 'name';
    expressionAttributeValues[':name'] = data.name;
  }
  if (data.description !== undefined) {
    updateExpressions.push('description = :description');
    expressionAttributeValues[':description'] = data.description;
  }
  if (data.department !== undefined) {
    updateExpressions.push('department = :department');
    expressionAttributeValues[':department'] = data.department;
  }
  if (data.email !== undefined) {
    updateExpressions.push('email = :email');
    expressionAttributeValues[':email'] = data.email;
  }

  updateExpressions.push('updated_at = :updated_at');
  expressionAttributeValues[':updated_at'] = new Date().toISOString();

  const result = await docClient.send(new UpdateCommand({
    TableName: TABLES.clients,
    Key: { id },
    UpdateExpression: 'SET ' + updateExpressions.join(', '),
    ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  }));
  return result.Attributes;
}

/**
 * Deletes a client and all of its associated work entries.
 * Work entries are removed first to avoid orphaned records.
 *
 * @param {string} id - Client UUID.
 * @returns {Promise<void>}
 */
async function deleteClient(id) {
  await docClient.send(new DeleteCommand({
    TableName: TABLES.clients,
    Key: { id }
  }));
  // Cascade-delete associated work entries to prevent orphans
  const entries = await getWorkEntriesByClient(id);
  for (const entry of entries) {
    await deleteWorkEntry(entry.id);
  }
}

// ---------------------------------------------------------------------------
// Work-entry operations
// ---------------------------------------------------------------------------

/**
 * Returns all work entries belonging to the given user.
 * Uses the `user_email-index` GSI.
 *
 * @param {string} userEmail - Owner's email address.
 * @returns {Promise<object[]>} Array of work-entry items (may be empty).
 */
async function getWorkEntriesByUser(userEmail) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.workEntries,
    IndexName: 'user_email-index',
    KeyConditionExpression: 'user_email = :email',
    ExpressionAttributeValues: { ':email': userEmail }
  }));
  return result.Items || [];
}

/**
 * Returns all work entries for a specific client.
 * Uses the `client_id-index` GSI.
 *
 * @param {string} clientId - Client UUID.
 * @returns {Promise<object[]>} Array of work-entry items (may be empty).
 */
async function getWorkEntriesByClient(clientId) {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLES.workEntries,
    IndexName: 'client_id-index',
    KeyConditionExpression: 'client_id = :clientId',
    ExpressionAttributeValues: { ':clientId': clientId }
  }));
  return result.Items || [];
}

/**
 * Fetches a single work entry by its unique ID.
 *
 * @param {string} id - Work-entry UUID.
 * @returns {Promise<object|undefined>} The work-entry item, or undefined if not found.
 */
async function getWorkEntryById(id) {
  const result = await docClient.send(new GetCommand({
    TableName: TABLES.workEntries,
    Key: { id }
  }));
  return result.Item;
}

/**
 * Persists a new work entry in DynamoDB.
 *
 * @param {object} data - Entry fields (client_id, user_email, hours, description, date).
 * @returns {Promise<object>} The created work-entry item including generated id and timestamps.
 */
async function createWorkEntry(data) {
  const entry = {
    id: uuidv4(),
    client_id: data.client_id,
    user_email: data.user_email,
    hours: data.hours,
    description: data.description || null,
    date: data.date,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  await docClient.send(new PutCommand({
    TableName: TABLES.workEntries,
    Item: entry
  }));
  return entry;
}

/**
 * Partially updates a work entry. Only the fields present in `data` are
 * modified; `updated_at` is always refreshed.
 *
 * Note: `date` is a DynamoDB reserved word, so it is aliased via
 * ExpressionAttributeNames (#date) when included.
 *
 * @param {string} id   - Work-entry UUID.
 * @param {object} data - Fields to update (hours, description, date, client_id).
 * @returns {Promise<object>} The full updated work-entry item (ALL_NEW).
 */
async function updateWorkEntry(id, data) {
  const updateExpressions = [];
  const expressionAttributeValues = {};

  if (data.hours !== undefined) {
    updateExpressions.push('hours = :hours');
    expressionAttributeValues[':hours'] = data.hours;
  }
  if (data.description !== undefined) {
    updateExpressions.push('description = :description');
    expressionAttributeValues[':description'] = data.description;
  }
  if (data.date !== undefined) {
    updateExpressions.push('#date = :date');
    expressionAttributeValues[':date'] = data.date;
  }
  if (data.client_id !== undefined) {
    updateExpressions.push('client_id = :client_id');
    expressionAttributeValues[':client_id'] = data.client_id;
  }

  updateExpressions.push('updated_at = :updated_at');
  expressionAttributeValues[':updated_at'] = new Date().toISOString();

  const result = await docClient.send(new UpdateCommand({
    TableName: TABLES.workEntries,
    Key: { id },
    UpdateExpression: 'SET ' + updateExpressions.join(', '),
    ExpressionAttributeNames: data.date !== undefined ? { '#date': 'date' } : undefined,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  }));
  return result.Attributes;
}

/**
 * Deletes a single work entry.
 *
 * @param {string} id - Work-entry UUID.
 * @returns {Promise<void>}
 */
async function deleteWorkEntry(id) {
  await docClient.send(new DeleteCommand({
    TableName: TABLES.workEntries,
    Key: { id }
  }));
}

module.exports = {
  getUser,
  createUser,
  getClientsByUser,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  getWorkEntriesByUser,
  getWorkEntriesByClient,
  getWorkEntryById,
  createWorkEntry,
  updateWorkEntry,
  deleteWorkEntry
};
