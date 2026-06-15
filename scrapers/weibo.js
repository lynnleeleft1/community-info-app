const axios = require('axios');
const cheerio = require('cheerio');
const { v4: uuidv4 } = require('uuid');

class WeiboScraper {
  constructor() {
    this.searchURL = 'https://s.weibo.com/weibo';
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Cookie': 'SUB=_2AkMRM1fQf8NxqwJRmP8dy2niaY12zQzEieKkA4rIJRMxHRl-yT9kqmgNtRB6OLdL2p-FWTg6pJUK4Br1hO1QBmn3Vy7f;', // 基础 cookie
    };
  }

  /**
   * 搜索微博
   * @param {string} keyword - 关键词
   * @param {number} maxPosts - 最大条数
   */
  async searchPosts(keyword, maxPosts = 30) {
    const articles = [];
    try {
      // 微博移动端搜索
      const searchUrl = `${this.searchURL}?q=${encodeURIComponent(keyword)}&typeall=1&suball=1&timescope=custom:${this.getDateRange()}&Refer=g`;
      const response = await axios.get(searchUrl, { 
        headers: this.headers,
        timeout: 15000 
      });
      
      const $ = cheerio.load(response.data);
      
      // 解析搜索结果卡片
      $('.card-wrap, .card').each((i, el) => {
        if (articles.length >= maxPosts) return false;
        
        try {
          const $card = $(el);
          
          // 获取文本内容
          const textEl = $card.find('.txt, .card-topic, .weibo-text');
          let title = '';
          let summary = '';
          
          if (textEl.length > 0) {
            // 清理HTML标签获取纯文本
            const html = textEl.html() || '';
            summary = html.replace(/<[^>]*>/g, '').trim();
            // 截取前80字作为标题
            title = summary.slice(0, 80) + (summary.length > 80 ? '...' : '');
          }
          
          // 尝试直接获取文本
          if (!title) {
            const contentEl = $card.find('p[node-type="feed_list_content"], .txt');
            const text = contentEl.text().trim();
            if (text) {
              summary = text;
              title = text.slice(0, 80) + (text.length > 80 ? '...' : '');
            }
          }
          
          const url = $card.find('a[href*="weibo.com"]').attr('href') || '';
          const fullUrl = url.startsWith('http') ? url : `https:${url}`;
          
          const authorEl = $card.find('.name, .nick-name');
          const author = authorEl.text().trim();
          
          const timeEl = $card.find('.from, .time');
          const timeText = timeEl.text().trim();
          
          // 获取图片
          const imgEl = $card.find('.media img, .weibo-media img');
          const imageUrl = imgEl.attr('src') || '';

          if (title && fullUrl) {
            const category = this.inferCategory(title + summary);
            
            articles.push({
              source_id: `weibo_${this.hashString(fullUrl)}`,
              title,
              summary,
              content: summary,
              url: fullUrl,
              source: 'weibo',
              category,
              author: author || '微博用户',
              published_at: this.parseTime(timeText),
              image_url: imageUrl.startsWith('//') ? `https:${imageUrl}` : imageUrl,
              tags: keyword,
            });
          }
        } catch (e) {
          // 跳过解析失败的单条
        }
      });

      // 如果微博搜索没抓到内容，尝试用 RSSHub 格式
      if (articles.length === 0) {
        return this.fallbackSearch(keyword, maxPosts);
      }

      return articles;
    } catch (error) {
      console.error(`[WeiboScraper] 搜索 "${keyword}" 失败:`, error.message);
      return this.fallbackSearch(keyword, maxPosts);
    }
  }

  /**
   * 备用搜索：使用RSSHub
   */
  async fallbackSearch(keyword, maxPosts = 30) {
    const articles = [];
    try {
      const rssUrl = `https://rsshub.app/weibo/search/${encodeURIComponent(keyword)}`;
      const response = await axios.get(rssUrl, { 
        headers: this.headers,
        timeout: 15000 
      });
      
      const $ = cheerio.load(response.data, { xmlMode: true });
      
      $('item').each((i, el) => {
        if (articles.length >= maxPosts) return false;
        
        const title = $(el).find('title').text().trim();
        const description = $(el).find('description').text().trim();
        const link = $(el).find('link').text().trim();
        const pubDate = $(el).find('pubDate, dc\\:date').text().trim();
        const author = $(el).find('author').text().trim();
        
        if (title && link) {
          articles.push({
            source_id: `weibo_rss_${this.hashString(link)}`,
            title: title.slice(0, 100),
            summary: description.slice(0, 300),
            content: description,
            url: link,
            source: 'weibo',
            category: this.inferCategory(title + description),
            author: author || '微博用户',
            published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
            image_url: '',
            tags: keyword,
          });
        }
      });
      
      return articles;
    } catch (error) {
      console.error(`[WeiboScraper fallback] 搜索 "${keyword}" 失败:`, error.message);
      return articles;
    }
  }

  // 获取近7天的日期范围（微博格式）
  getDateRange() {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return `${fmt(start)}-0:${fmt(end)}-23`;
  }

  inferCategory(text) {
    const lower = text.toLowerCase();
    if (lower.includes('药娘') || lower.includes('hrt') || lower.includes('激素治疗')) return '药娘';
    if (lower.includes('伪娘') || lower.includes('女装子') || lower.includes('女装大佬')) return '伪娘';
    if (lower.includes('第三性') || lower.includes('third gender')) return '第三性';
    if (lower.includes('cd') && (lower.includes('变装') || lower.includes('crossdress'))) return 'CD';
    if (lower.includes('ts') || lower.includes('跨性别') || lower.includes('transgender') || lower.includes('mtf') || lower.includes('ftm')) return 'TS';
    if (lower.includes('lgbt') || lower.includes('彩虹') || lower.includes('同志')) return 'LGBT';
    return '综合';
  }

  parseTime(timeText) {
    if (!timeText) return new Date().toISOString();
    
    const clean = timeText.replace(/来自|发布/g, '').trim();
    const now = new Date();
    
    if (clean.includes('分钟前')) {
      const mins = parseInt(clean);
      now.setMinutes(now.getMinutes() - (mins || 0));
      return now.toISOString();
    }
    if (clean.includes('秒前')) {
      return now.toISOString();
    }
    
    const parsed = new Date(clean);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
    
    return now.toISOString();
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
}

module.exports = new WeiboScraper();
