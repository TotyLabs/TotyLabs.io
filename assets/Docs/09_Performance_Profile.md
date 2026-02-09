# 09 - Performance Profile

## Baseline Benchmarks

**Test environment**:
- Docker: Ubuntu 24.04 container
- Host: 4 CPU, 8GB RAM
- Network: localhost (no latency)
- Configuration: Default (timeout=30s, memory=512MB)

### Cold Start (First Execution)

```
Language    | Setup Time | Execution Time | Total
------------|------------|----------------|--------
Python      | 150-200ms  | 5-20ms         | 155-220ms
JavaScript  | 200-250ms  | 10-30ms        | 210-280ms
C           | 300-400ms  | 2-5ms          | 302-405ms
C++         | 400-500ms  | 3-8ms          | 403-508ms
Go          | 250-350ms  | 5-10ms         | 255-360ms
Rust        | 400-600ms  | 3-7ms          | 403-607ms
Java        | 800-1200ms | 20-50ms        | 820-1250ms
```

**Interpretation**:
- Java slowest (JVM startup overhead)
- C/C++ fast execution (compiled)
- Python moderate startup + fast execution
- Go well-balanced

### Steady State (Cached/Warm)

```
Language    | Execution Time | Notes
------------|----------------|---
Python      | 5-15ms         | Fast scripting
JavaScript  | 10-25ms        | V8 overhead
C           | 1-5ms          | Minimal overhead
C++         | 2-8ms          | Minimal overhead
Go          | 3-10ms         | Minimal overhead
Rust        | 2-7ms          | Minimal overhead
Java        | 15-40ms        | JVM + GC
```

### Container Overhead (Phase A vs Phase B)

```
Operation           | Phase A (Docker) | Phase B (Subprocess) | Difference
--------------------|------------------|----------------------|-----------
Container creation  | 100-200ms        | 0ms                  | Docker slower
Code write          | 10ms             | 10ms                 | Same
Execution           | Same             | Same                 | Same
Cleanup             | 50-100ms         | 20-50ms              | Docker slower
Total overhead      | 160-310ms        | 30-60ms              | **Docker 3-5x slower**
```

**Key insight**: Phase B (Subprocess) 3-5x faster than Phase A (Docker) for short-lived executions

### Output Capture Overhead

```
Output Size | Capture Time | Notes
------------|--------------|---
1 KB        | < 1ms        | Negligible
10 KB       | 1-2ms        | Negligible
100 KB      | 2-5ms        | Minimal
1 MB        | 10-20ms      | Still fast (in-memory)
> 1 MB      | Truncated    | Capped by limit
```

## Concurrency Performance

### Single Instance Performance

```
Concurrency Level | Avg Response Time | P99 Response Time | Errors
------------------|-------------------|-------------------|--------
1                 | 200ms             | 250ms             | 0%
5                 | 220ms             | 300ms             | 0%
10                | 250ms             | 400ms             | 0%
20                | 350ms             | 600ms             | 0.5%
50                | 500ms+            | 1000ms+           | 2%
100               | 1000ms+           | 2000ms+           | 5%
```

**Recommendation**: Maximum safe concurrency = 20-30 per instance

### Memory Usage Under Load

```
Concurrency | Memory Usage | Per-Request Overhead
------------|--------------|---------------------
1           | 150MB        | ~150MB
5           | 300MB        | ~60MB each
10          | 500MB        | ~50MB each
20          | 900MB        | ~45MB each
```

**Calculation**: 
- Base: ~100MB (GozoLite runtime)
- Per request: ~40-50MB (512MB limit, not all allocated)

### Throughput

```
Configuration | Requests/Second | Scenarios
--------------|-----------------|----------
Single core   | 5-10 req/s      | Simple Python
Dual core     | 10-20 req/s     | Mixed languages
Quad core     | 20-40 req/s     | With load balancer
```

**Limitation**: GozoLite itself is mostly I/O bound (waiting on execution), not CPU bound

## Resource Consumption

### CPU Profile

```
Activity              | CPU Usage | Notes
----------------------|-----------|---
Idle                  | < 1%      | Baseline
Input validation      | < 1%      | Quick regex
Code execution        | Variable  | Depends on code
Docker container mgmt | 2-5%      | Per-container overhead
```

### Memory Profile

```
Component          | Memory | Notes
-------------------|--------|---
Python runtime     | 50MB   | Base interpreter
Docker API client  | 30MB   | Connection pooling
Request handling   | 20MB   | Per-request buffers
Code/output cache  | 100MB  | Configurable via limit
```

### Network I/O

```
Operation | Bandwidth | Latency
----------|-----------|----------
Input     | < 1Mbps   | Code upload (64KB max)
Output    | < 10Mbps  | Result download (1MB max)
Docker    | < 5Mbps   | Socket communication
```

## Scaling Characteristics

### Vertical Scaling (More Resources)

```
Resource        | Impact on Throughput | Notes
----------------|----------------------|---
CPU cores +2    | +50%                 | Diminishing returns
RAM +512MB      | +20% (if memory-bound) | Allows more concurrency
Network +10Mbps | +10%                 | Usually not bottleneck
```

### Horizontal Scaling (More Instances)

```
Instances | Load Balancer | Throughput | Consistency
----------|---------------|------------|---
1         | N/A           | 20 req/s   | Perfect
2         | Required      | 35 req/s   | Good (90-95%)
4         | Required      | 60 req/s   | OK (80-90%)
8         | Required      | 90 req/s   | Fair (70-80%)
```

**Diminishing returns**: Extra instances have overhead (load balancer, network)

## Language Performance Ranking

**Fastest execution**:
```
1. C/C++ (compiled, minimal overhead): 1-10ms
2. Go (compiled, fast startup): 3-15ms
3. Rust (compiled, safe): 2-10ms
4. Python (interpreted, but fast): 5-20ms
5. JavaScript (V8 JIT): 10-30ms
6. Java (JVM): 15-50ms (high startup)
```

**Best for stress testing** (low overhead):
- C/C++ (minimal resources)
- Go (good balance)

**Worst for stress testing** (high overhead):
- Java (JVM startup)
- Compiled languages (compilation overhead)

## Optimization Tips

### Client-Side
- Reuse API connections (HTTP Keep-Alive)
- Batch requests if possible (but API doesn't support batch)
- Use connection pooling

### Server-Side
- Phase B (Subprocess) for short-lived code (faster)
- Phase A (Docker) for untrusted code (better isolation)
- Reduce timeout if possible (faster failure)
- Reduce memory if possible (more concurrency)

### Application-Level
- Cache frequently used code
- Pre-warm container images (docker pull)
- Monitor and alert on P99 latency
- Rate limit to prevent overload

## Limits and Trade-offs

### Security vs Performance

```
Security Measure        | Performance Impact | Trade-off
------------------------|-------------------|---
Docker isolation        | 3-5x slower       | Worth it (high security)
Input validation        | < 1ms             | Negligible
Resource limits         | < 1ms             | Negligible
Token validation        | < 1ms             | Negligible
Output truncation       | < 1ms             | Negligible
```

### Determinism vs Performance

```
Mode      | Speed      | Determinism | Use Case
----------|------------|-------------|---
Docker    | 3-5x slower| Perfect     | Production
Subprocess| Fast       | Good        | Fallback
Simulated | Instant    | Perfect     | Demo
```

## Under-Provisioning Scenarios

### Low Memory (< 512MB container)

```
Scenario: Container memory = 256MB
Impact:
  - Concurrent requests: 2-3 max (vs 20-30 normally)
  - Request failures: High (OOM)
  - Performance: Good per-request (no contention)

Recommendation: Upgrade to 1GB+ if expecting > 5 concurrent
```

### Low CPU (1 core)

```
Scenario: 1 CPU core
Impact:
  - Throughput: 5-10 req/s (vs 20-40 normally)
  - Latency: Increases under load
  - Scalability: Limited

Recommendation: Upgrade to 2+ cores for production
```

### Slow Network

```
Scenario: Network bandwidth = 10 Mbps
Impact:
  - Code upload: 10-50ms (for 64KB code)
  - Result download: 100-500ms (for 1MB output)
  - Bottleneck: Network, not execution

Recommendation: Upgrade to 100+ Mbps for production
```

## Headroom Calculation

**Formula**:
```
Container Memory = (Base + Per-Request) × Concurrency + 20% Headroom

Example:
  Base: 100MB
  Per-Request: 50MB
  Target Concurrency: 10
  
  100 + (50 × 10) × 1.2 = 100 + 600 = 700MB
  Recommendation: 1GB container
```

**CPU Cores**:
```
CPU Cores = Concurrency / 5

Example:
  Target: 10 concurrent requests
  CPUs: 10 / 5 = 2 cores minimum
  Recommendation: 4 cores (2x for headroom)
```

## Monitoring Recommendations

### Critical Metrics
- **Response time (p99)**: Alert if > 1000ms
- **Error rate**: Alert if > 1%
- **Concurrency**: Alert if > 50
- **Memory usage**: Alert if > 80% capacity

### Health Metrics
- **Docker availability**: Alert if unavailable (Phase B fallback)
- **Request queue depth**: Alert if > 10
- **Timeout frequency**: Alert if > 5% of requests

### Capacity Metrics
- **Requests/minute**: Track trend
- **Peak concurrency**: Track trend
- **Average response time**: Track trend
- **Language distribution**: Track usage patterns

## Benchmarking Your Own Setup

```bash
#!/bin/bash
# Simple load test
TOKEN="your-token"
ENDPOINT="http://localhost:7860/execute"

echo "Starting performance test..."

for concurrency in 1 5 10 20; do
  echo "Testing concurrency=$concurrency"
  
  for i in $(seq 1 $concurrency); do
    curl -X POST $ENDPOINT \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"language":"python","code":"print(1)","timeout":5}' &
  done
  
  wait
  echo "✓ Completed concurrency=$concurrency"
  sleep 2
done

echo "Test complete"
```

Better tool: `ab` (Apache Bench) or `wrk` (modern load tester)

```bash
# Install wrk
apt-get install wrk

# Run test
wrk -t4 -c100 -d30s \
  -H "Authorization: Bearer $TOKEN" \
  --script post.lua \
  http://localhost:7860/execute
```
