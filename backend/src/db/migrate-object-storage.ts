import { pool } from "./index.js";
import { putObject } from "../services/object-storage.js";

async function migrateUploads(): Promise<void> {
  const result = await pool.query<{
    id: number;
    owner_hint: string;
    dataset_id: string;
    file_name: string;
    file_data: Buffer | null;
    storage_key: string | null;
  }>(
    `SELECT id, owner_hint, dataset_id, file_name, file_data, storage_key
     FROM dataset_uploads
     WHERE file_data IS NOT NULL AND (storage_key IS NULL OR storage_key = '')`,
  );

  for (const row of result.rows) {
    if (!row.file_data) continue;
    const objectKey = `${row.owner_hint}/${row.dataset_id}/legacy-${row.id}-${row.file_name}`;
    const objectRef = await putObject(objectKey, row.file_data);
    await pool.query(
      `UPDATE dataset_uploads
       SET storage_provider = $2,
           storage_bucket = $3,
           storage_key = $4,
           file_data = NULL
       WHERE id = $1`,
      [row.id, objectRef.provider, objectRef.bucket, objectRef.objectKey],
    );
    console.log(`Migrated upload ${row.id} to object storage (${objectRef.objectKey})`);
  }
}

await migrateUploads();
console.log("Object storage migration complete.");
