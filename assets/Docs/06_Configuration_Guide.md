# 06 - Configuration Guide

## Environment Variables

All configuration via environment variables (12-factor app). No config files.

### Required Variables

#### GOZOLITE_API_TOKEN
- **Purpose**: Bearer token for API authentication
- **Required**: Yes (production), No (development)
- **Type**: String
- **Length**: 32+ characters recommended
- **Example**: `export GOZOLITE_API_TOKEN="$(openssl rand -hex 32)"`
- **Impact**: Unauthenticated requests rejected with 401/403

#### EXECUTION_MODE
- **Purpose**: Select backend (Docker / Subprocess / Simulated)
- **Required**: Yes
- **Type**: String
- **Values**: `docker`, `subprocess`, `simulated`
- **Default**: `docker`
- **Impact**: 
  - `docker`: Phase A (highest isolation)
  - `subprocess`: Phase B (fallback, less isolation)
  - `simulated`: Phase C (demo only)

### Security Variables

#### SEC_MAX_CODE_BYTES
- **Purpose**: Maximum code size
- **Type**: Integer
- **Default**: 65536 (64 KB)
- **Range**: [1024, 1048576]
- **Impact**: Code larger than this rejected with 400 Bad Request

#### SEC_MAX_LINES
- **Purpose**: Maximum lines of code
- **Type**: Integer
- **Default**: 1200
- **Impact**: Code with more lines rejected

#### SEC_MAX_BLOCKS
- **Purpose**: Maximum Markdown code fence blocks
- **Type**: Integer
- **Default**: 20
- **Impact**: Multi-block submissions rejected

#### SEC_MAX_TIMEOUT
- **Purpose**: Maximum execution timeout
- **Type**: Integer
- **Default**: 60 (seconds)
- **Impact**: Timeout clamped to [1, SEC_MAX_TIMEOUT]

#### SEC_MAX_MEMORY_MB
- **Purpose**: Maximum memory allocation
- **Type**: Integer
- **Default**: 1024 (MB)
- **Impact**: Memory limit clamped to [64, SEC_MAX_MEMORY_MB]

#### SEC_LANG_WHITELIST
- **Purpose**: Allowed languages (comma-separated)
- **Type**: String
- **Default**: "" (all languages allowed)
- **Example**: `SEC_LANG_WHITELIST=python,javascript,c,cpp,go`
- **Impact**: If set, only listed languages execute; others rejected

#### SEC_ALLOW_NET
- **Purpose**: Allow network access in code
- **Type**: Boolean
- **Default**: false
- **Values**: "true", "false", "1", "0"
- **Impact**: 
  - false: Regex blocks socket, requests, urllib, fetch, http.* calls
  - true: Network calls allowed (not recommended)

### Deployment Variables

#### PORT
- **Purpose**: HTTP server port
- **Type**: Integer
- **Default**: 7860
- **Impact**: API listens on 0.0.0.0:PORT

#### GOZOLITE_VERSION
- **Purpose**: Version string (informational)
- **Type**: String
- **Default**: "2.0.0"
- **Impact**: Returned in /health and API docs

#### ENVIRONMENT
- **Purpose**: Deployment environment
- **Type**: String
- **Values**: "development", "production"
- **Default**: "development"
- **Impact**: Production mode enforces stricter auth

#### CORS_ORIGINS
- **Purpose**: CORS allowed origins
- **Type**: String (comma-separated)
- **Default**: "http://localhost,http://127.0.0.1,http://localhost:7860,http://127.0.0.1:7860"
- **Example**: `CORS_ORIGINS="https://app.example.com,https://api.example.com"`
- **Special**: `CORS_ORIGINS="*"` allows all (dev only)

### Docker Phase A Variables

#### DOCKER_SOCKET
- **Purpose**: Docker daemon socket path
- **Type**: String
- **Default**: "unix:///var/run/docker.sock"
- **Impact**: Used by ContainerManager to connect to Docker

#### DOCKER_IMAGE
- **Purpose**: Container image for execution
- **Type**: String
- **Default**: "gozolite-executor:latest"
- **Impact**: Image must exist locally or in registry

### Logging Variables

#### LOG_LEVEL
- **Purpose**: Minimum log level
- **Type**: String
- **Values**: "DEBUG", "INFO", "WARNING", "ERROR"
- **Default**: "INFO"
- **Impact**: Control verbosity

#### LOG_FORMAT
- **Purpose**: Log output format
- **Type**: String
- **Values**: "json", "text"
- **Default**: "text"
- **Impact**: JSON for structured logging, text for console

### Performance Variables (Tuning)

#### PROCESS_TIMEOUT_GRACE_PERIOD
- **Purpose**: Wait time after SIGTERM before SIGKILL
- **Type**: Integer (seconds)
- **Default**: 2
- **Impact**: Grace period for cleanup

#### OUTPUT_MAX_BYTES
- **Purpose**: Max stdout/stderr per stream
- **Type**: Integer
- **Default**: 1048576 (1 MB)
- **Impact**: Output truncated if exceeded

## Resource Limit Defaults

### Execution Resource Limits

```python
SandboxConfig(
    timeout=30,                    # seconds (min 1, max SEC_MAX_TIMEOUT)
    memory_mb=512,                 # MB (min 64, max SEC_MAX_MEMORY_MB)
    max_output_bytes=1048576,      # 1 MB
    max_file_size=10485760,        # 10 MB
    max_open_files=64,             # file descriptors
    max_processes=64,              # fork bomb protection
    enable_network=False,          # always disabled
)
```

### Phase A (Docker) Resource Cgroups

```
Memory:     512 MB (hard limit, no swap)
CPU:        0.5 cores (50% CPU quota)
Processes:  64 (--pids-limit)
Disk:       Ephemeral (deleted after execution)
```

### Phase B (Subprocess) Resource Limits

```
RLIMIT_CPU:    30 seconds (CPU time, not wall clock)
RLIMIT_AS:     512 MB (virtual address space)
RLIMIT_FSIZE:  10 MB (file size)
RLIMIT_NOFILE: 64 (open files)
RLIMIT_NPROC:  64 (process count)
```

## Default Configuration (Development)

```bash
# Permissive defaults (development only)
export PORT=7860
export EXECUTION_MODE=docker
export ENVIRONMENT=development
export GOZOLITE_VERSION=2.0.0
export LOG_LEVEL=INFO

# Defaults (no specific config needed)
# SEC_MAX_CODE_BYTES=65536
# SEC_MAX_LINES=1200
# SEC_MAX_TIMEOUT=60
# SEC_MAX_MEMORY_MB=1024
# SEC_LANG_WHITELIST=""  (all languages)
# SEC_ALLOW_NET=false
# CORS_ORIGINS="http://localhost,http://127.0.0.1,..."
```

## Production Configuration

```bash
# Required (must set)
export GOZOLITE_API_TOKEN="$(openssl rand -hex 32)"
export ENVIRONMENT=production
export EXECUTION_MODE=docker

# Recommended (security hardening)
export PORT=7860
export SEC_MAX_CODE_BYTES=65536    # Enforce strict limit
export SEC_MAX_TIMEOUT=30           # Shorter timeout
export SEC_MAX_MEMORY_MB=512        # Strict memory
export SEC_LANG_WHITELIST="python,javascript,c,cpp,go,rust"  # Only safe languages
export SEC_ALLOW_NET=false          # No network
export CORS_ORIGINS="https://app.example.com"  # Restrict CORS
export LOG_LEVEL=INFO               # Not DEBUG
```

## Secure Defaults Checklist

- [ ] GOZOLITE_API_TOKEN set to cryptographically strong value
- [ ] ENVIRONMENT=production (enables strict auth)
- [ ] EXECUTION_MODE=docker (highest isolation)
- [ ] CORS_ORIGINS restricted to known domains
- [ ] SEC_LANG_WHITELIST set to approved languages only
- [ ] SEC_ALLOW_NET=false (disable network)
- [ ] LOG_LEVEL=INFO or higher (no DEBUG logs)
- [ ] PORT behind firewall or reverse proxy
- [ ] HTTPS required (not HTTP)

## Configuration Validation

Run at startup to verify configuration:

```bash
#!/bin/bash
set -e

# Check required vars
if [ -z "$GOZOLITE_API_TOKEN" ]; then
    echo "ERROR: GOZOLITE_API_TOKEN not set"
    exit 1
fi

if [ -z "$EXECUTION_MODE" ]; then
    echo "ERROR: EXECUTION_MODE not set"
    exit 1
fi

# Validate values
case "$EXECUTION_MODE" in
    docker|subprocess|simulated)
        echo "✓ EXECUTION_MODE=$EXECUTION_MODE"
        ;;
    *)
        echo "ERROR: Invalid EXECUTION_MODE=$EXECUTION_MODE"
        exit 1
        ;;
esac

# Warn on dangerous configs
if [ "$ENVIRONMENT" != "production" ]; then
    echo "⚠ WARNING: ENVIRONMENT not set to production"
fi

if [ "$SEC_ALLOW_NET" = "true" ]; then
    echo "⚠ WARNING: SEC_ALLOW_NET=true (network enabled)"
fi

if [ "$CORS_ORIGINS" = "*" ]; then
    echo "⚠ WARNING: CORS_ORIGINS=* (all origins allowed)"
fi

echo "✓ Configuration validated"
```

## Runtime Configuration Changes

**Not supported**: Configuration is read at startup only.

**To change configuration**:
1. Update environment variables
2. Restart application
3. Configuration takes effect on next request

## Limitations

- No hot reload (restart required)
- No config file (env vars only)
- No per-request overrides
- No user-specific limits
