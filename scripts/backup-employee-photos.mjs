import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucketName = process.env.SUPABASE_STORAGE_BUCKET || "employee-photos";
const outputDir = process.argv[2];

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

if (!outputDir) {
  throw new Error("Usage: node scripts/backup-employee-photos.mjs <output-dir>");
}

const storageBaseUrl = new URL("/storage/v1", supabaseUrl).toString().replace(/\/$/, "");

const authHeaders = {
  Authorization: `Bearer ${serviceRoleKey}`,
  apikey: serviceRoleKey,
};

const encodeStorageKey = (key) => key.split("/").map(encodeURIComponent).join("/");

const storageRequest = async (path, init = {}) => {
  const response = await fetch(`${storageBaseUrl}${path}`, init);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Storage request failed (${response.status} ${response.statusText}): ${body}`);
  }

  return response;
};

const listAllObjects = async () => {
  const objects = [];
  let cursor;

  do {
    const response = await storageRequest(`/object/list-v2/${bucketName}`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        limit: 1000,
        cursor,
        with_delimiter: false,
        sortBy: {
          column: "name",
          order: "asc",
        },
      }),
    });

    const result = await response.json();
    objects.push(...(result.objects || []));
    cursor = result.hasNext ? result.nextCursor : undefined;
  } while (cursor);

  return objects;
};

const downloadObject = async (key) => {
  const response = await storageRequest(`/object/${bucketName}/${encodeStorageKey(key)}`, {
    headers: authHeaders,
  });

  const filePath = join(outputDir, "files", key);
  await mkdir(dirname(filePath), { recursive: true });
  const fileBuffer = Buffer.from(await response.arrayBuffer());
  await writeFile(filePath, fileBuffer);
};

const objects = await listAllObjects();
await mkdir(outputDir, { recursive: true });

for (const object of objects) {
  await downloadObject(object.name || object.key);
}

await writeFile(
  join(outputDir, "manifest.json"),
  JSON.stringify(
    {
      bucket: bucketName,
      exported_at: new Date().toISOString(),
      object_count: objects.length,
      objects: objects.map((object) => ({
        id: object.id,
        key: object.key || object.name,
        created_at: object.created_at,
        updated_at: object.updated_at,
        metadata: object.metadata || {},
      })),
    },
    null,
    2
  )
);
