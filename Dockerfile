FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /build
COPY package.json tsconfig.json ./
COPY nodes/ nodes/
COPY credentials/ credentials/
RUN npm install --include=dev && \
    ./node_modules/.bin/tsc && \
    cp nodes/Loops/loops.svg dist/nodes/Loops/

FROM n8nio/n8n:latest

USER root

# Copy the built node into n8n's custom extensions directory
RUN mkdir -p /home/node/.n8n/nodes/node_modules/n8n-nodes-loops
COPY --from=builder /build/dist /home/node/.n8n/nodes/node_modules/n8n-nodes-loops/dist
COPY --from=builder /build/package.json /home/node/.n8n/nodes/node_modules/n8n-nodes-loops/package.json
RUN chown -R node:node /home/node/.n8n

USER node
WORKDIR /home/node
