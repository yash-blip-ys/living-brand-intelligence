import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
    const i = line.indexOf("=");
    return [line.slice(0, i), line.slice(i + 1)];
  })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const tables = ["startups","context_items","brand_decisions","context_relationships","decision_context_links","decision_relationships","change_analyses","change_analysis_impacts"];

const res = await fetch(url + "/rest/v1/", {
  headers: { apikey: key, Authorization: "Bearer " + key, Accept: "application/openapi+json" },
});
if (!res.ok) { console.error("HTTP", res.status); process.exit(1); }
const spec = await res.json();
const schemas = spec.components?.schemas ?? {};
for (const table of tables) {
  const s = schemas[table];
  if (!s) { console.log("MISSING", table); continue; }
  console.log("TABLE", table);
  for (const [name, prop] of Object.entries(s.properties ?? {})) {
    const req = (s.required ?? []).includes(name) ? "required" : "optional";
    const bits = [prop.type, prop.format, prop.enum ? "enum" : null].filter(Boolean).join("/");
    console.log(" ", name, bits || JSON.stringify(prop).slice(0, 60), req);
  }
}
