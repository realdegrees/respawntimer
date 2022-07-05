# Assumes that the program has already been built
FROM node:18
WORKDIR /bot
COPY package.json .
COPY package-lock.json .
RUN npm install --only=production
COPY . .
COPY ./src/audio ./dist/audio 
RUN rm -rf src
# Start
ENV NODE_ENV prod
ENTRYPOINT [ "node", "./dist/src/index.js" ]
