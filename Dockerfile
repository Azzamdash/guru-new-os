# Build Phase
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# Production Phase
FROM nginx:alpine

# 1. مسح أي محتوى افتراضي
RUN rm -rf /usr/share/nginx/html/*

# 2. إعدادات Nginx لـ SPA
RUN echo 'server { listen 80; location / { root /usr/share/nginx/html; index index.html; try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf

# 3. نسخ المحتويات فقط لضمان وجود index.html في الجذر مباشرة
COPY --from=build /app/.output/public/. /usr/share/nginx/html/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
