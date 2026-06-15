const express = require('express');
const router = express.Router();

module.exports = function(db) {
  // GET /api/articles - 文章列表
  router.get('/', (req, res) => {
    try {
      const { category, source, page, limit, keyword } = req.query;
      const result = db.getArticles({
        category: category || undefined,
        source: source || undefined,
        page: parseInt(page) || 1,
        limit: Math.min(parseInt(limit) || 20, 50),
        keyword: keyword || undefined,
      });
      res.json({ success: true, ...result });
    } catch (error) {
      console.error('[Articles] 列表查询失败:', error.message);
      res.status(500).json({ success: false, error: '查询失败' });
    }
  });

  // GET /api/articles/latest - 最新文章（轮询）
  router.get('/latest', (req, res) => {
    try {
      const { after, category } = req.query;

      let query = 'SELECT * FROM articles WHERE 1=1';
      const params = [];

      if (after) {
        query += ' AND fetched_at > ?';
        params.push(after);
      }

      if (category) {
        query += ' AND category = ?';
        params.push(category);
      }

      query += ' ORDER BY published_at DESC LIMIT 10';

      const stmt = db.db.prepare(query);
      const articles = stmt.all(...params);

      res.json({ success: true, articles });
    } catch (error) {
      console.error('[Articles] 最新查询失败:', error.message);
      res.status(500).json({ success: false, error: '查询失败' });
    }
  });

  // GET /api/articles/search/suggestions - 搜索建议
  router.get('/search/suggestions', (req, res) => {
    try {
      const { keyword, limit } = req.query;
      if (!keyword || keyword.length < 2) {
        return res.json({ success: true, suggestions: [] });
      }
      const suggestions = db.getSearchSuggestions(keyword, parseInt(limit) || 10);
      res.json({ success: true, suggestions });
    } catch (error) {
      res.status(500).json({ success: false, error: '查询失败' });
    }
  });

  // GET /api/articles/:id - 单篇文章详情
  router.get('/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: '无效的文章ID' });
      }

      const stmt = db.db.prepare('SELECT * FROM articles WHERE id = ?');
      const article = stmt.get(id);

      if (!article) {
        return res.status(404).json({ success: false, error: '文章不存在' });
      }

      res.json({ success: true, data: article });
    } catch (error) {
      res.status(500).json({ success: false, error: '查询失败' });
    }
  });

  // GET /api/articles/stats/summary - 数据统计
  router.get('/stats/summary', (req, res) => {
    try {
      const total = db.db.prepare('SELECT COUNT(*) as count FROM articles').get();
      const bySource = db.db.prepare(
        'SELECT source, COUNT(*) as count FROM articles GROUP BY source ORDER BY count DESC'
      ).all();
      const byCategory = db.db.prepare(
        'SELECT category, COUNT(*) as count FROM articles GROUP BY category ORDER BY count DESC'
      ).all();
      const recent = db.db.prepare(
        "SELECT COUNT(*) as count FROM articles WHERE published_at > datetime('now', '-24 hours')"
      ).get();

      res.json({
        success: true,
        data: {
          total: total.count,
          recent24h: recent.count,
          bySource,
          byCategory,
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: '查询失败' });
    }
  });

  return router;
};
