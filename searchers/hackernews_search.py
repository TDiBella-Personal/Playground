import requests
from datetime import datetime, timezone


def search(query, limit=10):
    """Search Hacker News via the Algolia API. No auth needed."""
    results = []
    try:
        resp = requests.get(
            "https://hn.algolia.com/api/v1/search",
            params={"query": query, "hitsPerPage": limit},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()

        for hit in data.get("hits", []):
            timestamp = None
            if hit.get("created_at"):
                try:
                    timestamp = datetime.fromisoformat(
                        hit["created_at"].replace("Z", "+00:00")
                    )
                except ValueError:
                    pass

            results.append({
                "platform": "hackernews",
                "title": hit.get("title") or hit.get("story_title") or "",
                "body": hit.get("comment_text") or "",
                "url": hit.get("url") or f"https://news.ycombinator.com/item?id={hit.get('objectID', '')}",
                "author": hit.get("author", ""),
                "timestamp": timestamp,
                "score": hit.get("points") or 0,
                "extra": {
                    "comments": hit.get("num_comments") or 0,
                    "hn_url": f"https://news.ycombinator.com/item?id={hit.get('objectID', '')}",
                },
            })
    except Exception as e:
        print(f"[HackerNews] Search failed: {e}")

    return results
