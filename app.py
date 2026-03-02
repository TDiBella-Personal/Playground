import os
from concurrent.futures import ThreadPoolExecutor, as_completed

from dotenv import load_dotenv
from flask import Flask, render_template, request

from searchers import hackernews_search, reddit_search, youtube_search

load_dotenv()

app = Flask(__name__)

SEARCHERS = {
    "hackernews": hackernews_search,
    "reddit": reddit_search,
    "youtube": youtube_search,
}


def run_search(query, limit=10):
    """Search all platforms concurrently and return combined results."""
    all_results = []
    errors = []

    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {
            executor.submit(searcher.search, query, limit): name
            for name, searcher in SEARCHERS.items()
        }

        for future in as_completed(futures):
            platform = futures[future]
            try:
                results = future.result(timeout=15)
                all_results.extend(results)
            except Exception as e:
                errors.append(f"{platform}: {e}")
                print(f"[{platform}] Error: {e}")

    # Sort by timestamp (newest first), putting None timestamps at the end
    all_results.sort(
        key=lambda r: r["timestamp"] or __import__("datetime").datetime.min.replace(
            tzinfo=__import__("datetime").timezone.utc
        ),
        reverse=True,
    )

    return all_results, errors


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/search")
def search_results():
    query = request.args.get("q", "").strip()
    platform_filter = request.args.get("platform", "all")

    if not query:
        return render_template("index.html")

    results, errors = run_search(query)

    if platform_filter != "all":
        results = [r for r in results if r["platform"] == platform_filter]

    platforms = ["all", "reddit", "youtube", "hackernews"]

    return render_template(
        "results.html",
        query=query,
        results=results,
        errors=errors,
        platforms=platforms,
        active_platform=platform_filter,
    )


if __name__ == "__main__":
    app.run(debug=True, port=5000)
