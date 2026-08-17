FROM node:22-alpine

ARG VERSION=dev

LABEL org.opencontainers.image.title="Cinephage Nuvio Bridge" \
      org.opencontainers.image.description="Stremio-compatible bridge from Cinephage to NuvioTV" \
      org.opencontainers.image.source="https://github.com/vampywiz17/cinephage-nuvio-bridge" \
      org.opencontainers.image.url="https://github.com/vampywiz17/cinephage-nuvio-bridge" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}"

ENV NODE_ENV=production
ENV BRIDGE_IMAGE_VERSION=${VERSION}
WORKDIR /app

COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

USER node
EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8090)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "src/main.js"]
