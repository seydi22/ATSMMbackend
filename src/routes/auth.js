const express = require("express");
const jwt = require("jsonwebtoken");
const config = require("../config");

const router = express.Router();

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const loginAttempts = new Map();

function clientIp(req) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function isLoginRateLimited(ip) {
  const now = Date.now();
  const recent = (loginAttempts.get(ip) || []).filter((t) => now - t < LOGIN_WINDOW_MS);
  loginAttempts.set(ip, recent);
  return recent.length >= LOGIN_MAX_ATTEMPTS;
}

function recordLoginAttempt(ip) {
  const list = loginAttempts.get(ip) || [];
  list.push(Date.now());
  loginAttempts.set(ip, list);
}

router.post("/login", (req, res) => {
  const ip = clientIp(req);
  if (isLoginRateLimited(ip)) {
    return res.status(429).json({
      error: "Trop de tentatives. Réessayez dans 15 minutes.",
    });
  }
  recordLoginAttempt(ip);

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
