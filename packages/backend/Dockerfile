FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY packages/backend/package*.json ./
COPY packages/shared/package*.json ../shared/

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY packages/backend/src ./src
COPY packages/shared/src ../shared/src

# Build the application
RUN npm run build

# Install Playwright browsers
RUN npx playwright install chromium

EXPOSE 3000

CMD ["npm", "start"]