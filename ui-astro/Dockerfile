FROM node:25-alpine3.23 AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci
COPY . .

# Metadata
ARG PUBLIC_CONTACT_NAME
ARG PUBLIC_CONTACT_EMAIL
ENV PUBLIC_CONTACT_NAME=$PUBLIC_CONTACT_NAME
ENV PUBLIC_CONTACT_EMAIL=$PUBLIC_CONTACT_EMAIL

RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist
EXPOSE 4321
CMD ["serve", "dist", "-l", "4321"]