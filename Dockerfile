
FROM node:20-alpine
RUN apk add --no-cache fontconfig ttf-dejavu
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev || npm install --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.precision.plus.js"]
