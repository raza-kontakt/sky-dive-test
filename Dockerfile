FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy app
COPY . .

# Build Next.js
RUN npm run build

# Create data directory with proper permissions
RUN mkdir -p /app/data && chmod 755 /app/data

# Expose port
EXPOSE 3000

# Start app
CMD ["npm", "start"]
