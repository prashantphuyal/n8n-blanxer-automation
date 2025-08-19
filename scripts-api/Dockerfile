# Base image includes Chromium + Playwright deps
FROM mcr.microsoft.com/playwright:v1.46.0-jammy

WORKDIR /app

# 1) install deps
COPY package*.json ./
RUN npm ci

# 2) copy source
COPY . .

# 3) install browsers & compile TS
RUN npx playwright install --with-deps && npm run build

EXPOSE 3000
CMD ["node", "dist/src/index.js"]
