const XLSX = require("xlsx");
const config = require("../config");

function toNumber(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseCompletionDate(value) {
  if (value == null || value === "") return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0, 0);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const parsed = new Date(excelEpoch.getTime() + value * 86400000);
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(
        parsed.getUTCFullYear(),
        parsed.getUTCMonth(),
        parsed.getUTCDate(),
        12,
        0,
        0,
        0
      );
    }
  }

  const raw = String(value).trim();

  // Format SP portal : DD/MM/YYYY[ HH:mm:ss]
  const dmy = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day, 12, 0, 0, 0);
    }
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 12, 0, 0, 0);
  }

  return null;
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildLot(list) {
  return {
    nbTx: list.length,
    montantTotal: list.reduce((s, t) => s + t.paidIn, 0),
    reasonTypes: [...new Set(list.map((t) => t.reasonType).filter(Boolean))],
    transactions: list,
    xmlPath: null,
  };
}

function parseExcelBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, range: 5 });

  if (!rows.length) {
    throw new Error("Le fichier Excel ne contient aucune ligne de données");
  }

  if (!("Reason Type" in rows[0]) && !("Receipt No." in rows[0])) {
    throw new Error(
      "Colonnes attendues introuvables (Receipt No., Paid In, Reason Type). Vérifiez le format de l'export."
    );
  }

  const transactions = [];
  for (const row of rows) {
    const receiptNo = row["Receipt No."];
    const paidIn = toNumber(row["Paid In"]);
    if (receiptNo == null || receiptNo === "" || paidIn == null) continue;

    const dateTx = parseCompletionDate(row["Completion Time"]);

    transactions.push({
      receiptNo: String(receiptNo),
      details: row["Details"] != null ? String(row["Details"]) : String(receiptNo),
      paidIn,
      reasonType: row["Reason Type"] != null ? String(row["Reason Type"]) : "",
      completionTime:
        row["Completion Time"] != null ? String(row["Completion Time"]) : "",
      dateTx,
    });
  }

  if (!transactions.length) {
    throw new Error("Aucune transaction valide (Receipt No. + Paid In) trouvée");
  }

  const fallbackDate = new Date();
  fallbackDate.setHours(12, 0, 0, 0);

  const byDay = new Map();
  for (const tx of transactions) {
    const day = tx.dateTx || fallbackDate;
    const key = dateKey(day);
    if (!byDay.has(key)) {
      byDay.set(key, {
        date: day,
        douane: [],
        tresor: [],
      });
    }
    const bucket = byDay.get(key);
    if (tx.reasonType === config.reasonDouane) bucket.douane.push(tx);
    else bucket.tresor.push(tx);
  }

  const detailsParJour = [...byDay.values()]
    .sort((a, b) => a.date - b.date)
    .map((day) => ({
      date: day.date,
      douane: {
        nbTx: day.douane.length,
        montantTotal: day.douane.reduce((s, t) => s + t.paidIn, 0),
      },
      tresor: {
        nbTx: day.tresor.length,
        montantTotal: day.tresor.reduce((s, t) => s + t.paidIn, 0),
      },
    }));

  const dateDebut = detailsParJour[0]?.date || fallbackDate;
  const dateFin = detailsParJour[detailsParJour.length - 1]?.date || dateDebut;

  const douaneTx = transactions.filter((t) => t.reasonType === config.reasonDouane);
  const tresorTx = transactions.filter((t) => t.reasonType !== config.reasonDouane);

  // Nettoyer dateTx avant stockage (pas dans le schéma transactions)
  const clean = (list) =>
    list.map(({ dateTx, ...rest }) => rest);

  return {
    dateComptable: dateDebut,
    dateDebut,
    dateFin,
    detailsParJour,
    douane: buildLot(clean(douaneTx)),
    tresor: buildLot(clean(tresorTx)),
    totalTx: transactions.length,
  };
}

module.exports = { parseExcelBuffer };
