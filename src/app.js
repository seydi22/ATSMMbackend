const fs = require("fs");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const mongoose = require("mongoose");
const config = require("./config");

const authRoutes = require("./routes/auth");
const settingsRoutes = require("./routes/settings");
const journeesRoutes = require("./routes/journees");

for (const dir of Object.values(config.uploads)) {
  if (typeof dir === "string") {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const app = express();

app.use(
  cors({
    origin: config.frontendOrigin === "*" ? true : config.frontendOrigin.split(","),
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
if (!config.isVercel) {
  app.use(morgan("dev"));
}

// Cache de connexion Mongo pour Vercel (serverless)
let cached = global.__atsMongo;
if (!cached) {
  cached = global.__atsMongo = { conn: null, promise: null };
}

async function connectMongo() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(config.mongoUri, {
      bufferCommands: false,
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

app.use(async (_req, _res, next) => {
  try {
    await connectMongo();
    next();
  } catch (err) {
    next(err);
  }
});

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "ats-portal-backend",
    message: "API ATS Portal opérationnelle",
    health: "/api/health",
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "ats-portal-backend",
    mongo: mongoose.connection.readyState === 1 ? "connected" : "pending",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/journees", journeesRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Erreur serveur" });
});

module.exports = { app, connectMongo };
