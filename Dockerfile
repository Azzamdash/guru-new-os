# Build Phase
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# Production Phase
FROM nginx:alpine

# 1. مسح أي محتوى قديم
RUN rm -rf /usr/share/nginx/html/*

# 2. إعدادات Nginx المخصصة لـ SPA
RUN echo 'server { listen 80; location / { root /usr/share/nginx/html; index index.html; try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf

# 3. نسخ كل المخرجات إلى مجلد مؤقت
COPY --from=build /app/.output/public /tmp/build_output

# 4. نقل المحتويات الذكي وتعديل الصلاحيات لـ Nginx
RUN if [ -d "/tmp/build_output/public" ]; then \
      cp -r /tmp/build_output/public/* /usr/share/nginx/html/; \
    else \
      cp -r /tmp/build_output/* /usr/share/nginx/html/; \
    fi && \
    chmod -R 755 /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
