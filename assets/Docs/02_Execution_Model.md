# 02 - Execution Model (Enterprise)

## Overview

GozoLite 3.0 uses a **Strictly Isolated Container Execution Model**. For maximum security and multi-tenant predictability, every execution occurs within a fresh, ephemeral Docker container. Legacy subprocess and simulated backends have been deprecated and removed from the core execution path.

## The Ephemeral Container Flow

### Lifecycle
1. **Provisioning**: A new container is spawned from the `gozolite-executor` image.
2. **Standardization**: Environment variables and paths are normalized.
3. **Injection**: User code is injected into the container via a secure /tmp mount or `cat` redirection.
4. **Execution**: The language-specific runner executes the code.
5. **Observation**: `stdout`, `stderr`, and `time_ms` are captured.
6. **Destruction**: The container is immediately SIGKILLed and removed (`--rm`).

### Resource Isolation (Hardware Enforced)
Isolation is strictly enforced via Linux kernel namespaces and cgroups:

| Feature | Enforcement Mechanism | Limit |
|---------|-----------------------|-------|
| **Memory** | Cgroups `memory.limit_in_bytes` | 512 MB (Default) |
| **Swap** | `memory.memsw.limit_in_bytes` | 0 MB (No swap allowed) |
| **CPU** | Cgroups `cpu.shares` / `cpu.cfs_quota_us` | 0.5 Cores (50%) |
| **Processes** | `pids.max` (PIDs Controller) | 64 (Fork bomb protection) |
| **Network** | Network Namespace | None (Loopback only) |
| **Filesystem** | Mount Namespace | Read-only root + tmpfs |

### Determinism Guarantee
The system guarantees that the same code provided with the same resource constraints will always produce the same output (modulo non-deterministic language features like `time.now()`), as the underlying hardware resources are strictly capped and isolated from other tenants.

---

## Execution Sequence (Internal)

1. **Quota Acquisition**: Tenant reservations are checked in Redis.
2. **Container Start**: `docker run` with `--network none`, `--memory 512m`, `--pids-limit 64`.
3. **Process Execution**: The runner (e.g., `python3`, `node`) is started as the container's PID 1 or child.
4. **Wall-clock Timeout**: A mandatory timeout (default 30s) is enforced by the `ContainerManager`. If exceeded, the container is destroyed instantly.
5. **Result Capture**: Logs are retrieved before container deletion.

## Security Constraints
- **UID/GID**: Container runs as unprivileged user `gozolite` (1000:1000).
- **Capabilities**: All Linux capabilities are dropped (`--cap-drop=ALL`).
- **No New Privileges**: Sub-processes cannot gain privileges via `setuid` or `setgid` binaries.
