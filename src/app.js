const fs = require("fs");
const path = require("path");
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

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  cors({
    origin: config.frontendOrigin === "*" ? true : config.frontendOrigin.split(","),
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
if (!config.isVercel) {
  app.use(morgan(config.nodeEnv === "production" ? "combined" : "dev"));
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

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "ats-portal-backend",
    mongo: mongoose.connection.readyState === 1 ? "connected" : "pending",
  });
});

if (!config.serveFrontend) {
  app.get("/", (_req, res) => {
    res.json({
      ok: true,
      service: "ats-portal-backend",
      message: "API ATS Portal opérationnelle",
      health: "/api/health",
    });
  });
}

app.use("/api/auth", authRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/journees", journeesRoutes);

if (config.serveFrontend) {
  const dist = config.frontendDist;
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(dist, "index.html"));
    });
  } else {
    console.warn("SERVE_FRONTEND=true mais dist introuvable:", dist);
  }
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Erreur serveur" });
});

module.exports = { app, connectMongo };
