---
name: ops-runtime-java
description: JVM application deploys (JAR/WAR), heap/GC tuning, Spring Boot actuator, and systemd supervision.
version: 1.0
---

# Java/JVM Runtime Operations

## When to Use
Load when `pom.xml` or `build.gradle` is detected. Covers running fat JARs (or WAR in a
servlet container), JVM heap and GC tuning, Spring Boot actuator health, and systemd units.

## Build Artifact
Build in CI; ship the versioned artifact (Prinsip 9).
```bash
./mvnw -B clean package -DskipTests      # tests run earlier in CI; produces target/app-<ver>.jar
# Gradle: ./gradlew clean bootJar
```

## systemd Unit
```ini
# /etc/systemd/system/app.service
[Unit]
Description=Spring Boot app
After=network.target

[Service]
Type=simple
User=app
WorkingDirectory=/var/www/app
EnvironmentFile=/etc/app/app.env
ExecStart=/usr/bin/java $JAVA_OPTS -jar /var/www/app/app.jar
SuccessExitStatus=143             # 128 + SIGTERM(15): clean shutdown
Restart=on-failure
RestartSec=5
TimeoutStopSec=60                 # let the JVM drain and run shutdown hooks
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/www/app/logs

[Install]
WantedBy=multi-user.target
```

## JVM Heap & GC Tuning
Set `JAVA_OPTS` in the EnvironmentFile, not in the unit, so it is auditable/rollbackable.
```ini
# /etc/app/app.env
JAVA_OPTS=-Xms1g -Xmx1g -XX:+UseG1GC -XX:MaxGCPauseMillis=200 \
  -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/var/www/app/logs \
  -XX:+ExitOnOutOfMemoryError -Djava.security.egd=file:/dev/./urandom
```
- Set `-Xms` = `-Xmx` to avoid heap resize pauses; leave headroom for non-heap (metaspace,
  threads): cap heap at ~60–70% of container/host RAM.
- G1GC is the modern default; for large heaps with low-pause needs consider ZGC
  (`-XX:+UseZGC`). In containers, the JVM honors cgroup limits by default (JDK 17+).

## Spring Boot Actuator
Expose health for monitoring; bind management to localhost.
```ini
# application.properties
management.endpoints.web.exposure.include=health,info,metrics,prometheus
management.endpoint.health.probes.enabled=true
management.server.address=127.0.0.1
management.server.port=8081
```
```bash
curl -fsS http://127.0.0.1:8081/actuator/health    # {"status":"UP"}
```

## JDK Upgrade Path
1. Install the new JDK side-by-side (`apt install temurin-21-jdk`); register via
   `update-alternatives` or set `JAVA_HOME` per-service (Prinsip 3).
2. Rebuild/repackage against the new JDK in CI; run the test suite.
3. Point the service `ExecStart`/`JAVA_HOME` at the new JDK; `systemctl restart app`.
4. Verify actuator health, then remove the old JDK.

## Related
- ops-webserver — Nginx reverse proxy to the JVM port.
- ops-deploy — JAR swap + symlink and rollback to prior artifact.
- ops-monitoring — actuator `/health` and JVM metrics (Prometheus) scraping.
- ops-performance — GC log analysis and heap-dump triage.
