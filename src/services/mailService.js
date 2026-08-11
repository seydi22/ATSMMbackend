const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const { format } = require("date-fns");
const { fr } = require("date-fns/locale");
const config = require("../config");

function createTransport() {
  const options = {
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
  };
  if (config.smtp.user) {
    options.auth = {
      user: config.smtp.user,
      pass: config.smtp.pass,
    };
  }
  return nodemailer.createTransport(options);
}

function formatDateFr(date) {
  return format(new Date(date), "dd/MM/yyyy", { locale: fr });
}

function formatDateLongFr(date) {
  return format(new Date(date), "dd MMMM yyyy", { locale: fr });
}

function jourSemaineFr(date) {
  const raw = format(new Date(date), "EEEE", { locale: fr });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function formatMontant(n) {
  return Number(n || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function tableSection(title, journee) {
  const rows = (journee.detailsParJour && journee.detailsParJour.length
    ? journee.detailsParJour
    : [
        {
          date: journee.dateComptable,
          douane: {
            nbTx: journee.douane?.nbTx || 0,
            montantTotal: journee.douane?.montantTotal || 0,
          },
          tresor: {
            nbTx: journee.tresor?.nbTx || 0,
            montantTotal: journee.tresor?.montantTotal || 0,
          },
        },
      ]
  ).map((day) => {
    const lot = title === "Douane" ? day.douane : day.tresor;
    return `
        <tr>
          <td>${jourSemaineFr(day.date)}</td>
          <td>${formatDateLongFr(day.date)}</td>
          <td style="text-align:right;">${lot?.nbTx || 0}</td>
          <td style="text-align:right;">${formatMontant(lot?.montantTotal)}</td>
        </tr>`;
  });

  return `
    <h3 style="margin:16px 0 8px;font-family:Arial,sans-serif;">${title}</h3>
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">
      <thead>
        <tr style="background:#f0f0f0;">
          <th>Jour</th>
          <th>Date des Transactions</th>
          <th>Nombre de Transactions</th>
          <th>Montant Total (MRU)</th>
        </tr>
      </thead>
      <tbody>
        ${rows.join("")}
      </tbody>
    </table>
  `;
}

function periodeLabel(journee) {
  const debut = journee.dateDebut || journee.dateComptable;
  const fin = journee.dateFin || journee.dateComptable;
  const d1 = formatDateFr(debut);
  const d2 = formatDateFr(fin);
  if (d1 === d2) return `du ${d1}`;
  return `du ${d1} au ${d2}`;
}

function buildDemandeOvMail(journee, settings) {
  const periode = periodeLabel(journee);
  const subject = `Demande d'Ordre de Virement pour la journée comptable ${periode}`;
  const signature = (settings.signatureMail || "").replace(/\n/g, "<br/>");

  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#222;">
      <p>Bonjour,</p>
      <p>Veuillez trouver ci-dessous la demande d'ordre de virement pour la journée comptable <strong>${periode}</strong>.</p>
      ${tableSection("Douane", journee)}
      ${tableSection("Trésor", journee)}
      <p style="margin-top:20px;">${signature}</p>
    </div>
  `;

  return { subject, html };
}

function buildBanqueMail(journee, settings) {
  const periode = periodeLabel(journee);
  const subject = `Fichiers ATS + OV — journée comptable ${periode}`;
  const signature = (settings.signatureMail || "").replace(/\n/g, "<br/>");

  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#222;">
      <p>Bonjour,</p>
      <p>Veuillez trouver ci-joint les fichiers ATS et la photo de l'ordre de virement pour la journée comptable <strong>${periode}</strong>.</p>
      <ul>
        <li><strong>Douane</strong> : ${journee.douane?.nbTx || 0} transactions — ${formatMontant(journee.douane?.montantTotal)} MRU</li>
        <li><strong>Trésor</strong> : ${journee.tresor?.nbTx || 0} transactions — ${formatMontant(journee.tresor?.montantTotal)} MRU</li>
      </ul>
      <p>L'ordre de virement est joint à ce message.</p>
      <p style="margin-top:20px;">${signature}</p>
    </div>
  `;

  return { subject, html };
}

function parseCc(list) {
  if (!list) return [];
  if (Array.isArray(list)) {
    return list
      .flatMap((v) => String(v).split(/[,;]/))
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return String(list)
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function uniqueEmails(list) {
  const seen = new Set();
  const out = [];
  for (const email of list || []) {
    const key = String(email).trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(String(email).trim());
  }
  return out;
}

async function sendMail({ to, cc, subject, html, attachments = [] }) {
  if (!to) {
    throw new Error("Destinataire email manquant (configurez-le dans Paramètres)");
  }

  const toList = uniqueEmails(Array.isArray(to) ? to : [to]);
  const ccList = uniqueEmails(parseCc(cc)).filter(
    (email) => !toList.map((t) => t.toLowerCase()).includes(email.toLowerCase())
  );

  const transporter = createTransport();
  const info = await transporter.sendMail({
    from: config.smtp.from,
    to: toList.join(", "),
    cc: ccList.length ? ccList.join(", ") : undefined,
    subject,
    html,
    attachments,
  });

  return {
    messageId: info.messageId,
    to: toList,
    cc: ccList,
    subject,
    sentAt: new Date(),
  };
}

async function sendDemandeOv(journee, settings) {
  const { subject, html } = buildDemandeOvMail(journee, settings);
  const result = await sendMail({
    to: settings.ovTo,
    cc: parseCc(settings.ovCc),
    subject,
    html,
  });
  return { ...result, type: "demande_ov" };
}

async function sendBanque(journee, settings, xmlResults) {
  const { subject, html } = buildBanqueMail(journee, settings);
  const attachments = [];

  if (xmlResults.douane?.filePath && fs.existsSync(xmlResults.douane.filePath)) {
    attachments.push({
      filename: xmlResults.douane.fileName,
      path: xmlResults.douane.filePath,
    });
  }
  if (xmlResults.tresor?.filePath && fs.existsSync(xmlResults.tresor.filePath)) {
    attachments.push({
      filename: xmlResults.tresor.fileName,
      path: xmlResults.tresor.filePath,
    });
  }
  if (journee.ovPhoto && fs.existsSync(journee.ovPhoto)) {
    attachments.push({
      filename: journee.ovPhotoOriginalName || path.basename(journee.ovPhoto),
      path: journee.ovPhoto,
    });
  }

  const result = await sendMail({
    to: settings.banqueTo,
    cc: parseCc(settings.banqueCc),
    subject,
    html,
    attachments,
  });
  return { ...result, type: "banque" };
}

module.exports = {
  sendDemandeOv,
  sendBanque,
  formatDateFr,
  parseCc,
};
