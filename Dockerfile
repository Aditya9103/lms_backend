FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache curl ca-certificates
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src/ ./src/
RUN mkdir -p logs uploads

EXPOSE 5001
CMD ["node", "src/server.js"]
