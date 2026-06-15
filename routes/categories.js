const express = require('express');
const router = express.Router();

module.exports = function(db) {
  // GET /api/categories - 分类列表及计数
  router.get('/', (req, res) => {
    try {
      const categories = db.getCategories();
      
      // 确保默认分类存在
      const defaultCategories = [
        { category: 'TS', emoji: '🏳️‍⚧️', label: 'TS/跨性别' },
        { category: 'CD', emoji: '💃', label: 'CD' },
        { category: '第三性', emoji: '🌈', label: '第三性' },
        { category: '伪娘', emoji: '🌸', label: '伪娘' },
        { category: '药娘', emoji: '💊', label: '药娘' },
        { category: '活动', emoji: '🎉', label: '活动聚会' },
        { category: '科普', emoji: '📚', label: '科普知识' },
        { category: '法律', emoji: '⚖️', label: '法律政策' },
      ];

      const categoryMap = {};
      categories.forEach(c => {
        categoryMap[c.category] = c.count;
      });

      const formatted = defaultCategories.map(cat => ({
        ...cat,
        count: categoryMap[cat.category] || 0,
      }));

      // 添加未在默认列表中的分类
      const defaultKeys = new Set(defaultCategories.map(c => c.category));
      categories.forEach(c => {
        if (!defaultKeys.has(c.category)) {
          formatted.push({
            category: c.category,
            emoji: '📌',
            label: c.category,
            count: c.count,
          });
        }
      });

      res.json({ success: true, data: formatted });
    } catch (error) {
      res.status(500).json({ success: false, error: '查询失败' });
    }
  });

  return router;
};
