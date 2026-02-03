# Client Timesheet Application - Business Rules Documentation

This document provides a comprehensive overview of the business rules, workflows, and functional requirements that govern the Client Timesheet Application. It is intended for business analysts, product owners, and developers who need to understand the business logic underlying the system.

## Table of Contents

1. [Business Overview](#1-business-overview)
2. [User Management Rules](#2-user-management-rules)
3. [Client Management Rules](#3-client-management-rules)
4. [Work Entry Rules](#4-work-entry-rules)
5. [Reporting Rules](#5-reporting-rules)
6. [Data Validation Rules](#6-data-validation-rules)
7. [Data Ownership and Access Control](#7-data-ownership-and-access-control)
8. [Business Workflows](#8-business-workflows)
9. [Business Constraints](#9-business-constraints)
10. [Glossary](#10-glossary)

---

## 1. Business Overview

### 1.1 Purpose

The Client Timesheet Application enables professionals to track billable hours worked for different clients. It provides a centralized system for recording time entries, managing client information, and generating reports for billing and analysis purposes.

### 1.2 Target Users

The application is designed for freelancers, consultants, contractors, and small businesses who need to track time spent on client projects for billing, invoicing, or internal reporting purposes.

### 1.3 Core Business Functions

The system supports four primary business functions:

**User Authentication** allows users to access the system using their email address. The system maintains user accounts and ensures data isolation between users.

**Client Management** enables users to maintain a registry of clients they work with, including contact information and organizational details.

**Time Tracking** provides the ability to record work entries against specific clients, capturing hours worked, dates, and descriptions of work performed.

**Reporting** generates summaries of time worked per client and supports export to standard formats for billing and record-keeping.

---

## 2. User Management Rules

### 2.1 User Registration

**BR-USER-001**: Users are automatically registered upon their first login attempt. No separate registration process exists.

**BR-USER-002**: A user account is uniquely identified by their email address. The email address serves as the primary key for user identification.

**BR-USER-003**: The system records the timestamp when each user account is created for audit purposes.

### 2.2 User Authentication

**BR-AUTH-001**: Users authenticate using their email address only. No password is required in the current implementation.

**BR-AUTH-002**: The email address must be in a valid format conforming to standard email patterns (local-part@domain).

**BR-AUTH-003**: Authentication is required for all operations except the initial login request.

**BR-AUTH-004**: User identity is transmitted via the `x-user-email` HTTP header for authenticated requests.

**BR-AUTH-005**: If an authenticated request contains an email that does not exist in the system, a new user account is automatically created.

### 2.3 Session Management

**BR-SESSION-001**: User sessions are maintained on the client side. The server does not maintain session state.

**BR-SESSION-002**: Users can log out at any time, which clears their local session data.

---

## 3. Client Management Rules

### 3.1 Client Creation

**BR-CLIENT-001**: Each client record must have a name. The name is the only mandatory field for client creation.

**BR-CLIENT-002**: Client names must be between 1 and 255 characters in length after trimming whitespace.

**BR-CLIENT-003**: A user may create multiple clients with the same name. Client names are not required to be unique.

**BR-CLIENT-004**: Each client is automatically associated with the user who creates it. This association cannot be changed.

**BR-CLIENT-005**: The system automatically records creation and last-update timestamps for each client.

### 3.2 Client Information

**BR-CLIENT-006**: Client description is optional and may contain up to 1000 characters of text describing the client or engagement.

**BR-CLIENT-007**: Client department is optional and may contain up to 255 characters identifying the department or division within the client organization.

**BR-CLIENT-008**: Client email is optional. If provided, it must be a valid email format and may contain up to 255 characters.

**BR-CLIENT-009**: All text fields are trimmed of leading and trailing whitespace before storage.

### 3.3 Client Modification

**BR-CLIENT-010**: Users may update any client information field at any time.

**BR-CLIENT-011**: At least one field must be provided when updating a client record.

**BR-CLIENT-012**: The system automatically updates the last-modified timestamp when any client field is changed.

**BR-CLIENT-013**: Users may only modify clients they own. Attempts to modify another user's client will fail.

### 3.4 Client Deletion

**BR-CLIENT-014**: Users may delete any client they own at any time.

**BR-CLIENT-015**: Deleting a client automatically deletes all work entries associated with that client (cascade delete).

**BR-CLIENT-016**: Users may delete all their clients in a single operation. This also deletes all associated work entries.

**BR-CLIENT-017**: Client deletion is permanent and cannot be undone.

### 3.5 Client Listing

**BR-CLIENT-018**: Users can only view clients they own. The system does not display clients belonging to other users.

**BR-CLIENT-019**: Client lists are sorted alphabetically by client name in ascending order.

---

## 4. Work Entry Rules

### 4.1 Work Entry Creation

**BR-ENTRY-001**: Each work entry must be associated with a client. The client must exist and belong to the authenticated user.

**BR-ENTRY-002**: Each work entry must specify the number of hours worked. Hours are required.

**BR-ENTRY-003**: Hours must be a positive number greater than zero.

**BR-ENTRY-004**: Hours cannot exceed 24 for a single entry, representing the maximum hours in a day.

**BR-ENTRY-005**: Hours are recorded with up to 2 decimal places of precision (e.g., 1.25 hours, 2.50 hours).

**BR-ENTRY-006**: Each work entry must specify a date. The date represents when the work was performed.

**BR-ENTRY-007**: Dates must be provided in ISO 8601 format (YYYY-MM-DD).

**BR-ENTRY-008**: Work entry descriptions are optional and may contain up to 1000 characters describing the work performed.

**BR-ENTRY-009**: Each work entry is automatically associated with the authenticated user.

**BR-ENTRY-010**: The system automatically records creation and last-update timestamps for each work entry.

### 4.2 Work Entry Modification

**BR-ENTRY-011**: Users may update any work entry field at any time.

**BR-ENTRY-012**: At least one field must be provided when updating a work entry.

**BR-ENTRY-013**: When changing the client association of a work entry, the new client must belong to the authenticated user.

**BR-ENTRY-014**: The system automatically updates the last-modified timestamp when any work entry field is changed.

**BR-ENTRY-015**: Users may only modify work entries they own.

### 4.3 Work Entry Deletion

**BR-ENTRY-016**: Users may delete any work entry they own at any time.

**BR-ENTRY-017**: Work entry deletion is permanent and cannot be undone.

### 4.4 Work Entry Listing

**BR-ENTRY-018**: Users can only view work entries they own.

**BR-ENTRY-019**: Work entries are sorted by date in descending order (most recent first).

**BR-ENTRY-020**: When multiple entries exist for the same date, they are further sorted by creation time in descending order.

**BR-ENTRY-021**: Work entries can be filtered by client. When filtered, only entries for the specified client are returned.

**BR-ENTRY-022**: Each work entry in a list includes the associated client name for display purposes.

---

## 5. Reporting Rules

### 5.1 Client Reports

**BR-REPORT-001**: Reports are generated on a per-client basis. Each report covers a single client.

**BR-REPORT-002**: Users can only generate reports for clients they own.

**BR-REPORT-003**: A client report includes all work entries for that client, sorted by date descending.

**BR-REPORT-004**: The report calculates and displays the total hours worked for the client across all entries.

**BR-REPORT-005**: The report displays the total count of work entries for the client.

### 5.2 Report Export - CSV

**BR-EXPORT-001**: Users may export client reports to CSV (Comma-Separated Values) format.

**BR-EXPORT-002**: CSV exports include the following columns: Date, Hours, Description, Created At.

**BR-EXPORT-003**: CSV files are named using the pattern: `{ClientName}_report_{Timestamp}.csv` where special characters in the client name are replaced with underscores.

**BR-EXPORT-004**: Work entries in CSV exports are sorted by date in descending order.

### 5.3 Report Export - PDF

**BR-EXPORT-005**: Users may export client reports to PDF (Portable Document Format).

**BR-EXPORT-006**: PDF reports include a header with the client name, total hours, entry count, and generation timestamp.

**BR-EXPORT-007**: PDF reports include a table of all work entries with Date, Hours, and Description columns.

**BR-EXPORT-008**: PDF files are named using the pattern: `{ClientName}_report_{Timestamp}.pdf`.

**BR-EXPORT-009**: PDF reports automatically paginate when content exceeds a single page.

**BR-EXPORT-010**: Work entries in PDF exports are sorted by date in descending order.

---

## 6. Data Validation Rules

### 6.1 Email Validation

**BR-VAL-001**: Email addresses must match the pattern: `local-part@domain` where both parts are non-empty and contain no whitespace.

**BR-VAL-002**: Email validation is applied to user authentication, client email fields, and any other email inputs.

### 6.2 Text Field Validation

**BR-VAL-003**: All text fields are trimmed of leading and trailing whitespace before validation and storage.

**BR-VAL-004**: Empty strings after trimming are treated as null/not provided for optional fields.

**BR-VAL-005**: Required text fields must contain at least one non-whitespace character after trimming.

### 6.3 Numeric Validation

**BR-VAL-006**: Hours must be a positive number (greater than zero).

**BR-VAL-007**: Hours cannot exceed 24 per entry.

**BR-VAL-008**: Hours are rounded to 2 decimal places.

**BR-VAL-009**: Client and work entry IDs must be positive integers.

### 6.4 Date Validation

**BR-VAL-010**: Dates must be valid calendar dates in ISO 8601 format.

**BR-VAL-011**: The system does not restrict dates to past or present; future dates are allowed.

### 6.5 Update Validation

**BR-VAL-012**: Update operations require at least one field to be provided. Empty update requests are rejected.

---

## 7. Data Ownership and Access Control

### 7.1 Data Isolation

**BR-ACCESS-001**: All data in the system is scoped to individual users. Users cannot access data belonging to other users.

**BR-ACCESS-002**: Client records are owned by the user who created them. Ownership cannot be transferred.

**BR-ACCESS-003**: Work entries are owned by the user who created them. Ownership cannot be transferred.

### 7.2 Access Control

**BR-ACCESS-004**: Read operations (list, get) only return records owned by the authenticated user.

**BR-ACCESS-005**: Write operations (create, update, delete) only affect records owned by the authenticated user.

**BR-ACCESS-006**: Attempts to access or modify records owned by other users result in "not found" errors to prevent information disclosure.

### 7.3 Referential Integrity

**BR-ACCESS-007**: Work entries must reference a valid client owned by the same user.

**BR-ACCESS-008**: Deleting a user's client automatically deletes all work entries for that client.

**BR-ACCESS-009**: Deleting a user account would cascade to delete all clients and work entries (if implemented).

---

## 8. Business Workflows

### 8.1 New User Onboarding

The onboarding workflow for new users follows these steps:

1. User navigates to the application and enters their email address
2. System validates the email format
3. System checks if the user exists; if not, creates a new user account
4. User is logged in and redirected to the dashboard
5. Dashboard displays empty state with prompts to add first client

### 8.2 Client Setup

The workflow for setting up a new client:

1. User navigates to the Clients page
2. User clicks "Add Client" button
3. User enters client name (required) and optional details (description, department, email)
4. System validates input according to validation rules
5. System creates client record associated with the user
6. User is returned to client list showing the new client

### 8.3 Time Entry Recording

The workflow for recording time worked:

1. User navigates to Work Entries page
2. User clicks "Add Entry" button
3. User selects a client from their client list
4. User enters hours worked (required)
5. User selects the date work was performed (required)
6. User optionally enters a description of work performed
7. System validates input according to validation rules
8. System creates work entry associated with user and client
9. User is returned to work entries list showing the new entry

### 8.4 Report Generation

The workflow for generating and exporting reports:

1. User navigates to Reports page
2. User selects a client from their client list
3. System retrieves all work entries for the selected client
4. System calculates total hours and entry count
5. System displays report with work entry details
6. User may optionally export to CSV or PDF
7. If exporting, system generates file and initiates download

### 8.5 Data Correction

The workflow for correcting entered data:

1. User navigates to the relevant page (Clients or Work Entries)
2. User locates the record to correct
3. User clicks edit button on the record
4. User modifies the incorrect fields
5. System validates updated input
6. System saves changes and updates timestamp
7. User sees updated record in the list

---

## 9. Business Constraints

### 9.1 System Constraints

**BC-SYS-001**: The system operates with eventual consistency for in-memory database deployments. Data may be lost on server restart unless file-based persistence is configured.

**BC-SYS-002**: The system is designed for single-user concurrent access patterns. High-concurrency scenarios may require additional infrastructure.

**BC-SYS-003**: Report exports are generated synchronously. Large reports may take time to generate.

### 9.2 Business Constraints

**BC-BUS-001**: The system does not enforce billing rates. Hours are tracked without monetary values.

**BC-BUS-002**: The system does not integrate with external billing or invoicing systems.

**BC-BUS-003**: The system does not support project-level tracking within clients. All time is tracked at the client level.

**BC-BUS-004**: The system does not support team or organizational hierarchies. Each user operates independently.

**BC-BUS-005**: The system does not provide approval workflows for time entries.

### 9.3 Security Constraints

**BC-SEC-001**: The current authentication model (email-only) is suitable for trusted internal networks. Production deployments should implement stronger authentication.

**BC-SEC-002**: The system does not encrypt data at rest in the default configuration.

**BC-SEC-003**: The system does not provide audit logging of user actions beyond timestamps.

---

## 10. Glossary

**Client**: An organization or individual for whom work is performed and time is tracked. Each client belongs to a single user.

**Work Entry**: A record of time worked, including hours, date, and optional description. Each work entry is associated with one client and one user.

**User**: An individual who uses the system to track time. Identified by email address.

**Hours**: The amount of time worked, measured in decimal hours (e.g., 1.5 = 1 hour 30 minutes).

**Report**: A summary of work entries for a specific client, including total hours and entry count.

**CSV Export**: A comma-separated values file containing work entry data for import into spreadsheets or other systems.

**PDF Export**: A portable document format file containing a formatted report suitable for printing or sharing.

**Cascade Delete**: Automatic deletion of related records when a parent record is deleted (e.g., deleting a client deletes all associated work entries).

**ISO 8601**: International standard for date and time representation (YYYY-MM-DD format for dates).

**Trimming**: Removal of leading and trailing whitespace from text input.

---

## Document Information

**Version**: 1.0  
**Last Updated**: February 2026  
**Scope**: Client Timesheet Application hosted via hosting-client-timesheet-app infrastructure

This document should be reviewed and updated whenever business rules change or new features are added to the application.
