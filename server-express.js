// Express 版本 - 需要 npm install
// 使用: npm install && node server-express.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const ArticleDB = require('./models/ArticleDB');
const PushService = require('./services/push');
const ScraperScheduler = require('./services/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json({ limit: '2mb' }));

const db = new ArticleDB(process.env.DB_PATH || './data/articles.db');
const pushService = new PushService(db);
pushService.init(process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY, process.env.VAPID_SUBJECT || 'mailto:admin@app.local');
const scheduler = new ScraperScheduler(db);

app.use('/api/articles', require('./routes/articles')(db));
app.use('/api/categories', require('./routes/categories')(db));
app.use('/api/push', require('./routes/push')(db, pushService, scheduler));

app.get('/api/health', (req, res) => {
  const subs = db.getAllSubscriptions();
  res.json({ success: true, data: { status: 'running', articleCount: db.getArticles({page:1,limit:1}).pagination.total, subscriberCount: subs.length, pushEnabled: pushService.initialized, version: '2.0.0' }});
});

const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ success: false, error: 'Not found' });
  res.sendFile(path.join(publicDir, 'index.html'));
});

const si = parseInt(process.env.SCRAPE_INTERVAL)||30;
cron.schedule(`*/${Math.max(5,si)} * * * *`, () => scheduler.scrapeAll());
cron.schedule('*/10 * * * *', async () => { if (pushService.initialized) await pushService.pushNewArticles(); });

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Express server on port ${PORT} | Push: ${pushService.initialized}`);
  setTimeout(() => scheduler.scrapeAll(), 5000);
});

process.on('SIGINT', () => { db.db.close(); process.exit(0); });
process.on('SIGTERM', () => { db.db.close(); process.exit(0); });
