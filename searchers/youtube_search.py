import os
from datetime import datetime

import requests


def search(query, limit=10):
    """Search YouTube videos via Data API v3. Requires YOUTUBE_API_KEY in .env."""
    api_key = os.getenv("YOUTUBE_API_KEY")

    if not api_key:
        print("[YouTube] Skipping — YOUTUBE_API_KEY not set")
        return []

    results = []
    try:
        resp = requests.get(
            "https://www.googleapis.com/youtube/v3/search",
            params={
                "part": "snippet",
                "q": query,
                "type": "video",
                "maxResults": limit,
                "order": "relevance",
                "key": api_key,
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()

        for item in data.get("items", []):
            snippet = item["snippet"]
            video_id = item["id"]["videoId"]

            timestamp = None
            if snippet.get("publishedAt"):
                try:
                    timestamp = datetime.fromisoformat(
                        snippet["publishedAt"].replace("Z", "+00:00")
                    )
                except ValueError:
                    pass

            results.append({
                "platform": "youtube",
                "title": snippet.get("title", ""),
                "body": snippet.get("description", "")[:300],
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "author": snippet.get("channelTitle", ""),
                "timestamp": timestamp,
                "score": 0,
                "extra": {
                    "thumbnail": snippet.get("thumbnails", {}).get("medium", {}).get("url", ""),
                    "channel_id": snippet.get("channelId", ""),
                },
            })
    except Exception as e:
        print(f"[YouTube] Search failed: {e}")

    return results
