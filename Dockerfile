FROM node:latest as builder

RUN mkdir -p /usr/src/app

WORKDIR /usr/src/app

COPY package.json ./
COPY yarn.lock ./

RUN yarn install
RUN yarn add sharp --ignore-engines

COPY . .

RUN yarn run build

FROM node:latest as release

LABEL org.opencontainers.image.source https://github.com/ender-null/polaris-client-whatsapp-baileys

WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/build ./build
COPY --from=builder /usr/src/app/package.json ./

RUN npx puppeteer browsers install chrome

RUN apt update
RUN apt install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libgbm1 libasound2 libpangocairo-1.0-0 libxss1 libgtk-3-0
RUN rm -rf /var/lib/apt/lists/*

CMD ["yarn", "start"]
