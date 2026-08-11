const Journee = require("../models/Journee");

const STATUTS_TRANSFERES = ["demande_ov_envoyee", "ov_recue", "envoye_banque"];

function toDayKey(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDayKeyFr(key) {
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}

function collectDayKeysFromJournee(journee) {
  const keys = new Set();
  if (Array.isArray(journee.detailsParJour) && journee.detailsParJour.length) {
    for (const day of journee.detailsParJour) {
      const key = toDayKey(day.date);
      if (key) keys.add(key);
    }
  } else {
    const debut = toDayKey(journee.dateDebut || journee.dateComptable);
    const fin = toDayKey(journee.dateFin || journee.dateComptable);
    if (debut) keys.add(debut);
    if (fin) keys.add(fin);
  }
  return keys;
}

function collectReceiptsFromLot(lot) {
  const set = new Set();
  for (const tx of lot?.transactions || []) {
    if (tx.receiptNo) set.add(String(tx.receiptNo));
    if (tx.details) set.add(String(tx.details));
  }
  return set;
}

/**
 * Vérifie les dates / transactions déjà présentes dans des journées déjà soumises
 * (demande OV envoyée ou plus loin dans le flux).
 */
async function findDoublons(parsed, { excludeId = null } = {}) {
  const query = { statut: { $in: STATUTS_TRANSFERES } };
  if (excludeId) query._id = { $ne: excludeId };

  const existantes = await Journee.find(query)
    .select(
      "statut dateDebut dateFin dateComptable detailsParJour douane.transactions.receiptNo douane.transactions.details tresor.transactions.receiptNo tresor.transactions.details"
    )
    .lean();

  const transferredDays = new Map(); // dayKey -> statut
  const transferredReceipts = new Map(); // receipt -> day info

  for (const j of existantes) {
    for (const key of collectDayKeysFromJournee(j)) {
      if (!transferredDays.has(key)) {
        transferredDays.set(key, j.statut);
      }
    }
    for (const receipt of [
      ...collectReceiptsFromLot(j.douane),
      ...collectReceiptsFromLot(j.tresor),
    ]) {
      if (!transferredReceipts.has(receipt)) {
        transferredReceipts.set(receipt, j.statut);
      }
    }
  }

  const uploadDays = (parsed.detailsParJour || []).map((d) => toDayKey(d.date)).filter(Boolean);
  const datesEnDoublon = [...new Set(uploadDays)].filter((key) =>
    transferredDays.has(key)
  );

  const uploadReceipts = [
    ...collectReceiptsFromLot(parsed.douane),
    ...collectReceiptsFromLot(parsed.tresor),
  ];
  const receiptsEnDoublon = [...new Set(uploadReceipts)].filter((r) =>
    transferredReceipts.has(r)
  );

  return {
    datesEnDoublon,
    receiptsEnDoublon,
    hasDoublon: datesEnDoublon.length > 0 || receiptsEnDoublon.length > 0,
  };
}

function buildDoublonMessage({ datesEnDoublon, receiptsEnDoublon }) {
  const parts = [];

  if (datesEnDoublon.length) {
    parts.push(
      `Date(s) déjà transférée(s) : ${datesEnDoublon.map(formatDayKeyFr).join(", ")}`
    );
  }

  if (receiptsEnDoublon.length) {
    const sample = receiptsEnDoublon.slice(0, 5).join(", ");
    const more =
      receiptsEnDoublon.length > 5
        ? ` (+${receiptsEnDoublon.length - 5} autres)`
        : "";
    parts.push(
      `${receiptsEnDoublon.length} transaction(s) déjà soumise(s) (ex. ${sample}${more})`
    );
  }

  return `Doublon détecté — ce fichier (ou une partie) a déjà été soumis. ${parts.join(". ")}. Import refusé.`;
}

async function assertPasDeDoublon(parsed, options = {}) {
  const result = await findDoublons(parsed, options);
  if (result.hasDoublon) {
    const error = new Error(buildDoublonMessage(result));
    error.code = "DOUBLON";
    error.details = result;
    throw error;
  }
  return result;
}

module.exports = {
  findDoublons,
  assertPasDeDoublon,
  STATUTS_TRANSFERES,
  toDayKey,
  formatDayKeyFr,
  collectDayKeysFromJournee,
};
