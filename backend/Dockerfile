FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install -g nodemon && npm install

# Copy source code
COPY . .

EXPOSE 8080

CMD ["nodemon", "server.js"]
