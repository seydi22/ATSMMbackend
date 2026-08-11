const express = require("express");
const Settings = require("../models/Settings");
const { authRequired } = require("../middleware/auth");
const { parseCc } = require("../services/mailService");

const router = express.Router();

router.use(authRequired);

router.get("/", async (_req, res) => {
  try {
    const settings = await Settings.getSettings();
    return res.json(settings);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.put("/", async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    const body = req.body || {};

    const fields = [
      "ovTo",
      "banqueTo",
      "compteDebiteurNom",
      "compteDebiteurId",
      "compteDouaneNom",
      "compteDouaneId",
      "compteTresorNom",
      "compteTresorId",
      "signatureMail",
    ];

    for (const field of fields) {
      if (body[field] !== undefined) settings[field] = body[field];
    }

    if (body.ovCc !== undefined) {
      settings.ovCc = parseCc(body.ovCc);
    }
    if (body.banqueCc !== undefined) {
      settings.banqueCc = parseCc(body.banqueCc);
    }

    await settings.save();
    return res.json(settings);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
