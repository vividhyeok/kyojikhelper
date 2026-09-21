import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "kyojik_session";
const getSecret = () => process.env.SESSION_SECRET || "";
const signature = (payload: string) =>
  createHmac("sha256", getSecret()).update(payload).digest("base64url");
export function createSessionToken() {
  const payload = `${Date.now()}.${crypto.randomUUID()}`;
  return `${payload}.${signature(payload)}`;
}
export function verifySessionToken(token?: string) {
  if (!token || !getSecret() || token.length > 300) return false;
  const split = token.lastIndexOf(".");
  if (split < 1) return false;
  const payload = token.slice(0, split);
  const supplied = Buffer.from(token.slice(split + 1));
  const expected = Buffer.from(signature(payload));
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return false;
  return Date.now() - Number(payload.split(".")[0]) < 30 * 24 * 60 * 60 * 1000;
}
export async function isAuthenticated() {
  return verifySessionToken((await cookies()).get(COOKIE)?.value);
}
export async function requireAuth() {
  if (!(await isAuthenticated()))
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  return null;
}
export async function setSessionCookie() {
  (await cookies()).set(COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
}
export async function clearSessionCookie() {
  (await cookies()).set(COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}
export function safePinEqual(pin: string) {
  const expected = process.env.APP_ACCESS_PIN || "";
  if (!expected) return false;
  const a = Buffer.from(pin);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
