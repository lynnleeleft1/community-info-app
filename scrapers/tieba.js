const axios = require('axios');
const cheerio = require('cheerio');
const { v4: uuidv4 } = require('uuid');

class TiebaScraper {
  constructor() {
    this.baseURL = 'https://tieba.baidu.com';
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    };
  }

  /**
   * 搜索贴吧热门帖子
   * @param {string} keyword - 搜索关键词
   * @param {number} maxPosts - 最大帖子数
   */
  async searchPosts(keyword, maxPosts = 30) {
    const articles = [];
    try {
      // 贴吧搜索页
      const searchUrl = `${this.baseURL}/f/search/res?ie=utf-8&kw=&qw=${encodeURIComponent(keyword)}`;
      const response = await axios.get(searchUrl, { 
        headers: this.headers,
        timeout: 15000 
      });
      
      const $ = cheerio.load(response.data);
      
      // 解析搜索结果中的帖子
      $('.s_post').each((i, el) => {
        if (articles.length >= maxPosts) return false;
        
        try {
          const $el = $(el);
          const titleEl = $el.find('.p_title a, .threadlist_title a');
          const title = titleEl.text().trim();
          const relativeUrl = titleEl.attr('href');
          const url = relativeUrl ? (relativeUrl.startsWith('http') ? relativeUrl : `${this.baseURL}${relativeUrl}`) : '';
          
          const authorEl = $el.find('.p_author, .threadlist_author');
          const author = authorEl.text().trim();
          
          const summaryEl = $el.find('.p_content, .threadlist_abs');
          const summary = summaryEl.text().trim();
          
          const timeEl = $el.find('.p_date, .threadlist_reply_date');
          const timeText = timeEl.text().trim();

          if (title && url) {
            // 推断分类
            const category = this.inferCategory(title + summary);
            
            articles.push({
              source_id: `tieba_${this.hashString(url)}`,
              title,
              summary: summary || title,
              content: summary || '',
              url,
              source: 'tieba',
              category,
              author: author || '匿名',
              published_at: this.parseTime(timeText),
              image_url: '',
              tags: keyword,
            });
          }
        } catch (e) {
          // 跳过解析失败的单条
        }
      });

      // 如果标准解析没抓到，尝试贴吧热门流
      if (articles.length === 0) {
        const hotUrl = `${this.baseURL}/hot/bawu`;
        const hotRes = await axios.get(hotUrl, { headers: this.headers, timeout: 15000 });
        const $hot = cheerio.load(hotRes.data);
        
        $hot('.thread-item, .topic-item, .card-item').each((i, el) => {
          if (articles.length >= maxPosts) return false;
          
          const title = $hot(el).find('.title, .topic-title, h3').text().trim();
          const url = $hot(el).find('a').attr('href') || '';
          const summary = $hot(el).find('.abstract, .desc').text().trim();
          
          if (title) {
            articles.push({
              source_id: `tieba_hot_${uuidv4().slice(0, 8)}`,
              title,
              summary: summary || title,
              content: summary || '',
              url: url.startsWith('http') ? url : `${this.baseURL}${url}`,
              source: 'tieba',
              category: this.inferCategory(title + summary),
              author: '',
              published_at: new Date().toISOString(),
              image_url: '',
              tags: keyword,
            });
          }
        });
      }

      return articles;
    } catch (error) {
      console.error(`[TiebaScraper] 搜索 "${keyword}" 失败:`, error.message);
      return articles;
    }
  }

  /**
   * 根据内容推断分类
   */
  inferCategory(text) {
    const lower = text.toLowerCase();
    if (lower.includes('药娘') || lower.includes('hrt') || lower.includes('激素')) return '药娘';
    if (lower.includes('伪娘') || lower.includes('女装')) return '伪娘';
    if (lower.includes('第三性') || lower.includes('third gender')) return '第三性';
    if (lower.includes('cd') || lower.includes('crossdress')) return 'CD';
    if (lower.includes('ts') || lower.includes('transgender') || lower.includes('mtf') || lower.includes('ftm')) return 'TS';
    if (lower.includes('lgbt') || lower.includes('同志') || lower.includes('彩虹')) return 'LGBT';
    return '综合';
  }

  /**
   * 解析贴吧时间格式
   */
  parseTime(timeText) {
    if (!timeText) return new Date().toISOString();
    
    const now = new Date();
    if (timeText.includes('分钟前')) {
      const mins = parseInt(timeText);
      now.setMinutes(now.getMinutes() - mins);
      return now.toISOString();
    }
    if (timeText.includes('小时前')) {
      const hours = parseInt(timeText);
      now.setHours(now.getHours() - hours);
      return now.toISOString();
    }
    if (timeText.includes('昨天')) {
      now.setDate(now.getDate() - 1);
      return now.toISOString();
    }
    
    // 尝试标准日期解析
    const parsed = new Date(timeText);
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

module.exports = new TiebaScraper();
