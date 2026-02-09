# 08 - Operational Runbook

## Key Operational Concepts

GozoLite has three execution backends that can be active depending on `EXECUTION_MODE`:
- **Phase A (Docker)**: Primary backend (production)
- **Phase B (Subprocess)**: Fallback backend (if Docker fails)
- **Phase C (Simulated)**: Demo/testing backend

This runbook covers operational procedures for each backend and common incidents.

---

## Normal Operations

### Startup Procedure

1. **Set environment variables**:
   ```bash
   export GOZOLITE_API_TOKEN="$(openssl rand -hex 32)"
   export EXECUTION_MODE=docker
   export ENVIRONMENT=production
   ```

2. **Start service**:
   ```bash
   docker-compose up -d
   ```

3. **Verify health**:
   ```bash
   curl http://localhost:7860/health
   
   # Expected response:
   # {
   #   "status": "ok",
   #   "execution_mode": "docker",
   #   "docker_available": true
   # }
   ```

4. **Check logs**:
   ```bash
   docker logs gozolite
   # Should see: "Application startup complete"
   ```

### Daily Monitoring

**Metrics to watch**:
- API response time (should be < 500ms)
- Error rate (should be < 1%)
- Docker daemon availability (critical)
- Backend fallback events (warning if frequent)

**Commands**:
```bash
# Check current status
curl -H "Authorization: Bearer $TOKEN" http://localhost:7860/health

# Get metrics
curl http://localhost:7860/metrics | grep gozolite_

# Check docker
docker ps
docker stats

# Check logs
docker logs gozolite --tail 100 -f
```

---

## Incident: Docker Phase A Unavailable

### Symptoms
- Error messages: `Docker daemon not accessible`
- Phase B fallback active (backend degradation)
- API responses slower than normal

### Diagnosis

```bash
# 1. Check if Docker daemon is running
docker ps

# Expected: Shows running containers

# If fails: "Cannot connect to Docker daemon"
```

### Resolution

**Option 1: Restart Docker daemon**
```bash
sudo systemctl restart docker

# Verify
docker ps

# If still fails:
sudo systemctl start docker
```

**Option 2: Check Docker socket permissions**
```bash
# Check socket exists and permissions
ls -la /var/run/docker.sock

# Output should show socket with rw permissions

# If missing or permission denied:
sudo chmod 666 /var/run/docker.sock
# or
sudo setfacl -m u:1000:rw /var/run/docker.sock
```

**Option 3: Verify container can access socket**
```bash
# Test from inside container
docker exec gozolite docker ps

# If fails: socket not mounted correctly
# Check docker-compose.yml or docker run command
# Ensure: -v /var/run/docker.sock:/var/run/docker.sock
```

**Option 4: Check container logs**
```bash
docker logs gozolite | grep -i docker

# Look for: "Docker runner unavailable", "Cannot connect to Docker"
```

### Fallback Behavior

If Phase A unavailable:
1. ExecutionRouter detects Docker failure
2. Automatically falls back to Phase B (Subprocess)
3. Response includes `"mode": "environment_degraded"`
4. **NOTE**: This is a graceful degradation, not a failure
5. Operations should investigate root cause (above)

### Recovery Verification

After fixing Docker:
```bash
# 1. Restart GozoLite service
docker-compose restart gozolite

# 2. Check backend
curl -H "Authorization: Bearer $TOKEN" http://localhost:7860/health
# Should show: "docker_available": true, "backends": {"docker": true}

# 3. Test execution
curl -X POST http://localhost:7860/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"language":"python","code":"print(1)","timeout":5}'
# Response should not have "environment_degraded"
```

---

## Incident: Subprocess Phase B Fallback Activated

### Symptoms
- Execution mode is still `docker` but responses show `"environment_degraded"`
- Docker Phase A failed and Phase B is active
- (See "Docker Phase A Unavailable" above for root cause)

### Impact Assessment
- Phase B provides weaker isolation (same kernel, same network namespace)
- Network blocking still enforced via regex validation
- Risk level: **Moderate** (acceptable for temporary fallback)

### Timeline for Action
- **Immediate**: Acknowledge fallback active in monitoring/alerting
- **Within 1 hour**: Investigate Docker issue (see Docker incident above)
- **Within 4 hours**: Restore Phase A if possible
- **Escalate if**: Docker cannot be restored within 4 hours

### Monitoring for Phase B

```bash
# Check if Phase B is active
curl -H "Authorization: Bearer $TOKEN" http://localhost:7860/health | jq '.backends.subprocess'

# If true: Phase B ready (in use if docker_available is false)

# Monitor metrics for subprocess usage
curl http://localhost:7860/metrics | grep "execution_mode.*subprocess"
```

---

## Incident: Memory Exhaustion / OOM Killer

### Symptoms
- Execution fails with `"mode": "oom"`
- Container killed due to memory limit
- Process logs show: `Out of memory: Kill process`

### Diagnosis

```bash
# Check memory usage
docker stats gozolite

# Expected:
# MEM USAGE / LIMIT
# 512m / 1g      <- Normal
# 900m / 1g      <- High but OK
# 1g / 1g        <- At limit

# Check system memory
free -h
```

### Why OOM Happens

1. **Normal case**: Attacker sends code that allocates > 512 MB
   - Limit enforced ✓
   - Execution fails with `mode: "oom"` ✓
   - No system impact ✓

2. **Container memory misconfigured**:
   - Limit too low (< 512 MB)
   - Concurrent requests exceed total memory
   - Memory leak in GozoLite itself

### Resolution

**Option 1: Increase container memory limit**
```bash
# Temporary
docker update --memory 2g gozolite

# Permanent (docker-compose.yml)
services:
  gozolite:
    mem_limit: 2g
```

**Option 2: Reduce concurrent connections**
```bash
# Check concurrent requests
docker stats gozolite

# If many requests running simultaneously:
# - Increase container memory
# - Implement rate limiting (nginx: limit_req)
# - Reduce per-request memory limit (SEC_MAX_MEMORY_MB)
```

**Option 3: Check for memory leak**
```bash
# Monitor memory growth
docker stats gozolite --no-stream

# Run for 1 hour and observe
watch -n 5 "docker stats gozolite --no-stream"

# If memory increases without requests:
# - Check GozoLite logs for errors
# - Restart GozoLite service
# - File bug report
```

---

## Incident: Timeout Not Enforced

### Symptoms
- Process runs longer than specified timeout
- Client waits indefinitely (or > 60 seconds)
- Process eventually killed but response takes too long

### Diagnosis

```bash
# Test timeout enforcement
curl -X POST http://localhost:7860/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "language":"python",
    "code":"import time; time.sleep(100)",
    "timeout":5
  }'

# Expected:
# - Response comes back in ~5 seconds
# - "mode": "timeout"
# - stdout/stderr captured

# If takes > 5 seconds:
# Check which backend is in use
curl -H "Authorization: Bearer $TOKEN" http://localhost:7860/health
```

### Resolution

**Phase A (Docker)**:
```bash
# Docker timeout enforcement via subprocess wait()
# Check if timeout is being clamped:
export SEC_MAX_TIMEOUT=60

# Verify in logs
docker logs gozolite | grep "timeout"
```

**Phase B (Subprocess)**:
```bash
# Check ProcessKiller timeout logic
# In code: core/process_killer.py

# Ensure RLIMIT_CPU is set correctly
docker exec gozolite python3 -c "import resource; print(resource.getrlimit(resource.RLIMIT_CPU))"
```

### Workaround

If timeout not working:
1. Stop accepting requests (set EXECUTION_MODE=simulated)
2. Investigate logs for errors
3. Restart GozoLite service
4. Resume normal operations

---

## Incident: API Unresponsive

### Symptoms
- `/health` endpoint not responding
- `/execute` requests timeout
- Container shows CPU at 100%

### Diagnosis

```bash
# 1. Check if container is running
docker ps | grep gozolite
# Should show: Up X minutes

# 2. Check if port is listening
netstat -an | grep 7860
# Expected: LISTEN on 0.0.0.0:7860

# 3. Check resource usage
docker stats gozolite --no-stream
# CPU, Memory, Network

# 4. Check logs
docker logs gozolite | tail -50

# 5. Try direct connection
curl http://localhost:7860/health -v
```

### Common Causes

**Cause 1: Container crashed**
```bash
# If "Exited" status
docker restart gozolite
docker logs gozolite

# If keeps crashing:
# Check for startup errors in logs
# Verify environment variables
```

**Cause 2: CPU overload**
```bash
# If CPU at 100% and many running processes
# Check metrics
curl http://localhost:7860/metrics | grep execution

# If many concurrent /execute requests:
# - Rate limiting not working
# - Expected for stress test
# - Monitor and resolve overload

# Temporary: Reduce load
# nginx: temporary turn off or rate limit aggressively
```

**Cause 3: Network/firewall issue**
```bash
# Check port is accessible
curl http://127.0.0.1:7860/health

# If works locally but not remotely:
# - Check firewall (iptables, AWS security group)
# - Check routing (if using reverse proxy)
# - Check CORS configuration
```

### Resolution

**Emergency restart**:
```bash
docker-compose restart gozolite
```

**Full restart**:
```bash
docker-compose down
docker-compose up -d
```

**Verify recovery**:
```bash
curl http://localhost:7860/health
# Should return quickly with {"status": "ok", ...}
```

---

## Scheduled Maintenance

### Daily Tasks
- [ ] Monitor error rate (target: < 1%)
- [ ] Monitor API response time (target: < 500ms)
- [ ] Check Docker daemon status
- [ ] Scan logs for warnings/errors

### Weekly Tasks
- [ ] Review metrics trends
- [ ] Update token rotation schedule
- [ ] Test disaster recovery procedure
- [ ] Review security audit logs

### Monthly Tasks
- [ ] Update Docker image (security patches)
- [ ] Rotate API tokens
- [ ] Capacity planning (memory, CPU, concurrency)
- [ ] Review and test Phase B fallback

### Quarterly Tasks
- [ ] Security audit (code, dependencies)
- [ ] Performance benchmarking
- [ ] Disaster recovery drill
- [ ] Update deployment documentation

---

## Cleanup Procedures

### Clean Containers

```bash
# Remove stopped containers
docker container prune -f

# Remove unused images
docker image prune -f

# Remove dangling volumes
docker volume prune -f
```

### Clean Temp Files

GozoLite automatically cleans up execution temp files, but if needed:

```bash
# Phase A temp files (inside container, auto-cleaned)
# No manual cleanup needed

# Phase B temp files (host filesystem)
rm -rf /tmp/gozolite_*
```

### Clean Logs

```bash
# Rotate logs (if using local driver)
docker logs --tail 0 gozolite

# Or via logrotate (host)
# /etc/logrotate.d/docker
```

---

## Escalation Path

**Level 1 (On-call engineer)**:
- API responding but errors
- Single backend unavailable (fallback active)
- High latency (< 10 seconds)

**Level 2 (Senior engineer)**:
- API not responding
- Both backends unavailable
- Security incident suspected

**Level 3 (On-call manager)**:
- Extended outage (> 30 minutes)
- Data loss or corruption
- Security breach

---

## Contact Information

- **On-call**: Slack #gozolite-alerts
- **Escalation**: @gozolite-incident-commander
- **Status page**: https://status.example.com/gozolite
