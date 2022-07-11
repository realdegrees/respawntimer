### Build Step
# pull the Node.js Docker image
FROM python:3-alpine as builder

# Add node
RUN apk add --update npm

# change working directory
WORKDIR /usr/src/app

# copy the package.json files from local machine to the workdir in container
COPY package*.json .

# run npm install in our local machine
RUN npm ci

# copy the generated modules and all other files to the container
COPY . .

# build the application
RUN npm run build

### Serve Step
# pull the Node.js Docker image
FROM python:3-alpine

# Add node
RUN apk add --update npm

# change working directory
WORKDIR /app

# copy files from previous step
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/audio ./audio
COPY --from=builder /usr/src/app/package.json .
COPY --from=builder /usr/src/app/node_modules ./node_modules

EXPOSE 8080

# the command that starts our app
ENTRYPOINT [ "node", "./dist/src/index.js" ]
