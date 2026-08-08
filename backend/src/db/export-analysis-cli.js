import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './database.js';
import { buildAnalysisWorkbook } from '../services/analysis-export.js';

const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
const databasePath = process.env.DATABASE_PATH || path.join(projectRoot, 'data/rice.sqlite');
const outputArgument = process.argv[2] || 'outputs/水稻试验科研分析导出_现有测试数据.xlsx';
const outputPath = path.isAbsolute(outputArgument) ? outputArgument : path.join(projectRoot, outputArgument);
const database = openDatabase(databasePath);

try {
  const workbook = await buildAnalysisWorkbook(database);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, workbook);
  console.log(JSON.stringify({ status: 'ok', outputPath, bytes: workbook.length }));
} finally {
  database.close();
}
