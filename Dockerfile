# Build Phase
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# Production Phase
FROM nginx:alpine

# مسح أي محتوى قديم
RUN rm -rf /usr/share/nginx/html/*

# كتابة إعدادات Nginx المخصصة لـ React/Vite
RUN echo 'server { listen 80; location / { root /usr/share/nginx/html; index index.html; try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf

# نسخ المخرج الحقيقي لمشاريع Vite (فولدر dist)
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
