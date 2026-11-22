FROM node:20-alpine

WORKDIR /app

# Static app shell + assets
COPY certs_generations.html ./
COPY assets/ ./assets/

# Optional self-hosted TLS API used by the SSL Checker
COPY server.js ./

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

USER node

CMD ["node", "server.js"]
