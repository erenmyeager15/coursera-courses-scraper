FROM apify/actor-node:20

COPY package*.json ./
RUN npm --quiet set progress=false \
    && npm install

COPY . ./
RUN npm run build \
    && npm prune --omit=dev

CMD ["npm", "start"]
