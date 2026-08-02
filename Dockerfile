# Build Phase
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# Production Phase
FROM nginx:alpine

# مسح أي ملفات قديمة
RUN rm -rf /usr/share/nginx/html/*

# كتابة إعدادات Nginx المخصصة لـ React/SPA مباشرة هنا (عشان يحل مشكلة 403 و 404)
RUN echo 'server { listen 80; location / { root /usr/share/nginx/html; index index.html; try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf

# نسخ محتويات المجلد المترجم
COPY --from=build /app/.output/public/ /usr/share/nginx/html/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
