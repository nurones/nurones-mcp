# -------- Stage 1: build --------
FROM node:20-bullseye AS build
WORKDIR /app

# Install deps
COPY admin-web/package*.json admin-web/
WORKDIR /app/admin-web
RUN npm ci

# Copy sources and build static export
COPY admin-web/ /app/admin-web/
RUN npm run build

# -------- Stage 2: runtime --------
FROM node:20-bullseye AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Copy built app
COPY --from=build /app/admin-web/out /app/out

# Install a lightweight static server
RUN npm i -g serve

# API base for client-side calls (uses NEXT_PUBLIC_API_URL in code)
ENV NEXT_PUBLIC_API_URL=http://core:50550

EXPOSE 3000
CMD ["serve", "-s", "out", "-l", "3000"]
