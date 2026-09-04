/**
 * Purpose: the two upstreams every pack builder ranks and pronounces words with — hermitdave's
 * OpenSubtitles frequency lists and CMUdict — behind one loader each, so the commit pins live
 * in exactly one place. Both builders (build-pack.mjs, build-cross-pack.mjs) read them here.
 *
 * GitHub sources are pinned to a commit, never to `master`: a branch is whatever the upstream
 * account holds today, and this data ends up inside packs shipped to learners. The commit ids
 * and every file's digest live in upstream.lock.json.
 * Main exports: HERMITDAVE_COMMIT, CMUDICT_URL, EN_FREQUENCY_CUTOFF, frequencyUrl,
 * loadFrequencyList, loadCmudict, loadEnglishFrequent.
 */
import {
  downloadCached,
  lockedSource,
  parseCmudict,
  parseFrequencyList,
  requireLockedSource,
} from "./parsers.mjs";

export const HERMITDAVE_COMMIT = "525f9b560de45753a5ea01069454e72e9aa541c6";
const CMUDICT_COMMIT = "74790861f652b15e4ac49015a90074ad62a27690";
export const CMUDICT_URL = `https://raw.githubusercontent.com/cmusphinx/cmudict/${CMUDICT_COMMIT}/cmudict.dict`;

/** English targets must be words a learner will actually meet again; same cutoff the zh→en
 * build settled on. */
export const EN_FREQUENCY_CUTOFF = 20000;

export function frequencyUrl(code, edition) {
  return `https://raw.githubusercontent.com/hermitdave/FrequencyWords/${HERMITDAVE_COMMIT}/content/${edition}/${code}/${code}_50k.txt`;
}

/**
 * hermitdave's FrequencyWords has two editions and not every language is in both. Returns the
 * word → 1-based rank map of the first edition that is pinned, downloadable and long enough,
 * or null when this language has no usable list at all.
 */
export async function loadFrequencyList(spec, cacheDir) {
  for (const edition of spec.editions) {
    const url = frequencyUrl(spec.code, edition);
    const source = lockedSource(url);
    if (source === null) {
      console.log(`  ${spec.code}/${edition} is not pinned in upstream.lock.json, skipping`);
      continue;
    }
    try {
      const bytes = await downloadCached(
        url,
        cacheDir,
        `freq-${spec.code}-${edition}.txt`,
        source.sha256,
      );
      const ranks = parseFrequencyList(bytes.toString("utf-8"));
      if (ranks.size >= spec.minimumWords) return ranks;
      console.log(
        `  frequency list ${spec.code}/${edition} has only ${ranks.size} words, skipping`,
      );
    } catch {
      console.log(`  no frequency list at ${spec.code}/${edition}`);
    }
  }
  return null;
}

export async function loadCmudict(cacheDir) {
  const bytes = await downloadCached(
    CMUDICT_URL,
    cacheDir,
    "cmudict.dict",
    requireLockedSource(CMUDICT_URL).sha256,
  );
  return parseCmudict(bytes.toString("utf-8"));
}

/** The English words common enough to be worth meeting, as a set. */
export function englishFrequentSet(englishRanks) {
  return new Set(
    [...englishRanks.entries()]
      .filter(([, rank]) => rank <= EN_FREQUENCY_CUTOFF)
      .map(([word]) => word),
  );
}
