# SupportPilot AI

Production-grade multi-tenant customer support platform built with Node.js, TypeScript, PostgreSQL, Redis, Prisma and BullMQ.

## Features

### Authentication & Security

- JWT Authentication
- Refresh Token Rotation
- RBAC (Admin, Manager, Agent)
- Organization Isolation
- Rate Limiting
- Idempotency Protection

### Ticket Management

- Ticket Lifecycle State Machine
- Assignment & Reassignment
- Team Routing
- Internal/Public Comments
- Audit Trail
- Advanced Filtering

### Reliability

- BullMQ Background Jobs
- Redis Queue Processing
- Retry Policies
- Dead Letter Handling
- Request Correlation IDs

### Operations

- SLA Tracking
- Automatic Escalation
- Analytics Dashboard APIs
- Notification System
- Cleanup Workers

## Architecture

src/

modules/
auth/
tickets/
teams/
analytics/
notifications/
audit/

infrastructure/
database/
redis/
queue/

workers/

shared/

## Tech Stack

- Node.js
- TypeScript
- Express
- PostgreSQL
- Prisma
- Redis
- BullMQ
- JWT
- Docker

## API Examples

### Register

POST /api/v1/auth/register

### Login

POST /api/v1/auth/login

### Create Ticket

POST /api/v1/tickets

### Assign Ticket

POST /api/v1/tickets/:id/assign

## Local Development

npm install

cp .env.example .env

npm run prisma:migrate

npm run dev

## Production Concepts Demonstrated

- Multi-Tenancy
- RBAC
- State Machines
- Background Processing
- Distributed Systems Fundamentals
- Audit Logging
- Idempotency
- SLA Automation