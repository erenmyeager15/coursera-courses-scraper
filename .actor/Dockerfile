FROM apify/actor-node:20

ENV NODE_ENV=development

COPY package*.json ./
RUN npm --quiet set progress=false \
    && npm ci --include=dev

COPY . ./
RUN npm run build \
    && npm prune --omit=dev

ENV NODE_ENV=production

CMD ["npm", "start"]
