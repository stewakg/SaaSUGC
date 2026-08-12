/**
 * Unit tests for RealScraper (F3) — the fetch + cheerio best-effort scraper.
 *
 * Why this file exists: RealScraper hits arbitrary third-party URLs at request
 * time, so it has never been exercised against a fixed corpus. Every branch —
 * OpenGraph precedence, title/description/price/image heuristics, the SSRF
 * redirect guard, and the mock fallback — is pinned down here with faked HTML
 * and a mocked globalThis.fetch. No real network call is ever made; cheerio is
 * left real so the parsing logic under test is exactly what runs in prod.
 *
 * Isolation discipline (mirrors renderer.lambda.test.ts in this folder):
 *  - beforeEach swaps globalThis.fetch for a fresh vi.fn(); afterEach restores
 *    it and calls vi.restoreAllMocks() so a leaked mock cannot corrupt later
 *    files in the same vitest run.
 *  - cheerio is a real dependency used directly by the module; it is NOT mocked.
 *    Fake HTML strings are fed through the faked fetch Response and parsed for
 *    real.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RealScraper } from './scraper.real.ts';

// Build a fetch Response whose .text() resolves to the given HTML. The fields
// mirror exactly what RealScraper reads: ok, status, type, content-type header.
function htmlResponse(
  html: string,
  opts: Partial<{ ok: boolean; status: number; type: string; contentType: string }> = {},
): Response {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    type: opts.type ?? 'basic',
    headers: {
      get: (h: string) =>
        h.toLowerCase() === 'content-type'
          ? opts.contentType ?? 'text/html; charset=utf-8'
          : null,
    },
    text: async () => html,
  } as unknown as Response;
}

// --- Expected MockScraper fallback shape ----------------------------------
// MockScraper returns a stable title/price and a placeholder image whose only
// variable part is the module-level seedCounter. We assert the stable fields
// verbatim and the image by its format, so the assertions do not depend on how
// many other calls incremented the counter before this test ran.
const MOCK_TITLE = 'Demo proizvod (mock scrape)';
const MOCK_PRICE = '1.990 RSD';
const MOCK_DESC_PREFIX = (url: string) =>
  `Ovo je mock scrapovan sadržaj za ${url}. Pravi Scraper (fetch + cheerio) se dodaje u F3.`;
const PLACEHOLDER_IMAGE_RE =
  /^https:\/\/placehold\.co\/1080x1080\/0a0a0a\/FFE000\/png\?text=PROIZVOD&\d+$/;

describe('RealScraper', () => {
  let scraper: RealScraper;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    scraper = new RealScraper();
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  // =========================================================================
  // Happy path
  // =========================================================================
  describe('happy path', () => {
    it('1. OpenGraph wins over body heuristics', async () => {
      const html = `
        <html><head>
          <meta property="og:title" content="Masažer za vrat">
          <meta property="og:description" content="Opis proizvoda">
          <meta property="product:price:amount" content="2999">
          <meta property="og:image" content="https://cdn.example.com/a.jpg">
        </head><body><h1>Drugi naslov</h1>Cena 100 RSD</body></html>`;
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(htmlResponse(html));

      const r = await scraper.scrape('https://shop.example.com/p/42');

      expect(r.title).toBe('Masažer za vrat');
      expect(r.description).toBe('Opis proizvoda');
      expect(r.price).toBe('2999');
      expect(r.images).toContain('https://cdn.example.com/a.jpg');
    });

    it('2. title precedence: h1, then <title>, then default "Proizvod"', async () => {
      // h1 beats <title>
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        htmlResponse('<html><body><h1>Naslov H1</h1></body></html><title>Naslov Title</title>'),
      );
      let r = await scraper.scrape('https://shop.example.com/p/1');
      expect(r.title).toBe('Naslov H1');

      // <title> when no h1
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        htmlResponse('<html><head><title>Naslov Title</title></head></html>'),
      );
      r = await scraper.scrape('https://shop.example.com/p/2');
      expect(r.title).toBe('Naslov Title');

      // default when neither present
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        htmlResponse('<html><body><div>samo div</div></body></html>'),
      );
      r = await scraper.scrape('https://shop.example.com/p/3');
      expect(r.title).toBe('Proizvod');
    });

    it('3. description precedence: og:description, then meta[name=description], then undefined', async () => {
      // meta[name=description] when no og:description
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        htmlResponse('<html><head><meta name="description" content="Meta opis"></head></html>'),
      );
      let r = await scraper.scrape('https://shop.example.com/p/1');
      expect(r.description).toBe('Meta opis');

      // neither → undefined
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        htmlResponse('<html><body><div>bez opisa</div></body></html>'),
      );
      r = await scraper.scrape('https://shop.example.com/p/2');
      expect(r.description).toBeUndefined();
    });

    it('4. price from body text pattern when no structured price', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        htmlResponse('<html><body>Cena je 2.499 RSD danas</body></html>'),
      );
      const r = await scraper.scrape('https://shop.example.com/p/1');
      expect(r.price).toBe('2.499 RSD');

      // no price anywhere → undefined
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        htmlResponse('<html><body>nema cene ovde</body></html>'),
      );
      const r2 = await scraper.scrape('https://shop.example.com/p/2');
      expect(r2.price).toBeUndefined();
    });

    it('5. structured price via itemprop prefers the content attribute over text', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        htmlResponse(
          '<html><body><span itemprop="price" content="1499">stari tekst</span></body></html>',
        ),
      );
      const r = await scraper.scrape('https://shop.example.com/p/1');
      expect(r.price).toBe('1499');
    });
  });


  // =========================================================================
  // Images
  // =========================================================================
  describe('images', () => {
    it('6. og:image: dedups and resolves relative urls against the page url', async () => {
      const html = `
        <html><head>
          <meta property="og:image" content="https://cdn.example.com/a.jpg">
          <meta property="og:image" content="https://cdn.example.com/a.jpg">
          <meta property="og:image" content="/img/b.jpg">
        </head></html>`;
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(htmlResponse(html));

      const r = await scraper.scrape('https://shop.example.com/p/1');

      expect(r.images).toEqual([
        'https://cdn.example.com/a.jpg',
        'https://shop.example.com/img/b.jpg',
      ]);
    });

    it('7. falls back to <img>, skipping svg/logo/icon and reading data-src', async () => {
      const html = `
        <html><body>
          <img src="/logo.png">
          <img src="/hero.jpg">
          <img src="/icon-cart.svg">
          <img data-src="/real2.jpg">
        </body></html>`;
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(htmlResponse(html));

      const r = await scraper.scrape('https://shop.example.com/p/1');

      expect(r.images).toEqual([
        'https://shop.example.com/hero.jpg',
        'https://shop.example.com/real2.jpg',
      ]);
    });

    it('8. caps og:image collection at 8', async () => {
      const tags = Array.from({ length: 12 }, (_, i) =>
        `<meta property="og:image" content="https://cdn.example.com/${i + 1}.jpg">`,
      ).join('');
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        htmlResponse(`<html><head>${tags}</head></html>`),
      );

      const r = await scraper.scrape('https://shop.example.com/p/1');
      expect(r.images).toHaveLength(8);
    });
  });


  // =========================================================================
  // Failure ⇒ MockScraper fallback
  // =========================================================================
  describe('failure falls back to MockScraper', () => {
    // Asserts the mock-fallback invariants shared by every failure case:
    //  - title/price/images match MockScraper's output for this url,
    //  - description is the mock description with " (real scrape failed: <reason>)"
    //    appended and contains the expected reason keyword.
    async function expectFallback(url: string, reasonNeedle: string) {
      const r = await scraper.scrape(url);
      expect(r.title).toBe(MOCK_TITLE);
      expect(r.price).toBe(MOCK_PRICE);
      expect(r.images).toHaveLength(1);
      expect(r.images[0]).toMatch(PLACEHOLDER_IMAGE_RE);
      expect(r.description).toBeDefined();
      expect(r.description!.startsWith(MOCK_DESC_PREFIX(url))).toBe(true);
      expect(r.description!).toContain('(real scrape failed:');
      expect(r.description!).toContain(reasonNeedle);
      expect(r.description!.endsWith(')')).toBe(true);
    }

    it('9. refuses an opaqueredirect response', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        htmlResponse('', { type: 'opaqueredirect' }),
      );
      await expectFallback('https://shop.example.com/p/9', 'redirect');
    });

    it('10. refuses a 3xx redirect status', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        htmlResponse('', { status: 302 }),
      );
      await expectFallback('https://shop.example.com/p/10', 'redirect');
    });

    it('11. non-ok status surfaces the code in the reason', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        htmlResponse('', { ok: false, status: 500 }),
      );
      await expectFallback('https://shop.example.com/p/11', '500');
    });

    it('12. non-html content-type is rejected', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        htmlResponse('', { contentType: 'application/json' }),
      );
      await expectFallback('https://shop.example.com/p/12', 'content-type');
    });

    it('13. a thrown fetch surfaces its message in the reason', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
      await expectFallback('https://shop.example.com/p/13', 'boom');
    });
  });
});

