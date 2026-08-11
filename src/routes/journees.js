const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const Journee = require("../models/Journee");
const Settings = require("../models/Settings");
const { authRequired } = require("../middleware/auth");
const { parseExcelBuffer } = require("../services/excelParser");
const { generateXmlFiles } = require("../services/xmlGenerator");
const { sendDemandeOv, sendBanque } = require("../services/mailService");
const { assertPasDeDoublon } = require("../services/duplicateCheck");
const config = require("../config");

const router = express.Router();
router.use(authRequired);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(config.uploads.excel);
ensureDir(config.uploads.ov);
ensureDir(config.uploads.xml);

const excelStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploads.excel),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-() ]+/g, "_");
    cb(null, `${Date.now()}_${safe}`);
  },
});

const ovStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploads.ov),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-() ]+/g, "_");
    cb(null, `${Date.now()}_${safe}`);
  },
});

const uploadExcel = multer({
  storage: excelStorage,
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error("Fichier Excel attendu (.xls / .xlsx)"), ok);
  },
});

const uploadOv = multer({
  storage: ovStorage,
  fileFilter: (_req, file, cb) => {
    const ok = /\.(jpg|jpeg|png|gif|webp|pdf)$/i.test(file.originalname);
    cb(ok ? null : new Error("Photo/PDF OV attendu"), ok);
  },
});

router.get("/", async (_req, res) => {
  try {
    const list = await Journee.find()
      .select("-douane.transactions -tresor.transactions")
      .sort({ dateComptable: -1, createdAt: -1 })
      .lean();
    return res.json(list);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const journee = await Journee.findById(req.params.id).lean();
    if (!journee) return res.status(404).json({ error: "Journée introuvable" });
    const { douane, tresor, ...rest } = journee;
    return res.json({
      ...rest,
      dateDebut: rest.dateDebut || rest.dateComptable,
      dateFin: rest.dateFin || rest.dateComptable,
      detailsParJour: rest.detailsParJour || [],
      douane: {
        nbTx: douane?.nbTx || 0,
        montantTotal: douane?.montantTotal || 0,
        reasonTypes: douane?.reasonTypes || [],
        xmlPath: douane?.xmlPath || null,
      },
      tresor: {
        nbTx: tresor?.nbTx || 0,
        montantTotal: tresor?.montantTotal || 0,
        reasonTypes: tresor?.reasonTypes || [],
        xmlPath: tresor?.xmlPath || null,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const journee = await Journee.findById(req.params.id);
    if (!journee) return res.status(404).json({ error: "Journée introuvable" });

    if (journee.statut !== "brouillon") {
      return res.status(400).json({
        error: "Seuls les brouillons peuvent être supprimés",
      });
    }

    for (const filePath of [
      journee.sourceExcel,
      journee.ovPhoto,
      journee.douane?.xmlPath,
      journee.tresor?.xmlPath,
    ]) {
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // ignore file cleanup errors
        }
      }
    }

    await journee.deleteOne();
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/upload", uploadExcel.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Fichier Excel manquant" });
    }

    const buffer = fs.readFileSync(req.file.path);
    const parsed = parseExcelBuffer(buffer);

    try {
      await assertPasDeDoublon(parsed);
    } catch (dupErr) {
      if (req.file.path && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          // ignore
        }
      }
      return res.status(409).json({
        error: dupErr.message,
        code: "DOUBLON",
        datesEnDoublon: dupErr.details?.datesEnDoublon || [],
        receiptsEnDoublonCount: dupErr.details?.receiptsEnDoublon?.length || 0,
      });
    }

    const debutDay = new Date(parsed.dateDebut);
    debutDay.setHours(12, 0, 0, 0);
    const finDay = new Date(parsed.dateFin);
    finDay.setHours(12, 0, 0, 0);

    let journee = await Journee.findOne({
      statut: "brouillon",
      dateDebut: debutDay,
      dateFin: finDay,
    });

    const payload = {
      dateComptable: parsed.dateComptable,
      dateDebut: debutDay,
      dateFin: finDay,
      detailsParJour: parsed.detailsParJour,
      sourceExcel: req.file.path,
      sourceExcelOriginalName: req.file.originalname,
      douane: parsed.douane,
      tresor: parsed.tresor,
      ovPhoto: null,
      ovPhotoOriginalName: null,
      emails: [],
    };

    if (journee) {
      Object.assign(journee, payload);
      await journee.save();
    } else {
      journee = await Journee.create({
        ...payload,
        statut: "brouillon",
      });
    }

    return res.status(201).json({
      id: journee._id,
      dateComptable: journee.dateComptable,
      dateDebut: journee.dateDebut,
      dateFin: journee.dateFin,
      detailsParJour: journee.detailsParJour,
      statut: journee.statut,
      douane: {
        nbTx: journee.douane.nbTx,
        montantTotal: journee.douane.montantTotal,
      },
      tresor: {
        nbTx: journee.tresor.nbTx,
        montantTotal: journee.tresor.montantTotal,
      },
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.post("/:id/envoyer-demande-ov", async (req, res) => {
  try {
    const journee = await Journee.findById(req.params.id);
    if (!journee) return res.status(404).json({ error: "Journée introuvable" });

    if (!["brouillon", "demande_ov_envoyee"].includes(journee.statut)) {
      return res.status(400).json({
        error: `Impossible d'envoyer la demande OV depuis le statut "${journee.statut}"`,
      });
    }

    // Bloque si ces dates/transactions existent déjà dans une autre journée transférée
    try {
      await assertPasDeDoublon(
        {
          detailsParJour: journee.detailsParJour,
          douane: journee.douane,
          tresor: journee.tresor,
        },
        { excludeId: journee._id }
      );
    } catch (dupErr) {
      return res.status(409).json({
        error: dupErr.message,
        code: "DOUBLON",
        datesEnDoublon: dupErr.details?.datesEnDoublon || [],
      });
    }

    const settings = await Settings.getSettings();
    if (!settings.ovTo) {
      return res.status(400).json({
        error: "Configurez l'email destinataire OV dans Paramètres",
      });
    }

    const mail = await sendDemandeOv(journee, settings);
    journee.emails.push({
      type: "demande_ov",
      to: mail.to,
      cc: mail.cc,
      subject: mail.subject,
      sentAt: mail.sentAt,
      messageId: mail.messageId,
    });
    journee.statut = "demande_ov_envoyee";
    await journee.save();

    return res.json({
      ok: true,
      statut: journee.statut,
      email: {
        type: mail.type,
        to: mail.to,
        cc: mail.cc,
        subject: mail.subject,
        sentAt: mail.sentAt,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post("/:id/upload-ov", uploadOv.single("ov"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Photo OV manquante" });
    }

    const journee = await Journee.findById(req.params.id);
    if (!journee) return res.status(404).json({ error: "Journée introuvable" });

    if (
      !["demande_ov_envoyee", "ov_recue", "envoye_banque"].includes(
        journee.statut
      )
    ) {
      return res.status(400).json({
        error:
          "Envoyez d'abord la demande d'ordre de virement avant d'uploader l'OV",
      });
    }

    const settings = await Settings.getSettings();
    if (!settings.banqueTo) {
      return res.status(400).json({
        error: "Configurez l'email destinataire banque dans Paramètres",
      });
    }

    journee.ovPhoto = req.file.path;
    journee.ovPhotoOriginalName = req.file.originalname;
    journee.statut = "ov_recue";

    const xmlResults = generateXmlFiles(journee, settings);
    if (xmlResults.douane) {
      journee.douane.xmlPath = xmlResults.douane.filePath;
    }
    if (xmlResults.tresor) {
      journee.tresor.xmlPath = xmlResults.tresor.filePath;
    }
    await journee.save();

    try {
      const mail = await sendBanque(journee, settings, xmlResults);
      journee.emails.push({
        type: "banque",
        to: mail.to,
        cc: mail.cc,
        subject: mail.subject,
        sentAt: mail.sentAt,
        messageId: mail.messageId,
      });
      journee.statut = "envoye_banque";
      await journee.save();

      return res.json({
        ok: true,
        statut: journee.statut,
        xml: {
          douane: xmlResults.douane
            ? {
                fileName: xmlResults.douane.fileName,
                nb: xmlResults.douane.nb,
                total: xmlResults.douane.total,
              }
            : null,
          tresor: xmlResults.tresor
            ? {
                fileName: xmlResults.tresor.fileName,
                nb: xmlResults.tresor.nb,
                total: xmlResults.tresor.total,
              }
            : null,
        },
        email: {
          type: mail.type,
          to: mail.to,
          cc: mail.cc,
          subject: mail.subject,
          sentAt: mail.sentAt,
        },
      });
    } catch (mailErr) {
      return res.status(502).json({
        error: `XML générés, mais échec envoi email banque: ${mailErr.message}`,
        statut: journee.statut,
      });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/:id/xml/:type", async (req, res) => {
  try {
    const journee = await Journee.findById(req.params.id);
    if (!journee) return res.status(404).json({ error: "Journée introuvable" });

    const type = req.params.type;
    const filePath =
      type === "douane"
        ? journee.douane?.xmlPath
        : type === "tresor"
          ? journee.tresor?.xmlPath
          : null;

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Fichier XML introuvable" });
    }

    return res.download(filePath, path.basename(filePath));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
