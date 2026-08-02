# Build Phase
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# Production Phase
FROM nginx:alpine

# مسح أي محتوى افتراضي لـ nginx
RUN rm -rf /usr/share/nginx/html/*

# نسخ المجلد الناتج الصحيح مباشرة
COPY --from=build /app/.output/public /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
