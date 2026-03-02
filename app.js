(function () {
  "use strict";

  // ── State ──
  var allResults = [];
  var activeFilter = "all";

  // ── DOM refs ──
  var app = document.getElementById("app");
  var form = document.getElementById("search-form");
  var queryInput = document.getElementById("query");
  var quickLinks = document.getElementById("quick-links");
  var filtersEl = document.getElementById("filters");
  var statusEl = document.getElementById("status");
  var resultsEl = document.getElementById("results");
  var settingsBtn = document.getElementById("settings-btn");
  var settingsModal = document.getElementById("settings-modal");
  var ytKeyInput = document.getElementById("yt-key");
  var saveSettingsBtn = document.getElementById("save-settings");
  var closeSettingsBtn = document.getElementById("close-settings");
  var closeSettingsX = document.getElementById("close-settings-x");
  var themePicker = document.getElementById("theme-picker");

  // ── Helpers ──

  function escapeHtml(str) {
    if (!str) return "";
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function fetchWithTimeout(url, timeoutMs) {
    var ms = timeoutMs || 10000;
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        reject(new Error("Request timed out after " + ms + "ms"));
      }, ms);
      fetch(url).then(function (resp) {
        clearTimeout(timer);
        resolve(resp);
      }).catch(function (err) {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  // ── Theme System ──

  function getTheme() {
    return localStorage.getItem("theme") || "midnight";
  }

  function setTheme(name) {
    document.body.setAttribute("data-theme", name);
    localStorage.setItem("theme", name);
    // Update swatch active states
    var swatches = themePicker.querySelectorAll(".theme-swatch");
    for (var i = 0; i < swatches.length; i++) {
      if (swatches[i].getAttribute("data-theme") === name) {
        swatches[i].classList.add("active");
      } else {
        swatches[i].classList.remove("active");
      }
    }
  }

  // Initialize theme
  setTheme(getTheme());

  themePicker.addEventListener("click", function (e) {
    var swatch = e.target.closest(".theme-swatch");
    if (!swatch) return;
    setTheme(swatch.getAttribute("data-theme"));
  });

  // ── Settings Modal ──

  function getYouTubeKey() {
    return localStorage.getItem("yt_api_key") || "";
  }

  function openSettings() {
    ytKeyInput.value = getYouTubeKey();
    setTheme(getTheme()); // refresh active swatch
    settingsModal.classList.remove("hidden");
  }

  function closeSettings() {
    settingsModal.classList.add("hidden");
  }

  settingsBtn.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    openSettings();
  });

  // Also handle touch explicitly for iPad
  settingsBtn.addEventListener("touchend", function (e) {
    e.preventDefault();
    e.stopPropagation();
    openSettings();
  });

  saveSettingsBtn.addEventListener("click", function () {
    var key = ytKeyInput.value.trim();
    if (key) {
      localStorage.setItem("yt_api_key", key);
    } else {
      localStorage.removeItem("yt_api_key");
    }
    closeSettings();
  });

  closeSettingsBtn.addEventListener("click", closeSettings);
  closeSettingsX.addEventListener("click", closeSettings);

  settingsModal.addEventListener("click", function (e) {
    if (e.target === settingsModal) closeSettings();
  });

  // ── Filters ──

  filtersEl.addEventListener("click", function (e) {
    var btn = e.target.closest(".filter");
    if (!btn) return;
    var allBtns = filtersEl.querySelectorAll(".filter");
    for (var i = 0; i < allBtns.length; i++) allBtns[i].classList.remove("active");
    btn.classList.add("active");
    activeFilter = btn.getAttribute("data-platform");
    renderResults();
  });

  // ── Search ──

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var query = queryInput.value.trim();
    if (!query) return;
    doSearch(query);
  });

  function doSearch(query) {
    // Switch to results layout
    app.classList.remove("centered");
    app.classList.add("has-results");
    quickLinks.classList.remove("hidden");
    filtersEl.classList.remove("hidden");

    // Update quick links
    var enc = encodeURIComponent(query);
    document.getElementById("link-facebook").href =
      "https://www.facebook.com/search/posts/?q=" + enc;
    document.getElementById("link-tiktok").href =
      "https://www.tiktok.com/search?q=" + enc;
    document.getElementById("link-instagram").href =
      "https://www.instagram.com/explore/tags/" + encodeURIComponent(query.replace(/\s+/g, "")) + "/";

    // Show loading
    allResults = [];
    resultsEl.innerHTML = "";
    showStatus('<span class="spinner"></span> Searching across platforms...');

    // Fire all API searches in parallel
    var searches = [
      searchHackerNews(query),
      searchReddit(query),
    ];

    var ytKey = getYouTubeKey();
    if (ytKey) {
      searches.push(searchYouTube(query, ytKey));
    }

    Promise.allSettled(searches).then(function (settled) {
      allResults = [];
      var errors = [];

      for (var i = 0; i < settled.length; i++) {
        var r = settled[i];
        if (r.status === "fulfilled" && r.value && r.value.results && r.value.results.length > 0) {
          allResults = allResults.concat(r.value.results);
        }
        if (r.status === "fulfilled" && r.value && r.value.error) {
          errors.push(r.value.error);
        }
        if (r.status === "rejected") {
          errors.push(r.reason && r.reason.message ? r.reason.message : "Unknown error");
        }
      }

      // Sort by date (newest first)
      allResults.sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });

      var msg;
      if (allResults.length === 0 && errors.length > 0) {
        showStatus("No results found. Errors: " + escapeHtml(errors.join("; ")), true);
      } else if (allResults.length === 0) {
        msg = 'No results found for "' + escapeHtml(query) + '"';
        if (!ytKey) msg += '. <a href="#" id="add-yt-hint">Add YouTube API key</a> for more results';
        showStatus(msg);
      } else {
        msg = allResults.length + " result" + (allResults.length !== 1 ? "s" : "") + " found";
        if (!ytKey) msg += ' &middot; <a href="#" id="add-yt-hint">Add YouTube API key</a> for more';
        if (errors.length > 0) msg += " &middot; Some platforms had errors";
        showStatus(msg);
      }

      // Bind the hint link if present
      var hint = document.getElementById("add-yt-hint");
      if (hint) {
        hint.addEventListener("click", function (ev) {
          ev.preventDefault();
          openSettings();
        });
      }

      renderResults();
    });
  }

  // ── Searchers ──

  function searchHackerNews(query) {
    var url = "https://hn.algolia.com/api/v1/search?query=" + encodeURIComponent(query) + "&hitsPerPage=15";
    return fetchWithTimeout(url, 10000).then(function (resp) {
      if (!resp.ok) throw new Error("HN API returned " + resp.status);
      return resp.json();
    }).then(function (data) {
      var hits = data.hits || [];
      var results = [];
      for (var i = 0; i < hits.length; i++) {
        var hit = hits[i];
        results.push({
          platform: "hackernews",
          title: hit.title || hit.story_title || "Untitled",
          url: hit.url || ("https://news.ycombinator.com/item?id=" + hit.objectID),
          author: hit.author,
          timestamp: hit.created_at_i ? hit.created_at_i * 1000 : null,
          points: hit.points,
          comments: hit.num_comments,
          body: hit.story_text || hit.comment_text || "",
        });
      }
      return { results: results };
    }).catch(function (err) {
      return { results: [], error: "Hacker News: " + err.message };
    });
  }

  function searchYouTube(query, apiKey) {
    var params = "part=snippet&q=" + encodeURIComponent(query) +
      "&type=video&maxResults=15&order=relevance&key=" + encodeURIComponent(apiKey);
    var url = "https://www.googleapis.com/youtube/v3/search?" + params;
    return fetchWithTimeout(url, 10000).then(function (resp) {
      if (!resp.ok) {
        return resp.json().catch(function () { return {}; }).then(function (body) {
          throw new Error((body.error && body.error.message) || ("API returned " + resp.status));
        });
      }
      return resp.json();
    }).then(function (data) {
      var items = data.items || [];
      var results = [];
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var sn = item.snippet || {};
        results.push({
          platform: "youtube",
          title: sn.title || "Untitled",
          url: "https://www.youtube.com/watch?v=" + (item.id && item.id.videoId),
          author: sn.channelTitle,
          timestamp: sn.publishedAt ? new Date(sn.publishedAt).getTime() : null,
          thumbnail: sn.thumbnails && sn.thumbnails.medium && sn.thumbnails.medium.url,
          body: sn.description || "",
        });
      }
      return { results: results };
    }).catch(function (err) {
      return { results: [], error: "YouTube: " + err.message };
    });
  }

  // Reddit: try multiple CORS proxies as fallbacks
  var CORS_PROXIES = [
    function (u) { return "https://api.allorigins.win/raw?url=" + encodeURIComponent(u); },
    function (u) { return "https://corsproxy.io/?" + encodeURIComponent(u); },
  ];

  function searchReddit(query) {
    var redditUrl = "https://www.reddit.com/search.json?q=" + encodeURIComponent(query) + "&limit=15&sort=relevance";

    function tryProxy(index) {
      if (index >= CORS_PROXIES.length) {
        return Promise.resolve({ results: [], error: "Reddit: all proxies failed" });
      }
      var proxyUrl = CORS_PROXIES[index](redditUrl);
      return fetchWithTimeout(proxyUrl, 8000).then(function (resp) {
        if (!resp.ok) throw new Error("Proxy " + (index + 1) + " returned " + resp.status);
        return resp.json();
      }).then(function (data) {
        var children = (data && data.data && data.data.children) || [];
        var results = [];
        for (var i = 0; i < children.length; i++) {
          var p = children[i].data;
          if (!p) continue;
          results.push({
            platform: "reddit",
            title: p.title || "Untitled",
            url: "https://www.reddit.com" + (p.permalink || ""),
            author: p.author,
            timestamp: p.created_utc ? p.created_utc * 1000 : null,
            score: p.score,
            comments: p.num_comments,
            subreddit: p.subreddit_name_prefixed,
            body: p.selftext || "",
          });
        }
        return { results: results };
      }).catch(function () {
        return tryProxy(index + 1);
      });
    }

    return tryProxy(0);
  }

  // ── Rendering ──

  function showStatus(html, isError) {
    statusEl.innerHTML = html;
    statusEl.classList.remove("hidden", "error");
    if (isError) statusEl.classList.add("error");
  }

  function renderResults() {
    resultsEl.innerHTML = "";
    var filtered;
    if (activeFilter === "all") {
      filtered = allResults;
    } else {
      filtered = [];
      for (var i = 0; i < allResults.length; i++) {
        if (allResults[i].platform === activeFilter) filtered.push(allResults[i]);
      }
    }

    if (filtered.length === 0 && allResults.length > 0) {
      resultsEl.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px 0;">No results for this platform filter.</p>';
      return;
    }

    for (var j = 0; j < filtered.length; j++) {
      var r = filtered[j];
      var card = document.createElement("div");
      card.className = "result-card";

      var metaParts = [];
      if (r.author) metaParts.push("by " + escapeHtml(r.author));
      if (r.subreddit) metaParts.push(escapeHtml(r.subreddit));
      if (r.points != null) metaParts.push(r.points + " points");
      if (r.score != null) metaParts.push(r.score + " upvotes");
      if (r.comments != null) metaParts.push(r.comments + " comments");

      var metaHtml = "";
      for (var k = 0; k < metaParts.length; k++) {
        metaHtml += "<span>" + metaParts[k] + "</span>";
      }

      var bodyHtml = "";
      if (r.body) {
        var preview = r.body.length > 300 ? r.body.slice(0, 300) + "..." : r.body;
        bodyHtml = '<div class="body-preview">' + escapeHtml(preview) + "</div>";
      }

      var thumbHtml = "";
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
    }
  }

  function platformLabel(p) {
    if (p === "hackernews") return "Hacker News";
    if (p === "youtube") return "YouTube";
    if (p === "reddit") return "Reddit";
    return p;
  }

  function formatTime(ts) {
    if (!ts) return "";
    var diff = Date.now() - ts;
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    var days = Math.floor(hrs / 24);
    if (days < 30) return days + "d ago";
    return new Date(ts).toLocaleDateString();
  }

})();
