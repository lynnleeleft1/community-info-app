const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class RSSScraper {
  constructor() {
    this.feeds = [
      // LGBTQ+ 相关 RSS 源
      { url: 'https://rsshub.app/weibo/search/跨性别', category: 'TS', source: 'weibo_rss' },
      { url: 'https://rsshub.app/weibo/search/第三性', category: '第三性', source: 'weibo_rss' },
      { url: 'https://rsshub.app/weibo/search/伪娘', category: '伪娘', source: 'weibo_rss' },
      { url: 'https://rsshub.app/weibo/search/药娘', category: '药娘', source: 'weibo_rss' },
      { url: 'https://rsshub.app/weibo/search/transgender', category: 'TS', source: 'weibo_rss' },
      // 贴吧 RSS
      { url: 'https://rsshub.app/tieba/forum/第三性', category: '第三性', source: 'tieba_rss' },
      { url: 'https://rsshub.app/tieba/forum/伪娘', category: '伪娘', source: 'tieba_rss' },
      { url: 'https://rsshub.app/tieba/forum/药娘', category: '药娘', source: 'tieba_rss' },
      // 知乎相关
      { url: 'https://rsshub.app/zhihu/search/跨性别', category: 'TS', source: 'zhihu' },
      { url: 'https://rsshub.app/zhihu/search/第三性', category: '第三性', source: 'zhihu' },
      // B站相关视频
      { url: 'https://rsshub.app/bilibili/search/跨性别', category: 'TS', source: 'bilibili' },
    ];

    this.parser = null;
    this.initParser();
  }

  async initParser() {
    try {
      const { default: Parser } = await import('rss-parser');
      this.parser = new Parser({
        headers: {
          'User-Agent': 'CommunityInfoApp/1.0',
        },
        timeout: 15000,
      });
    } catch (e) {
      console.warn('[RSSScraper] rss-parser 不可用，使用简化解析');
    }
  }

  /**
   * 抓取所有 RSS 源
   * @param {number} maxPerFeed - 每个源最大条目数
   */
  async fetchAll(maxPerFeed = 20) {
    const allArticles = [];
    
    for (const feed of this.feeds) {
      const articles = await this.fetchFeed(feed, maxPerFeed);
      allArticles.push(...articles);
      // 避免请求过快
      await this.sleep(500);
    }
    
    return allArticles;
  }

  /**
   * 抓取单个 RSS 源
   */
  async fetchFeed(feed, maxPerFeed = 20) {
    const articles = [];
    
    try {
      // 使用 axios 获取并手动解析 XML
      const response = await axios.get(feed.url, {
        headers: {
          'User-Agent': 'CommunityInfoApp/1.0',
        },
        timeout: 15000,
        responseType: 'text',
      });

      const items = this.parseXMLItems(response.data);
      
      for (let i = 0; i < Math.min(items.length, maxPerFeed); i++) {
        const item = items[i];
        if (item.title && item.link) {
          articles.push({
            source_id: `${feed.source}_${this.hashString(item.link)}`,
            title: item.title.slice(0, 200),
            summary: (item.description || item.contentSnippet || '').slice(0, 500),
            content: item.content || item.description || '',
            url: item.link,
            source: feed.source,
            category: feed.category,
            author: item.author || item.creator || '',
            published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
            image_url: item.enclosure?.url || '',
            tags: feed.category,
          });
        }
      }

      return articles;
    } catch (error) {
      console.error(`[RSSScraper] 抓取 ${feed.url} 失败:`, error.message);
      return articles;
    }
  }

  /**
   * 简易 XML 解析
   */
  parseXMLItems(xml) {
    const items = [];
    // 匹配 <item>...</item> 或 <entry>...</entry>
    const itemRegex = /<(item|entry)>([\s\S]*?)<\/\1>/gi;
    let match;
    
    while ((match = itemRegex.exec(xml)) !== null) {
      const itemContent = match[2];
      const item = {
        title: this.extractTag(itemContent, 'title'),
        link: this.extractLink(itemContent),
        description: this.extractTag(itemContent, 'description'),
        content: this.extractTag(itemContent, 'content:encoded') || this.extractTag(itemContent, 'content'),
        contentSnippet: this.extractTag(itemContent, 'description')?.replace(/<[^>]*>/g, ''),
        author: this.extractTag(itemContent, 'author') || this.extractTag(itemContent, 'dc:creator'),
        pubDate: this.extractTag(itemContent, 'pubDate') || this.extractTag(itemContent, 'dc:date'),
        creator: this.extractTag(itemContent, 'dc:creator'),
      };
      items.push(item);
    }
    
    return items;
  }

  extractTag(content, tag) {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const match = content.match(regex);
    return match ? match[1].trim() : '';
  }

  extractLink(content) {
    // 优先取 <link> 标签内容
    let link = this.extractTag(content, 'link');
    if (link && !link.startsWith('http')) {
      // 可能是 Atom 的 href 属性
      const hrefMatch = content.match(/<link[^>]*href="([^"]*)"/i);
      if (hrefMatch) link = hrefMatch[1];
    }
    return link;
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 添加自定义 RSS 源
   */
  addFeed(url, category, source = 'custom_rss') {
    this.feeds.push({ url, category, source });
  }

  /**
   * 获取所有已配置的源
   */
  getFeeds() {
    return this.feeds.map(f => ({ url: f.url, category: f.category, source: f.source }));
  }
}

module.exports = new RSSScraper();
