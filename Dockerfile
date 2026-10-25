FROM node:22-alpine
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=8080 \
    TZ=Europe/Berlin
RUN apk add --no-cache tzdata
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY lib ./lib
COPY public ./public
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- "http://127.0.0.1:${PORT:-8080}/healthz" || exit 1
CMD ["node", "server.js"]
