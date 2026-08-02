# Build Phase
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# السطور دي عشان نعرف الحقيقة بالضبط جوه الـ Logs
RUN echo "=== MAIN APP DIR ===" && ls -la /app
RUN echo "=== OUTPUT DIR ===" && ls -la /app/.output || true
RUN echo "=== OUTPUT PUBLIC DIR ===" && ls -la /app/.output/public || true

# Production Phase
FROM nginx:alpine
RUN rm -rf /usr/share/nginx/html/*

# نسخ المحتوى مؤقتاً
COPY --from=build /app/.output/public /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
