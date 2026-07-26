# --- Stage 1: build the React/Vite client ---
FROM node:20-slim AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# --- Stage 2: install server deps + assemble final image ---
FROM node:20-slim
WORKDIR /app

# Install only production server dependencies (faster, smaller image)
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# Copy server source
COPY server/ ./server/

# Copy the built client into client/dist, exactly where
# server/src/index.js already expects it (path.join(__dirname, "..", "..", "client", "dist"))
COPY --from=client-build /app/client/dist ./client/dist

ENV NODE_ENV=production
# Cloud Run injects PORT automatically (usually 8080); server/src/index.js
# already reads process.env.PORT and binds to 0.0.0.0, so no code change needed.
EXPOSE 8080

CMD ["node", "server/src/index.js"]
