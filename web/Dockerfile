FROM node:22-bookworm-slim AS deps

WORKDIR /app

COPY package.json ./
RUN npm install

FROM deps AS build

ENV DATABASE_URL=postgres://postgres:postgres@localhost:5432/video_transcoding

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./

RUN npm prune --omit=dev

EXPOSE 3000

CMD ["node", "build/index.js"]
