# 05 - API Specification

## Overview

GozoLite provides an enterprise-grade RESTful API for polyglot code execution. All endpoints require **JWT-based Bearer token authentication** (except `/health` for informational access).

**Base URL**: `http://localhost:7860`

## Authentication & Multi-Tenancy

GozoLite uses JWT tokens for authentication and tenant isolation.

### Payload Schema
```json
{
  "tenant_id": "tenant-123",
  "role": "executor",
  "scopes": ["execute", "read"],
  "exp": 1704153600
}
```

### Roles (RBAC)
- **viewer**: Can access metadata and metrics (`/capabilities`, `/metrics`, `/stats`).
- **executor**: Can execute code (`/execute`).
- **admin**: Full platform access.

### Authorization Header
```
Authorization: Bearer {JWT_TOKEN}
```

---

## Endpoints

### 1. POST /execute
Execute code in an ephemeral container.

**Request**:
```json
POST /execute
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "language": "python",
  "code": "print('hello')",
  "timeout": 30,
  "memory_mb": 512
}
```

**Constraints**:
- **Language**: Must be whitelisted for the environment.
- **Code validation**: AST-based analysis blocks dangerous patterns.
- **Quota**: Enforced per-tenant (concurrent slots and memory).

**Response (200 OK)**:
```json
{
  "ok": true,
  "exit_code": 0,
  "stdout": "hello\n",
  "stderr": "",
  "time_ms": 42,
  "language": "python",
  "mode": "container",
  "exec_id": "ab12c3"
}
```

---

### 2. GET /capabilities
Diagnostics and operational environment report. **Requires `viewer` role.**

---

### 3. GET /metrics
Prometheus metrics. **Requires `viewer` role.**

---

### 4. GET /health
Lightweight health status. **Public.**
```json
{
  "status": "healthy",
  "version": "3.0.0"
}
```

---

## Rate Limiting (Distributed)
Per-tenant rate limiting via Redis. 
- Default: 60 RPM, 10 burst.
- Returns `429 Too Many Requests` when exceeded.

## Audit Logs
All requests are signed with HMAC-SHA256 and shipped via Syslog to a centralized storage.
