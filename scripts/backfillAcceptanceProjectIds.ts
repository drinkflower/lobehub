import pg from 'pg';

const { Pool } = pg;
const DEFAULT_BATCH_SIZE = 100;
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const batchSizeArg = process.argv.find((arg) => arg.startsWith('--batch-size='));
const batchSize = batchSizeArg
  ? Number.parseInt(batchSizeArg.slice('--batch-size='.length), 10)
  : DEFAULT_BATCH_SIZE;

if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
  throw new Error('--batch-size must be an integer between 1 and 1000');
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString });

const candidatesSql = `
  SELECT a.id, COALESCE(direct_task.project_id, topic_task.project_id) AS project_id
  FROM acceptances AS a
  LEFT JOIN tasks AS direct_task
    ON a.subject_type = 'task'
    AND (direct_task.id = a.subject_id OR UPPER(direct_task.identifier) = UPPER(a.subject_id))
    AND direct_task.user_id = a.user_id
    AND direct_task.workspace_id IS NOT DISTINCT FROM a.workspace_id
  LEFT JOIN task_topics AS tt
    ON a.subject_type = 'topic'
    AND tt.topic_id = a.subject_id
    AND tt.user_id = a.user_id
    AND tt.workspace_id IS NOT DISTINCT FROM a.workspace_id
  LEFT JOIN tasks AS topic_task
    ON topic_task.id = tt.task_id
    AND topic_task.user_id = a.user_id
    AND topic_task.workspace_id IS NOT DISTINCT FROM a.workspace_id
  WHERE a.project_id IS NULL
    AND a.id::text > $1
    AND COALESCE(direct_task.project_id, topic_task.project_id) IS NOT NULL
  ORDER BY a.id
  LIMIT $2
`;

const run = async () => {
  let cursor = '';
  let reconciled = 0;

  while (true) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const candidates = await client.query<{ id: string; project_id: string }>(candidatesSql, [
        cursor,
        batchSize,
      ]);
      if (candidates.rows.length === 0) {
        await client.query('COMMIT');
        break;
      }

      if (apply) {
        await client.query(
          `
            UPDATE acceptances AS a
            SET project_id = source.project_id, updated_at = NOW()
            FROM UNNEST($1::uuid[], $2::text[]) AS source(id, project_id)
            WHERE a.id = source.id AND a.project_id IS NULL
          `,
          [
            candidates.rows.map(({ id }) => id),
            candidates.rows.map(({ project_id: projectId }) => projectId),
          ],
        );
      }
      await client.query('COMMIT');

      reconciled += candidates.rows.length;
      cursor = candidates.rows.at(-1)!.id;
      console.log(JSON.stringify({ apply, cursor, reconciled }));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  console.log(JSON.stringify({ apply, complete: true, reconciled }));
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
