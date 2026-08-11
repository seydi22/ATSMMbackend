const fs = require("fs");
const path = require("path");
const { create } = require("xmlbuilder2");
const config = require("../config");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDateParts(date = new Date()) {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  return {
    iso: `${y}-${m}-${d}`,
    compact: `${y}${m}${d}`,
    heure: `${hh}${mm}${ss}`,
  };
}

function buildXmlDocument(transactions, compteCrediteur, settings, dateParts) {
  const nb = transactions.length;
  const total = transactions.reduce((s, t) => s + Number(t.paidIn), 0);
  const msgId = `${config.defaults.bicBnm}${dateParts.compact}${dateParts.heure}`;
  const creDtTm = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const doc = create({ version: "1.0", encoding: "UTF-8" }).ele(
    "Document",
    {
      xmlns: "urn:iso:std:iso:20022:tech:xsd:pacs.008.001.07",
      "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
    }
  );

  const root = doc.ele("FIToFICstmrCdtTrf");
  const grpHdr = root.ele("GrpHdr");
  grpHdr.ele("MsgId").txt(msgId);
  grpHdr.ele("CreDtTm").txt(creDtTm);
  grpHdr.ele("NbOfTxs").txt(String(nb));
  grpHdr
    .ele("TtlIntrBkSttlmAmt", { Ccy: config.defaults.devise })
    .txt(total.toFixed(2));
  grpHdr.ele("IntrBkSttlmDt").txt(dateParts.iso);

  const sttlmInf = grpHdr.ele("SttlmInf");
  sttlmInf.ele("SttlmMtd").txt(config.defaults.settlementMethod);
  sttlmInf.ele("ClrSys").ele("Prtry").txt(config.defaults.clearingSystem);

  grpHdr
    .ele("InstgAgt")
    .ele("FinInstnId")
    .ele("BICFI")
    .txt(config.defaults.bicBnm);

  for (const tx of transactions) {
    const cdt = root.ele("CdtTrfTxInf");
    const reference = String(tx.details);

    const pmtId = cdt.ele("PmtId");
    pmtId.ele("InstrId").txt(reference);
    pmtId.ele("EndToEndId").txt(reference);
    pmtId.ele("TxId").txt(reference);

    const pmtTpInf = cdt.ele("PmtTpInf");
    pmtTpInf.ele("SvcLvl").ele("Cd").txt("SEPA");
    pmtTpInf.ele("LclInstrm").ele("Cd").txt("B2B");
    pmtTpInf.ele("CtgyPurp").ele("Cd").txt("CASH");

    cdt
      .ele("IntrBkSttlmAmt", { Ccy: config.defaults.devise })
      .txt(Number(tx.paidIn).toFixed(2));
    cdt.ele("ChrgBr").txt("DEBT");

    cdt.ele("Dbtr").ele("Nm").txt(settings.compteDebiteurNom);
    cdt
      .ele("DbtrAcct")
      .ele("Id")
      .ele("Othr")
      .ele("Id")
      .txt(settings.compteDebiteurId);

    cdt
      .ele("DbtrAgt")
      .ele("FinInstnId")
      .ele("BICFI")
      .txt(config.defaults.bicBnm);

    cdt
      .ele("CdtrAgt")
      .ele("FinInstnId")
      .ele("BICFI")
      .txt(config.defaults.bicBcm);

    cdt.ele("Cdtr").ele("Nm").txt(compteCrediteur.nom);
    cdt
      .ele("CdtrAcct")
      .ele("Id")
      .ele("Othr")
      .ele("Id")
      .txt(compteCrediteur.id);

    cdt.ele("Purp").ele("Cd").txt("ADVA");
    cdt.ele("RmtInf").ele("Ustrd").txt(reference);
  }

  return {
    xml: doc.end({ prettyPrint: true }),
    nb,
    total,
    fileName: `paiements_${compteCrediteur.prefixe}_${dateParts.iso}.xml`,
  };
}

function generateXmlFiles(journee, settings) {
  const base = formatDateParts(new Date());
  const results = { douane: null, tresor: null };

  if (journee.douane?.nbTx > 0) {
    const parts = { ...base };
    const built = buildXmlDocument(
      journee.douane.transactions,
      {
        nom: settings.compteDouaneNom,
        id: settings.compteDouaneId,
        prefixe: "Douane",
      },
      settings,
      parts
    );
    const filePath = path.join(config.uploads.xml, `${journee._id}_Douane_${parts.iso}.xml`);
    fs.writeFileSync(filePath, built.xml, "utf8");
    results.douane = { ...built, filePath };
  }

  if (journee.tresor?.nbTx > 0) {
    const d = new Date();
    d.setSeconds(d.getSeconds() + 1);
    const parts = formatDateParts(d);
    const built = buildXmlDocument(
      journee.tresor.transactions,
      {
        nom: settings.compteTresorNom,
        id: settings.compteTresorId,
        prefixe: "Tresor",
      },
      settings,
      parts
    );
    const filePath = path.join(config.uploads.xml, `${journee._id}_Tresor_${parts.iso}.xml`);
    fs.writeFileSync(filePath, built.xml, "utf8");
    results.tresor = { ...built, filePath };
  }

  return results;
}

module.exports = { generateXmlFiles, formatDateParts };
