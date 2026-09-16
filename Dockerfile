FROM node:20-alpine

WORKDIR /app

# Instalar dependencias
COPY package*.json ./
RUN npm ci --only=production

# Copiar el código de la aplicación
COPY . .

# Exponer el puerto
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# Iniciar servidor
CMD ["node", "server.js"]
