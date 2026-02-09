# 01 - Architecture

## System Overview

GozoLite 3.0 is an enterprise-grade polyglot code execution platform. It uses a **strictly isolated execution model** where every request is executed in a fresh, ephemeral Docker container.

### High-Level Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                     FastAPI Application Layer                    │
│  /execute  /capabilities  /health  /metrics  (JWT + RBAC Auth)   │
└────────────────┬────────────────────────────────────────────────┘
                 │
        ┌────────▼────────┐
        │  GenericRunner  │ (Validation & Orchestration)
        └────────┬────────┘
                 │
        ┌────────▼────────┐
        │ContainerManager │ (Ephemeral Docker Sandbox)
        └────────┬────────┘
                 │
        ┌────────▼────────┐
        │  Audit Logger    │ (Centralized & Signed Logs)
        └──────────────────┘
```

## Core Components

### 1. Multi-Tenancy & Security (Middleware)
- **JWT Manager**: High-entropy token validation with tenant isolation.
- **RBAC**: Role-based access control (viewer, executor, admin).
- **Distributed Rate Limiter**: Per-tenant limits backed by Redis.
- **Quota Manager**: Atomic enforcement of concurrent executions and memory usage.

### 2. GenericRunner (`runners/generic_runner.py`)
- **Validation**: AST-based semantic analysis for Python; pattern-based for others.
- **Toolchain Registry**: Declarative mapping for 30+ enterprise languages.
- **Limit Enforcement**: Clamps user-provided timeout/memory to safe ranges.

### 3. ContainerManager (`core/container_manager.py`)
- **Isolation**: Ephemeral Docker containers with zero shared state.
- **Resource Constraints**: Cgroups enforced memory limits, CPU quotas, and PID limits.
- **Security Features**: `no-new-privileges`, `cap-drop=ALL`, isolated network and read-only rootfs.

### 4. Observability & Auditing
- **Centralized Audit Logger**: HMAC-SHA256 signed events shipped to syslog.
- **OpenTelemetry**: Distributed tracing and Prometheus metrics.

## Execution Flow

1. **Authentication**: JWT token validated; `tenant_id` and `role` extracted.
2. **Rate Limiting**: Redis check for per-tenant RPM and burst limits.
3. **Quota Acquisition**: Atomic reservation of concurrent slot and memory in Redis.
4. **Code Validation**: AST analyzer scans for dangerous patterns/syscalls.
5. **Sandbox Provisioning**: Ephemeral container created with strict resource quotas.
6. **Execution**: Code runs with mandatory wall-clock timeout and OOM kills.
7. **Cleanup & Logging**: Container destroyed; HMAC-signed audit log emitted.
8. **Quota Release**: Atomic release of concurrent slot and memory.
