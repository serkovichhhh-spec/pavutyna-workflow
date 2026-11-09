// Supabase Edge Function «mkt-ingest»: приймає дані від Google Ads Script і GA4 Apps Script
// та віддає Google Ads Script черговість змін. Уся логіка й перевірка ключа — у SQL (схема mkt).
import postgres from "npm:postgres@3.4.5";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2, idle_timeout: 20 });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const key = req.headers.get("x-mkt-key") ?? "";
  if (!key) return json({ error: "Немає ключа" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Некоректний JSON" }, 400); }
  try {
    let rows;
    switch (body.action) {
      case "ingest": rows = await sql`select mkt.ingest(${key}, ${sql.json(body.payload)}) as r`; break;
      case "state": rows = await sql`select mkt.sync_state(${key}, ${String(body.source)}) as r`; break;
      case "error": rows = await sql`select mkt.ingest_error(${key}, ${String(body.source)}, ${String(body.error ?? "")}) as r`; break;
      case "pull": rows = await sql`select mkt.commands_pull(${key}) as r`; break;
      case "report": rows = await sql`select mkt.commands_report(${key}, ${sql.json(body.results ?? [])}) as r`; break;
      default: return json({ error: "Невідома дія" }, 400);
    }
    return json(rows[0].r);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    return json({ error: msg }, msg.includes("Невірний ключ") ? 401 : 500);
  }
});
