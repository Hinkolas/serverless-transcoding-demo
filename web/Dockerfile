FROM oven/bun:1-debian AS deps

WORKDIR /app

RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build

ENV DATABASE_URL=/tmp/build.db

COPY . .
RUN bun run build

FROM oven/bun:1-debian AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./

EXPOSE 3000

CMD ["bun", "build/index.js"]
