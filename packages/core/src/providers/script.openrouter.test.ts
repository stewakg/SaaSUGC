/**
 * parseVariantsJson has to survive whatever the model returns, because the
 * model is swappable by env var: a strict-schema model emits
 * `{ variants: [...] }`, one that ignores response_format emits the bare array
 * the system prompt asked for, and some wrap either in markdown fences.
 */
import { describe, expect, it } from 'vitest';
import { parseVariantsJson } from './script.openrouter.ts';

const one = { angle: 'problem→rešenje', script: 'Bole te leđa?', estDurationSec: 12 };

describe('parseVariantsJson', () => {
  it('parses the bare array the system prompt asks for', () => {
    expect(parseVariantsJson(JSON.stringify([one]))).toEqual([one]);
  });

  it('parses the { variants: [...] } object a strict-schema model returns', () => {
    expect(parseVariantsJson(JSON.stringify({ variants: [one] }))).toEqual([one]);
  });

  it('strips markdown fences around either shape', () => {
    expect(parseVariantsJson('```json\n' + JSON.stringify([one]) + '\n```')).toEqual([one]);
    expect(parseVariantsJson('```\n' + JSON.stringify({ variants: [one] }) + '\n```')).toEqual([one]);
  });

  it('defaults a missing or nonsensical estDurationSec to 15', () => {
    const parsed = parseVariantsJson(
      JSON.stringify([
        { angle: 'a', script: 's' },
        { angle: 'b', script: 's', estDurationSec: 0 },
        { angle: 'c', script: 's', estDurationSec: 'dvanaest' },
      ]),
    );
    expect(parsed.map((v) => v.estDurationSec)).toEqual([15, 15, 15]);
  });

  it('drops entries missing angle or script rather than failing the whole batch', () => {
    const parsed = parseVariantsJson(JSON.stringify([one, { angle: 'no script' }, { script: 'no angle' }]));
    expect(parsed).toEqual([one]);
  });

  it('throws on non-JSON, quoting enough of it to debug', () => {
    expect(() => parseVariantsJson('Evo tvojih skripti:')).toThrow(/not valid JSON/);
  });

  it('throws when the JSON is neither an array nor { variants: [...] }', () => {
    expect(() => parseVariantsJson(JSON.stringify({ scripts: [one] }))).toThrow(/neither an array/);
  });

  it('preserves Serbian diacritics through the round trip', () => {
    const srp = { angle: 'hitnost', script: 'Požuri — akcija traje još tri dana! Šalje se pouzećem.', estDurationSec: 9 };
    expect(parseVariantsJson(JSON.stringify([srp]))[0].script).toBe(srp.script);
  });
});
