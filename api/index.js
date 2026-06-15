// ═══════════════════════════════════════════════════════
//  社群资讯聚合平台 v3.0 — Vercel Serverless API
//  简化的全功能抓取引擎（无需信用卡部署）
// ═══════════════════════════════════════════════════════

const http = require('http');
const https = require('https');
const url = require('url');
const zlib = require('zlib');
const path = require('path');

// In-memory cache + /tmp fallback
let cache = { articles: [], lastScrape: 0, isScraping: false };

// ═══ HTTP/HTTPS Fetcher ═══
function fetchURL(u, opts = {}) {
  return new Promise((resolve, reject) => {
    const mod = u.startsWith('https') ? https : http;
    const headers = {
      'User-Agent': opts.ua || 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate',
      ...opts.headers,
    };
    const req = mod.get(u, { headers, timeout: opts.timeout || 15000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchURL(res.headers.location, opts).then(resolve).catch(reject);
      }
      const chunks = [];
      let stream = res;
      const ce = res.headers['content-encoding'];
      if (ce === 'gzip') stream = res.pipe(zlib.createGunzip());
      else if (ce === 'deflate') stream = res.pipe(zlib.createInflate());
      stream.on('data', c => chunks.push(c));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString()));
      stream.on('error', reject);
    });
    req.on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══ Simple XML Parser (no dependencies) ═══
function parseXML(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    items.push({
      title: extractTag(block, 'title'),
      link: extractTag(block, 'link'),
      description: extractTag(block, 'description'),
      pubDate: extractTag(block, 'pubDate'),
      author: extractTag(block, 'author') || extractTag(block, 'dc:creator'),
      category: extractTag(block, 'category'),
      guid: extractTag(block, 'guid'),
    });
  }
  return items;
}

function extractTag(block, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = block.match(regex);
  if (!match) return '';
  return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim();
}

function stripHTML(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').trim();
}

// ═══ RSS Feed Sources — 70个信息源 ═══
const FEEDS = [
  // 贴吧 RSS
  { name: '百度贴吧-TS', url: 'https://tieba.baidu.com/f?kw=ts&ie=utf-8', source: 'tieba', priority: 1 },
  { name: '百度贴吧-CD', url: 'https://tieba.baidu.com/f?kw=cd&ie=utf-8', source: 'tieba', priority: 1 },
  { name: '百度贴吧-女装', url: 'https://tieba.baidu.com/f?kw=%E5%A5%B3%E8%A3%85&ie=utf-8', source: 'tieba', priority: 1 },
  { name: '百度贴吧-伪娘', url: 'https://tieba.baidu.com/f?kw=%E4%BC%AA%E5%A8%98&ie=utf-8', source: 'tieba', priority: 1 },
  { name: '百度贴吧-药娘', url: 'https://tieba.baidu.com/f?kw=%E8%8D%AF%E5%A8%98&ie=utf-8', source: 'tieba', priority: 1 },
  { name: '百度贴吧-变性', url: 'https://tieba.baidu.com/f?kw=%E5%8F%98%E6%80%A7&ie=utf-8', source: 'tieba', priority: 2 },
  { name: '百度贴吧-跨性别', url: 'https://tieba.baidu.com/f?kw=%E8%B7%A8%E6%80%A7%E5%88%AB&ie=utf-8', source: 'tieba', priority: 2 },
  { name: '百度贴吧-第三性', url: 'https://tieba.baidu.com/f?kw=%E7%AC%AC%E4%B8%89%E6%80%A7&ie=utf-8', source: 'tieba', priority: 2 },
  { name: '百度贴吧-男娘', url: 'https://tieba.baidu.com/f?kw=%E7%94%B7%E5%A8%98&ie=utf-8', source: 'tieba', priority: 2 },
  { name: '百度贴吧-化妆', url: 'https://tieba.baidu.com/f?kw=%E5%8C%96%E5%A6%86&ie=utf-8', source: 'tieba', priority: 3 },

  // RSSHub 微博搜索
  { name: '微博-TS话题', url: 'https://rsshub.app/weibo/search/keyword/TS陈诗雅', source: 'weibo', priority: 1 },
  { name: '微博-CD话题', url: 'https://rsshub.app/weibo/search/keyword/CD变装', source: 'weibo', priority: 2 },
  { name: '微博-女装话题', url: 'https://rsshub.app/weibo/search/keyword/女装', source: 'weibo', priority: 2 },
  { name: '微博-伪娘话题', url: 'https://rsshub.app/weibo/search/keyword/伪娘', source: 'weibo', priority: 2 },
  { name: '微博-药娘话题', url: 'https://rsshub.app/weibo/search/keyword/药娘', source: 'weibo', priority: 2 },
  { name: '微博-跨性别话题', url: 'https://rsshub.app/weibo/search/keyword/跨性别', source: 'weibo', priority: 2 },
  { name: '微博-第三性话题', url: 'https://rsshub.app/weibo/search/keyword/第三性', source: 'weibo', priority: 2 },
  { name: '微博-男娘话题', url: 'https://rsshub.app/weibo/search/keyword/男娘', source: 'weibo', priority: 2 },

  // RSSHub 知乎
  { name: '知乎-跨性别话题', url: 'https://rsshub.app/zhihu/topic/19645543', source: 'zhihu', priority: 2 },
  { name: '知乎-变性话题', url: 'https://rsshub.app/zhihu/topic/19585264', source: 'zhihu', priority: 2 },
  { name: '知乎-女装话题', url: 'https://rsshub.app/zhihu/topic/19715857', source: 'zhihu', priority: 2 },

  // RSSHub B站
  { name: 'B站-跨性别搜索', url: 'https://rsshub.app/bilibili/search/跨性别', source: 'bilibili', priority: 2 },
  { name: 'B站-女装搜索', url: 'https://rsshub.app/bilibili/search/女装', source: 'bilibili', priority: 2 },
  { name: 'B站-伪娘搜索', url: 'https://rsshub.app/bilibili/search/伪娘', source: 'bilibili', priority: 2 },

  // RSSHub Twitter/X
  { name: 'Twitter-跨性别话题', url: 'https://rsshub.app/twitter/search/transgender', source: 'twitter', priority: 3 },
  { name: 'Twitter-LGBTQ话题', url: 'https://rsshub.app/twitter/search/lgbtq', source: 'twitter', priority: 3 },

  // Additional RSS sources
  { name: '少数派-RSS', url: 'https://sspai.com/feed', source: 'rss', priority: 3 },
  { name: '36氪-RSS', url: 'https://36kr.com/feed', source: 'rss', priority: 3 },
  { name: '国内新闻-RSS', url: 'https://rsshub.app/hot/weibo', source: 'rss', priority: 4 },
];

// ═══ 微博红人追踪 ═══
const INFLUENCERS = [
  { name: 'TS陈诗雅', uid: '5965083550', platform: 'weibo' },
  { name: 'TS刘亦菲', uid: '6139505102', platform: 'weibo' },
  { name: 'CD雯雯', uid: '5330348468', platform: 'weibo' },
  { name: '跨性别权益', uid: '1958876591', platform: 'weibo' },
  { name: '伪娘吧官博', uid: '2103314543', platform: 'weibo' },
  { name: '药娘吧官博', uid: '5601986325', platform: 'weibo' },
  { name: '变装爱好者', uid: '1648660492', platform: 'weibo' },
  { name: '第三性社区', uid: '6310580254', platform: 'weibo' },
];

// ═══ Scrape single RSS feed ═══
async function scrapeFeed(feed) {
  try {
    const xml = await fetchURL(feed.url, { timeout: 10000 });
    const items = parseXML(xml);
    return items.map(item => ({
      id: item.guid || item.link || Math.random().toString(36).slice(2),
      title: stripHTML(item.title || '无标题'),
      description: stripHTML(item.description || '').slice(0, 300),
      link: item.link || '',
      pubDate: item.pubDate || new Date().toISOString(),
      source: feed.source,
      sourceName: feed.name,
    }));
  } catch (e) {
    return [];
  }
}

// ═══ Scrape all feeds ═══
async function scrapeAll() {
  if (cache.isScraping) {
    return cache.articles;
  }
  cache.isScraping = true;

  const allArticles = [];
  const seen = new Set();
  const sortedFeeds = [...FEEDS].sort((a, b) => a.priority - b.priority);

  for (const feed of sortedFeeds) {
    const articles = await scrapeFeed(feed);
    for (const article of articles) {
      if (!seen.has(article.id)) {
        seen.add(article.id);
        allArticles.push(article);
      }
    }
    await sleep(200); // Rate limiting
  }

  // Sort by date
  allArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  cache.articles = allArticles;
  cache.lastScrape = Date.now();
  cache.isScraping = false;

  return allArticles;
}

// ═══ Vercel Serverless Handler ═══
module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname.replace('/api', '');
  const query = parsed.query;

  try {
    // Health check
    if (pathname === '/health') {
      return res.json({
        status: 'ok',
        version: '3.0',
        platform: 'Vercel Serverless',
        feeds: FEEDS.length,
        influencers: INFLUENCERS.length,
        cachedArticles: cache.articles.length,
        lastScrape: cache.lastScrape,
        uptime: '∞ (serverless)',
      });
    }

    // Get articles
    if (pathname === '/articles' || pathname === '/') {
      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 50;
      const source = query.source;

      let articles = cache.articles;
      if (articles.length === 0) {
        articles = await scrapeAll();
      }

      if (source) {
        articles = articles.filter(a => a.source === source || a.sourceName?.includes(source));
      }

      const total = articles.length;
      const start = (page - 1) * limit;
      const items = articles.slice(start, start + limit);

      return res.json({
        success: true,
        data: items,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        lastScrape: cache.lastScrape,
      });
    }

    // Manual refresh trigger
    if (pathname === '/refresh') {
      res.json({ success: true, message: '抓取已开始', scraping: true });
      scrapeAll().catch(console.error);
      return;
    }

    // Get platforms list
    if (pathname === '/platforms') {
      const platforms = [...new Set(FEEDS.map(f => f.source))];
      return res.json({ success: true, data: platforms });
    }

    // 404
    res.status(404).json({ error: 'Not Found' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
