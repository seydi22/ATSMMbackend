const mongoose = require("mongoose");
const config = require("./config");
const { app, connectMongo } = require("./app");

// Export pour Vercel serverless
module.exports = app;

function shutdown(server, signal) {
  console.log(`${signal} reçu, arrêt en cours…`);
  server.close(async () => {
    try {
      await mongoose.disconnect();
    } catch (err) {
      console.error("Erreur fermeture Mongo:", err.message);
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

// Démarrage local / VM / Docker
if (!config.isVercel && require.main === module) {
  connectMongo()
    .then(() => {
      console.log("MongoDB connecté");
      const server = app.listen(config.port, config.host, () => {
        const mode = config.serveFrontend ? "API + frontend" : "API";
        console.log(
          `ATS Portal (${mode}) sur http://${config.host}:${config.port}`
        );
      });
      process.on("SIGTERM", () => shutdown(server, "SIGTERM"));
      process.on("SIGINT", () => shutdown(server, "SIGINT"));
    })
    .catch((err) => {
      console.error("Impossible de démarrer:", err);
      process.exit(1);
    });
}
