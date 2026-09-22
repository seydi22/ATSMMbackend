const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const isVercel = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
const uploadsRoot = isVercel
  ? path.join("/tmp", "ats-uploads")
  : path.join(__dirname, "..", "uploads");

module.exports = {
  port: Number(process.env.PORT) || 4000,
  host: process.env.HOST || "0.0.0.0",
  nodeEnv: process.env.NODE_ENV || "development",
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ats_portal",
  jwtSecret: process.env.JWT_SECRET || "ats-portal-dev-secret",
  isVercel,
  serveFrontend: process.env.SERVE_FRONTEND === "true",
  frontendDist:
    process.env.FRONTEND_DIST ||
    path.join(__dirname, "..", "..", "frontend", "dist"),
  frontendOrigin: process.env.FRONTEND_ORIGIN || "*",
  // Temporaire : remettre SKIP_DUPLICATE_CHECK=false après régularisation
  skipDuplicateCheck: process.env.SKIP_DUPLICATE_CHECK !== "false",
  rtgsThreshold: Number(process.env.RTGS_THRESHOLD) || 1_000_000,
  operator: {
    username: process.env.OPERATOR_USERNAME || "admin",
    password: process.env.OPERATOR_PASSWORD || "admin123",
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || "ATS Portal <noreply@example.com>",
  },
  uploads: {
    root: uploadsRoot,
    excel: path.join(uploadsRoot, "excel"),
    ov: path.join(uploadsRoot, "ov"),
    xml: path.join(uploadsRoot, "xml"),
  },
  reasonDouane: null, // obsolète : filtre via Details
  isDouaneDetails(details) {
    const ref = String(details || "")
      .trim()
      .toUpperCase();
    if (ref.startsWith("DGD") || ref.startsWith("26")) return true;
    // TPE douane : référence hex (ex. 5B357111E24648AEE06400144FF80EA6)
    if (/^[0-9A-F]{20,}$/.test(ref) && ref.includes("E064")) return true;
    return false;
  },
  defaults: {
    bicBnm: "BQNMMRMR",
    bicBcm: "BCEMMRMR",
    devise: "MRU",
    settlementMethod: "CLRG",
    clearingSystem: "ACH",
    compteDebiteurNom: "Compte MoovMoney cantonnement  BNM",
    compteDebiteurId: "012218242010",
    compteDouane: {
      nom: "Recettes E-Paiements Droits des Douanes",
      id: "00001000010100130005984",
    },
    compteTresor: {
      nom: "Compte Epay Tresore",
      id: "00001000010100130001134",
    },
  },
};
