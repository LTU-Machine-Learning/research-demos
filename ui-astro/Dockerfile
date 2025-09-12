# Étape 1 : build Astro
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build

# Étape 2 : serveur statique pour le build Astro
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
RUN npm install -g serve
EXPOSE 4321
CMD ["serve", "dist", "-l", "4321"]