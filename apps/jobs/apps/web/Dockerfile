FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN npm install --no-save --package-lock=false \
    react@18.3.1 react-dom@18.3.1 lucide-react@0.468.0 esbuild@0.24.2
RUN mkdir -p dist \
 && npx esbuild entry.jsx --bundle --minify --format=esm --target=es2020 --outfile=dist/app.js \
 && cp index.html dist/index.html

FROM caddy:2.8.4-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
