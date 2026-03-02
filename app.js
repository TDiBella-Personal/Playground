// ── State ──
let allResults = [];
let activeFilter = "all";

// ── DOM ──
const app = document.getElementById("app");
const form = document.getElementById("search-form");
const queryInput = document.getElementById("query");
const quickLinks = document.getElementById("quick-links");
const filtersEl = document.getElementById("filters");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const settingsBtn = document.getElementById("settings-btn");
const settingsModal = document.getElementById("settings-modal");
const ytKeyInput = document.getElementById("yt-key");
const saveSettingsBtn = document.getElementById("save-settings");
const closeSettingsBtn = document.getElementById("close-settings");

// ── Settings ──
function getYouTubeKey() {
  return localStorage.getItem("yt_api_key") || "";
}

settingsBtn.addEventListener("click", () => {
  ytKeyInput.value = getYouTubeKey();
  settingsModal.classList.remove("hidden");
});

saveSettingsBtn.addEventListener("click", () => {
  const key = ytKeyInput.value.trim();
  if (key) {
    localStorage.setItem("yt_api_key", key);
  } else {
    localStorage.removeItem("yt_api_key");
  }
  settingsModal.classList.add("hidden");
});

closeSettingsBtn.addEventListener("click", () => {
  settingsModal.classList.add("hidden");
});

settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) settingsModal.classList.add("hidden");
});

// ── Filters ──
filtersEl.addEventListener("click", (e) => {
  if (!e.target.classList.contains("filter")) return;
  filtersEl.querySelectorAll(".filter").forEach((b) => b.classList.remove("active"));
  e.target.classList.add("active");
  activeFilter = e.target.dataset.platform;
  renderResults();
});

// ── Search ──
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = queryInput.value.trim();
  if (!query) return;

  // Switch to results layout
  app.classList.remove("centered");
  app.classList.add("has-results");
  quickLinks.classList.remove("hidden");
  filtersEl.classList.remove("hidden");

  // Update quick links
  document.getElementById("link-facebook").href =
    "https://www.facebook.com/search/posts/?q=" + encodeURIComponent(query);
  document.getElementById("link-tiktok").href =
    "https://www.tiktok.com/search?q=" + encodeURIComponent(query);
  document.getElementById("link-instagram").href =
    "https://www.instagram.com/explore/tags/" + encodeURIComponent(query.replace(/\s+/g, "")) + "/";

  // Show loading
  allResults = [];
  resultsEl.innerHTML = "";
  showStatus('<span class="spinner"></span> Searching across platforms...');

  // Fire all API searches in parallel
  const searches = [
    searchHackerNews(query),
    searchReddit(query),
  ];

  const ytKey = getYouTubeKey();
  if (ytKey) {
    searches.push(searchYouTube(query, ytKey));
  }

  const results = await Promise.allSettled(searches);

  // Collect results
  allResults = [];
  const errors = [];

  results.forEach((r) => {
    if (r.status === "fulfilled" && r.value.results) {
      allResults = allResults.concat(r.value.results);
    }
    if (r.status === "fulfilled" && r.value.error) {
      errors.push(r.value.error);
    }
    if (r.status === "rejected") {
      errors.push(r.reason?.message || "Unknown error");
    }
  });

  // Sort by date (newest first)
  allResults.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  if (allResults.length === 0 && errors.length > 0) {
    showStatus("No results found. Errors: " + errors.join("; "), true);
  } else if (allResults.length === 0) {
    showStatus("No results found for "" + query + """);
  } else {
    let msg = allResults.length + " result" + (allResults.length !== 1 ? "s" : "") + " found";
    if (!ytKey) msg += ' &middot; <a href="#" id="add-yt-hint">Add YouTube API key</a> for more results';
    if (errors.length > 0) msg += " &middot; Some platforms had errors";
    showStatus(msg);
  }

  // Bind the hint link if present
  const hint = document.getElementById("add-yt-hint");
  if (hint) {
    hint.addEventListener("click", (ev) => {
      ev.preventDefault();
      settingsBtn.click();
    });
  }

  renderResults();
});

// ── Searchers ──

async function searchHackerNews(query) {
  try {
    const resp = await fetch(
      "https://hn.algolia.com/api/v1/search?query=" + encodeURIComponent(query) + "&hitsPerPage=15"
    );
    if (!resp.ok) throw new Error("HN API returned " + resp.status);
    const data = await resp.json();
    const results = (data.hits || []).map((hit) => ({
      platform: "hackernews",
      title: hit.title || hit.story_title || "Untitled",
      url: hit.url || "https://news.ycombinator.com/item?id=" + hit.objectID,
      author: hit.author,
      timestamp: hit.created_at_i ? hit.created_at_i * 1000 : null,
      points: hit.points,
      comments: hit.num_comments,
      body: hit.story_text || hit.comment_text || "",
    }));
    return { results };
  } catch (err) {
    return { results: [], error: "Hacker News: " + err.message };
  }
}

async function searchYouTube(query, apiKey) {
  try {
    const params = new URLSearchParams({
      part: "snippet",
      q: query,
      type: "video",
      maxResults: "15",
      order: "relevance",
      key: apiKey,
    });
    const resp = await fetch(
      "https://www.googleapis.com/youtube/v3/search?" + params.toString()
    );
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || "API returned " + resp.status);
    }
    const data = await resp.json();
    const results = (data.items || []).map((item) => ({
      platform: "youtube",
      title: item.snippet.title,
      url: "https://www.youtube.com/watch?v=" + item.id.videoId,
      author: item.snippet.channelTitle,
      timestamp: new Date(item.snippet.publishedAt).getTime(),
      thumbnail: item.snippet.thumbnails?.medium?.url,
      body: item.snippet.description || "",
    }));
    return { results };
  } catch (err) {
    return { results: [], error: "YouTube: " + err.message };
  }
}

async function searchReddit(query) {
  try {
    // Use CORS proxy since Reddit doesn't send CORS headers
    const redditUrl = "https://www.reddit.com/search.json?q=" + encodeURIComponent(query) + "&limit=15&sort=relevance";
    const proxyUrl = "https://api.allorigins.win/raw?url=" + encodeURIComponent(redditUrl);
    const resp = await fetch(proxyUrl);
    if (!resp.ok) throw new Error("Proxy returned " + resp.status);
    const data = await resp.json();
    const posts = data?.data?.children || [];
    const results = posts.map((child) => {
      const p = child.data;
      return {
        platform: "reddit",
        title: p.title,
        url: "https://www.reddit.com" + p.permalink,
        author: p.author,
        timestamp: p.created_utc ? p.created_utc * 1000 : null,
        score: p.score,
        comments: p.num_comments,
        subreddit: p.subreddit_name_prefixed,
        body: p.selftext || "",
      };
    });
    return { results };
  } catch (err) {
    return { results: [], error: "Reddit: " + err.message };
  }
}

// ── Rendering ──

function showStatus(html, isError) {
  statusEl.innerHTML = html;
  statusEl.classList.remove("hidden", "error");
  if (isError) statusEl.classList.add("error");
}

function renderResults() {
  resultsEl.innerHTML = "";
  const filtered = activeFilter === "all"
    ? allResults
    : allResults.filter((r) => r.platform === activeFilter);

  if (filtered.length === 0 && allResults.length > 0) {
    resultsEl.innerHTML = '<p style="color:#8b949e;text-align:center;padding:40px 0;">No results for this platform filter.</p>';
    return;
  }

  filtered.forEach((r) => {
    const card = document.createElement("div");
    card.className = "result-card";
    card.dataset.platform = r.platform;

    let metaHtml = "";
    if (r.author) metaHtml += "<span>by " + escapeHtml(r.author) + "</span>";
    if (r.subreddit) metaHtml += "<span>" + escapeHtml(r.subreddit) + "</span>";
    if (r.points != null) metaHtml += "<span>" + r.points + " points</span>";
    if (r.score != null) metaHtml += "<span>" + r.score + " upvotes</span>";
    if (r.comments != null) metaHtml += "<span>" + r.comments + " comments</span>";

    let bodyHtml = "";
    if (r.body) {
      const preview = r.body.length > 300 ? r.body.slice(0, 300) + "..." : r.body;
      bodyHtml = '<div class="body-preview">' + escapeHtml(preview) + "</div>";
    }

    let thumbHtml = "";
    if (r.thumbnail) {
      thumbHtml = '<img class="thumbnail" src="' + escapeHtml(r.thumbnail) + '" alt="" loading="lazy">';
    }

    card.innerHTML =
      '<div class="card-header">' +
        '<span class="platform-badge badge-' + r.platform + '">' + platformLabel(r.platform) + "</span>" +
        '<span class="timestamp">' + formatTime(r.timestamp) + "</span>" +
      "</div>" +
      '<div class="title"><a href="' + escapeHtml(r.url) + '" target="_blank" rel="noopener">' + escapeHtml(r.title) + "</a></div>" +
      '<div class="meta">' + metaHtml + "</div>" +
      bodyHtml +
      thumbHtml;

    resultsEl.appendChild(card);
  });
}

function platformLabel(p) {
  const labels = { hackernews: "Hacker News", youtube: "YouTube", reddit: "Reddit" };
  return labels[p] || p;
}

function formatTime(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins + "m ago";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  const days = Math.floor(hrs / 24);
  if (days < 30) return days + "d ago";
  return new Date(ts).toLocaleDateString();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
