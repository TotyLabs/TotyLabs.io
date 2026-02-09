# 03 - Security Model

## Defense-in-Depth Strategy

GozoLite employs a multi-layered security model to protect the host system and ensure tenant isolation.

### Layer 1: Authentication & Multi-Tenancy (JWT)
- **Identity Enforcement**: Every request must carry a valid JWT signed by the system secret (fetched from Vault).
- **Tenant Isolation**: Tokens are bound to a `tenant_id`. All resource quotas and rate limits are tracked per tenant in Redis.
- **RBAC**: Access to sensitive endpoints (metrics, capabilities) is restricted to the `viewer` or `admin` roles.

### Layer 2: Semantic Validation (AST Analyzer)
- **Protocol**: Static analysis of Abstract Syntax Trees (AST) for Python.
- **Dunder Block**: Access to `__class__`, `__subclasses__`, etc., is strictly blocked to prevent sandbox escapes via reflection.
- **Symbol Whitelisting**: Blocks dangerous built-ins (`eval`, `exec`, `__import__`, `getattr`) and dangerous modules (`os`, `sys`, `subprocess`, `socket`, `requests`).
- **Heuristic Scanning**: Non-Python languages use strict pattern-based scanning for equivalent dangerous syscalls.

### Layer 3: Aggregated Resource Quotas
- **Atomic Enforcement**: Uses Redis `INCR` to prevent race conditions during slot acquisition.
- **Concurrent Caps**: Limits maximal simultaneous executions per tenant.
- **Memory Caps**: Limits the aggregate memory footprint of a tenant's active containers.
- **Rate Limiting**: Token bucket algorithm prevents API flooding and DoS.

### Layer 4: Hard Execution Isolation (Docker)
- **Containerization**: Every execution runs in a fresh, ephemeral container.
- **Zero Privileges**:
  - `no-new-privileges` enabled.
  - `cap-drop=ALL` (all capabilities dropped).
  - Network-less execution (CNI disabled).
- **Cgroups**: Hardware-level enforcement of memory (hard limit + no swap) and CPU quotas.
- **Filesystem**: Read-only root filesystem with ephemeral `/tmp` and `/home`.

### Layer 5: Tamper-Proof Auditing
- **HMAC Signing**: All audit logs are signed with a per-event HMAC-SHA256 signature.
- **Centralized Shipping**: Logs are pushed to a remote syslog server to prevent local tampering by an attacker who might gain limited shell access.
- **Persistence**: Local buffer ensures no log loss during network degradation.

## Threat Mitigation Matrix

| Threat | Mitigation Layer | Effectiveness |
|--------|------------------|---------------|
| RCE via eval() | AST Analyzer | High |
| Sandbox Escape (Reflection) | AST (Dunder Block) | High |
| Resource Exhaustion (DoS) | Quota Manager | High |
| Pivot via Network | Docker (No Network) | Critical |
| Host Filesystem Access | Docker (Read-only + Namespaces) | Critical |
| Log Manipulation | Centralized signed audit | High |
