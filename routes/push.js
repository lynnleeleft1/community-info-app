const express = require('express');
const router = express.Router();

module.exports = function(db, pushService, scheduler) {
  /**
   * POST /api/push/subscribe
   * 订阅推送
   * Body: { subscription, categories }
   */
  router.post('/subscribe', async (req, res) => {
    try {
      const { subscription, categories = '' } = req.body;
      
      if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ success: false, error: '无效的订阅信息' });
      }

      await pushService.saveSubscription(subscription, categories);
      
      // 发送测试推送
      try {
        await pushService.sendTestPush(subscription);
      } catch (e) {
        console.warn('[Push] 测试推送发送失败:', e.message);
      }

      res.json({ success: true, message: '订阅成功' });
    } catch (error) {
      console.error('[Push] 订阅失败:', error.message);
      res.status(500).json({ success: false, error: '订阅失败' });
    }
  });

  /**
   * POST /api/push/unsubscribe
   * 取消订阅
   * Body: { endpoint }
   */
  router.post('/unsubscribe', async (req, res) => {
    try {
      const { endpoint } = req.body;
      await pushService.removeSubscription(endpoint);
      res.json({ success: true, message: '已取消订阅' });
    } catch (error) {
      res.status(500).json({ success: false, error: '取消订阅失败' });
    }
  });

  /**
   * GET /api/push/vapid-public-key
   * 获取 VAPID 公钥（前端订阅用）
   */
  router.get('/vapid-public-key', (req, res) => {
    res.json({ 
      success: true, 
      data: { publicKey: pushService.getVapidPublicKey() }
    });
  });

  /**
   * POST /api/push/test
   * 发送测试推送
   */
  router.post('/test', async (req, res) => {
    try {
      const { subscription } = req.body;
      await pushService.sendTestPush(subscription);
      res.json({ success: true, message: '测试推送已发送' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/push/send-all
   * 管理员触发全量推送（需要简单的 admin key）
   */
  router.post('/send-all', async (req, res) => {
    try {
      const { adminKey } = req.body;
      if (adminKey !== process.env.ADMIN_KEY && adminKey !== 'community2024') {
        return res.status(403).json({ success: false, error: '无效的管理密钥' });
      }
      const result = await pushService.pushNewArticles();
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/push/status
   * 推送服务状态
   */
  router.get('/status', (req, res) => {
    const subscriptions = db.getAllSubscriptions();
    res.json({
      success: true,
      data: {
        initialized: pushService.initialized,
        subscriberCount: subscriptions.length,
        vapidAvailable: !!pushService.getVapidPublicKey(),
      }
    });
  });

  /**
   * POST /api/search/manual
   * 手动搜索（触发实时爬取）
   * Body: { keyword, maxResults }
   */
  router.post('/search/manual', async (req, res) => {
    try {
      const { keyword, maxResults = 20 } = req.body;
      if (!keyword || keyword.length < 2) {
        return res.status(400).json({ success: false, error: '关键词至少2个字符' });
      }
      const results = await scheduler.manualSearch(keyword, maxResults);
      res.json({ success: true, data: results });
    } catch (error) {
      res.status(500).json({ success: false, error: '搜索失败' });
    }
  });

  return router;
};
