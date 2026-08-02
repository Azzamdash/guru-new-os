# Build Phase
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# Production Phase
FROM nginx:alpine

# 1. مسح أي ملفات قديمة
RUN rm -rf /usr/share/nginx/html/*

# 2. نسخ كونفيج Nginx اللي عملناه
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 3. نسخ المحتويات مع السلاش لضمان إن الفولدر ينزل فك
COPY --from=build /app/.output/public/ /usr/share/nginx/html/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
