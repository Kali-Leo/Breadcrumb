/**
 * Purpose: unit tests for the Wikidata provider (mocked fetch) — the entity → properties →
 * statements → references → sentences flow, the rank rule (preferred only when one exists,
 * deprecated never seen), property selection by label/alias with the headline fallback, the
 * query-prefix entity lookup, the language-neutral value text, and the failed/empty
 * distinction.
 */
import { describe, expect, it, vi } from "vitest";
import { createWikidataProvider } from "./wikidata";
import { capStatements, currentStatements, selectProperties } from "./wikidataFacts";
import { entityCandidates } from "./wikidataLookup";
import type { WikidataProperty, WikidataStatement } from "./wikidataQuery";
import { valueText } from "./wikidataRender";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const literal = (value: string) => ({ type: "literal", value });
const uri = (value: string) => ({ type: "uri", value });
const ST = "http://www.wikidata.org/entity/statement/Q513-";
const P = "http://www.wikidata.org/entity/";

function propertyRow(id: string, label: string, aliases: string) {
  return { prop: uri(`${P}${id}`), propLabel: literal(label), aliases: literal(aliases) };
}

/** The measured shape of the Everest elevation rows: one preferred, three normal — the
 * deprecated ones are filtered in the query itself and never arrive. */
function elevationRow(suffix: string, amount: string, rank: "Preferred" | "Normal") {
  return {
    st: uri(`${ST}${suffix}`),
    prop: uri(`${P}P2044`),
    rank: uri(`http://wikiba.se/ontology#${rank}Rank`),
    amount: literal(amount),
    unitLabel: literal("米"),
  };
}

function statement(overrides: Partial<WikidataStatement>): WikidataStatement {
  return {
    iri: `${ST}x`,
    property: "P2044",
    rank: "normal",
    value: { kind: "quantity", amount: "8848", unit: "米" },
    pointInTime: null,
    ...overrides,
  };
}

function property(id: string, label: string, ...aliases: string[]): WikidataProperty {
  return { id, label, names: [label, ...aliases].map((name) => name.toLowerCase()) };
}

describe("entityCandidates", () => {
  it("tries the whole query first, then drops trailing terms, and never a bare number", () => {
    expect(entityCandidates("Mount Everest elevation")).toEqual([
      "Mount Everest elevation",
      "Mount Everest",
      "Mount",
      "Everest",
    ]);
    expect(entityCandidates("珠穆朗玛峰 海拔 8848.86")).toEqual([
      "珠穆朗玛峰 海拔",
      "珠穆朗玛峰",
      "海拔",
    ]);
  });
});

describe("selectProperties", () => {
  const everest = [
    property("P910", "话题主分类"),
    property("P2044", "海拔", "elevation above sea level", "elevation", "height"),
    property("P1174", "每年访客人数", "visitors per year"),
    property("P17", "国家", "country"),
  ];

  it("picks the property the query names, ignoring the subject's own words", () => {
    expect(selectProperties(everest, "珠穆朗玛峰 海拔 8848.86", "珠穆朗玛峰").ids[0]).toBe("P2044");
    expect(selectProperties(everest, "Mount Everest elevation", "Mount Everest")).toMatchObject({
      ids: ["P2044", "P17"],
      matched: true,
    });
  });

  it("falls back to the headline properties the entity has when nothing matches by label", () => {
    expect(selectProperties(everest, "珠穆朗玛峰 高度", "珠穆朗玛峰")).toEqual({
      ids: ["P2044", "P17"],
      matched: false,
      headlineCount: 2,
    });
  });

  it("prefers the shortest label among equal matches: 人口 before 人口密度", () => {
    const china = [
      property("P1082", "人口"),
      property("P6499", "人口密度"),
      property("P1198", "失业率"),
    ];
    expect(selectProperties(china, "中国 人口 2025", "中国").ids).toEqual(["P1082", "P6499"]);
  });
});

describe("currentStatements (the rank rule)", () => {
  it("keeps only the preferred reading of a property that has one", () => {
    const kept = currentStatements([
      statement({
        iri: "a",
        value: { kind: "quantity", amount: "8848.86", unit: "米" },
        rank: "preferred",
      }),
      statement({ iri: "b", value: { kind: "quantity", amount: "8848", unit: "米" } }),
      statement({ iri: "c", value: { kind: "quantity", amount: "8844.43", unit: "米" } }),
      statement({
        iri: "d",
        property: "P17",
        value: { kind: "item", id: "Q837", label: "尼泊尔" },
      }),
    ]);
    expect(kept.map((s) => s.iri)).toEqual(["a", "d"]);
  });

  it("keeps every normal reading of a property with no preferred one", () => {
    const kept = currentStatements([
      statement({ iri: "a", value: { kind: "quantity", amount: "1", unit: null } }),
      statement({ iri: "b", value: { kind: "quantity", amount: "2", unit: null } }),
    ]);
    expect(kept).toHaveLength(2);
  });
});

describe("capStatements", () => {
  it("keeps at most two readings per property, in property order", () => {
    const visitors = ["547", "658", "4"].map((amount, i) =>
      statement({
        iri: `v${i}`,
        property: "P1174",
        value: { kind: "quantity", amount, unit: null },
      }),
    );
    const elevation = statement({
      iri: "e",
      rank: "preferred",
      value: { kind: "quantity", amount: "8848.86", unit: "米" },
    });
    const chosen = capStatements([...visitors, elevation], ["P2044", "P1174"]);
    expect(chosen.map((s) => s.iri)).toEqual(["e", "v0", "v1"]);
  });
});

describe("valueText", () => {
  it("renders dates at their own precision and readings with their date", () => {
    expect(valueText({ kind: "time", time: "1912-06-23T00:00:00Z", precision: 11 }, null)).toBe(
      "1912-06-23",
    );
    expect(valueText({ kind: "time", time: "1912-06-23T00:00:00Z", precision: 9 }, null)).toBe(
      "1912",
    );
    expect(
      valueText({ kind: "quantity", amount: "1404890000", unit: null }, "2025-01-01T00:00:00Z"),
    ).toBe("1404890000 (2025-01-01)");
  });
});

/** A fetch that answers by what is asked rather than by call order: the lookup tries several
 * candidate strings and the provider several entities, and the exact sequence is not the
 * contract. `search` maps a candidate string to its hits; `properties` an entity id to its
 * property rows; `statements` and `references` answer the two SPARQL shapes. */
function routedFetch(answers: {
  search: Record<string, unknown[]>;
  properties: Record<string, unknown[]>;
  statements?: unknown[];
  references?: unknown[] | "refuse";
}) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/w/api.php") {
      return jsonResponse({ search: answers.search[url.searchParams.get("search") ?? ""] ?? [] });
    }
    const query = url.searchParams.get("query") ?? "";
    if (query.includes("GROUP_CONCAT")) {
      const entity = /wd:(Q\d+) \?p \?st/.exec(query)?.[1] ?? "";
      return jsonResponse({ results: { bindings: answers.properties[entity] ?? [] } });
    }
    if (query.includes("prov:wasDerivedFrom")) {
      if (answers.references === "refuse") return jsonResponse({}, 503);
      return jsonResponse({ results: { bindings: answers.references ?? [] } });
    }
    return jsonResponse({ results: { bindings: answers.statements ?? [] } });
  });
}

describe("createWikidataProvider", () => {
  const everestHit = {
    id: "Q513",
    label: "珠穆朗玛峰",
    description: "山",
    match: { text: "珠穆朗玛峰" },
  };
  const everestProperties = [
    propertyRow("P2044", "海拔", "海拔|elevation|height"),
    propertyRow("P17", "国家", "country"),
  ];

  it("renders the current value into one sentence in the learner's language, with its source", async () => {
    const fetchImpl = routedFetch({
      search: { 珠穆朗玛峰: [everestHit] },
      properties: { Q513: everestProperties },
      statements: [
        elevationRow("pref", "8848.86", "Preferred"),
        elevationRow("n1", "8848", "Normal"),
        elevationRow("n2", "8850", "Normal"),
        elevationRow("n3", "8844.43", "Normal"),
      ],
      references: [{ st: uri(`${ST}pref`), ref: uri("https://www.bbc.com/news/1") }],
    });
    const provider = createWikidataProvider({
      fetchImpl,
      language: "zh-CN",
      renderFact: (p) =>
        `${p.subject}的${p.property}为${p.value}。（来源：${p.reference ?? "无"}）`,
    });

    const { items, failed } = await provider.search("珠穆朗玛峰 海拔 8848.86", 3);

    expect(failed).toBe(false);
    expect(items).toEqual([
      {
        url: "https://www.wikidata.org/wiki/Q513",
        title: "珠穆朗玛峰",
        snippet: "珠穆朗玛峰的海拔为8848.86 米。（来源：https://www.bbc.com/news/1）",
        source: "wikidata",
      },
    ]);
    // The three superseded readings never reach the judge: no self-made contradictions.
    expect(items[0]?.snippet).not.toContain("8844");
    const urls = fetchImpl.mock.calls.map((call) => decodeURIComponent(String(call[0])));
    // Only the properties the query is about are asked for, the matched one first.
    expect(urls.find((url) => url.includes("VALUES ?prop"))).toContain(
      "VALUES ?prop { wd:P2044 wd:P17 }",
    );
    // Language chain: the simplified-script labels first, English last.
    expect(urls.find((url) => url.includes("VALUES ?prop"))).toContain(
      'wikibase:language "zh-cn,zh-hans,zh,en"',
    );
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({
      "Api-User-Agent": expect.stringContaining("Breadcrumb"),
    });
  });

  it("reports empty, not failed, when no candidate names an entity", async () => {
    const fetchImpl = routedFetch({ search: {}, properties: {} });
    const provider = createWikidataProvider({ fetchImpl, language: "en" });
    expect(await provider.search("why is the sky blue", 3)).toEqual({ items: [], failed: false });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("ignores a hit whose matched name is much longer than the candidate (a paper title)", async () => {
    const fetchImpl = routedFetch({
      search: {
        "water boiling": [
          {
            id: "Q33450717",
            label: "Water Boiling Inside Carbon Nanotubes",
            match: { text: "Water Boiling Inside Carbon Nanotubes" },
          },
        ],
      },
      properties: {},
    });
    const provider = createWikidataProvider({ fetchImpl, language: "en" });
    expect(await provider.search("water boiling point", 3)).toEqual({ items: [], failed: false });
  });

  it("moves to the hit whose properties the query names — the second «中国» has the population", async () => {
    const fetchImpl = routedFetch({
      search: {
        中国: [
          { id: "Q29520", label: "中国", match: { text: "中国" } },
          { id: "Q148", label: "中华人民共和国", match: { text: "中国" } },
        ],
      },
      properties: {
        Q29520: [propertyRow("P31", "隶属于", "")],
        Q148: [propertyRow("P1082", "人口", "人口|population")],
      },
      statements: [
        {
          st: uri(`${ST}pop`),
          prop: uri(`${P}P1082`),
          rank: uri("http://wikiba.se/ontology#PreferredRank"),
          amount: literal("1404890000"),
          unitLabel: literal("1"),
          pointInTime: literal("2025-01-01T00:00:00Z"),
        },
      ],
    });
    const provider = createWikidataProvider({ fetchImpl, language: "zh-CN" });
    const { items } = await provider.search("中国 人口", 1);
    expect(items[0]?.url).toBe("https://www.wikidata.org/wiki/Q148");
    expect(items[0]?.snippet).toBe("中华人民共和国 — 人口: 1404890000 (2025-01-01)");
  });

  it("prefers the entity with more headline facts when nothing matches by name", async () => {
    const fetchImpl = routedFetch({
      search: {
        Mlima: [{ id: "Q8502", label: "mlima", match: { text: "mlima" } }],
        Everest: [{ id: "Q513", label: "Everest", match: { text: "Everest" } }],
      },
      properties: { Q8502: [propertyRow("P31", "ni mfano wa", "")], Q513: everestProperties },
      statements: [elevationRow("p", "8848.86", "Preferred")],
    });
    const provider = createWikidataProvider({ fetchImpl, language: "sw" });
    const { items } = await provider.search("Mlima Everest urefu", 1);
    expect(items[0]?.url).toBe("https://www.wikidata.org/wiki/Q513");
  });

  it("reports failed when the query service does not answer", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) =>
      String(input).includes("wbsearchentities")
        ? jsonResponse({ search: [everestHit] })
        : Promise.reject(new Error("timeout")),
    );
    const provider = createWikidataProvider({ fetchImpl, language: "en" });
    expect(await provider.search("珠穆朗玛峰 海拔", 3)).toEqual({ items: [], failed: true });
  });

  it("still returns the fact when the reference query fails", async () => {
    const fetchImpl = routedFetch({
      search: { 珠穆朗玛峰: [everestHit] },
      properties: { Q513: everestProperties },
      statements: [elevationRow("p", "8848.86", "Preferred")],
      references: "refuse",
    });
    const provider = createWikidataProvider({ fetchImpl, language: "en" });
    const { items } = await provider.search("珠穆朗玛峰 海拔", 3);
    expect(items[0]?.snippet).toBe("珠穆朗玛峰 — 海拔: 8848.86 米");
  });
});
