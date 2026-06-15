const rssScraper = require('../scrapers/rss');

class ScraperScheduler {
  constructor(db) {
    this.db = db;
    this.isRunning = false;
  }

  /**
   * 执行一次全量爬取
   */
  async scrapeAll() {
    if (this.isRunning) {
      console.log('[Scheduler] 上一次爬取仍在进行中，跳过');
      return;
    }

    this.isRunning = true;
    console.log('[Scheduler] ===== 开始全量爬取 =====');
    
    const results = {
      rss: { found: 0, new: 0, error: null },
      total: { found: 0, new: 0 },
    };

    // 1. RSS 源爬取
    try {
      const rssArticles = await rssScraper.fetchAll(20);
      results.rss.found = rssArticles.length;
      
      if (rssArticles.length > 0) {
        const newCount = this.db.insertArticles(rssArticles);
        results.rss.new = newCount;
      }
      
      await this.db.logScrape({
        source: 'rss',
        status: 'success',
        items_found: results.rss.found,
        items_new: results.rss.new,
        error_message: null,
      });
    } catch (error) {
      console.error('[Scheduler] RSS 爬取失败:', error.message);
      results.rss.error = error.message;
      await this.db.logScrape({
        source: 'rss',
        status: 'error',
        items_found: 0,
        items_new: 0,
        error_message: error.message,
      });
    }

    // 汇总
    results.total.found = results.rss.found;
    results.total.new = results.rss.new;

    console.log(`[Scheduler] ===== 爬取完成: 找到 ${results.total.found} 条, 新增 ${results.total.new} 条 =====`);
    
    // 定期清理旧数据（每周执行一次，通过简单判断）
    if (new Date().getDay() === 1) {
      this.db.cleanupOldArticles(30);
    }

    this.isRunning = false;
    return results;
  }

  /**
   * 手动搜索（实时爬取 + 数据库搜索）
   */
  async manualSearch(keyword, maxResults = 20) {
    console.log(`[Scheduler] 手动搜索: "${keyword}"`);
    
    try {
      // 动态添加 RSS 搜索源
      rssScraper.addFeed(
        `https://rsshub.app/weibo/search/${encodeURIComponent(keyword)}`,
        'general',
        'weibo_rss'
      );
      rssScraper.addFeed(
        `https://rsshub.app/tieba/forum/${encodeURIComponent(keyword)}`,
        'general',
        'tieba_rss'
      );

      // 执行爬取
      const scraped = await rssScraper.fetchAll(10);
      if (scraped.length > 0) {
        this.db.insertArticles(scraped);
      }

      // 搜索数据库
      const result = this.db.getArticles({
        keyword,
        limit: maxResults,
        page: 1,
      });

      return result.articles;
    } catch (error) {
      console.error('[Scheduler] 手动搜索失败:', error.message);
      // 降级到数据库搜索
      const result = this.db.getArticles({
        keyword,
        limit: maxResults,
        page: 1,
      });
      return result.articles;
    }
  }

  /**
   * 获取爬取日志
   */
  getLogs(limit = 20) {
    const stmt = this.db.db.prepare(
      'SELECT * FROM scrape_logs ORDER BY scraped_at DESC LIMIT ?'
    );
    return stmt.all(limit);
  }

  /**
   * 获取爬取状态
   */
  getStatus() {
    const rssFeeds = rssScraper.getFeeds();
    const stats = {
      rssFeeds: rssFeeds.length,
      sources: [...new Set(rssFeeds.map(f => f.source))],
      isRunning: this.isRunning,
      lastLogs: this.getLogs(5),
    };
    return stats;
  }
}

module.exports = ScraperScheduler;
