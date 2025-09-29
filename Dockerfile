FROM node:20-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

ENV PORT=8080
CMD ["node", "--enable-source-maps", "dist/server.js"]
