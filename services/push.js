const webpush = require('web-push');

class PushService {
  constructor(db) {
    this.db = db;
    this.initialized = false;
    this.vapidKeys = null;
  }

  /**
   * 初始化 VAPID keys
   */
  init(vapidPublicKey, vapidPrivateKey, subject) {
    if (vapidPublicKey && vapidPrivateKey) {
      this.vapidKeys = { publicKey: vapidPublicKey, privateKey: vapidPrivateKey };
      webpush.setVapidDetails(subject, vapidPublicKey, vapidPrivateKey);
      this.initialized = true;
      console.log('[PushService] VAPID 已配置，推送服务就绪');
    } else {
      console.warn('[PushService] VAPID keys 未配置，推送功能不可用。请生成: npx web-push generate-vapid-keys');
    }
  }

  /**
   * 保存推送订阅
   */
  async saveSubscription(subscription, categories = '') {
    const { endpoint, keys } = subscription;
    return this.db.addSubscription({
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      categories,
    });
  }

  /**
   * 删除推送订阅
   */
  async removeSubscription(endpoint) {
    return this.db.removeSubscription(endpoint);
  }

  /**
   * 推送新文章通知
   */
  async pushNewArticles() {
    if (!this.initialized) {
      console.log('[PushService] 未初始化，跳过推送');
      return { pushed: 0, errors: 0 };
    }

    const articles = this.db.getUnpushedArticles();
    if (articles.length === 0) return { pushed: 0, errors: 0 };

    const subscriptions = this.db.getAllSubscriptions();
    if (subscriptions.length === 0) {
      // 没有订阅者，直接标记为已推送
      this.db.markPushed(articles.map(a => a.id));
      return { pushed: 0, errors: 0 };
    }

    let pushedCount = 0;
    let errorCount = 0;
    const pushedIds = [];

    for (const article of articles.slice(0, 5)) { // 每次最多推送5条
      const payload = JSON.stringify({
        title: `📢 ${article.category} · 新资讯`,
        body: article.title.slice(0, 150),
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
        data: {
          url: article.url,
          articleId: article.id,
          category: article.category,
        },
        tag: `article-${article.id}`,
        requireInteraction: false,
        vibrate: [200, 100, 200],
        actions: [
          { action: 'open', title: '查看详情' },
        ],
      });

      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          );
          pushedCount++;
        } catch (error) {
          errorCount++;
          // 订阅已过期则删除
          if (error.statusCode === 410 || error.statusCode === 404) {
            await this.db.removeSubscription(sub.endpoint);
          }
        }
      }
      pushedIds.push(article.id);
    }

    // 标记已推送
    if (pushedIds.length > 0) {
      this.db.markPushed(pushedIds);
    }

    // 其余文章也标记（没有推完的）
    const remainingIds = articles.filter(a => !pushedIds.includes(a.id)).map(a => a.id);
    if (remainingIds.length > 0) {
      this.db.markPushed(remainingIds);
    }

    console.log(`[PushService] 推送完成: 成功 ${pushedCount}, 失败 ${errorCount}`);
    return { pushed: pushedCount, errors: errorCount };
  }

  /**
   * 发送测试推送
   */
  async sendTestPush(subscription) {
    if (!this.initialized) {
      throw new Error('推送服务未初始化');
    }

    const payload = JSON.stringify({
      title: '✅ 推送测试成功',
      body: '如果你收到这条消息，说明推送功能正常工作！',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data: { url: '/' },
      vibrate: [200, 100, 200],
    });

    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      },
      payload
    );

    return { success: true };
  }

  getVapidPublicKey() {
    return this.vapidKeys?.publicKey || '';
  }
}

module.exports = PushService;
