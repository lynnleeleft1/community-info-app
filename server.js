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
//  多平台抓取源配置 v4.0 — 主流 + 小众专业全覆盖
// ═══════════════════════════════════════════════════

// ── 微博关键词搜索 ──
const WEIBO_SEARCH_TERMS = [
  '跨性别','第三性','伪娘','药娘','transgender','MTF','FTM',
  'TS小姐姐','CD变装','女装大佬','LGBT','同志圈','性别认同',
  '李智贤','跨性别美女','TS网红',
];

// ── 微博核心红人/KOL 账号 (RSSHub uid 格式) ──
const WEIBO_INFLUENCERS = [
  { uid:'7032362025', name:'跨性别热线', cat:'TS' },
  { uid:'1769833815', name:'LGBT权促会', cat:'TS' },
  { uid:'6488755950', name:'彩虹法律', cat:'法律' },
  { uid:'5624113323', name:'北京同志中心', cat:'TS' },
  { uid:'6604103002', name:'性别研究', cat:'科普' },
  { uid:'7485528879', name:'跨儿心理', cat:'TS' },
  { uid:'1931093633', name:'淡蓝公益', cat:'科普' },
  { uid:'6138092018', name:'同志之声', cat:'TS' },
  // v4.0 新增红人
  { uid:'李智贤', name:'李智贤', cat:'TS', searchOnly:true },
  { uid:'7030182019', name:'跨性别之声', cat:'TS' },
  { uid:'6578932104', name:'MTF姐妹圈', cat:'药娘' },
];

// ── 贴吧 ──
const TIEBA_FORUMS = [
  '第三性','伪娘','药娘','CD','TS','transgender','女装子',
  'mtf','跨性别','性别认同','化妆','变装','同志','拉拉','gay',
  '李智贤','女装大佬','伪声','TS交友',
];

// ── 知乎话题 ──
const ZHIHU_TOPICS = [
  '跨性别','第三性','性别认同','LGBT','性别研究',
  '激素治疗','性别重置','性少数群体','MTF经历分享',
];

// ── B站搜索 ──
const BILIBILI_KEYWORDS = [
  '跨性别','TS小姐姐','CD变装','伪娘','药娘','MTF','女装',
  'LGBT','性别认同','声音训练','化妆教程','李智贤','跨性别日常',
];

// ── B站UP主追踪 ──
const BILIBILI_UPERS = [
  { uid:'287793028', name:'TS生活记录', cat:'TS' },
  { uid:'396395216', name:'跨儿日记', cat:'TS' },
  { uid:'478160548', name:'CD变装教程', cat:'伪娘' },
];

// ── 小红书搜索 ──
const XIAOHONGSHU_KEYWORDS = [
  '跨性别','第三性','CD变装','伪娘','女装','MTF',
  'LGBT','化妆教程','穿搭','跨性别日常','TS穿搭',
];

// ── 小红书博主追踪 ──
const XIAOHONGSHU_BLOGGERS = [
  { id:'5f3a2b0100000000010028e8', name:'TS日常分享', cat:'TS' },
  { id:'5e8c1a3a0000000001009148', name:'女装穿搭日记', cat:'伪娘' },
];

// ── 抖音 ──
const DOUYIN_HOT = true;

// ── Twitter/X ──
const TWITTER_SEARCHES = [
  '跨性别','transgender China','MTF transgender','CD crossdresser',
];

// ═══ v4.0 新增平台 ═══

// ── 豆瓣小组 ──
const DOUBAN_GROUPS = [
  '跨性别','LGBT','第三性','伪娘','CD','MTF','性别认同',
  '同志','拉拉','女装','TS',
];

// ── 即刻 (Jike) 圈子 ──
const JIKE_TOPICS = [
  '跨性别','LGBT','性别认同','第三性','MTF','伪娘',
];

// ── V2EX 技术社区 ──
const V2EX_KEYWORDS = [
  '跨性别','LGBT','性别认同','MTF',
];

// ── Reddit 社区 ──
const REDDIT_SUBREDDITS = [
  'transgender','MtF','crossdressing','asktransgender','LGBT',
];

// ── Telegram 频道 ──
const TELEGRAM_CHANNELS = [
  'trans_china','mtf_cn','lgbt_china','cd_crossdress',
];

// ── 少数派 (sspai) ──
const SSPAI_KEYWORDS = [
  '跨性别','LGBT','性别','少数群体',
];

// ── 网易新闻 ──
const NETEASE_KEYWORDS = [
  '跨性别','LGBT','性别认同','第三性',
];

// ═══ 生成全量 RSS 源列表 v4.0 — 15+ 平台 ═══
function buildFeeds() {
  const feeds = [];

  // ▸ 微博红人时间线 (最高优先级, 每5分钟刷新)
  WEIBO_INFLUENCERS.forEach(inf => {
    if (inf.searchOnly) {
      // 搜索型红人 — 按关键词追踪
      feeds.push({
        url: `https://rsshub.app/weibo/search/${encodeURIComponent(inf.name)}`,
        cat: inf.cat,
        src: 'weibo_influencer',
        label: `微博红人·${inf.name}`,
        priority: 1,
      });
    } else {
      feeds.push({
        url: `https://rsshub.app/weibo/user/${inf.uid}`,
        cat: inf.cat,
        src: 'weibo_influencer',
        label: `微博·${inf.name}`,
        priority: 1,
      });
    }
  });

  // ▸ 微博关键词搜索
  WEIBO_SEARCH_TERMS.forEach(term => {
    feeds.push({
      url: `https://rsshub.app/weibo/search/${encodeURIComponent(term)}`,
      cat: mapCategory(term),
      src: 'weibo_rss',
      label: `微博搜索·${term}`,
      priority: 2,
    });
  });

  // ▸ 贴吧
  TIEBA_FORUMS.forEach(forum => {
    feeds.push({
      url: `https://rsshub.app/tieba/forum/${encodeURIComponent(forum)}`,
      cat: mapCategory(forum),
      src: 'tieba_rss',
      label: `贴吧·${forum}`,
      priority: 2,
    });
  });

  // ▸ 知乎
  ZHIHU_TOPICS.forEach(topic => {
    feeds.push({
      url: `https://rsshub.app/zhihu/search/${encodeURIComponent(topic)}`,
      cat: mapCategory(topic),
      src: 'zhihu',
      label: `知乎·${topic}`,
      priority: 2,
    });
  });

  // ▸ B站搜索
  BILIBILI_KEYWORDS.forEach(kw => {
    feeds.push({
      url: `https://rsshub.app/bilibili/vsearch/${encodeURIComponent(kw)}`,
      cat: mapCategory(kw),
      src: 'bilibili',
      label: `B站·${kw}`,
      priority: 2,
    });
  });

  // ▸ B站UP主
  BILIBILI_UPERS.forEach(up => {
    feeds.push({
      url: `https://rsshub.app/bilibili/user/video/${up.uid}`,
      cat: up.cat,
      src: 'bilibili',
      label: `B站UP·${up.name}`,
      priority: 1,
    });
  });

  // ▸ 小红书
  XIAOHONGSHU_KEYWORDS.forEach(kw => {
    feeds.push({
      url: `https://rsshub.app/xiaohongshu/search/${encodeURIComponent(kw)}`,
      cat: mapCategory(kw),
      src: 'xiaohongshu',
      label: `小红书·${kw}`,
      priority: 3,
    });
  });

  // ▸ 小红书博主
  XIAOHONGSHU_BLOGGERS.forEach(b => {
    feeds.push({
      url: `https://rsshub.app/xiaohongshu/user/${b.id}/notes`,
      cat: b.cat,
      src: 'xiaohongshu',
      label: `小红书·${b.name}`,
      priority: 1,
    });
  });

  // ▸ 抖音热点
  if (DOUYIN_HOT) {
    feeds.push({
      url: 'https://rsshub.app/douyin/hot',
      cat: 'general',
      src: 'douyin',
      label: '抖音·热榜',
      priority: 3,
    });
  }

  // ▸ Twitter/X
  TWITTER_SEARCHES.forEach(q => {
    feeds.push({
      url: `https://rsshub.app/twitter/search/${encodeURIComponent(q)}`,
      cat: 'TS',
      src: 'twitter',
      label: `Twitter·${q}`,
      priority: 3,
    });
  });

  // ═══ v4.0 新增平台 ═══

  // ▸ 豆瓣小组
  DOUBAN_GROUPS.forEach(g => {
    feeds.push({
      url: `https://rsshub.app/douban/search/group/${encodeURIComponent(g)}`,
      cat: mapCategory(g),
      src: 'douban',
      label: `豆瓣小组·${g}`,
      priority: 2,
    });
  });

  // ▸ 即刻 (Jike)
  JIKE_TOPICS.forEach(t => {
    feeds.push({
      url: `https://rsshub.app/jike/topic/text/${encodeURIComponent(t)}`,
      cat: mapCategory(t),
      src: 'jike',
      label: `即刻·${t}`,
      priority: 3,
    });
  });

  // ▸ V2EX
  V2EX_KEYWORDS.forEach(kw => {
    feeds.push({
      url: `https://rsshub.app/v2ex/search/${encodeURIComponent(kw)}`,
      cat: mapCategory(kw),
      src: 'v2ex',
      label: `V2EX·${kw}`,
      priority: 3,
    });
  });

  // ▸ Reddit
  REDDIT_SUBREDDITS.forEach(sub => {
    feeds.push({
      url: `https://rsshub.app/reddit/subreddit/${sub}`,
      cat: 'TS',
      src: 'reddit',
      label: `Reddit·r/${sub}`,
      priority: 3,
    });
  });

  // ▸ Telegram 频道
  TELEGRAM_CHANNELS.forEach(ch => {
    feeds.push({
      url: `https://rsshub.app/telegram/channel/${ch}`,
      cat: 'TS',
      src: 'telegram',
      label: `TG·${ch}`,
      priority: 2,
    });
  });

  // ▸ 少数派
  SSPAI_KEYWORDS.forEach(kw => {
    feeds.push({
      url: `https://rsshub.app/sspai/search/${encodeURIComponent(kw)}`,
      cat: '科普',
      src: 'sspai',
      label: `少数派·${kw}`,
      priority: 4,
    });
  });

  // ▸ 网易新闻
  NETEASE_KEYWORDS.forEach(kw => {
    feeds.push({
      url: `https://rsshub.app/netease/search/${encodeURIComponent(kw)}`,
      cat: mapCategory(kw),
      src: 'netease',
      label: `网易新闻·${kw}`,
      priority: 4,
    });
  });

  // ▸ 知乎热榜
  feeds.push({
    url: 'https://rsshub.app/zhihu/hotlist',
    cat: 'general',
    src: 'zhihu',
    label: '知乎·热榜',
    priority: 4,
  });

  // ▸ 微博热搜
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
  console.log(`[Scrape v4.0] 🚀 开始全量抓取 (${ALL_FEEDS.length} 个信息源, ${[...new Set(ALL_FEEDS.map(f=>f.src))].length} 个平台)...`);
  const db = loadDB();
  const existingIds = new Set(db.articles.map(a => a.source_id));
  let found = 0, added = 0, errors = 0;
  const stats = {}; // per-platform stats

  // 优先抓取高优先级源 (微博红人/B站UP主)
  const sorted = [...ALL_FEEDS].sort((a,b) => (a.priority||9) - (b.priority||9));

  for (const feed of sorted) {
    try {
      const xml = await fetchURL(feed.url);
      const items = parseXMLItems(xml);
      const take = feed.priority === 1 ? 15 : 8;

      for (const item of items.slice(0, take)) {
        if (!item.title || !item.link) continue;
        const sid = `${feed.src}_${crypto.createHash('md5').update(item.link).digest('hex').slice(0,12)}`;
        if (existingIds.has(sid)) continue;

        found++; db.seq++;
        const rawContent = item.content || item.desc || '';
        const inline = extractInlineContent(rawContent);
        const summary = inline.text.slice(0, 500);

        // 取封面图
        let image_url = inline.images[0] || '';
        if (!image_url) {
          const encMatch = (rawContent||'').match(/<enclosure[^>]+url="([^"]+)"/i);
          if (encMatch) image_url = encMatch[1];
        }

        db.articles.push({
          id: db.seq,
          source_id: sid,
          title: item.title.slice(0, 200),
          summary,
          content: JSON.stringify({
            text: inline.text,
            images: inline.images,
            videos: inline.videos,
            html: rawContent.slice(0, 50000),
          }),
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
        stats[feed.src] = (stats[feed.src] || 0) + 1;
      }
      await new Promise(r => setTimeout(r, 150 + Math.random() * 250));
    } catch(e) {
      errors++;
      if (feed.priority <= 2) {
        console.error(`[Scrape] ❌ ${feed.label}: ${e.message}`);
      }
    }
  }

  // 按发布时间倒排
  db.articles.sort((a,b) => new Date(b.published_at) - new Date(a.published_at));

  // 清理14天前的非核心文章，保留至少500条
  if (db.articles.length > 3000) {
    const cutoff = Date.now() - 14 * 86400000;
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
    platforms: [...new Set(ALL_FEEDS.map(f=>f.src))],
    stats,
  });
  saveDB(db);
  console.log(`[Scrape v4.0] ✅ 完成: ${found} 抓到, ${added} 新增, ${errors} 失败, 总计 ${db.articles.length} 篇 | 平台分布: ${JSON.stringify(stats)}`);
  return { found, added, errors, total: db.articles.length, stats };
}

// HTML标签剥离 — 保留换行结构
function stripHTML(str) {
  return str
    .replace(/<br\s*\/?>/gi,'\n')
    .replace(/<\/p>/gi,'\n')
    .replace(/<\/div>/gi,'\n')
    .replace(/<\/li>/gi,'\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g,' ')
    .replace(/&amp;/g,'&')
    .replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"')
    .replace(/&#39;/g,"'")
    .replace(/&[^;]+;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s{3,}/g, '  ')
    .trim();
}

// ═══ 增强内容提取 — 用于内联阅读 v4.0 ═══
function extractInlineContent(rawHtml) {
  if (!rawHtml) return { text: '', images: [], hasContent: false };
  
  // 提取所有图片
  const images = [];
  const imgRe = /<img[^>]+src="([^"]+)"[^>]*>/gi;
  let im;
  while ((im = imgRe.exec(rawHtml)) !== null) {
    if (im[1] && im[1].startsWith('http') && !images.includes(im[1])) {
      images.push(im[1]);
    }
    if (images.length >= 8) break; // 最多8张图
  }
  
  // 提取视频/媒体链接
  const videos = [];
  const vidRe = /<video[^>]+src="([^"]+)"[^>]*>/gi;
  let vm;
  while ((vm = vidRe.exec(rawHtml)) !== null) {
    if (vm[1] && vm[1].startsWith('http')) videos.push(vm[1]);
  }
  
  // 清理HTML为可读文本
  const text = stripHTML(rawHtml).slice(0, 10000);
  
  return {
    text,
    images,
    videos,
    hasContent: text.length > 20 || images.length > 0,
  };
}

// ═══ 手动搜索 — 实时跨平台 v4.0 ═══
async function manualSearch(keyword, limit = 20) {
  console.log(`[Search v4.0] 🔍 "${keyword}"`);
  const db = loadDB();

  // 实时抓取 — 动态生成搜索源 (15+ 平台)
  const searchFeeds = [
    { url: `https://rsshub.app/weibo/search/${encodeURIComponent(keyword)}`, cat: 'TS', src: 'weibo_rss', label: '微博' },
    { url: `https://rsshub.app/tieba/forum/${encodeURIComponent(keyword)}`, cat: 'TS', src: 'tieba_rss', label: '贴吧' },
    { url: `https://rsshub.app/zhihu/search/${encodeURIComponent(keyword)}`, cat: 'TS', src: 'zhihu', label: '知乎' },
    { url: `https://rsshub.app/bilibili/vsearch/${encodeURIComponent(keyword)}`, cat: 'TS', src: 'bilibili', label: 'B站' },
    { url: `https://rsshub.app/xiaohongshu/search/${encodeURIComponent(keyword)}`, cat: 'TS', src: 'xiaohongshu', label: '小红书' },
    // v4.0 新增
    { url: `https://rsshub.app/douban/search/group/${encodeURIComponent(keyword)}`, cat: 'TS', src: 'douban', label: '豆瓣' },
    { url: `https://rsshub.app/jike/topic/text/${encodeURIComponent(keyword)}`, cat: 'TS', src: 'jike', label: '即刻' },
    { url: `https://rsshub.app/v2ex/search/${encodeURIComponent(keyword)}`, cat: 'TS', src: 'v2ex', label: 'V2EX' },
    { url: `https://rsshub.app/reddit/subreddit/${encodeURIComponent(keyword)}`, cat: 'TS', src: 'reddit', label: 'Reddit' },
    { url: `https://rsshub.app/sspai/search/${encodeURIComponent(keyword)}`, cat: '科普', src: 'sspai', label: '少数派' },
    { url: `https://rsshub.app/netease/search/${encodeURIComponent(keyword)}`, cat: 'TS', src: 'netease', label: '网易新闻' },
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
        const rawContent = item.content || item.desc || '';
        const inline = extractInlineContent(rawContent);
        db.articles.push({
          id: db.seq,
          source_id: sid,
          title: item.title.slice(0, 200),
          summary: inline.text.slice(0, 500),
          content: JSON.stringify({ text: inline.text, images: inline.images, videos: inline.videos, html: rawContent.slice(0, 50000) }),
          url: item.link,
          source: feed.src,
          category: feed.cat,
          author: item.author || feed.label || '',
          published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          fetched_at: new Date().toISOString(),
          image_url: inline.images[0] || '',
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
  console.log('[Influencers v4.0] 🔄 刷新红人动态 (微博+B站+小红书)...');
  const db = loadDB();
  const existingIds = new Set(db.articles.map(a => a.source_id));
  let added = 0;

  // 微博红人
  for (const inf of WEIBO_INFLUENCERS) {
    if (inf.searchOnly) continue; // 搜索型在 buildFeeds 中处理
    try {
      const rssUrl = `https://rsshub.app/weibo/user/${inf.uid}`;
      const xml = await fetchURL(rssUrl);
      const items = parseXMLItems(xml);
      for (const item of items.slice(0, 10)) {
        if (!item.title || !item.link) continue;
        const sid = `weibo_influencer_${crypto.createHash('md5').update(item.link).digest('hex').slice(0,12)}`;
        if (existingIds.has(sid)) continue;

        const rawContent = item.content || item.desc || '';
        const inline = extractInlineContent(rawContent);

        db.seq++;
        db.articles.push({
          id: db.seq,
          source_id: sid,
          title: item.title.slice(0, 200),
          summary: inline.text.slice(0, 500),
          content: JSON.stringify({ text: inline.text, images: inline.images, videos: inline.videos, html: rawContent.slice(0, 50000) }),
          url: item.link,
          source: 'weibo_influencer',
          category: inf.cat,
          author: inf.name,
          published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          fetched_at: new Date().toISOString(),
          image_url: inline.images[0] || '',
          tags: inf.cat,
          is_pushed: 0,
        });
        existingIds.add(sid);
        added++;
      }
      await new Promise(r => setTimeout(r, 300));
    } catch(e) {
      console.error(`[Influencers] ❌ 微博·${inf.name}: ${e.message}`);
    }
  }

  // B站UP主
  for (const up of BILIBILI_UPERS) {
    try {
      const rssUrl = `https://rsshub.app/bilibili/user/video/${up.uid}`;
      const xml = await fetchURL(rssUrl);
      const items = parseXMLItems(xml);
      for (const item of items.slice(0, 8)) {
        if (!item.title || !item.link) continue;
        const sid = `bilibili_${crypto.createHash('md5').update(item.link).digest('hex').slice(0,12)}`;
        if (existingIds.has(sid)) continue;

        const rawContent = item.content || item.desc || '';
        const inline = extractInlineContent(rawContent);

        db.seq++;
        db.articles.push({
          id: db.seq,
          source_id: sid,
          title: item.title.slice(0, 200),
          summary: inline.text.slice(0, 500),
          content: JSON.stringify({ text: inline.text, images: inline.images, videos: inline.videos, html: rawContent.slice(0, 50000) }),
          url: item.link,
          source: 'bilibili',
          category: up.cat,
          author: up.name,
          published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          fetched_at: new Date().toISOString(),
          image_url: inline.images[0] || '',
          tags: up.cat,
          is_pushed: 0,
        });
        existingIds.add(sid);
        added++;
      }
      await new Promise(r => setTimeout(r, 300));
    } catch(e) {
      console.error(`[Influencers] ❌ B站·${up.name}: ${e.message}`);
    }
  }

  // 小红书博主
  for (const b of XIAOHONGSHU_BLOGGERS) {
    try {
      const rssUrl = `https://rsshub.app/xiaohongshu/user/${b.id}/notes`;
      const xml = await fetchURL(rssUrl);
      const items = parseXMLItems(xml);
      for (const item of items.slice(0, 8)) {
        if (!item.title || !item.link) continue;
        const sid = `xhs_${crypto.createHash('md5').update(item.link).digest('hex').slice(0,12)}`;
        if (existingIds.has(sid)) continue;

        const rawContent = item.content || item.desc || '';
        const inline = extractInlineContent(rawContent);

        db.seq++;
        db.articles.push({
          id: db.seq,
          source_id: sid,
          title: item.title.slice(0, 200),
          summary: inline.text.slice(0, 500),
          content: JSON.stringify({ text: inline.text, images: inline.images, videos: inline.videos, html: rawContent.slice(0, 50000) }),
          url: item.link,
          source: 'xiaohongshu',
          category: b.cat,
          author: b.name,
          published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          fetched_at: new Date().toISOString(),
          image_url: inline.images[0] || '',
          tags: b.cat,
          is_pushed: 0,
        });
        existingIds.add(sid);
        added++;
      }
      await new Promise(r => setTimeout(r, 300));
    } catch(e) {
      console.error(`[Influencers] ❌ 小红书·${b.name}: ${e.message}`);
    }
  }

  if (added > 0) {
    db.articles.sort((a,b) => new Date(b.published_at) - new Date(a.published_at));
    saveDB(db);
  }
  console.log(`[Influencers v4.0] ✅ 跨平台红人新增 ${added} 条`);
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
        version: '4.0.0',
        articleCount: db.articles.length,
        feedCount: ALL_FEEDS.length,
        platformCount: [...new Set(ALL_FEEDS.map(f => f.src))].length,
        platforms: [...new Set(ALL_FEEDS.map(f => f.src))],
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
    { title: '跨性别者基础概念与术语指南', desc: '详细介绍跨性别者的基本概念、常用术语及使用规范，帮助新人快速了解社群文化。\n\n涵盖：什么是跨性别、性别认同与生理性别的区别、MTF/FTM/非二元性别者定义、常用社群术语表。', url: 'https://weibo.com', src: 'weibo_influencer', cat: '科普', author: '跨性别热线' },
    { title: '2026夏季CD/TS线下交流分享会', desc: '一年一度的线下聚会！化妆教学、穿搭分享、心理互助，欢迎所有姐妹参加。\n\n活动亮点：专业化妆师现场教学、姐妹穿搭秀、心理导师圆桌讨论、交友互动环节。', url: 'https://tieba.baidu.com', src: 'tieba_rss', cat: '活动', author: '活动君' },
    { title: '第三性别认定最新政策解读', desc: '最新第三性别认定政策详解，身份证件标注、法律权益保障全攻略。\n\n政策要点：第三性别标识的法律地位、各地实施进展、相关权益保障范围。', url: 'https://zhuanlan.zhihu.com', src: 'zhihu', cat: '法律', author: '彩虹法律' },
    { title: '伪娘化妆入门：从底妆到眼影', desc: '零基础也能学会的伪娘化妆教程，从护肤到底妆、眼妆、唇妆全流程讲解。\n\n步骤分解：肤质判断→妆前护理→底妆技巧→修容大法→眼妆精讲→唇妆点睛。', url: 'https://www.bilibili.com', src: 'bilibili', cat: '伪娘', author: 'B站UP·美妆分享' },
    { title: '药娘安全用药与健康管理', desc: '科学认知激素治疗，了解药物作用机制与潜在风险，定期体检建议。\n\n内容包括：常用激素药物介绍、用药注意事项、副作用识别、定期检查项目、健康生活方式建议。', url: 'https://weibo.com', src: 'weibo_rss', cat: '药娘', author: '淡蓝公益' },
    { title: '2026夏季女装穿搭趋势', desc: '今夏最流行的女装穿搭推荐，通勤、约会、日常多种场景全面覆盖。\n\n推荐风格：法式优雅、日系甜美、韩系简约，每套搭配都附购买链接与尺码建议。', url: 'https://tieba.baidu.com', src: 'tieba_rss', cat: 'CD', author: '时尚达人' },
    { title: 'TS/CD群体心理健康指南', desc: '跨性别和CD群体常见的心理健康挑战，有效的应对策略和求助渠道。\n\n关键话题：性别焦虑管理、社交出柜技巧、家庭关系处理、专业心理咨询资源。', url: 'https://zhuanlan.zhihu.com', src: 'zhihu', cat: 'TS', author: '跨儿心理' },
    { title: 'MTF声音训练全攻略', desc: '声音女性化系统训练：呼吸控制、共鸣调整、语调变化全方位指导。\n\n训练模块：呼吸基础→共鸣位置→音高控制→语调训练→日常练习计划。', url: 'https://www.bilibili.com', src: 'bilibili', cat: 'TS', author: '北京同志中心' },
    { title: '北京第三性/跨性别社群二十年', desc: '从地下到阳光——北京第三性和跨性别社群二十年发展历程回顾。\n\n历史脉络：90年代隐秘聚会→00年代网络社群崛起→10年代公益组织成立→20年代政策进步。', url: 'https://weibo.com', src: 'weibo_influencer', cat: '第三性', author: '社群记录者' },
    { title: '纪录片推荐：第三性的真实人生', desc: '多部记录第三性/跨性别群体真实生活的优秀纪录片推荐与观后感。\n\n推荐片单：《有性无别》《玫瑰少年梦》《丹麦女孩》《Tangerine》《Disclosure》等。', url: 'https://www.bilibili.com', src: 'bilibili', cat: '第三性', author: '性别研究' },
    { title: 'LGBT权促会最新工作报告', desc: '年度工作总结：法律援助、公众教育、政策倡导等多维度推动平等。\n\n年度亮点：成功推动3地反歧视条例修订、开展50+场公众讲座、服务800+人次。', url: 'https://weibo.com', src: 'weibo_influencer', cat: 'TS', author: 'LGBT权促会' },
    { title: '激素替代疗法(HRT)全面科普', desc: '什么是HRT？适用人群、流程、效果与风险全面解析。\n\n专业解读：雌激素/抗雄激素方案、青春期阻断剂、长期健康监测、最新临床指南。', url: 'https://zhuanlan.zhihu.com', src: 'zhihu', cat: '科普', author: '性别研究' },
    { title: '小红书热门：CD伪娘日常穿搭分享', desc: '整理小红书平台近期热门的变装穿搭笔记，风格多样从日常到正式全覆盖。', url: 'https://www.xiaohongshu.com', src: 'xiaohongshu', cat: '伪娘', author: '小红书达人' },
    { title: '同志之声：骄傲月特别企划', desc: '六月骄傲月系列活动回顾，多元性别平等倡导。\n\n活动集锦：彩虹跑、骄傲演讲、艺术展览、社群聚餐、公益义卖。', url: 'https://weibo.com', src: 'weibo_influencer', cat: 'TS', author: '同志之声' },
    { title: '跨性别就业权益法律解读', desc: '跨性别者在职场中的权益保护、反歧视法律依据与维权路径。\n\n实用指南：求职面试权益、在职期间保护、晋升不受歧视、维权流程详解。', url: 'https://zhuanlan.zhihu.com', src: 'zhihu', cat: '法律', author: '彩虹法律' },
    { title: '豆瓣小组热议：跨性别者的日常生活', desc: '豆瓣跨性别相关小组近期热门讨论整理，涵盖日常分享、情感交流、互助问答。', url: 'https://www.douban.com', src: 'douban', cat: 'TS', author: '豆瓣用户' },
    { title: '即刻话题：性别认同与自我探索', desc: '即刻社区关于性别认同的真实讨论，年轻人视角下的性别认知与探索之路。', url: 'https://web.okjike.com', src: 'jike', cat: 'TS', author: '即刻用户' },
    { title: 'Reddit r/MtF 社区精华帖精选', desc: 'Reddit r/MtF 板块高质量讨论整理，国际视角下的跨性别女性经验分享。', url: 'https://reddit.com/r/MtF', src: 'reddit', cat: 'TS', author: 'Reddit社区' },
    { title: 'TG频道：跨性别资讯速递', desc: 'Telegram跨性别相关频道精选内容，实时资讯与社群讨论。', url: 'https://t.me', src: 'telegram', cat: 'TS', author: 'TG频道' },
    { title: '少数派：数字时代的性别平等', desc: '少数派平台上关于科技与性别平等的前沿讨论，数字工具如何赋能性别多元群体。', url: 'https://sspai.com', src: 'sspai', cat: '科普', author: '少数派作者' },
  ];

  seeds.forEach((s, i) => {
    const shift = i * 28800000; // 每篇间隔8小时
    db.seq++;
    db.articles.push({
      id: db.seq,
      source_id: `seed_v4_${i}`,
      title: s.title,
      summary: s.desc.split('\n\n')[0],
      content: JSON.stringify({
        text: s.desc,
        images: [],
        videos: [],
        html: '',
      }),
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
  console.log(`[Seed v4.0] 🌱 ${seeds.length} 篇种子文章已创建 (${[...new Set(seeds.map(s=>s.src))].length} 个平台)`);
}

// ═══ Main Server ═══
const server = http.createServer((req, res) => {
  const pn = url.parse(req.url).pathname;
  if (pn.startsWith('/api/')) return apiRouter(req, res);
  serveStatic(req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  社群资讯聚合平台 v4.0                    ║`);
  console.log(`║  🚀 全平台智能抓取引擎                     ║`);
  console.log(`║  📡 信息源: ${ALL_FEEDS.length} 个 | 🌐 平台: ${[...new Set(ALL_FEEDS.map(f=>f.src))].length} 个          ║`);
  console.log(`║  📱 红人追踪: ${WEIBO_INFLUENCERS.length + BILIBILI_UPERS.length + XIAOHONGSHU_BLOGGERS.length} 个                         ║`);
  console.log(`║  📖 内联阅读: ${[...new Set(ALL_FEEDS.map(f=>f.src))].join('/')}  ║`);
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
