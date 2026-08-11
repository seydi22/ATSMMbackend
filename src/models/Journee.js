const mongoose = require("mongoose");

const dayLotSchema = new mongoose.Schema(
  {
    nbTx: { type: Number, default: 0 },
    montantTotal: { type: Number, default: 0 },
  },
  { _id: false }
);

const detailJourSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    douane: { type: dayLotSchema, default: () => ({}) },
    tresor: { type: dayLotSchema, default: () => ({}) },
  },
  { _id: false }
);

const lotSchema = new mongoose.Schema(
  {
    nbTx: { type: Number, default: 0 },
    montantTotal: { type: Number, default: 0 },
    reasonTypes: [{ type: String }],
    xmlPath: { type: String, default: null },
    transactions: [
      {
        receiptNo: String,
        details: String,
        paidIn: Number,
        reasonType: String,
        completionTime: String,
      },
    ],
  },
  { _id: false }
);

const emailSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["demande_ov", "banque"], required: true },
    to: [String],
    cc: [String],
    subject: String,
    sentAt: { type: Date, default: Date.now },
    messageId: String,
  },
  { _id: false }
);

const journeeSchema = new mongoose.Schema(
  {
    dateComptable: { type: Date, required: true },
    dateDebut: { type: Date },
    dateFin: { type: Date },
    detailsParJour: { type: [detailJourSchema], default: [] },
    statut: {
      type: String,
      enum: ["brouillon", "demande_ov_envoyee", "ov_recue", "envoye_banque"],
      default: "brouillon",
    },
    sourceExcel: { type: String },
    sourceExcelOriginalName: { type: String },
    douane: { type: lotSchema, default: () => ({}) },
    tresor: { type: lotSchema, default: () => ({}) },
    ovPhoto: { type: String, default: null },
    ovPhotoOriginalName: { type: String, default: null },
    emails: [emailSchema],
  },
  { timestamps: true }
);

journeeSchema.index({ dateComptable: 1 });
journeeSchema.index({ dateDebut: 1, dateFin: 1 });

module.exports = mongoose.model("Journee", journeeSchema);
