FROM node:22-alpine AS build
WORKDIR /src
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/
RUN pnpm install --frozen-lockfile
COPY web ./web
RUN pnpm --filter kdiag-web build

FROM nginxinc/nginx-unprivileged:1.31.3-alpine3.24
COPY deploy/docker/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /src/web/dist /usr/share/nginx/html
USER 101:101
EXPOSE 8080
