# NEWTON BRAWL: one image that serves the game and its API.
#   docker build -t newton-brawl .
#   docker run -p 8080:8080 -e DB_URL=... -e DB_USER=... -e DB_PASSWORD=... -e JWT_SECRET=... -e CORS_ORIGINS=https://your.domain newton-brawl

# ---- 1. Build the frontend (it imports fighter data straight from the backend's resources) ----
FROM node:20-alpine AS web
WORKDIR /src
COPY backend/src/main/resources backend/src/main/resources
COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci
COPY frontend frontend
RUN cd frontend && npm run build

# ---- 2. Build the backend with the game bundled as static files ----
FROM maven:3.9-eclipse-temurin-21 AS api
WORKDIR /src/backend
COPY backend/pom.xml .
RUN mvn -q -B dependency:go-offline
COPY backend/src src
COPY --from=web /src/frontend/dist src/main/resources/static
RUN mvn -q -B package -DskipTests

# ---- 3. Small runtime image, tuned for fast cold starts ----
# Free hosting (Render's free plan) sleeps when idle and wakes on the next request on a fraction of a CPU,
# so startup time is what players feel. Two things cut it roughly in half:
#   * the jar is unpacked (no nested-jar class loading), and
#   * a class-data-sharing archive (app.jsa) is recorded at build time from a training start, so the JVM
#     maps thousands of pre-parsed classes instead of loading them one by one.
# The training start uses the in-memory H2 "dev" profile, so no database is needed while building.
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=api /src/backend/target/newton-brawl-backend-*.jar /tmp/app.jar
RUN java -Djarmode=tools -jar /tmp/app.jar extract --destination /tmp/x \
 && mv /tmp/x/lib /app/lib && mv /tmp/x/*.jar /app/app.jar && rm -rf /tmp/x /tmp/app.jar \
 && java -XX:ArchiveClassesAtExit=/app/app.jsa -XX:TieredStopAtLevel=1 -XX:+UseSerialGC \
         -Dspring.context.exit=onRefresh -jar /app/app.jar --spring.profiles.active=dev --server.port=0 \
 && chown -R app:app /app
USER app
EXPOSE 8080
# JAVA_OPTS can be replaced by the host; the class-data archive and the small-container GC are always on.
# TieredStopAtLevel=1 (quick C1 compiler only) starts much faster on a tiny CPU; drop it on big machines.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:TieredStopAtLevel=1"
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD wget -qO- http://localhost:${PORT:-8080}/actuator/health || exit 1
ENTRYPOINT ["sh", "-c", "exec java -XX:SharedArchiveFile=/app/app.jsa -XX:+UseSerialGC -Xss512k $JAVA_OPTS -jar /app/app.jar"]
