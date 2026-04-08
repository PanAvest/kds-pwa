import { NextResponse } from "next/server";

const INTERNAL_ADMIN_SECRET =
  process.env.INTERNAL_ADMIN_SECRET?.trim() ||
  process.env.KDS_INTERNAL_API_SECRET?.trim() ||
  "";

export const isProductionEnvironment = process.env.NODE_ENV === "production";

export function requireInternalApiAccess(req: Request) {
  if (!isProductionEnvironment) return null;

  const presentedSecret =
    req.headers.get("x-admin-secret")?.trim() ||
    req.headers.get("x-kds-admin-secret")?.trim() ||
    "";

  if (INTERNAL_ADMIN_SECRET && presentedSecret === INTERNAL_ADMIN_SECRET) {
    return null;
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
