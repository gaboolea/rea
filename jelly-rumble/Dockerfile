# Imagen única: compila el cliente y sirve cliente + WebSocket desde el mismo puerto.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV PORT=2567
EXPOSE 2567
CMD ["npm", "start"]
