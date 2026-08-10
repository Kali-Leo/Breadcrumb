# Purpose: dev-time timeliness-patch step 1 (spec 026 §4) — fetch a sample of real job
# postings for one occupation via JobSpy (experimental scraping: rate-limited, dev-only,
# never part of the product runtime) and dump title+description JSON for the extractor.
# Usage: <venv-python> fetch-postings.py "web developer" out.json
import json
import sys

from jobspy import scrape_jobs

if len(sys.argv) < 3:
    print("usage: fetch-postings.py <search term> <out.json>")
    sys.exit(1)

term, out_path = sys.argv[1], sys.argv[2]
jobs = scrape_jobs(
    site_name=["indeed"],
    search_term=term,
    results_wanted=60,
    country_indeed="USA",
    description_format="markdown",
)
postings = []
for _, row in jobs.iterrows():
    description = row.get("description")
    if not isinstance(description, str) or len(description) < 200:
        continue
    postings.append({"title": str(row.get("title", "")), "description": description[:6000]})

with open(out_path, "w", encoding="utf-8") as handle:
    json.dump({"term": term, "postings": postings}, handle, ensure_ascii=False)
print(f"postings={len(postings)}")
