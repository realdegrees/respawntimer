### Build Step
# pull the Node.js Docker image
FROM python:3-alpine as builder

# Add node and pnpm
RUN apk add --update npm
RUN npm install -g pnpm
RUN apk add libtool autoconf automake g++ make

# change working directory
WORKDIR /usr/src/app

# copy the package.json files from local machine to the workdir in container
COPY backend/package*.json .

# run pnpm install in our local machine
RUN pnpm install

# copy the generated modules and all other files to the container
COPY backend .

# build the application
RUN pnpm run build

### Serve Step
# pull the Node.js Docker image
FROM python:3-alpine

# Add node and pnpm
RUN apk add --update npm
RUN npm install -g pnpm

# change working directory
WORKDIR /app

# copy files from previous step
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/audio ./audio
COPY --from=builder /usr/src/app/package.json .
COPY --from=builder /usr/src/app/node_modules ./node_modules

ENV NODE_ENV prod

EXPOSE 8080

# the command that starts our app
ENTRYPOINT [ "node", "./dist/src/index.js" ]
