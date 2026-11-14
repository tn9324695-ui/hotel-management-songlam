import { createRequire } from 'node:module';
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const sql = require('mssql/msnodesqlv8');
const pool = new sql.ConnectionPool({
  server: '.\\SQLEXPRESS', database: 'SongLamPms_Design', driver: 'ODBC Driver 17 for SQL Server',
  options: { trustedConnection: true, encrypt: true, trustServerCertificate: true },
  beforeConnect: c => { c.conn_str += ';TrustServerCertificate=Yes;'; }
});
try {
  await pool.connect();
  const res = await pool.request().query("SELECT name FROM sys.procedures WHERE schema_id=SCHEMA_ID('pms') ORDER BY name;");
  console.log('PMS Procedures:', res.recordset.map(r => r.name));
} finally {
  await pool.close();
}
