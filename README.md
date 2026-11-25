# Inventory-Query

A full-stack inventory query and stock management system: a Next.js web app (search page + admin console) and a Taro WeChat Mini Program share the same REST API and PostgreSQL database.

## Features

- Search: keyword, category, and exact/range filters on inner (bore) diameter, outer diameter, and height (length); multi-field sorting and pagination
- Admin console: items (with image upload, stock in/out, Excel bulk import), categories, users, stock logs, system status
- Profile: update avatar, username, and password (password change requires the current password)
- WeChat Mini Program: search, item/category/user/stock-log management, system status
- Security: JWT with per-request database verification, login rate limiting, last-admin protection, and concurrency-safe stock operations that never oversell

## Tech Stack

- Next.js 16 (App Router) + React + TypeScript + Tailwind CSS
- Prisma 5 + PostgreSQL
- Taro 4 + React (WeChat Mini Program)
- JWT (jsonwebtoken) + bcryptjs

## Local Development

```bash
npm install
cp .env.example .env        # set DATABASE_URL and JWT_SECRET
npx prisma generate
npx prisma db push
npm run prisma:seed         # default admin: admin / admin123
npm run dev                 # http://localhost:3000
```

Production build: `npm run build && npm run start`. Images uploaded at runtime are stored in `public/uploads`; do not delete this directory when redeploying.

## WeChat Mini Program

```bash
cd miniapp
npm install
# set TARO_APP_API_BASE in .env.development / .env.production
npm run dev:weapp           # output in miniapp/dist
```

Open the `miniapp` directory with WeChat DevTools to preview. On a real device, make sure the backend is reachable and the request domain is whitelisted.

`project.config.json` in the repository uses `touristappid` as a placeholder. Put your real Mini Program AppID in the `appid` field of `miniapp/project.private.config.json` (ignored by `.gitignore`, so it will not be committed).

## Project Structure

```
src/            Next.js pages, components, and API routes
prisma/         Data models, seed script, optional index script
public/uploads/ Images uploaded at runtime (not committed)
miniapp/        Taro WeChat Mini Program
```
