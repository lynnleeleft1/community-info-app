const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class ArticleDB {
  constructor(dbPath) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.init();
  }

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        summary TEXT,
        content TEXT,
        url TEXT NOT NULL,
        source TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        author TEXT,
        published_at DATETIME,
        fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        image_url TEXT,
        tags TEXT,
        is_pushed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
      CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source);
      CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC);
      CREATE INDEX IF NOT EXISTS idx_articles_source_id ON articles(source_id);

      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint TEXT UNIQUE NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        categories TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS scrape_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        items_found INTEGER DEFAULT 0,
        items_new INTEGER DEFAULT 0,
        error_message TEXT,
        scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  // 插入或忽略文章（按 source_id 去重）
  insertArticle(article) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO articles 
        (source_id, title, summary, content, url, source, category, author, published_at, image_url, tags)
      VALUES (@source_id, @title, @summary, @content, @url, @source, @category, @author, @published_at, @image_url, @tags)
    `);
    return stmt.run(article);
  }

  // 批量插入
  insertArticles(articles) {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO articles 
        (source_id, title, summary, content, url, source, category, author, published_at, image_url, tags)
      VALUES (@source_id, @title, @summary, @content, @url, @source, @category, @author, @published_at, @image_url, @tags)
    `);
    
    const transaction = this.db.transaction((items) => {
      let count = 0;
      for (const item of items) {
        const result = insert.run(item);
        if (result.changes > 0) count++;
      }
      return count;
    });
    
    return transaction(articles);
  }

  // 查询文章列表
  getArticles({ category, source, page = 1, limit = 20, keyword }) {
    let where = [];
    let params = {};

    if (category && category !== 'all') {
      where.push('category = @category');
      params.category = category;
    }
    if (source && source !== 'all') {
      where.push('source = @source');
      params.source = source;
    }
    if (keyword) {
      where.push('(title LIKE @keyword OR summary LIKE @keyword OR content LIKE @keyword)');
      params.keyword = `%${keyword}%`;
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    const offset = (page - 1) * limit;

    const countStmt = this.db.prepare(`SELECT COUNT(*) as total FROM articles ${whereClause}`);
    const { total } = countStmt.get(params);

    const stmt = this.db.prepare(`
      SELECT * FROM articles ${whereClause}
      ORDER BY published_at DESC
      LIMIT @limit OFFSET @offset
    `);
    
    const articles = stmt.all({ ...params, limit, offset });

    return {
      articles,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // 获取分类列表及计数
  getCategories() {
    const stmt = this.db.prepare(`
      SELECT category, COUNT(*) as count 
      FROM articles 
      GROUP BY category 
      ORDER BY count DESC
    `);
    return stmt.all();
  }

  // 获取未推送文章
  getUnpushedArticles() {
    const stmt = this.db.prepare(`
      SELECT * FROM articles WHERE is_pushed = 0 
      ORDER BY published_at DESC LIMIT 50
    `);
    return stmt.all();
  }

  // 标记已推送
  markPushed(ids) {
    const stmt = this.db.prepare(`UPDATE articles SET is_pushed = 1 WHERE id IN (${ids.join(',')})`);
    return stmt.run();
  }

  // 推送订阅管理
  addSubscription(subscription) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO push_subscriptions (endpoint, p256dh, auth, categories)
      VALUES (@endpoint, @p256dh, @auth, @categories)
    `);
    return stmt.run(subscription);
  }

  removeSubscription(endpoint) {
    const stmt = this.db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = @endpoint`);
    return stmt.run({ endpoint });
  }

  getAllSubscriptions(category) {
    if (category) {
      const stmt = this.db.prepare(`SELECT * FROM push_subscriptions WHERE categories LIKE @category`);
      return stmt.all({ category: `%${category}%` });
    }
    const stmt = this.db.prepare(`SELECT * FROM push_subscriptions`);
    return stmt.all();
  }

  // 记录爬取日志
  logScrape(log) {
    const stmt = this.db.prepare(`
      INSERT INTO scrape_logs (source, status, items_found, items_new, error_message)
      VALUES (@source, @status, @items_found, @items_new, @error_message)
    `);
    return stmt.run(log);
  }

  // 清理旧数据（保留最近30天）
  cleanupOldArticles(days = 30) {
    const stmt = this.db.prepare(`
      DELETE FROM articles WHERE published_at < datetime('now', @days)
    `);
    return stmt.run({ days: `-${days} days` });
  }

  // 搜索建议
  getSearchSuggestions(keyword, limit = 10) {
    const stmt = this.db.prepare(`
      SELECT DISTINCT title FROM articles 
      WHERE title LIKE @keyword 
      ORDER BY published_at DESC 
      LIMIT @limit
    `);
    return stmt.all({ keyword: `%${keyword}%`, limit });
  }
}

module.exports = ArticleDB;
