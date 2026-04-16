import axios from "axios";
import * as cheerio from "cheerio";

export async function searchWeb(args: { query: string }): Promise<any> {
  const { query } = args;

  try {
    // DuckDuckGo HTML scrape (lite version)
    const response = await axios.get("https://html.duckduckgo.com/html/", {
      params: { q: query },
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);
    const results: Array<{ title: string; snippet: string; url: string }> = [];

    $(".result").slice(0, 5).each((_, el) => {
      const title = $(el).find(".result__title").text().trim();
      const snippet = $(el).find(".result__snippet").text().trim();
      const url = $(el).find(".result__url").text().trim();

      if (title && snippet) {
        results.push({ title, snippet, url });
      }
    });

    return {
      ok: true,
      scope: "web",
      data: { query, results },
      suggested_next: "Use fetch_url to read full content from a result URL",
    };
  } catch (error: any) {
    return {
      ok: false,
      scope: "web",
      data: { error: error.message },
      suggested_next: "Try a simpler query or use fetch_url directly if you have a URL",
    };
  }
}
