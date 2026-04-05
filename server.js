require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log('\n══════════════════════════════════════════════');
  console.log('   🖨️  PRINTICOM BACKEND SERVER STARTED');
  console.log('══════════════════════════════════════════════');
  console.log(`   Mode    : ${process.env.NODE_ENV}`);
  console.log(`   Port    : ${PORT}`);
  console.log(`   URL     : http://localhost:${PORT}`);
  console.log(`   Health  : http://localhost:${PORT}/api/health`);
  console.log('══════════════════════════════════════════════\n');
});

// ─── Handle unhandled promise rejections ───────────────────
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err.message);
  server.close(() => process.exit(1));
});

// ─── Handle SIGTERM ────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received. Shutting down gracefully...');
  server.close(() => process.exit(0));
});
