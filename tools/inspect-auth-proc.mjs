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
  const res = await pool.request().query("EXEC sp_helptext 'pms.vRoomStatus';");
  console.log(res.recordset.map(r => r.Text).join(''));
} finally {
  await pool.close();
}
