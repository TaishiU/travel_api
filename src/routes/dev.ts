import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

const router = Router();

router.get('/tables', async (_req: Request, res: Response) => {
  const rows = await prisma.$queryRaw<{ name: string }[]>`
    SELECT table_name AS name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  res.json(rows);
});

router.get('/tables/:name/schema', async (req: Request, res: Response) => {
  const name = req.params['name'];
  const rows = await prisma.$queryRaw<{
    column_name: string;
    column_type: string;
    is_nullable: string;
    column_default: string | null;
    column_key: string;
    extra: string;
  }[]>`
    SELECT
      c.column_name,
      c.data_type AS column_type,
      c.is_nullable,
      c.column_default,
      CASE WHEN kcu.column_name IS NOT NULL THEN 'PRI' ELSE '' END AS column_key,
      '' AS extra
    FROM information_schema.columns c
    LEFT JOIN information_schema.key_column_usage kcu
      ON kcu.table_schema = 'public'
      AND kcu.table_name = c.table_name
      AND kcu.column_name = c.column_name
      AND kcu.constraint_name = (
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = c.table_name AND constraint_type = 'PRIMARY KEY'
        LIMIT 1
      )
    WHERE c.table_schema = 'public' AND c.table_name = ${name}
    ORDER BY c.ordinal_position
  `;
  res.json(rows);
});

router.get('/tables/:name/rows', async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query['page']) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query['limit']) || 50));
  const offset = (page - 1) * limit;

  const tableName = String(req.params['name']).replace(/[^a-zA-Z0-9_]/g, '');
  const [countResult, rows] = await Promise.all([
    prisma.$queryRawUnsafe<{ total: bigint }[]>(`SELECT COUNT(*) AS total FROM "${tableName}"`),
    prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "${tableName}" LIMIT ${limit} OFFSET ${offset}`),
  ]);

  const total = Number(countResult[0]?.total ?? 0);
  res.json({ total, page, limit, rows });
});

export default router;
