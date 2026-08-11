const mongoose = require("mongoose");
const config = require("../config");

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "default", unique: true },
    ovTo: { type: String, default: "" },
    ovCc: { type: [String], default: [] },
    banqueTo: { type: String, default: "" },
    banqueCc: { type: [String], default: [] },
    compteDebiteurNom: {
      type: String,
      default: config.defaults.compteDebiteurNom,
    },
    compteDebiteurId: {
      type: String,
      default: config.defaults.compteDebiteurId,
    },
    compteDouaneNom: {
      type: String,
      default: config.defaults.compteDouane.nom,
    },
    compteDouaneId: {
      type: String,
      default: config.defaults.compteDouane.id,
    },
    compteTresorNom: {
      type: String,
      default: config.defaults.compteTresor.nom,
    },
    compteTresorId: {
      type: String,
      default: config.defaults.compteTresor.id,
    },
    signatureMail: {
      type: String,
      default: "Cordialement,\nÉquipe ATS / Moov Money",
    },
  },
  { timestamps: true }
);

settingsSchema.statics.getSettings = async function getSettings() {
  let doc = await this.findOne({ key: "default" });
  if (!doc) {
    doc = await this.create({ key: "default" });
  }
  return doc;
};

module.exports = mongoose.model("Settings", settingsSchema);
