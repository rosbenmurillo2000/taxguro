
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import db from "./db.js";

export const cookieName = "phsb_token";
const SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

export async function hashPassword(p){ return await bcrypt.hash(p, 10); }
export async function verifyPassword(p, hash){ return await bcrypt.compare(p, hash); }

export function signToken(user){
  const payload = { sub: user.id, name: user.name, email: user.email, role: user.role, org_id: user.org_id || 1 };
  return jwt.sign(payload, SECRET, { expiresIn: "7d" });
}

export function authRequired(req, res, next){
  try {
    const token = req.cookies?.[cookieName] || (req.headers.authorization?.split(" ")[1]);
    if (!token) return res.status(401).json({ message: "Unauthorized" });
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch (e){
    return res.status(401).json({ message: "Unauthorized" });
  }
}

// Small helper for /api/me
export function meHandler(req,res){
  if (!req.user) return res.status(200).json({});
  res.json(req.user);
}
