FROM node:20-slim

RUN npm install -g pnpm

WORKDIR /app

COPY studio/web/package.json studio/web/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY studio/web/ .

EXPOSE 3000

CMD ["pnpm", "dev"]
