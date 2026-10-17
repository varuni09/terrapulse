// Save as: app/api/gee/debug/route.ts   (DELETE this file once Earth Engine works)
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const raw = process.env.GEE_SERVICE_ACCOUNT_JSON;
  let parsed: any = null;
  let parseError: string | null = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch (e: any) {
      parseError = String(e?.message ?? e).slice(0, 120);
    }
  }
  const key: string | undefined = parsed?.private_key;

  return NextResponse.json({
    deployment_env: process.env.VERCEL_ENV ?? "local", // production | preview | development
    GEE_PROJECT_set: Boolean(process.env.GEE_PROJECT),
    GEE_PROJECT_value: process.env.GEE_PROJECT ?? null, // a project ID is not a secret
    GEE_SERVICE_ACCOUNT_JSON_set: Boolean(raw),
    json_parses: Boolean(parsed),
    json_parse_error: parseError,
    service_account_email: parsed?.client_email ?? null,
    json_project_id: parsed?.project_id ?? null,
    private_key_has_header: Boolean(key?.includes("BEGIN PRIVATE KEY")),
    private_key_has_real_newlines: Boolean(key?.includes("\n")),
  });
}