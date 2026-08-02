# Build Phase
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# Production Phase
FROM nginx:alpine

# 1. مسح صفحة Nginx الافتراضية تماماً
RUN rm -rf /usr/share/nginx/html/*

# 2. نسخ الملفات المترجمة (سيتم التفتيش عن المجلد الموجود فعلياً)
COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=build /app/.output/public /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
