/**
 * Real Scraper (F3): fetch + cheerio, best-effort. No paid account needed, so
 * unlike the other providers this doesn't wait for F5 — see interfaces.ts.
 *
 * Product pages vary wildly across Balkan e-commerce sites, so extraction is
 * heuristic: prefer OpenGraph/structured-data meta tags, fall back to the
 * first plausible <img>/price text on the page. Any fetch or parse failure
 * falls back to MockScraper so the wizard never hard-fails on a bad URL.
 */
import * as cheerio from 'cheerio';
import type { Scraper } from '../interfaces.ts';
import { MockScraper } from './mocks.ts';

const USER_AGENT =
  'Mozilla/5.0 (compatible; AdGenBot/1.0; +https://adgen.local) AppleWebKit/537.36';

const PRICE_PATTERN = /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*(RSD|din\.?|€|EUR|KM|BAM|LEI|RON)/i;

function resolveUrl(src: string, base: string): string | null {
  try {
    return new URL(src, base).toString();
  } catch {
    return null;
  }
}

export class RealScraper implements Scraper {
  readonly name = 'real-scraper';
  private readonly fallback = new MockScraper();

  async scrape(url: string): Promise<{
    title: string;
    price?: string;
    images: string[];
    description?: string;
  }> {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
        signal: AbortSignal.timeout(10_000),
        // Don't follow redirects: the caller already validated `url` against
        // an SSRF blocklist, and a followed redirect would fetch a second,
        // unvalidated URL (a classic bypass — e.g. redirecting to a cloud
        // metadata address). Fail closed to the mock fallback instead.
        redirect: 'manual',
      });
      if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
        throw new Error('refusing to follow a redirect (SSRF guard)');
      }
      if (!res.ok) throw new Error(`fetch failed with status ${res.status}`);

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('html')) throw new Error(`unexpected content-type: ${contentType}`);

      const html = await res.text();
      const $ = cheerio.load(html);

      const title =
        $('meta[property="og:title"]').attr('content')?.trim() ||
        $('h1').first().text().trim() ||
        $('title').text().trim() ||
        'Proizvod';

      const description =
        $('meta[property="og:description"]').attr('content')?.trim() ||
        $('meta[name="description"]').attr('content')?.trim() ||
        undefined;

      const price = this.extractPrice($);
      const images = this.extractImages($, url);

      return { title, price, images, description };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const mock = await this.fallback.scrape(url);
      return { ...mock, description: `${mock.description ?? ''} (real scrape failed: ${reason})`.trim() };
    }
  }

  private extractPrice($: cheerio.CheerioAPI): string | undefined {
    const structured =
      $('meta[property="product:price:amount"]').attr('content') ||
      $('[itemprop="price"]').attr('content') ||
      $('[itemprop="price"]').first().text();
    if (structured?.trim()) return structured.trim();

    const bodyText = $('body').text();
    const match = bodyText.match(PRICE_PATTERN);
    return match ? `${match[1]} ${match[2]}` : undefined;
  }

  private extractImages($: cheerio.CheerioAPI, baseUrl: string): string[] {
    const ogImages = $('meta[property="og:image"]')
      .map((_, el) => $(el).attr('content'))
      .get()
      .filter((src): src is string => Boolean(src));

    const seen = new Set<string>();
    const images: string[] = [];
    for (const src of ogImages) {
      const resolved = resolveUrl(src, baseUrl);
      if (resolved && !seen.has(resolved)) {
        seen.add(resolved);
        images.push(resolved);
      }
    }
    if (images.length > 0) return images.slice(0, 8);

    // Fallback: first handful of <img> tags, skipping obvious icons/tracking pixels.
    $('img').each((_, el) => {
      if (images.length >= 8) return;
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (!src) return;
      const resolved = resolveUrl(src, baseUrl);
      if (!resolved || seen.has(resolved)) return;
      if (/\.(svg)(\?|$)/i.test(resolved) || /(logo|icon|sprite|pixel)/i.test(resolved)) return;
      seen.add(resolved);
      images.push(resolved);
    });
    return images;
  }
}
