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

# ---- 3. Small runtime image ----
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=api /src/backend/target/newton-brawl-backend-*.jar app.jar
USER app
EXPOSE 8080
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75"
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD wget -qO- http://localhost:${PORT:-8080}/actuator/health || exit 1
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
