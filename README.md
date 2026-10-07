# LifeCraft Events Management API

A Node.js and Express API starter backed by MongoDB with Mongoose.

## Requirements

- Node.js 20 or later
- MongoDB running locally, or a MongoDB connection string

## Setup

```powershell
npm install
Copy-Item .env.example .env
```

Update `MONGO_URI` in `.env` if your MongoDB server uses a different connection
string. The default connects to a local database named `lifecraft_events`.

## Run

```powershell
npm run dev
```

The API listens on `http://localhost:3000` by default. Set `PORT` in `.env` to
use another port. The server connects to MongoDB before accepting requests.

## Endpoints

- `GET /api/health` — confirms that the API process is running.
- `GET /api/health/ready` — confirms that the API can reach MongoDB; returns
  `503` until the database is connected.

## Tests

```powershell
npm test
```
