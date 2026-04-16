import Parser from "rss-parser";
import axios from "axios";

const parser = new Parser();

export async function searchNews(args: { query: string; days?: number }): Promise<any> {
  const { query, days = 7 } = args;

  try {
    // Use Google News RSS feed (simplified)
    const encodedQuery = encodeURIComponent(query);
    const rssUrl = `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`;

    const response = await axios.get(rssUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 10000,
    });

    const feed = await parser.parseString(response.data);

    const items = feed.items.slice(0, 5).map((item) => ({
      title: item.title || "",
      link: item.link || "",
      pubDate: item.pubDate || "",
      snippet: item.contentSnippet || item.summary || "",
    }));

    return {
      ok: true,
      scope: "web",
      data: { query, days, items },
      suggested_next: "Use fetch_url to read full article content",
    };
  } catch (error: any) {
    return {
      ok: false,
      scope: "web",
      data: { error: error.message },
      suggested_next: "Try search_web as alternative",
    };
  }
}
