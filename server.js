#!/usr/bin/env node
// ═══════════════════════════════════════════════════════
//  社群资讯聚合平台 v3.0 — 独立后端服务器
//  零依赖 Node.js + 多平台智能抓取 + 微博红人追踪
//  覆盖: 微博/贴吧/知乎/B站/小红书/抖音/Twitter/X
// ═══════════════════════════════════════════════════════

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const zlib = require('zlib');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const PUBLIC = path.join(__dirname, 'public');
const SCRAPE_MIN = parseInt(process.env.SCRAPE_INTERVAL) || 10; // 10分钟主动更新

// ═══ JSON Database ═══
function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return { articles:[], subs:[], logs:[], seq:0 }; }
}
function saveDB(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data)); }

// ═══ MIME types ═══
const MIME = {
  '.html':'text/html;charset=utf-8','.css':'text/css;charset=utf-8',
  '.js':'application/javascript;charset=utf-8','.json':'application/json;charset=utf-8',
  '.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon',
  '.webmanifest':'application/manifest+json',
};

// ═══ Static file server ═══
function serveStatic(req, res) {
  let p = url.parse(req.url).pathname;
  if (p === '/') p = '/index.html';
  const fp = path.join(PUBLIC, p);
  try {
    const data = fs.readFileSync(fp);
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext]||'application/octet-stream',
      'Access-Control-Allow-Origin':'*',
      'Cache-Control': ext==='.html'?'no-cache':'max-age=86400',
    });
    res.end(data);
  } catch {
    const html = fs.readFileSync(path.join(PUBLIC, 'index.html'));
    res.writeHead(200, {'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-cache'});
    res.end(html);
  }
}

// ═══ JSON Response Helper ═══
function json(res, code, data) {
  res.writeHead(code, {
    'Content-Type':'application/json;charset=utf-8',
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

// ═══ HTTP/HTTPS Fetcher — 智能用户代理 + 重定向跟随 ═══
function fetchURL(u, opts={}) {
  return new Promise((resolve, reject) => {
    const mod = u.startsWith('https') ? https : http;
    const headers = {
      'User-Agent': opts.ua || 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate',
      ...opts.headers,
    };
    const req = mod.get(u, { headers, timeout: opts.timeout||25000 }, res => {
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
    req.on('timeout', function(){ this.destroy(); reject(new Error('timeout')); });
  });
}

// ═══ XML/RSS Parser ═══
function parseXMLItems(xml) {
  const items = [];
  const re = /<(item|entry)>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const c = m[2];
    const tag = (t) => { const r = new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`,'i'); return (c.match(r)||[])[1]?.trim()||''; };
    let link = tag('link');
    if (!link || !link.startsWith('http')) {
      const hm = c.match(/<link[^>]*href="([^"]*)"/i);
      if (hm) link = hm[1];
    }
    if (!link && m[1]==='entry') {
      const altLinks = c.match(/<link[^>]*href="([^"]*)"/g);
      if (altLinks) {
        for (const al of altLinks) {
          const hm = al.match(/href="([^"]*)"/);
          if (hm && hm[1].startsWith('http')) { link = hm[1]; break; }
        }
      }
    }
    const desc = tag('description') || tag('summary') || tag('content');
    items.push({
      title: tag('title'),
      link,
      desc,
      content: tag('content:encoded') || tag('content') || desc,
      author: tag('author') || tag('dc:creator'),
      pubDate: tag('pubDate') || tag('dc:date') || tag('published') || tag('updated'),
    });
  }
  return items;
}

// ═══ HTML 内容提取 — 从网页直接抓标题/摘要 ═══
function extractFromHTML(html) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]?.trim()||'';
  const desc = (html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i)||[])[1]?.trim()
    || (html.match(/<meta[^>]+content="([^"]*)"[^>]+name="description"/i)||[])[1]?.trim()
    || '';
  return { title: title.replace(/<[^>]*>/g,''), desc };
}

// ═══════════════════════════════════════════════════
//  多平台抓取源配置
// ═══════════════════════════════════════════════════

// ── 微博关键词搜索 ──
const WEIBO_SEARCH_TERMS = [
  '跨性别','第三性','伪娘','药娘','transgender','MTF','FTM',
  'TS小姐姐','CD变装','女装大佬','LGBT','同志圈','性别认同',
];

// ── 微博核心红人/KOL 账号 (RSSHub uid 格式) ──
// 这些是圈子内知名账号，优先级最高
const WEIBO_INFLUENCERS = [
  { uid:'7032362025', name:'跨性别热线', cat:'TS' },
  { uid:'1769833815', name:'LGBT权促会', cat:'TS' },
  { uid:'6488755950', name:'彩虹法律', cat:'法律' },
  { uid:'5624113323', name:'北京同志中心', cat:'TS' },
  { uid:'6604103002', name:'性别研究', cat:'科普' },
  { uid:'7485528879', name:'跨儿心理', cat:'TS' },
  { uid:'1931093633', name:'淡蓝公益', cat:'科普' },
  { uid:'6138092018', name:'同志之声', cat:'TS' },
];

// ── 贴吧 ──
const TIEBA_FORUMS = [
  '第三性','伪娘','药娘','CD','TS','transgender','女装子',
  'mtf','跨性别','性别认同','化妆','变装','同志','拉拉','gay',
];

// ── 知乎话题 ──
const ZHIHU_TOPICS = [
  '跨性别','第三性','性别认同','LGBT','性别研究',
  '激素治疗','性别重置','性少数群体',
];

// ── B站搜索 ──
const BILIBILI_KEYWORDS = [
  '跨性别','TS小姐姐','CD变装','伪娘','药娘','MTF','女装',
  'LGBT','性别认同','声音训练','化妆教程',
];

// ── 小红书搜索 (RSSHub) ──
const XIAOHONGSHU_KEYWORDS = [
  '跨性别','第三性','CD变装','伪娘','女装','MTF',
  'LGBT','化妆教程','穿搭',
];

// ── 抖音 (RSSHub) ──
const DOUYIN_HOT = true; // 抖音热点

// ── Twitter/X 搜索 (RSSHub) ──
const TWITTER_SEARCHES = [
  '跨性别','transgender China','MTF transgender',
];

// ═══ 生成全量 RSS 源列表 ═══
function buildFeeds() {
  const feeds = [];

  // 微博红人时间线 (高优先级)
  WEIBO_INFLUENCERS.forEach(inf => {
    feeds.push({
      url: `https://rsshub.app/weibo/user/${inf.uid}`,
      cat: inf.cat,
      src: 'weibo_influencer',
      label: `微博·${inf.name}`,
      priority: 1,
    });
  });

  // 微博关键词搜索
  WEIBO_SEARCH_TERMS.forEach(term => {
    feeds.push({
      url: `https://rsshub.app/weibo/search/${encodeURIComponent(term)}`,
      cat: mapCategory(term),
      src: 'weibo_rss',
      label: `微博搜索·${term}`,
      priority: 2,
    });
  });

  // 贴吧
  TIEBA_FORUMS.forEach(forum => {
    feeds.push({
      url: `https://rsshub.app/tieba/forum/${encodeURIComponent(forum)}`,
      cat: mapCategory(forum),
      src: 'tieba_rss',
      label: `贴吧·${forum}`,
      priority: 2,
    });
  });

  // 知乎
  ZHIHU_TOPICS.forEach(topic => {
    feeds.push({
      url: `https://rsshub.app/zhihu/search/${encodeURIComponent(topic)}`,
      cat: mapCategory(topic),
      src: 'zhihu',
      label: `知乎·${topic}`,
      priority: 2,
    });
  });

  // B站
  BILIBILI_KEYWORDS.forEach(kw => {
    feeds.push({
      url: `https://rsshub.app/bilibili/vsearch/${encodeURIComponent(kw)}`,
      cat: mapCategory(kw),
      src: 'bilibili',
      label: `B站·${kw}`,
      priority: 2,
    });
  });

  // 小红书
  XIAOHONGSHU_KEYWORDS.forEach(kw => {
    feeds.push({
      url: `https://rsshub.app/xiaohongshu/search/${encodeURIComponent(kw)}`,
      cat: mapCategory(kw),
      src: 'xiaohongshu',
      label: `小红书·${kw}`,
      priority: 3,
    });
  });

  // 抖音热点
  if (DOUYIN_HOT) {
    feeds.push({
      url: 'https://rsshub.app/douyin/hot',
      cat: 'general',
      src: 'douyin',
      label: '抖音·热榜',
      priority: 3,
    });
  }

  // Twitter/X
  TWITTER_SEARCHES.forEach(q => {
    feeds.push({
      url: `https://rsshub.app/twitter/search/${encodeURIComponent(q)}`,
      cat: 'TS',
      src: 'twitter',
      label: `Twitter·${q}`,
      priority: 3,
    });
  });

  // 知乎热榜
  feeds.push({
    url: 'https://rsshub.app/zhihu/hotlist',
    cat: 'general',
    src: 'zhihu',
    label: '知乎·热榜',
    priority: 4,
  });

  // 微博热搜
  feeds.push({
    url: 'https://rsshub.app/weibo/search/hot',
    cat: 'general',
    src: 'weibo_rss',
    label: '微博·热搜',
    priority: 4,
  });

  return feeds;
}

// 关键词 → 分类映射
function mapCategory(term) {
  const lower = term.toLowerCase();
  if (/跨性别|transgender|mtf|ftm|ts|lgbt|同志|性别认同|性别研究|性少数/.test(lower)) return 'TS';
  if (/第三性/.test(lower)) return '第三性';
  if (/伪娘|女装|cd|变装|化妆教程|穿搭/.test(lower)) return '伪娘';
  if (/药娘|激素/.test(lower)) return '药娘';
  if (/法律|政策/.test(lower)) return '法律';
  if (/健康|心理|公益/.test(lower)) return '科普';
  return 'TS';
}

// ═══ 核心抓取引擎 ═══
const ALL_FEEDS = buildFeeds();

async function scrapeAll() {
  console.log(`[Scrape v3.0] 🚀 开始全量抓取 (${ALL_FEEDS.length} 个信息源)...`);
  const db = loadDB();
  const existingIds = new Set(db.articles.map(a => a.source_id));
  let found = 0, added = 0, errors = 0;

  // 优先抓取高优先级源 (微博红人)
  const sorted = [...ALL_FEEDS].sort((a,b) => (a.priority||9) - (b.priority||9));

  for (const feed of sorted) {
    try {
      const xml = await fetchURL(feed.url);
      const items = parseXMLItems(xml);
      const take = feed.priority === 1 ? 15 : 8; // 红人多抓几条

      for (const item of items.slice(0, take)) {
        if (!item.title || !item.link) continue;
        const sid = `${feed.src}_${crypto.createHash('md5').update(item.link).digest('hex').slice(0,12)}`;
        if (existingIds.has(sid)) continue;

        found++; db.seq++;
        const summary = stripHTML(item.desc || '').slice(0, 500);
        const content = item.content || item.desc || '';

        // 提取图片
        let image_url = '';
        const imgMatch = (content||'').match(/<img[^>]+src="([^"]+)"/i);
        if (imgMatch) image_url = imgMatch[1];
        else {
          const encMatch = (content||'').match(/<enclosure[^>]+url="([^"]+)"/i);
          if (encMatch) image_url = encMatch[1];
        }

        db.articles.push({
          id: db.seq,
          source_id: sid,
          title: item.title.slice(0, 200),
          summary,
          content,
          url: item.link,
          source: feed.src,
          category: feed.cat,
          author: item.author || feed.label || '',
          published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          fetched_at: new Date().toISOString(),
          image_url,
          tags: feed.cat,
          is_pushed: 0,
        });
        existingIds.add(sid);
        added++;
      }
      // 请求节流
      await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
    } catch(e) {
      errors++;
      if (feed.priority <= 2) {
        console.error(`[Scrape] ❌ ${feed.label}: ${e.message}`);
      }
    }
  }

  // 按发布时间倒排
  db.articles.sort((a,b) => new Date(b.published_at) - new Date(a.published_at));

  // 清理7天前的非核心文章，保留至少200条
  if (db.articles.length > 2000) {
    const cutoff = Date.now() - 7 * 86400000;
    db.articles = db.articles.filter(a =>
      new Date(a.published_at).getTime() > cutoff || a.source === 'weibo_influencer'
    );
  }

  db.logs.push({
    time: new Date().toISOString(),
    found,
    added,
    errors,
    total: db.articles.length,
    feeds: ALL_FEEDS.length,
  });
  saveDB(db);
  console.log(`[Scrape v3.0] ✅ 完成: ${found} 抓到, ${added} 新增, ${errors} 失败, 总计 ${db.articles.length} 篇文章`);
  return { found, added, errors, total: db.articles.length };
}

// HTML标签剥离
function stripHTML(str) {
  return str.replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

// ═══ 手动搜索 — 实时跨平台 ═══
async function manualSearch(keyword, limit = 20) {
  console.log(`[Search] 🔍 "${keyword}"`);
  const db = loadDB();

  // 实时抓取 — 动态生成搜索源
  const searchFeeds = [
    { url: `https://rsshub.app/weibo/search/${encodeURIComponent(keyword)}`, cat: 'TS', src: 'weibo_rss', label: '微博搜索' },
    { url: `https://rsshub.app/tieba/forum/${encodeURIComponent(keyword)}`, cat: 'TS', src: 'tieba_rss', label: '贴吧' },
    { url: `https://rsshub.app/zhihu/search/${encodeURIComponent(keyword)}`, cat: 'TS', src: 'zhihu', label: '知乎' },
    { url: `https://rsshub.app/bilibili/vsearch/${encodeURIComponent(keyword)}`, cat: 'TS', src: 'bilibili', label: 'B站' },
    { url: `https://rsshub.app/xiaohongshu/search/${encodeURIComponent(keyword)}`, cat: 'TS', src: 'xiaohongshu', label: '小红书' },
  ];

  const existingIds = new Set(db.articles.map(a => a.source_id));
  let newArticles = 0;

  for (const feed of searchFeeds) {
    try {
      const xml = await fetchURL(feed.url);
      const items = parseXMLItems(xml);
      for (const item of items.slice(0, 5)) {
        if (!item.title || !item.link) continue;
        const sid = `${feed.src}_${crypto.createHash('md5').update(item.link).digest('hex').slice(0,12)}`;
        if (existingIds.has(sid)) continue;

        db.seq++;
        db.articles.push({
          id: db.seq,
          source_id: sid,
          title: item.title.slice(0, 200),
          summary: stripHTML(item.desc || '').slice(0, 500),
          content: item.content || item.desc || '',
          url: item.link,
          source: feed.src,
          category: feed.cat,
          author: item.author || feed.label || '',
          published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          fetched_at: new Date().toISOString(),
          image_url: '',
          tags: feed.cat,
          is_pushed: 0,
        });
        existingIds.add(sid);
        newArticles++;
      }
      await new Promise(r => setTimeout(r, 200));
    } catch(e) {
      // 搜索容错
    }
  }

  if (newArticles > 0) {
    db.articles.sort((a,b) => new Date(b.published_at) - new Date(a.published_at));
    saveDB(db);
  }

  // 从数据库搜索
  const kw = keyword.toLowerCase();
  let results = db.articles.filter(a =>
    a.title.toLowerCase().includes(kw) ||
    (a.summary || '').toLowerCase().includes(kw)
  );
  results.sort((a,b) => new Date(b.published_at) - new Date(a.published_at));
  return results.slice(0, limit);
}

// ═══ 获取爬取状态 ═══
function getScrapeStatus() {
  const db = loadDB();
  const lastLog = db.logs[db.logs.length - 1];
  const sources = {};
  db.articles.forEach(a => {
    sources[a.source] = (sources[a.source] || 0) + 1;
  });
  return {
    feeds: ALL_FEEDS.length,
    totalArticles: db.articles.length,
    lastScrape: lastLog || null,
    sources,
    feedList: ALL_FEEDS.map(f => ({
      label: f.label,
      category: f.cat,
      source: f.src,
      priority: f.priority,
      url: f.url,
    })),
  };
}

// ═══ 微博红人刷新 — 单独调用以确保跟上最新动态 ═══
async function refreshInfluencers() {
  console.log('[Influencers] 🔄 刷新微博红人动态...');
  const db = loadDB();
  const existingIds = new Set(db.articles.map(a => a.source_id));
  let added = 0;

  for (const inf of WEIBO_INFLUENCERS) {
    try {
      const rssUrl = `https://rsshub.app/weibo/user/${inf.uid}`;
      const xml = await fetchURL(rssUrl);
      const items = parseXMLItems(xml);
      for (const item of items.slice(0, 10)) {
        if (!item.title || !item.link) continue;
        const sid = `weibo_influencer_${crypto.createHash('md5').update(item.link).digest('hex').slice(0,12)}`;
        if (existingIds.has(sid)) continue;

        db.seq++;
        db.articles.push({
          id: db.seq,
          source_id: sid,
          title: item.title.slice(0, 200),
          summary: stripHTML(item.desc || '').slice(0, 500),
          content: item.content || item.desc || '',
          url: item.link,
          source: 'weibo_influencer',
          category: inf.cat,
          author: inf.name,
          published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          fetched_at: new Date().toISOString(),
          image_url: '',
          tags: inf.cat,
          is_pushed: 0,
        });
        existingIds.add(sid);
        added++;
      }
      await new Promise(r => setTimeout(r, 300));
    } catch(e) {
      console.error(`[Influencers] ❌ ${inf.name}: ${e.message}`);
    }
  }

  if (added > 0) {
    db.articles.sort((a,b) => new Date(b.published_at) - new Date(a.published_at));
    saveDB(db);
  }
  console.log(`[Influencers] ✅ 微博红人新增 ${added} 条`);
  return added;
}

// ═══ API Router ═══
async function apiRouter(req, res) {
  const p = url.parse(req.url, true);
  const pn = p.pathname;

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── 健康检查 ──
  if (pn === '/api/health') {
    const db = loadDB();
    return json(res, 200, {
      success: true,
      data: {
        status: 'running',
        version: '3.0.0',
        articleCount: db.articles.length,
        feedCount: ALL_FEEDS.length,
        platformCount: [...new Set(ALL_FEEDS.map(f => f.src))].length,
        lastScrape: db.logs[db.logs.length - 1] || null,
      }
    });
  }

  // ── 文章列表 (含分页/分类/搜索) ──
  if (pn === '/api/articles') {
    const db = loadDB();
    let list = [...db.articles];
    const q = p.query;

    if (q.category && q.category !== 'all') {
      list = list.filter(a => a.category === q.category);
    }
    if (q.source && q.source !== 'all') {
      list = list.filter(a => a.source === q.source);
    }
    if (q.keyword) {
      const kw = q.keyword.toLowerCase();
      list = list.filter(a =>
        a.title.toLowerCase().includes(kw) ||
        (a.summary || '').toLowerCase().includes(kw) ||
        (a.author || '').toLowerCase().includes(kw)
      );
    }
    list.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

    const page = Math.max(1, parseInt(q.page) || 1);
    const limit = Math.min(parseInt(q.limit) || 20, 50);
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return json(res, 200, {
      success: true,
      articles: list.slice((page - 1) * limit, page * limit),
      pagination: { page, limit, total, totalPages },
    });
  }

  // ── 文章详情 ──
  const am = pn.match(/^\/api\/articles\/(\d+)$/);
  if (am) {
    const db = loadDB();
    const a = db.articles.find(x => x.id === parseInt(am[1]));
    if (!a) return json(res, 404, { success: false, error: 'Not found' });
    return json(res, 200, { success: true, data: a });
  }

  // ── 分类列表 ──
  if (pn === '/api/categories') {
    const db = loadDB();
    const cats = [
      { category: 'TS', emoji: '🏳️‍⚧️', label: 'TS/跨性别' },
      { category: 'CD', emoji: '💃', label: 'CD/变装' },
      { category: '第三性', emoji: '🌈', label: '第三性' },
      { category: '伪娘', emoji: '🌸', label: '伪娘' },
      { category: '药娘', emoji: '💊', label: '药娘' },
      { category: '活动', emoji: '🎉', label: '活动聚会' },
      { category: '科普', emoji: '📚', label: '科普知识' },
      { category: '法律', emoji: '⚖️', label: '法律政策' },
      { category: 'general', emoji: '📡', label: '综合资讯' },
    ];
    const counts = {};
    db.articles.forEach(a => {
      const cat = cats.find(c => c.category === a.category) ? a.category : 'general';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return json(res, 200, {
      success: true,
      data: cats.map(c => ({ ...c, count: counts[c.category] || 0 })),
    });
  }

  // ── 抓取状态 ──
  if (pn === '/api/scrape/status') {
    return json(res, 200, { success: true, data: getScrapeStatus() });
  }

  // ── 手动触发全量抓取 ──
  if (pn === '/api/scrape/trigger' && req.method === 'POST') {
    scrapeAll().then(() => console.log('[API] 全量抓取完成'));
    return json(res, 200, { success: true, message: '🌐 全量抓取已启动', feeds: ALL_FEEDS.length });
  }

  // ── 刷新微博红人 ──
  if (pn === '/api/scrape/influencers' && req.method === 'POST') {
    refreshInfluencers().then(n => console.log(`[API] 红人刷新完成: +${n}`));
    return json(res, 200, { success: true, message: '📱 微博红人动态刷新中', influencers: WEIBO_INFLUENCERS.length });
  }

  // ── 手动搜索 ──
  if (pn === '/api/search' && req.method === 'POST') {
    const body = await readBody(req);
    const kw = body.keyword || p.query.keyword || '';
    if (!kw) return json(res, 400, { success: false, error: '请提供 keyword' });
    const results = await manualSearch(kw, body.limit || 20);
    return json(res, 200, { success: true, data: results, total: results.length });
  }

  // ── 推送订阅 ──
  if (pn === '/api/push/subscribe' && req.method === 'POST') {
    const body = await readBody(req);
    const db = loadDB();
    if (body.subscription?.endpoint) {
      db.subs.push({
        endpoint: body.subscription.endpoint,
        keys: body.subscription.keys,
        time: new Date().toISOString(),
      });
      saveDB(db);
    }
    return json(res, 200, { success: true });
  }
  if (pn === '/api/push/vapid-public-key') {
    return json(res, 200, { success: true, data: { publicKey: '' } });
  }

  // ── 微博红人列表 ──
  if (pn === '/api/influencers') {
    const db = loadDB();
    const infs = WEIBO_INFLUENCERS.map(inf => {
      const articleCount = db.articles.filter(a => a.author === inf.name).length;
      return { ...inf, articleCount };
    });
    return json(res, 200, { success: true, data: infs });
  }

  json(res, 404, { success: false, error: 'Not found', endpoints: [
    'GET  /api/health',
    'GET  /api/articles?category=&keyword=&page=&limit=',
    'GET  /api/articles/:id',
    'GET  /api/categories',
    'GET  /api/scrape/status',
    'POST /api/scrape/trigger',
    'POST /api/scrape/influencers',
    'POST /api/search  {keyword, limit}',
    'GET  /api/influencers',
  ]});
}

// ═══ 种子数据 ═══
function seedDatabase() {
  const db = loadDB();
  if (db.articles.length > 0) return;
  const now = Date.now();
  const seeds = [
    { title: '跨性别者基础概念与术语指南', desc: '详细介绍跨性别者的基本概念、常用术语及使用规范，帮助新人快速了解社群文化。', url: 'https://weibo.com', src: 'weibo_influencer', cat: '科普', author: '跨性别热线' },
    { title: '2026夏季CD/TS线下交流分享会', desc: '一年一度的线下聚会！化妆教学、穿搭分享、心理互助，欢迎所有姐妹参加。', url: 'https://tieba.baidu.com', src: 'tieba_rss', cat: '活动', author: '活动君' },
    { title: '第三性别认定最新政策解读', desc: '最新第三性别认定政策详解，身份证件标注、法律权益保障全攻略。', url: 'https://zhuanlan.zhihu.com', src: 'zhihu', cat: '法律', author: '彩虹法律' },
    { title: '伪娘化妆入门：从底妆到眼影', desc: '零基础也能学会的伪娘化妆教程，从护肤到底妆、眼妆、唇妆全流程讲解。', url: 'https://www.bilibili.com', src: 'bilibili', cat: '伪娘', author: '美妆分享' },
    { title: '药娘安全用药与健康管理', desc: '科学认知激素治疗，了解药物作用机制与潜在风险，定期体检建议。', url: 'https://weibo.com', src: 'weibo_rss', cat: '药娘', author: '淡蓝公益' },
    { title: '2026夏季女装穿搭趋势', desc: '今夏最流行的女装穿搭推荐，通勤、约会、日常多种场景全面覆盖。', url: 'https://tieba.baidu.com', src: 'tieba_rss', cat: 'CD', author: '时尚达人' },
    { title: 'TS/CD群体心理健康指南', desc: '跨性别和CD群体常见的心理健康挑战，有效的应对策略和求助渠道。', url: 'https://zhuanlan.zhihu.com', src: 'zhihu', cat: 'TS', author: '跨儿心理' },
    { title: 'MTF声音训练全攻略', desc: '声音女性化系统训练：呼吸控制、共鸣调整、语调变化全方位指导。', url: 'https://www.bilibili.com', src: 'bilibili', cat: 'TS', author: '北京同志中心' },
    { title: '北京第三性/跨性别社群二十年', desc: '从地下到阳光——北京第三性和跨性别社群二十年发展历程回顾。', url: 'https://weibo.com', src: 'weibo_influencer', cat: '第三性', author: '社群记录者' },
    { title: '纪录片推荐：第三性的真实人生', desc: '多部记录第三性/跨性别群体真实生活的优秀纪录片推荐与观后感。', url: 'https://www.bilibili.com', src: 'bilibili', cat: '第三性', author: '性别研究' },
    { title: 'LGBT权促会最新工作报告', desc: '年度工作总结：法律援助、公众教育、政策倡导等多维度推动平等。', url: 'https://weibo.com', src: 'weibo_influencer', cat: 'TS', author: 'LGBT权促会' },
    { title: '激素替代疗法(HRT)全面科普', desc: '什么是HRT？适用人群、流程、效果与风险全面解析。', url: 'https://zhuanlan.zhihu.com', src: 'zhihu', cat: '科普', author: '性别研究' },
    { title: '小红书热门：CD伪娘日常穿搭分享', desc: '整理小红书平台近期热门的变装穿搭笔记，风格多样。', url: 'https://www.xiaohongshu.com', src: 'xiaohongshu', cat: '伪娘', author: '小红书达人' },
    { title: '同志之声：骄傲月特别企划', desc: '六月骄傲月系列活动回顾，多元性别平等倡导。', url: 'https://weibo.com', src: 'weibo_influencer', cat: 'TS', author: '同志之声' },
    { title: '跨性别就业权益法律解读', desc: '跨性别者在职场中的权益保护、反歧视法律依据与维权路径。', url: 'https://zhuanlan.zhihu.com', src: 'zhihu', cat: '法律', author: '彩虹法律' },
  ];

  seeds.forEach((s, i) => {
    const shift = i * 43200000; // 每篇间隔12小时
    db.seq++;
    db.articles.push({
      id: db.seq,
      source_id: `seed_v3_${i}`,
      title: s.title,
      summary: s.desc,
      content: s.desc,
      url: s.url,
      source: s.src,
      category: s.cat,
      author: s.author,
      published_at: new Date(now - shift).toISOString(),
      fetched_at: new Date().toISOString(),
      image_url: '',
      tags: s.cat,
      is_pushed: 0,
    });
  });
  db.articles.sort((a,b) => new Date(b.published_at) - new Date(a.published_at));
  saveDB(db);
  console.log(`[Seed v3.0] 🌱 ${seeds.length} 篇种子文章已创建`);
}

// ═══ Main Server ═══
const server = http.createServer((req, res) => {
  const pn = url.parse(req.url).pathname;
  if (pn.startsWith('/api/')) return apiRouter(req, res);
  serveStatic(req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  社群资讯聚合平台 v3.0                    ║`);
  console.log(`║  🚀 多平台智能抓取引擎                     ║`);
  console.log(`║  📡 信息源: ${ALL_FEEDS.length} 个                         ║`);
  console.log(`║  🌐 覆盖: 微博/贴吧/知乎/B站/小红书/抖音/Twitter  ║`);
  console.log(`║  📱 微博红人追踪: ${WEIBO_INFLUENCERS.length} 个                   ║`);
  console.log(`║  ⏱️  自动更新: 每 ${SCRAPE_MIN} 分钟                    ║`);
  console.log(`╚══════════════════════════════════════════╝`);
  console.log(`   http://0.0.0.0:${PORT}\n`);

  // 初始化种子数据
  seedDatabase();

  // 启动后立即抓取
  setTimeout(async () => {
    console.log('[Init] 🔄 首轮全量抓取...');
    await refreshInfluencers(); // 优先抓红人
    await scrapeAll();
    console.log('[Init] ✅ 启动完成');
  }, 3000);

  // 定时全量抓取
  setInterval(() => scrapeAll(), SCRAPE_MIN * 60 * 1000);

  // 微博红人单独高频刷新 (每5分钟)
  setInterval(() => refreshInfluencers(), 5 * 60 * 1000);
});

process.on('SIGINT', () => { server.close(); process.exit(0); });
process.on('SIGTERM', () => { server.close(); process.exit(0); });
