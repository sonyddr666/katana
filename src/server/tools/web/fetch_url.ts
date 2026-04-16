import axios from "axios";
import * as cheerio from "cheerio";

export async function fetchUrl(args: { url: string; selector?: string }): Promise<any> {
  const { url, selector } = args;

  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);

    let content: string;
    if (selector) {
      content = $(selector).text().trim();
    } else {
      // Get main text content, removing scripts/styles
      $("script, style, nav, footer, header").remove();
      content = $("body").text().trim().replace(/\s+/g, " ").substring(0, 10000);
    }

    return {
      ok: true,
      scope: "web",
      data: {
        url,
        content: content.substring(0, 8000),
        length: content.length,
      },
      suggested_next: "Use search_web if you need to find more sources",
    };
  } catch (error: any) {
    return {
      ok: false,
      scope: "web",
      data: { error: error.message, url },
      suggested_next: "Check the URL or try search_web to find the correct link",
    };
  }
}
