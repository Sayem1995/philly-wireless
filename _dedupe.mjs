// One-off: remove the duplicate catalog rows created by an accidental second
// `db:seed` run against production. Keeps the lowest id per natural key.
const PROJECT = "philly-repair";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const TOKEN = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
if (!TOKEN) throw new Error("GOOGLE_OAUTH_ACCESS_TOKEN not set");
const HDR = { Authorization: `Bearer ${TOKEN}` };

// collection -> fields that identify a row
const SPECS = {
  repairPrices: ["category", "brand", "service", "priceLabel", "sortOrder"],
  products: ["name"],
  parts: ["sku"],
  blogPosts: ["slug"],
};

async function listAll(col) {
  const out = [];
  let pageToken = "";
  do {
    const url = `${BASE}/${col}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await fetch(url, { headers: HDR });
    if (!res.ok) throw new Error(`${col} list ${res.status}`);
    const json = await res.json();
    for (const d of json.documents ?? []) out.push(d);
    pageToken = json.nextPageToken ?? "";
  } while (pageToken);
  return out;
}

function flat(field) {
  if (!field) return "";
  return (
    field.stringValue ??
    field.integerValue ??
    field.doubleValue ??
    field.booleanValue ??
    JSON.stringify(field)
  );
}

let totalDeleted = 0;
for (const [col, keyFields] of Object.entries(SPECS)) {
  const docs = await listAll(col);
  const seen = new Map();
  const toDelete = [];
  for (const d of docs) {
    const id = Number(d.name.split("/").pop());
    const key = keyFields.map((f) => flat(d.fields?.[f])).join("|");
    if (seen.has(key)) toDelete.push(id);
    else seen.set(key, id);
  }
  console.log(`${col.padEnd(14)} total=${docs.length} unique=${seen.size} duplicates=${toDelete.length}`);
  for (const id of toDelete) {
    const res = await fetch(`${BASE}/${col}/${id}`, { method: "DELETE", headers: HDR });
    if (!res.ok) console.log(`  FAILED to delete ${col}/${id}: ${res.status}`);
    else totalDeleted++;
  }
}
console.log(`\ndeleted ${totalDeleted} duplicate documents`);
