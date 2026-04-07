import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { cookies } from "next/headers";

import { env } from "~/env";
import { GITHUB_IMPORT_SESSION_COOKIE } from "~/server/github/constants";

type ImportSessionPayload = {
  accessToken: string;
  expiresAt: number;
};

const IMPORT_SESSION_MAX_AGE_SECONDS = 60 * 10;

function createEncryptionKey() {
  return createHash("sha256")
    .update(`${env.CLERK_SECRET_KEY}:${env.GITHUB_APP_CLIENT_SECRET}`)
    .digest();
}

function encryptPayload(payload: ImportSessionPayload) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

function decryptPayload(value: string) {
  const [ivPart, tagPart, dataPart] = value.split(".");

  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("invalid_import_session");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    createEncryptionKey(),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8")) as ImportSessionPayload;
}

export async function writeGithubImportSession(accessToken: string) {
  const cookieStore = await cookies();
  const expiresAt = Date.now() + IMPORT_SESSION_MAX_AGE_SECONDS * 1000;

  cookieStore.set(GITHUB_IMPORT_SESSION_COOKIE, encryptPayload({ accessToken, expiresAt }), {
    httpOnly: true,
    maxAge: IMPORT_SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
  });
}

export async function readGithubImportSession() {
  const cookieStore = await cookies();
  const value = cookieStore.get(GITHUB_IMPORT_SESSION_COOKIE)?.value;

  if (!value) {
    return null;
  }

  try {
    const payload = decryptPayload(value);

    if (payload.expiresAt <= Date.now()) {
      cookieStore.delete(GITHUB_IMPORT_SESSION_COOKIE);
      return null;
    }

    return payload;
  } catch {
    cookieStore.delete(GITHUB_IMPORT_SESSION_COOKIE);
    return null;
  }
}

export async function clearGithubImportSession() {
  const cookieStore = await cookies();
  cookieStore.delete(GITHUB_IMPORT_SESSION_COOKIE);
}
