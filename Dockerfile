FROM node:22-alpine AS client-build
WORKDIR /client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-alpine
RUN apk add --no-cache tzdata
ENV NODE_ENV=production TZ=America/Santiago
WORKDIR /app/server
COPY --chown=node:node server/package*.json ./
RUN npm ci --omit=dev
COPY --chown=node:node server/ ./
COPY --from=client-build --chown=node:node /client/dist /app/client/dist
RUN mkdir -p uploads/libros && chown -R node:node uploads
USER node
EXPOSE 8085
CMD ["node", "app.js"]