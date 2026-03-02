import os
from datetime import datetime, timezone

import praw


def search(query, limit=10):
    """Search Reddit posts via PRAW. Requires REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET in .env."""
    client_id = os.getenv("REDDIT_CLIENT_ID")
    client_secret = os.getenv("REDDIT_CLIENT_SECRET")
    user_agent = os.getenv("REDDIT_USER_AGENT", "social-media-search/1.0")

    if not client_id or not client_secret:
        print("[Reddit] Skipping — REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET not set")
        return []

    results = []
    try:
        reddit = praw.Reddit(
            client_id=client_id,
            client_secret=client_secret,
            user_agent=user_agent,
        )

        for post in reddit.subreddit("all").search(query, sort="relevance", limit=limit):
            timestamp = datetime.fromtimestamp(post.created_utc, tz=timezone.utc)

            results.append({
                "platform": "reddit",
                "title": post.title,
                "body": (post.selftext[:300] + "...") if len(post.selftext) > 300 else post.selftext,
                "url": f"https://reddit.com{post.permalink}",
                "author": str(post.author) if post.author else "[deleted]",
                "timestamp": timestamp,
                "score": post.score,
                "extra": {
                    "subreddit": post.subreddit.display_name,
                    "comments": post.num_comments,
                },
            })
    except Exception as e:
        print(f"[Reddit] Search failed: {e}")

    return results
