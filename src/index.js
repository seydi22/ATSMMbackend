const config = require("./config");
const { app, connectMongo } = require("./app");

// Export pour Vercel serverless
module.exports = app;

// Démarrage local / VM classique
if (!config.isVercel && require.main === module) {
  connectMongo()
    .then(() => {
      console.log("MongoDB connecté");
      app.listen(config.port, () => {
        console.log(`API ATS Portal sur http://localhost:${config.port}`);
      });
    })
    .catch((err) => {
      console.error("Impossible de démarrer:", err);
      process.exit(1);
    });
}
