FROM 077700697743.dkr.ecr.us-east-1.amazonaws.com/docker-hub/library/node:22-slim AS base

WORKDIR /app

COPY package*.json ./

FROM base AS dev

COPY tsconfig.json .
COPY .prettierignore .
COPY eslint.config.js .
COPY .npmrc ./

RUN npm ci

FROM dev AS build

COPY src/index.* ./
COPY src/ ./src

RUN npx tsc

RUN npm ci --ignore-scripts --omit=dev

FROM base AS release

ENV NODE_ENV=production

COPY --from=build /app/dist dist
COPY --from=build /app/node_modules node_modules
