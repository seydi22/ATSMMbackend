const express = require("express");
const jwt = require("jsonwebtoken");
const config = require("../config");

const router = express.Router();

router.post("/login", (req, res) => {
  const { username, password } = req.body || {};

  if (
    username !== config.operator.username ||
    password !== config.operator.password
  ) {
    return res.status(401).json({ error: "Identifiants incorrects" });
  }

  const token = jwt.sign(
    { username, role: "operator" },
    config.jwtSecret,
    { expiresIn: "12h" }
  );

  return res.json({ token, username });
});

router.get("/me", (req, res) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Non authentifié" });
  try {
    const user = jwt.verify(token, config.jwtSecret);
    return res.json({ username: user.username, role: user.role });
  } catch {
    return res.status(401).json({ error: "Token invalide" });
  }
});

module.exports = router;
