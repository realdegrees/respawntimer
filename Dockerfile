### Build Step
# Use Node.js instead of Python for TypeScript compilation
FROM node:24-alpine as builder

# Install pnpm and build dependencies
RUN npm install -g pnpm
RUN apk add --no-cache libtool autoconf automake g++ make python3

# change working directory
WORKDIR /usr/src/app

# copy the package.json files from local machine to the workdir in container
COPY backend/package.json ./
COPY backend/pnpm-lock.yaml ./

# Install all dependencies (including devDependencies for TypeScript)
RUN pnpm install --frozen-lockfile

# copy the generated modules and all other files to the container
COPY backend ./

# build the application
RUN pnpm run build

### Serve Step
# Use Node.js for runtime as well
FROM node:24-alpine

# Install only runtime dependencies
RUN apk add --no-cache python3

# change working directory
WORKDIR /app

# copy built files from previous step
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/audio ./audio
COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/pnpm-lock.yaml ./

# Install only production dependencies
RUN npm install -g pnpm && pnpm install --prod --frozen-lockfile

ENV NODE_ENV=production

EXPOSE 8080

# the command that starts our app
CMD ["node", "./dist/src/index.js"]
