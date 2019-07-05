FROM node:10-alpine
ENV NODE_ENV=production
WORKDIR /app

RUN apk update && apk add yarn git python g++ make && rm -rf /var/cache/apk/*

RUN chown node /app
USER node

COPY package.json yarn.lock ./
RUN yarn install --production=false
COPY . .
RUN yarn run prestart:prod

EXPOSE 3000

CMD ["node", "dist/main.js"]
