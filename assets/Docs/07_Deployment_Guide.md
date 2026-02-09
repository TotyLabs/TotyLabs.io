# 07 - Deployment Guide

## Docker Setup

### Build Image

```bash
# Build executor image (includes all 30+ language toolchains)
docker build -t gozolite-executor:latest .

# Verify image
docker images | grep gozolite
```

### Run Container (Phase A)

**Development**:
```bash
docker run -it \
  -p 7860:7860 \
  -e GOZOLITE_API_TOKEN="dev-token" \
  -e EXECUTION_MODE=docker \
  -e ENVIRONMENT=development \
  gozolite-executor:latest
```

**With Docker Socket** (for Phase A, Docker-in-Docker):
```bash
docker run -d \
  -p 7860:7860 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e GOZOLITE_API_TOKEN="$(openssl rand -hex 32)" \
  -e EXECUTION_MODE=docker \
  -e ENVIRONMENT=production \
  gozolite-executor:latest
```

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  gozolite:
    build: .
    ports:
      - "7860:7860"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      GOZOLITE_API_TOKEN: "${GOZOLITE_API_TOKEN}"
      EXECUTION_MODE: docker
      ENVIRONMENT: production
      SEC_MAX_TIMEOUT: 30
      SEC_MAX_MEMORY_MB: 512
      SEC_LANG_WHITELIST: "python,javascript,c,cpp,go,rust"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:7860/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

**Deploy**:
```bash
export GOZOLITE_API_TOKEN="$(openssl rand -hex 32)"
docker-compose up -d
```

## Kubernetes Deployment

```yaml
# k8s-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gozolite
  namespace: default
spec:
  replicas: 3
  selector:
    matchLabels:
      app: gozolite
  template:
    metadata:
      labels:
        app: gozolite
    spec:
      serviceAccountName: gozolite
      containers:
      - name: gozolite
        image: gozolite-executor:latest
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 7860
        env:
        - name: GOZOLITE_API_TOKEN
          valueFrom:
            secretKeyRef:
              name: gozolite-secret
              key: api-token
        - name: EXECUTION_MODE
          value: "docker"
        - name: ENVIRONMENT
          value: "production"
        - name: SEC_MAX_TIMEOUT
          value: "30"
        - name: SEC_MAX_MEMORY_MB
          value: "512"
        resources:
          requests:
            cpu: "500m"
            memory: "512Mi"
          limits:
            cpu: "1000m"
            memory: "1024Mi"
        livenessProbe:
          httpGet:
            path: /health
            port: 7860
          initialDelaySeconds: 10
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health
            port: 7860
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 2
        volumeMounts:
        - name: docker-socket
          mountPath: /var/run/docker.sock
      volumes:
      - name: docker-socket
        hostPath:
          path: /var/run/docker.sock
          type: Socket
      nodeSelector:
        kubernetes.io/os: linux

---
apiVersion: v1
kind: Service
metadata:
  name: gozolite-service
spec:
  type: LoadBalancer
  selector:
    app: gozolite
  ports:
  - protocol: TCP
    port: 80
    targetPort: 7860

---
apiVersion: v1
kind: Secret
metadata:
  name: gozolite-secret
type: Opaque
stringData:
  api-token: "CHANGE_ME_IN_PRODUCTION"
```

**Deploy**:
```bash
kubectl create namespace gozolite
kubectl -n gozolite apply -f k8s-deployment.yaml
kubectl -n gozolite get pods
```

## Docker Socket Requirements

### Prerequisites

For Phase A (Docker backend), container must access Docker daemon:

1. **Mount Docker socket**:
   ```bash
   -v /var/run/docker.sock:/var/run/docker.sock
   ```

2. **User permissions**:
   ```bash
   # On host, add Docker user to docker group
   sudo usermod -aG docker gozolite-user
   
   # In container (if using custom UID)
   docker run --user 1000 ...  # Must have docker socket permissions
   ```

3. **Verify access**:
   ```bash
   docker exec <container> docker ps
   # Should show running containers
   ```

### Host Configuration

```bash
# Check Docker socket permissions
ls -la /var/run/docker.sock

# Add GozoLite container user to docker group (if needed)
sudo setfacl -m u:1000:rw /var/run/docker.sock
```

## Redis Configuration (Optional, for Rate Limiting)

If rate limiting enabled (future feature):

```bash
# Start Redis
docker run -d \
  -p 6379:6379 \
  -v redis-data:/data \
  redis:latest

# Configure GozoLite
export REDIS_URL="redis://localhost:6379/0"
```

## Production Checklist

### Pre-Deployment

- [ ] GOZOLITE_API_TOKEN set to cryptographically strong value
- [ ] EXECUTION_MODE=docker (Phase A for highest isolation)
- [ ] ENVIRONMENT=production
- [ ] CORS_ORIGINS restricted to known domains
- [ ] SEC_LANG_WHITELIST set to approved languages
- [ ] SEC_ALLOW_NET=false
- [ ] LOG_LEVEL=INFO or higher
- [ ] Docker image built and tested
- [ ] Health check endpoint responding

### Security Hardening

- [ ] API behind HTTPS reverse proxy (nginx, HAProxy)
- [ ] API behind WAF (ModSecurity, Cloudflare)
- [ ] Rate limiting implemented (nginx: `limit_req`, HAProxy: `rate_limit`)
- [ ] DDoS protection (Cloudflare, AWS Shield)
- [ ] API key rotation schedule planned
- [ ] Secrets stored in secure vault (AWS Secrets Manager, HashiCorp Vault)
- [ ] Audit logging enabled
- [ ] Monitoring/alerting configured

### Infrastructure

- [ ] Compute: Minimum 2GB RAM per instance (1GB for GozoLite + 1GB headroom)
- [ ] Storage: 20GB for base image + 5GB per concurrent execution
- [ ] Network: Minimum 100 Mbps (for large code uploads)
- [ ] Docker daemon running and accessible
- [ ] Docker image pulled or built locally
- [ ] Container restart policy set (`unless-stopped` or `on-failure`)

### Monitoring & Observability

- [ ] Health check endpoint configured (Kubernetes, Docker, load balancer)
- [ ] Metrics endpoint available for Prometheus scraping
- [ ] Logs aggregated to central service (ELK, Datadog, etc.)
- [ ] Alerting configured for:
  - [ ] API response time > 500ms
  - [ ] Error rate > 1%
  - [ ] Container restart frequency
  - [ ] Docker daemon unavailable (Phase B fallback)

## Reverse Proxy Configuration

### Nginx

```nginx
upstream gozolite {
    server 127.0.0.1:7860;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;
    
    ssl_certificate /etc/ssl/certs/api.example.com.crt;
    ssl_certificate_key /etc/ssl/private/api.example.com.key;
    
    # Security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header X-XSS-Protection "1; mode=block";
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;
    limit_req_zone $http_authorization zone=per_token:10m rate=100r/m;
    limit_req zone=general burst=20 nodelay;
    limit_req zone=per_token burst=10 nodelay;
    
    # Request timeouts
    proxy_connect_timeout 10s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
    
    # Max request body (code max 64KB)
    client_max_body_size 1M;
    
    location / {
        proxy_pass http://gozolite;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### HAProxy

```haproxy
frontend gozolite_front
    bind *:80
    mode http
    timeout client 60s
    
    # Rate limiting
    stick-table type ip size 100k expire 30s store http_req_rate(10s)
    http-request track-sc0 src
    http-request deny if { sc_http_req_rate(0) gt 100 }
    
    # Forward to backend
    default_backend gozolite_back

backend gozolite_back
    mode http
    balance roundrobin
    timeout connect 10s
    timeout server 60s
    
    server gozolite1 127.0.0.1:7860 check inter 30s
    server gozolite2 127.0.0.2:7860 check inter 30s
```

## Scaling

### Horizontal Scaling

Deploy multiple GozoLite instances behind load balancer:

```
Client → Load Balancer (nginx/HAProxy)
  ├─ GozoLite Instance 1 (port 7860)
  ├─ GozoLite Instance 2 (port 7861)
  └─ GozoLite Instance 3 (port 7862)
  
Each instance has:
  • Separate Docker daemon (or shared with access control)
  • Shared token (or per-instance token)
  • Independent logs
```

### Vertical Scaling

Increase container resources:

```yaml
resources:
  requests:
    cpu: "2000m"
    memory: "2048Mi"
  limits:
    cpu: "4000m"
    memory: "4096Mi"
```

## Disaster Recovery

### Backup

```bash
# Backup GozoLite configuration
docker run --rm \
  -v gozolite-config:/config \
  -v $(pwd)/backup:/backup \
  alpine tar czf /backup/config.tar.gz /config/

# Backup Docker image
docker save gozolite-executor:latest | gzip > gozolite-executor-latest.tar.gz
```

### Restore

```bash
# Restore image
gunzip -c gozolite-executor-latest.tar.gz | docker load

# Restore and start
docker-compose up -d
```

## Troubleshooting

### Container won't start

```bash
docker logs gozolite

# Check Docker socket
docker exec gozolite docker ps
# If fails: check socket permissions

# Check API token
docker exec gozolite env | grep GOZOLITE_API_TOKEN
```

### Docker Phase A unavailable

```bash
# Check if Docker daemon running
docker ps

# Check if socket mounted
docker exec gozolite ls -la /var/run/docker.sock

# Verify socket permissions
ls -la /var/run/docker.sock
sudo setfacl -m u:1000:rw /var/run/docker.sock
```

### API not responding

```bash
# Check health
curl http://localhost:7860/health

# Check logs
docker logs -f gozolite

# Check ports
docker ps | grep gozolite
netstat -an | grep 7860
```

### Memory pressure

```bash
# Check memory usage
docker stats gozolite

# Increase container memory limits
docker update --memory 2g gozolite

# Or in docker-compose.yml:
# mem_limit: 2g
```
