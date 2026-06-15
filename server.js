#!/usr/bin/env node
// ═══════════════════════════════════════════════
//  社群资讯聚合平台 - 独立后端服务器
//  零依赖，仅使用 Node.js 内置模块
//  支持: API + 静态文件 + RSS爬虫 + 推送订阅
// ═══════════════════════════════════════════════

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const PUBLIC = path.join(__dirname, 'public');
const SCRAPE_MIN = parseInt(process.env.SCRAPE_INTERVAL) || 30;

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
  res.writeHead(code, {'Content-Type':'application/json;charset=utf-8','Access-Control-Allow-Origin':'*'});
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

// ═══ RSS Scraper ═══
const RSS_FEEDS = [
  { url:'https://rsshub.app/weibo/search/%E8%B7%A8%E6%80%A7%E5%88%AB', cat:'TS', src:'weibo_rss' },
  { url:'https://rsshub.app/weibo/search/%E7%AC%AC%E4%B8%89%E6%80%A7', cat:'第三性', src:'weibo_rss' },
  { url:'https://rsshub.app/weibo/search/%E4%BC%AA%E5%A8%98', cat:'伪娘', src:'weibo_rss' },
  { url:'https://rsshub.app/weibo/search/%E8%8D%AF%E5%A8%98', cat:'药娘', src:'weibo_rss' },
  { url:'https://rsshub.app/tieba/forum/%E7%AC%AC%E4%B8%89%E6%80%A7', cat:'第三性', src:'tieba_rss' },
  { url:'https://rsshub.app/tieba/forum/%E4%BC%AA%E5%A8%98', cat:'伪娘', src:'tieba_rss' },
  { url:'https://rsshub.app/tieba/forum/%E8%8D%AF%E5%A8%98', cat:'药娘', src:'tieba_rss' },
  { url:'https://rsshub.app/zhihu/search/%E8%B7%A8%E6%80%A7%E5%88%AB', cat:'TS', src:'zhihu' },
  { url:'https://rsshub.app/bilibili/search/%E8%B7%A8%E6%80%A7%E5%88%AB', cat:'TS', src:'bilibili' },
];

function fetchURL(u) {
  return new Promise((resolve, reject) => {
    const mod = u.startsWith('https') ? https : http;
    const req = mod.get(u, { headers:{'User-Agent':'CommunityApp/2.0'}, timeout:15000 }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', function(){ this.destroy(); reject(new Error('timeout')); });
  });
}

function parseXMLItems(xml) {
  const items = [];
  const re = /<(item|entry)>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const c = m[2];
    const tag = (t) => { const r = new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`,'i'); return (c.match(r)||[])[1]?.trim()||''; };
    let link = tag('link');
    if (link && !link.startsWith('http')) { const hm = c.match(/<link[^>]*href="([^"]*)"/i); if (hm) link = hm[1]; }
    items.push({ title:tag('title'), link, desc:tag('description'), content:tag('content:encoded')||tag('content'), author:tag('author')||tag('dc:creator'), pubDate:tag('pubDate')||tag('dc:date') });
  }
  return items;
}

async function scrapeAll() {
  console.log('[Scrape] Starting...');
  const db = loadDB();
  let found=0, added=0;
  const existingIds = new Set(db.articles.map(a=>a.source_id));
  for (const feed of RSS_FEEDS) {
    try {
      const xml = await fetchURL(feed.url);
      for (const item of parseXMLItems(xml).slice(0,10)) {
        if (!item.title||!item.link) continue;
        const sid = `${feed.src}_${crypto.createHash('md5').update(item.link).digest('hex').slice(0,12)}`;
        if (existingIds.has(sid)) continue;
        found++; db.seq++;
        db.articles.push({id:db.seq,source_id:sid,title:item.title.slice(0,200),summary:(item.desc||'').replace(/<[^>]*>/g,'').slice(0,500),content:item.content||item.desc||'',url:item.link,source:feed.src,category:feed.cat,author:item.author||'',published_at:item.pubDate?new Date(item.pubDate).toISOString():new Date().toISOString(),fetched_at:new Date().toISOString(),image_url:'',tags:feed.cat,is_pushed:0});
        existingIds.add(sid); added++;
      }
      await new Promise(r=>setTimeout(r,300));
    } catch(e) { console.error(`[Scrape] ${feed.url}: ${e.message}`); }
  }
  db.articles.sort((a,b)=>new Date(b.published_at)-new Date(a.published_at));
  db.logs.push({time:new Date().toISOString(),found,added});
  saveDB(db);
  console.log(`[Scrape] Done: ${found} found, ${added} new`);
}

// ═══ API Router ═══
async function apiRouter(req, res) {
  const p = url.parse(req.url, true);
  const pn = p.pathname;
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (req.method==='OPTIONS') { res.writeHead(204); res.end(); return; }

  if (pn==='/api/health') { const db=loadDB(); return json(res,200,{success:true,data:{status:'running',articleCount:db.articles.length,version:'2.0.0'}}); }

  if (pn==='/api/articles') {
    const db=loadDB(); let list=[...db.articles]; const q=p.query;
    if (q.category&&q.category!=='all') list=list.filter(a=>a.category===q.category);
    if (q.keyword) { const kw=q.keyword.toLowerCase(); list=list.filter(a=>a.title.toLowerCase().includes(kw)||(a.summary||'').toLowerCase().includes(kw)); }
    list.sort((a,b)=>new Date(b.published_at)-new Date(a.published_at));
    const page=parseInt(q.page)||1, limit=Math.min(parseInt(q.limit)||20,50);
    const total=list.length, totalPages=Math.max(1,Math.ceil(total/limit));
    return json(res,200,{success:true,articles:list.slice((page-1)*limit,page*limit),pagination:{page,limit,total,totalPages}});
  }

  const am = pn.match(/^\/api\/articles\/(\d+)$/);
  if (am) { const db=loadDB(); const a=db.articles.find(x=>x.id===parseInt(am[1])); if(!a) return json(res,404,{success:false,error:'Not found'}); return json(res,200,{success:true,data:a}); }

  if (pn==='/api/categories') {
    const db=loadDB();
    const cats=[{category:'TS',emoji:'🏳️‍⚧️',label:'TS/跨性别'},{category:'CD',emoji:'💃',label:'CD'},{category:'第三性',emoji:'🌈',label:'第三性'},{category:'伪娘',emoji:'🌸',label:'伪娘'},{category:'药娘',emoji:'💊',label:'药娘'},{category:'活动',emoji:'🎉',label:'活动聚会'},{category:'科普',emoji:'📚',label:'科普知识'},{category:'法律',emoji:'⚖️',label:'法律政策'}];
    const counts={}; db.articles.forEach(a=>{counts[a.category]=(counts[a.category]||0)+1;});
    return json(res,200,{success:true,data:cats.map(c=>({...c,count:counts[c.category]||0}))});
  }

  if (pn==='/api/push/subscribe'&&req.method==='POST') { const body=await readBody(req); const db=loadDB(); if(body.subscription?.endpoint) { db.subs.push({endpoint:body.subscription.endpoint,keys:body.subscription.keys,time:new Date().toISOString()}); saveDB(db); } return json(res,200,{success:true}); }
  if (pn==='/api/push/vapid-public-key') return json(res,200,{success:true,data:{publicKey:''}});
  if (pn==='/api/scrape/trigger'&&req.method==='POST') { scrapeAll(); return json(res,200,{success:true,message:'Scraping started'}); }

  json(res,404,{success:false,error:'Not found'});
}

// ═══ Main Server ═══
const server = http.createServer((req, res) => {
  const pn = url.parse(req.url).pathname;
  if (pn.startsWith('/api/')) return apiRouter(req, res);
  serveStatic(req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
  const db = loadDB();
  if (db.articles.length === 0) {
    const now = new Date();
    [
      {title:'跨性别者基础概念与术语指南',summary:'详细介绍跨性别者的基本概念、常用术语及使用规范。',url:'https://zhuanlan.zhihu.com/p/example-1',source:'weibo_rss',category:'科普',author:'科普君',published_at:new Date(now-86400000).toISOString()},
      {title:'上海6月CD/TS姐妹线下聚会活动',summary:'一年一度的线下聚会！化妆教学、穿搭分享、心理支持。',url:'https://tieba.baidu.com/p/example-2',source:'tieba_rss',category:'活动',author:'活动君',published_at:new Date(now-172800000).toISOString()},
      {title:'第三性别认定最新政策解读',summary:'最新第三性别认定政策，证件办理、法律权益保障。',url:'https://zhuanlan.zhihu.com/p/example-3',source:'zhihu',category:'法律',author:'法律观察',published_at:new Date(now-259200000).toISOString()},
      {title:'伪娘化妆入门教程',summary:'从底妆到眼妆，手把手教你伪娘化妆技巧。',url:'https://www.bilibili.com/video/example-4',source:'bilibili',category:'伪娘',author:'美妆UP主',published_at:new Date(now-345600000).toISOString()},
      {title:'药娘安全用药指南',summary:'关注药娘群体健康，常见药物作用与风险。',url:'https://weibo.com/example-5',source:'weibo_rss',category:'药娘',author:'健康守护者',published_at:new Date(now-432000000).toISOString()},
      {title:'2026夏季女装穿搭趋势分享',summary:'今夏最in女装穿搭，通勤、约会等多种场景。',url:'https://tieba.baidu.com/p/example-6',source:'tieba_rss',category:'CD',author:'时尚达人',published_at:new Date(now-518400000).toISOString()},
      {title:'TS/CD群体心理健康',summary:'跨性别和CD群体心理健康挑战与应对策略。',url:'https://zhuanlan.zhihu.com/p/example-7',source:'zhihu',category:'TS',author:'心理咨询师',published_at:new Date(now-604800000).toISOString()},
      {title:'MTF声音训练全攻略',summary:'声音女性化训练，呼吸、共鸣、语调全方位指导。',url:'https://www.bilibili.com/video/example-8',source:'bilibili',category:'TS',author:'声音训练师',published_at:new Date(now-691200000).toISOString()},
      {title:'北京第三性/TS社群发展史',summary:'北京第三性和跨性别社群从萌芽到壮大。',url:'https://weibo.com/example-9',source:'weibo_rss',category:'第三性',author:'社群记录者',published_at:new Date(now-777600000).toISOString()},
      {title:'纪录片《第三性》推荐',summary:'记录第三性群体真实生活的纪录片推荐。',url:'https://www.bilibili.com/video/example-10',source:'bilibili',category:'第三性',author:'纪录片推荐',published_at:new Date(now-864000000).toISOString()},
    ].forEach((s,i)=>{db.seq++;db.articles.push({id:db.seq,source_id:`seed_${i}`,...s,content:s.summary,fetched_at:new Date().toISOString(),image_url:'',tags:s.category,is_pushed:0});});
    saveDB(db);
    console.log(`[Seed] ${10} articles created`);
  }
  setInterval(()=>scrapeAll(),SCRAPE_MIN*60*1000);
  setTimeout(()=>scrapeAll(),10000);
});

process.on('SIGINT', ()=>{server.close();process.exit(0);});
process.on('SIGTERM', ()=>{server.close();process.exit(0);});
