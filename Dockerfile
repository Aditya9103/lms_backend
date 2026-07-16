FROM node:20-alpine

WORKDIR /app

# Install dependencies first (cached layer)
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Create log directory
RUN mkdir -p logs

EXPOSE 5001

CMD ["node", "src/server.js"]
