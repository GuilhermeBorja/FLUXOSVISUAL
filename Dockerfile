FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run check && npm run check:backend

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/var/lib/fluxosvisual TZ=America/Sao_Paulo
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/package.json ./package.json
RUN mkdir -p /var/lib/fluxosvisual && chown node:node /var/lib/fluxosvisual
USER node
VOLUME ["/var/lib/fluxosvisual"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node --input-type=module -e "const r=await fetch('http://127.0.0.1:3000/api/health');process.exit(r.ok?0:1)"
CMD ["node", "server/index.mjs"]
