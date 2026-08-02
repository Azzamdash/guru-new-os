# Build Phase
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# Production Phase
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# نسخ المخرجات كاملة
COPY --from=build /app/.output ./.output

EXPOSE 3000

# تشغيل سيرفر Nitro/Node مباشرة
CMD ["node", ".output/server/index.mjs"]
