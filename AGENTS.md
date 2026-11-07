# EverySub

The goal of EverySub is to provide a simple and efficient way to track and manage subscriptions. It allows users to keep track of their subscriptions, including the cost, renewal dates, and see the big picture spending metrics, like how much they are spending on subscriptions each month.

Currently, the project only serves me, but I am treating it like a public product. The engineering and design quality is high. The project is open source and part of my portfolio, so the code, design, and product decisions are meant to reflect the level of care I would bring to client work. It gives potential clients and employers a practical look at how I approach software development, design, and product thinking.

Current project stage: Development. Data models are still evolving. No need to handle backwards compatibility yet.

# Development

Don't run `db:generate` unless I explicitly tell you to.

Follow [docs/testing.md](docs/testing.md) when writing or changing tests. Unit tests (`*.test.ts`) cover pure logic. Database tests (`*.db.test.ts`) cover server functions and jobs against a real Postgres started with `docker compose up --detach --wait`. Mock only external services, never the app's own modules.
