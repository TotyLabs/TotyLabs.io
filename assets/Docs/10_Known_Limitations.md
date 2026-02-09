# 10 - Known Limitations

## Language Support Limitations

### Partially Supported Languages

#### Java
**Issue**: JVM startup overhead (800ms-1.2s per execution)

**Limitation**: 
- Not suitable for latency-critical applications
- Fine for batch workloads
- Memory overhead (JVM ~200MB)

**Workaround**: Use Phase B (Subprocess) for faster startup

#### Scala
**Issue**: Depends on Java, inherits startup overhead

**Limitation**: Same as Java, plus compilation overhead

#### Kotlin
**Issue**: JVM-based, slow startup

**Limitation**: Similar to Scala

#### Clojure
**Issue**: JVM-based interpreter

**Limitation**: 1-2 second startup time

**Recommendation**: Not recommended for production unless batch workloads

### Not Fully Tested

#### COBOL
**Status**: Installed but limited real-world testing
**Known issue**: COBOL has rare security vulnerabilities, but outdated syntax parser may have bugs

#### Ada
**Status**: gnat compiler installed but rarely tested
**Known issue**: Complex language, edge cases may not be handled

#### Scheme/Lisp
**Status**: Available but limited testing
**Known issue**: Recursive evaluation could hit resource limits unexpectedly

**Recommendation**: Test thoroughly before using in production

### Missing Advanced Features

#### Python
**Missing**:
- `asyncio` (would need event loop)
- Networking modules (blocked by regex validation)
- File I/O beyond /tmp (sandboxed)
- Multiprocessing (isolated process, no inter-process communication)

**Workaround**: Use alternative constructs or split logic

#### JavaScript
**Missing**:
- Browser APIs (DOM, fetch, etc.)
- Node.js `fs` module (blocked by regex validation)
- Native modules (C++ addons not available)

**Limitation**: Code must be pure JavaScript or use built-in Node modules only

#### Go
**Missing**:
- CGO (C interop, disabled in Dockerfile)
- Networking (would be blocked)

**Limitation**: Pure Go code only

---

## Execution Model Limitations

### Phase A (Docker) Limitations

#### Container Startup Overhead
**Issue**: 100-200ms per execution

**Impact**: Not suitable for < 50ms execution time expectations

**Workaround**: Use Phase B (Subprocess) if latency-critical

#### Docker Dependency
**Issue**: Requires Docker daemon running

**Impact**: Docker outage = fallback to Phase B (weaker isolation)

**Mitigation**: Implement health monitoring and alerting

#### Container Image Size
**Issue**: ~2GB for all 30+ language toolchains

**Impact**: 
- Slow pull on first run
- Large disk footprint
- Network bandwidth for deployment

**Mitigation**: Pre-pull images during deployment

#### Resource Limits Hard Enforcement
**Issue**: Process killed when hitting limits (no graceful shutdown)

**Impact**: Incomplete results, no error output from code

**Workaround**: Code should check available memory and time proactively

### Phase B (Subprocess) Limitations

#### Weaker Isolation
**Issue**: Same kernel, same network namespace, same filesystem

**Impact**: 
- Kernel exploits affect host
- Network isolation via regex only (can be bypassed)
- File access via path traversal possible

**Mitigation**: Keep OS kernel updated, use gVisor for stricter isolation

#### Binary Availability
**Issue**: Language execution depends on host OS binaries

**Impact**: Not all 30+ languages may be available in all environments

**Mitigation**: Install required toolchains before deployment

#### Resource Limit Precision
**Issue**: setrlimit may not be precisely enforced by all OS versions

**Impact**: Process might exceed stated memory limit slightly

**Mitigation**: Add safety margin to limits

#### CPU Time vs Wall Clock
**Issue**: RLIMIT_CPU limits CPU time, not wall clock time

**Impact**: 
- Infinite loop on single CPU thread: kills after 30s CPU time
- Infinite loop with sleep: timeout not enforced (sleeps don't count as CPU time)

**Known issue**: `while True: pass.sleep(0.001)` may not timeout properly

**Workaround**: ProcessKiller has separate wall-clock timeout, but may have race conditions

### Phase C (Simulated) Limitations

#### No Real Execution
**Issue**: Returns synthetic output

**Impact**: 
- Not suitable for production
- Results are fake
- No actual language verification

**Recommendation**: Demo and testing only

---

## Security Limitations

### Input Validation Limitations

#### Regex-Based Pattern Blocking (Not AST-Based)

**What it catches**:
```python
import os
os.system("echo hello")   # Caught by /os/
eval("print(1)")          # Caught by /eval/
```

**What it misses**:
```python
x = "o" + "s"
__import__(x).system("echo hello")  # NOT caught (obfuscation)

eval("prin" + "t(1)")     # NOT caught (string concatenation)

# Compiled bytecode bypass
import marshal
marshal.loads(b"...")     # Caught by /marshal\.loads/

# But renamed import:
loads = marshal.loads
loads(b"...")  # NOT caught reliably
```

**Impact**: Determined attacker can bypass regex validation

**Mitigation**: 
- Use AST-based Python validation (parse code, analyze tree)
- Accept residual risk for public-facing API
- Add monitoring for bypass attempts

#### Network Blocking (Regex-Based)

**Blocked patterns**:
```python
socket, requests, urllib, fetch, http., https.
```

**Bypasses**:
```python
# Obfuscation
s = __import__("so" + "cket")

# Encoding
import base64
__import__(base64.b64decode(b"c29ja2V0")).socket()

# DNS
# No network namespace in Phase B = could reach internal services
```

**Mitigation**: 
- Run Phase B in network namespace (if possible)
- Add iptables rules to block outbound connections
- Monitor for suspicious network patterns

### Container Escape Risks

#### Known Kernel Vulnerabilities

**CVE-2021-30465** (runc):
- Affects: Docker using older runc versions
- Impact: Container escape possible
- Mitigation: Update Docker/runc

**CVE-2023-5678** (containerd):
- Affects: Older containerd versions
- Impact: Container escape
- Mitigation: Update containerd

**Future vulnerabilities**: Kernel 0-days are discovered regularly

**Mitigation strategy**:
- Keep Docker updated
- Use gVisor for higher assurance (runsc runtime)
- Monitor security advisories
- Assume escape is possible, add secondary controls

### Token Security Limitations

#### No Token Expiration

**Issue**: Bearer tokens valid indefinitely

**Impact**: 
- Stolen token usable forever
- No automatic key rotation
- Breach = permanent compromise

**Mitigation**: 
- Implement token rotation schedule (manual)
- Store tokens in secure vault (AWS Secrets Manager)
- Monitor token usage patterns

#### No Rate Limiting Per Token

**Issue**: No protection against brute force or replay attacks

**Impact**: 
- One token could be abused to DoS service
- No per-user quotas
- No audit trail of who made requests

**Mitigation**: 
- Implement Redis-based rate limiter (per token)
- Limit to 100 requests/minute per token
- Add request logging

#### No RBAC (Role-Based Access Control)

**Issue**: All tokens have same permissions

**Impact**: 
- Cannot restrict certain languages to certain users
- Cannot implement quotas per user
- Cannot audit who executed what code

**Mitigation**: 
- Implement RBAC layer
- Add user identity to requests
- Log execution per user

---

## Output and Performance Limitations

### Output Size Truncation

**Limitation**: Max 1 MB per stream (stdout, stderr)

**Impact**: Code with large output loses data

**Example**:
```python
for i in range(1000000):
    print(f"Line {i}")  # 8MB+ output
# Response includes only first 1MB with truncated=true
```

**Mitigation**: 
- Document 1 MB limit
- Stream output to external service
- Accept truncation for policy

### Execution Time Ceiling

**Limitation**: Max 60 seconds (SEC_MAX_TIMEOUT)

**Impact**: Long-running computations must complete in 60s or get killed

**Example**:
```python
# 3-hour computation
result = heavy_computation()  # Gets killed at 60s
```

**Mitigation**: 
- Checkpoint and resume
- Split computation into stages
- Accept 60s ceiling as requirement

### Memory Ceiling

**Limitation**: Max 1024 MB (SEC_MAX_MEMORY_MB)

**Impact**: Large data structures must fit in ~500 MB (configured default)

**Example**:
```python
# Allocate 2GB
data = [0] * (2_000_000_000 // 8)  # Killed by OOM
```

**Mitigation**: 
- Use generators instead of lists
- Stream data
- Accept 512 MB ceiling as requirement

---

## Deployment Limitations

### Single Docker Daemon Per Instance

**Limitation**: Cannot run multiple Docker daemons in single container

**Impact**: Phase A executes code in same Docker daemon as GozoLite

**Risk**: 
- Container escape could compromise GozoLite itself
- Sibling containers visible (shouldn't be an issue with good namespace isolation)

**Mitigation**: 
- Use gVisor to strengthen isolation
- Accept risk of privileged execution
- Monitor for escape attempts

### No State Persistence

**Limitation**: Each execution is stateless

**Impact**: 
- No session state across requests
- Each request independent
- No "connected" API sessions

**Workaround**: Clients must manage state server-side

### No Database Integration

**Limitation**: No built-in persistence layer

**Impact**: 
- Execution results not stored
- No query history
- No replay capability

**Workaround**: 
- Client side adds persistence
- Use external database
- Implement result caching service

---

## Known Bugs and Issues

### ProcessKiller Race Condition (Phase B)

**Bug**: ProcessKiller may not reliably enforce timeout on all systems

**Symptoms**: 
- Process runs past timeout in rare cases
- More common on overloaded systems
- Non-deterministic

**Status**: Acknowledged, not critical

**Workaround**: 
- Increase timeout by 5 seconds as margin
- Use Phase A (Docker) for critical workloads
- Monitor and report if timeout frequently exceeded

### Docker Socket Permission Issues

**Bug**: In some configurations, Docker socket permissions reset after reboot

**Symptoms**: 
- Phase A available at startup but fails later
- Falls back to Phase B unexpectedly

**Status**: Environment-specific, not GozoLite bug

**Mitigation**: 
- Set persistent socket permissions in systemd
- Use `setfacl` instead of `chmod`
- Add startup check and alert

### Zero-Trust Manager Not Implemented

**Issue**: `security/zero_trust.py` is stub only

**Status**: Listed but non-functional

**Impact**: Cannot implement additional zero-trust controls

**Recommendation**: File issue for future implementation

---

## Architectural Limitations

### No Load Balancing Built-In

**Limitation**: GozoLite is single-instance; horizontal scaling requires external load balancer

**Impact**: 
- Added complexity (nginx/HAProxy needed)
- State management across instances (if implemented later)

**Workaround**: Deploy behind standard load balancer

### No Caching

**Limitation**: Results not cached; identical requests re-executed

**Impact**: 
- Wasted resources for identical requests
- Higher latency than necessary

**Workaround**: 
- Implement client-side caching
- Add result cache service (Redis)

### No Async Execution

**Limitation**: All executions synchronous; client waits for result

**Impact**: 
- Long-running tasks block client
- Poor user experience for slow code
- Not suitable for 10+ second tasks

**Workaround**: 
- Implement job queue (Celery, RQ)
- Return job ID, poll for result
- Accept synchronous limitation

---

## Recommendations for Overcoming Limitations

| Limitation | Severity | Recommendation |
|------------|----------|-----------------|
| Regex bypass possible | Medium | Add AST-based validation, monitor for patterns |
| Network isolation weak in Phase B | High | Use Phase A for untrusted code, add iptables rules |
| Container escape possible | Medium | Keep Docker updated, monitor kernel CVEs |
| Token not expiring | Medium | Implement rotation schedule, use secrets vault |
| No rate limiting | High | Add Redis-based rate limiter before production |
| No RBAC | Medium | Implement RBAC layer for multi-tenant scenarios |
| Output truncated at 1 MB | Low | Document limit, accept for most use cases |
| Timeout max 60s | Low | Document limit, recommend Phase B for longer |
| Zero-trust stub | Low | File issue for future implementation |
| No load balancing | Low | Use nginx/HAProxy, acceptable trade-off |

---

## Unsupported Use Cases

1. **Real-time execution** (< 50ms latency required)
   - Phase A: 150-300ms overhead
   - Phase B: 30-100ms overhead
   - Recommendation: Pre-compiled services instead

2. **Long-running tasks** (> 60s)
   - Timeout ceiling
   - Recommendation: Job queue system

3. **Large data processing** (> 1 GB memory)
   - Memory ceiling
   - Recommendation: Spark, data warehouse

4. **Multi-user isolation** (RBAC required)
   - Single token auth
   - Recommendation: Implement RBAC wrapper

5. **Deterministic GPU execution**
   - No GPU support
   - Recommendation: Separate GPU service

6. **Interactive shells**
   - No REPL support
   - Recommendation: JupyterHub or similar

---

## Future Improvements

**Planned (if implemented)**:
- [ ] Rate limiting per token
- [ ] AST-based Python validation
- [ ] gVisor support (stricter isolation)
- [ ] Token expiration
- [ ] RBAC
- [ ] Result caching
- [ ] Async job support
- [ ] Observability improvements (tracing, metrics)
