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
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "ats-portal-backend" });
});

app.use("/api/auth", authRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/journees", journeesRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Erreur serveur" });
});

async function start() {
  await mongoose.connect(config.mongoUri);
  console.log("MongoDB connecté:", config.mongoUri);

  app.listen(config.port, () => {
    console.log(`API ATS Portal sur http://localhost:${config.port}`);
  });
}

start().catch((err) => {
  console.error("Impossible de démarrer:", err);
  process.exit(1);
});
