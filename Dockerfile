FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY vendor/protocol-v2 ./vendor/protocol-v2
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3100 ARENA_BIND_HOST=0.0.0.0 ARENA_MODE=fixture
COPY --from=build --chown=node:node /app/package*.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/vendor ./vendor
COPY --from=build --chown=node:node /app/fixtures ./fixtures
RUN mkdir -p /app/.arena-cache && chown node:node /app/.arena-cache
USER node
EXPOSE 3100
CMD ["npm", "start"]
