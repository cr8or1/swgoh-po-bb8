FROM node:16-alpine
LABEL authors="cr8or"

WORKDIR /app
COPY . .
RUN npm ci
CMD ["node", "bot.js"]