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

# نسخ محتويات المجلد مباشرة مع / في الآخر
COPY --from=build /app/.output/public/ /usr/share/nginx/html/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
