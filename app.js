(function () {
  "use strict";

  // ── State ──
  var allResults = [];
  var ALL_PLATFORMS = [
    "hackernews", "reddit", "youtube", "devto", "github", "stackoverflow",
    "wikipedia", "lemmy", "googlenews", "archiveorg", "arxiv", "mastodon"
  ];
  var enabledPlatforms = {};
  for (var i = 0; i < ALL_PLATFORMS.length; i++) enabledPlatforms[ALL_PLATFORMS[i]] = true;

  // ── DOM refs ──
  var app = document.getElementById("app");
  var splashBg = document.getElementById("splash-bg");
  var form = document.getElementById("search-form");
  var queryInput = document.getElementById("query");
  var toolbar = document.getElementById("toolbar");
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

  function stripHtml(html) {
    if (!html) return "";
    var tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  }

  function fetchWithTimeout(url, timeoutMs) {
    var ms = timeoutMs || 10000;
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        reject(new Error("Timed out"));
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
    var swatches = themePicker.querySelectorAll(".theme-swatch");
    for (var i = 0; i < swatches.length; i++) {
      if (swatches[i].getAttribute("data-theme") === name) {
        swatches[i].classList.add("active");
      } else {
        swatches[i].classList.remove("active");
      }
    }
  }

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
    setTheme(getTheme());
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

  function syncFilterUI() {
    var btns = filtersEl.querySelectorAll(".filter");
    for (var j = 0; j < btns.length; j++) {
      var p = btns[j].getAttribute("data-platform");
      if (p) {
        if (enabledPlatforms[p]) btns[j].classList.add("active");
        else btns[j].classList.remove("active");
      }
    }
  }

  function handleFilterTap(e) {
    var btn = e.target.closest(".filter");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    var platform = btn.getAttribute("data-platform");
    if (!platform) return;

    enabledPlatforms[platform] = !enabledPlatforms[platform];
    syncFilterUI();
    renderResults();
  }

  filtersEl.addEventListener("touchend", handleFilterTap);
  filtersEl.addEventListener("click", handleFilterTap);

  // ── Article Count ──

  var countDisplay = document.getElementById("count-display");
  var countMinus = document.getElementById("count-minus");
  var countPlus = document.getElementById("count-plus");

  function getArticleCount() {
    return parseInt(localStorage.getItem("article_count") || "10", 10);
  }

  function setArticleCount(n) {
    localStorage.setItem("article_count", String(n));
    if (countDisplay) countDisplay.textContent = n;
  }

  setArticleCount(getArticleCount());

  if (countMinus) {
    countMinus.addEventListener("click", function () {
      var c = getArticleCount();
      if (c > 5) { setArticleCount(c - 5); renderResults(); }
    });
  }
  if (countPlus) {
    countPlus.addEventListener("click", function () {
      var c = getArticleCount();
      if (c < 50) { setArticleCount(c + 5); renderResults(); }
    });
  }

  // ── Search ──

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var query = queryInput.value.trim();
    if (!query) return;
    doSearch(query);
  });

  function doSearch(query) {
    app.classList.remove("centered");
    app.classList.add("has-results");
    toolbar.classList.remove("hidden");
    if (splashBg) splashBg.classList.add("faded");

    allResults = [];
    resultsEl.innerHTML = "";
    showStatus('<span class="spinner"></span> Searching 12 platforms...');

    var searches = [
      searchHackerNews(query),
      searchReddit(query),
      searchDevTo(query),
      searchGitHub(query),
      searchStackOverflow(query),
      searchWikipedia(query),
      searchLemmy(query),
      searchGoogleNews(query),
      searchArchiveOrg(query),
      searchArxiv(query),
      searchMastodon(query),
    ];

    var ytKey = getYouTubeKey();
    if (ytKey) {
      searches.push(searchYouTube(query, ytKey));
    }

    Promise.allSettled(searches).then(function (settled) {
      allResults = [];
      var errors = [];
      var platformCounts = {};

      for (var i = 0; i < settled.length; i++) {
        var r = settled[i];
        if (r.status === "fulfilled" && r.value && r.value.results) {
          for (var j = 0; j < r.value.results.length; j++) {
            allResults.push(r.value.results[j]);
            var pl = r.value.results[j].platform;
            platformCounts[pl] = (platformCounts[pl] || 0) + 1;
          }
        }
        if (r.status === "fulfilled" && r.value && r.value.error) {
          errors.push(r.value.error);
        }
        if (r.status === "rejected") {
          errors.push(r.reason && r.reason.message ? r.reason.message : "Unknown error");
        }
      }

      allResults.sort(function (a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });

      var msg;
      if (allResults.length === 0 && errors.length > 0) {
        showStatus("No results. Errors: " + escapeHtml(errors.join("; ")), true);
      } else if (allResults.length === 0) {
        msg = 'No results for "' + escapeHtml(query) + '"';
        if (!ytKey) msg += ' · <a href="#" id="add-yt-hint">Add YouTube key</a> for more';
        showStatus(msg);
      } else {
        var sources = Object.keys(platformCounts).length;
        msg = allResults.length + " results from " + sources + " source" + (sources !== 1 ? "s" : "");
        if (!ytKey) msg += ' · <a href="#" id="add-yt-hint">Add YouTube key</a>';
        if (errors.length > 0) msg += " · " + errors.length + " source" + (errors.length !== 1 ? "s" : "") + " had errors";
        showStatus(msg);
      }

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

  // ── CORS Proxies ──

  var CORS_PROXIES = [
    function (u) { return "https://api.allorigins.win/raw?url=" + encodeURIComponent(u); },
    function (u) { return "https://corsproxy.io/?" + encodeURIComponent(u); },
  ];

  function fetchViaProxy(url, timeout) {
    function tryProxy(index) {
      if (index >= CORS_PROXIES.length) {
        return Promise.reject(new Error("All proxies failed"));
      }
      return fetchWithTimeout(CORS_PROXIES[index](url), timeout || 8000).then(function (resp) {
        if (!resp.ok) throw new Error("Proxy " + (index + 1) + " returned " + resp.status);
        return resp;
      }).catch(function () {
        return tryProxy(index + 1);
      });
    }
    return tryProxy(0);
  }

  // ── Searchers ──

  // 1. Hacker News (Algolia)
  function searchHackerNews(query) {
    var url = "https://hn.algolia.com/api/v1/search?query=" + encodeURIComponent(query) + "&hitsPerPage=25";
    return fetchWithTimeout(url, 10000).then(function (resp) {
      if (!resp.ok) throw new Error("HN " + resp.status);
      return resp.json();
    }).then(function (data) {
      var hits = data.hits || [];
      var results = [];
      for (var i = 0; i < hits.length; i++) {
        var h = hits[i];
        results.push({
          platform: "hackernews",
          title: h.title || h.story_title || "Untitled",
          url: h.url || ("https://news.ycombinator.com/item?id=" + h.objectID),
          author: h.author,
          timestamp: h.created_at_i ? h.created_at_i * 1000 : null,
          points: h.points,
          comments: h.num_comments,
          body: h.story_text || h.comment_text || "",
        });
      }
      return { results: results };
    }).catch(function (err) {
      return { results: [], error: "Hacker News: " + err.message };
    });
  }

  // 2. Reddit (via CORS proxy)
  function searchReddit(query) {
    var redditUrl = "https://www.reddit.com/search.json?q=" + encodeURIComponent(query) + "&limit=25&sort=relevance";
    return fetchViaProxy(redditUrl, 8000).then(function (resp) {
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
    }).catch(function (err) {
      return { results: [], error: "Reddit: " + err.message };
    });
  }

  // 3. YouTube (API key required)
  function searchYouTube(query, apiKey) {
    var params = "part=snippet&q=" + encodeURIComponent(query) +
      "&type=video&maxResults=15&order=relevance&key=" + encodeURIComponent(apiKey);
    var url = "https://www.googleapis.com/youtube/v3/search?" + params;
    return fetchWithTimeout(url, 10000).then(function (resp) {
      if (!resp.ok) {
        return resp.json().catch(function () { return {}; }).then(function (body) {
          throw new Error((body.error && body.error.message) || ("API " + resp.status));
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

  // 4. Dev.to (Forem API)
  function searchDevTo(query) {
    var url = "https://dev.to/api/articles?per_page=20&tag=" + encodeURIComponent(query.toLowerCase().replace(/\s+/g, ""));
    return fetchWithTimeout(url, 10000).then(function (resp) {
      if (!resp.ok) throw new Error("Dev.to " + resp.status);
      return resp.json();
    }).then(function (articles) {
      if (!Array.isArray(articles)) articles = [];
      var results = [];
      for (var i = 0; i < articles.length; i++) {
        var a = articles[i];
        results.push({
          platform: "devto",
          title: a.title || "Untitled",
          url: a.url || ("https://dev.to" + (a.path || "")),
          author: a.user ? a.user.name : "",
          timestamp: a.published_at ? new Date(a.published_at).getTime() : null,
          body: a.description || "",
          comments: a.comments_count,
          score: a.positive_reactions_count,
          thumbnail: a.cover_image || null,
        });
      }
      return { results: results };
    }).catch(function (err) {
      return { results: [], error: "Dev.to: " + err.message };
    });
  }

  // 5. GitHub (Search API)
  function searchGitHub(query) {
    var url = "https://api.github.com/search/repositories?q=" + encodeURIComponent(query) + "&sort=updated&per_page=15";
    return fetchWithTimeout(url, 10000).then(function (resp) {
      if (!resp.ok) throw new Error("GitHub " + resp.status);
      return resp.json();
    }).then(function (data) {
      var items = data.items || [];
      var results = [];
      for (var i = 0; i < items.length; i++) {
        var r = items[i];
        results.push({
          platform: "github",
          title: r.full_name || r.name || "Untitled",
          url: r.html_url || "",
          author: r.owner ? r.owner.login : "",
          timestamp: r.updated_at ? new Date(r.updated_at).getTime() : null,
          body: r.description || "",
          score: r.stargazers_count,
          language: r.language,
        });
      }
      return { results: results };
    }).catch(function (err) {
      return { results: [], error: "GitHub: " + err.message };
    });
  }

  // 6. StackOverflow (StackExchange API)
  function searchStackOverflow(query) {
    var url = "https://api.stackexchange.com/2.3/search/excerpts?order=desc&sort=relevance&q=" +
      encodeURIComponent(query) + "&site=stackoverflow&pagesize=15";
    return fetchWithTimeout(url, 10000).then(function (resp) {
      if (!resp.ok) throw new Error("SO " + resp.status);
      return resp.json();
    }).then(function (data) {
      var items = data.items || [];
      var results = [];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.item_type !== "question") continue;
        results.push({
          platform: "stackoverflow",
          title: stripHtml(it.title) || "Untitled",
          url: "https://stackoverflow.com/q/" + it.question_id,
          author: "",
          timestamp: it.creation_date ? it.creation_date * 1000 : null,
          body: stripHtml(it.excerpt) || "",
          score: it.score,
          tags: it.tags,
        });
      }
      return { results: results };
    }).catch(function (err) {
      return { results: [], error: "StackOverflow: " + err.message };
    });
  }

  // 7. Wikipedia (REST API search)
  function searchWikipedia(query) {
    var url = "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" +
      encodeURIComponent(query) + "&srlimit=15&format=json&origin=*";
    return fetchWithTimeout(url, 10000).then(function (resp) {
      if (!resp.ok) throw new Error("Wikipedia " + resp.status);
      return resp.json();
    }).then(function (data) {
      var items = (data.query && data.query.search) || [];
      var results = [];
      for (var i = 0; i < items.length; i++) {
        var w = items[i];
        results.push({
          platform: "wikipedia",
          title: w.title || "Untitled",
          url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(w.title.replace(/ /g, "_")),
          author: "",
          timestamp: w.timestamp ? new Date(w.timestamp).getTime() : null,
          body: stripHtml(w.snippet) || "",
          wordcount: w.wordcount,
        });
      }
      return { results: results };
    }).catch(function (err) {
      return { results: [], error: "Wikipedia: " + err.message };
    });
  }

  // 8. Lemmy (lemmy.world API)
  function searchLemmy(query) {
    var url = "https://lemmy.world/api/v3/search?q=" + encodeURIComponent(query) + "&type_=Posts&sort=TopAll&limit=15";
    return fetchViaProxy(url, 10000).then(function (resp) {
      return resp.json();
    }).then(function (data) {
      var posts = data.posts || [];
      var results = [];
      for (var i = 0; i < posts.length; i++) {
        var p = posts[i].post;
        var c = posts[i].counts;
        if (!p) continue;
        results.push({
          platform: "lemmy",
          title: p.name || "Untitled",
          url: p.ap_id || ("https://lemmy.world/post/" + p.id),
          author: posts[i].creator ? posts[i].creator.name : "",
          timestamp: p.published ? new Date(p.published).getTime() : null,
          body: p.body || "",
          score: c ? c.score : null,
          comments: c ? c.comments : null,
        });
      }
      return { results: results };
    }).catch(function (err) {
      return { results: [], error: "Lemmy: " + err.message };
    });
  }

  // 9. Google News (RSS via CORS proxy)
  function searchGoogleNews(query) {
    var rssUrl = "https://news.google.com/rss/search?q=" + encodeURIComponent(query) + "&hl=en-US&gl=US&ceid=US:en";
    return fetchViaProxy(rssUrl, 10000).then(function (resp) {
      return resp.text();
    }).then(function (xml) {
      var parser = new DOMParser();
      var doc = parser.parseFromString(xml, "text/xml");
      var items = doc.querySelectorAll("item");
      var results = [];
      for (var i = 0; i < items.length && i < 20; i++) {
        var item = items[i];
        var title = item.querySelector("title");
        var link = item.querySelector("link");
        var pubDate = item.querySelector("pubDate");
        var source = item.querySelector("source");
        results.push({
          platform: "googlenews",
          title: title ? title.textContent : "Untitled",
          url: link ? link.textContent : "",
          author: source ? source.textContent : "",
          timestamp: pubDate ? new Date(pubDate.textContent).getTime() : null,
          body: "",
        });
      }
      return { results: results };
    }).catch(function (err) {
      return { results: [], error: "Google News: " + err.message };
    });
  }

  // 10. Archive.org
  function searchArchiveOrg(query) {
    var url = "https://archive.org/advancedsearch.php?q=" + encodeURIComponent(query) +
      "&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=description&fl[]=date&fl[]=downloads&output=json&rows=15&sort[]=downloads+desc";
    return fetchWithTimeout(url, 10000).then(function (resp) {
      if (!resp.ok) throw new Error("Archive.org " + resp.status);
      return resp.json();
    }).then(function (data) {
      var docs = (data.response && data.response.docs) || [];
      var results = [];
      for (var i = 0; i < docs.length; i++) {
        var d = docs[i];
        results.push({
          platform: "archiveorg",
          title: d.title || "Untitled",
          url: "https://archive.org/details/" + encodeURIComponent(d.identifier || ""),
          author: d.creator || "",
          timestamp: d.date ? new Date(d.date).getTime() : null,
          body: d.description ? (typeof d.description === "string" ? d.description : d.description[0] || "") : "",
          score: d.downloads,
        });
      }
      return { results: results };
    }).catch(function (err) {
      return { results: [], error: "Archive.org: " + err.message };
    });
  }

  // 11. ArXiv (Atom API via CORS proxy)
  function searchArxiv(query) {
    var url = "https://export.arxiv.org/api/query?search_query=all:" + encodeURIComponent(query) +
      "&start=0&max_results=15&sortBy=relevance&sortOrder=descending";
    return fetchViaProxy(url, 10000).then(function (resp) {
      return resp.text();
    }).then(function (xml) {
      var parser = new DOMParser();
      var doc = parser.parseFromString(xml, "text/xml");
      var entries = doc.querySelectorAll("entry");
      var results = [];
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var title = entry.querySelector("title");
        var summary = entry.querySelector("summary");
        var published = entry.querySelector("published");
        var link = entry.querySelector('link[title="pdf"]') || entry.querySelector("link");
        var authors = entry.querySelectorAll("author name");
        var authorNames = [];
        for (var j = 0; j < authors.length && j < 3; j++) {
          authorNames.push(authors[j].textContent);
        }
        if (authors.length > 3) authorNames.push("et al.");
        results.push({
          platform: "arxiv",
          title: title ? title.textContent.trim().replace(/\s+/g, " ") : "Untitled",
          url: link ? link.getAttribute("href") : "",
          author: authorNames.join(", "),
          timestamp: published ? new Date(published.textContent).getTime() : null,
          body: summary ? summary.textContent.trim().replace(/\s+/g, " ").slice(0, 300) : "",
        });
      }
      return { results: results };
    }).catch(function (err) {
      return { results: [], error: "ArXiv: " + err.message };
    });
  }

  // 12. Mastodon (trending + hashtag timeline)
  function searchMastodon(query) {
    var tag = query.toLowerCase().replace(/[^a-z0-9]/g, "");
    var url = "https://mastodon.social/api/v1/timelines/tag/" + encodeURIComponent(tag) + "?limit=15";
    return fetchWithTimeout(url, 10000).then(function (resp) {
      if (!resp.ok) throw new Error("Mastodon " + resp.status);
      return resp.json();
    }).then(function (statuses) {
      if (!Array.isArray(statuses)) statuses = [];
      var results = [];
      for (var i = 0; i < statuses.length; i++) {
        var s = statuses[i];
        var text = stripHtml(s.content || "");
        results.push({
          platform: "mastodon",
          title: text.slice(0, 120) || "Post",
          url: s.url || s.uri || "",
          author: s.account ? (s.account.display_name || s.account.username) : "",
          timestamp: s.created_at ? new Date(s.created_at).getTime() : null,
          body: text,
          score: (s.favourites_count || 0) + (s.reblogs_count || 0),
        });
      }
      return { results: results };
    }).catch(function (err) {
      return { results: [], error: "Mastodon: " + err.message };
    });
  }

  // ── Rendering ──

  function showStatus(html, isError) {
    statusEl.innerHTML = html;
    statusEl.classList.remove("hidden", "error");
    if (isError) statusEl.classList.add("error");
  }

  function renderResults() {
    resultsEl.innerHTML = "";
    var maxPer = getArticleCount();
    var platformCounts = {};
    var filtered = [];

    for (var i = 0; i < allResults.length; i++) {
      var plat = allResults[i].platform;
      if (!enabledPlatforms[plat]) continue;
      if (!platformCounts[plat]) platformCounts[plat] = 0;
      if (platformCounts[plat] >= maxPer) continue;
      platformCounts[plat]++;
      filtered.push(allResults[i]);
    }

    if (filtered.length === 0) {
      resultsEl.innerHTML = "";
      return;
    }

    for (var j = 0; j < filtered.length; j++) {
      var r = filtered[j];
      var card = document.createElement("div");
      card.className = "result-card card-" + r.platform;

      var metaParts = [];
      if (r.author) metaParts.push("by " + escapeHtml(r.author));
      if (r.subreddit) metaParts.push(escapeHtml(r.subreddit));
      if (r.language) metaParts.push(escapeHtml(r.language));
      if (r.points != null) metaParts.push(r.points + " pts");
      if (r.score != null) metaParts.push(r.score + (r.platform === "github" ? " stars" : " votes"));
      if (r.comments != null) metaParts.push(r.comments + " comments");
      if (r.tags && r.tags.length) metaParts.push(r.tags.slice(0, 3).join(", "));
      if (r.wordcount) metaParts.push(r.wordcount + " words");

      var metaHtml = "";
      for (var k = 0; k < metaParts.length; k++) {
        metaHtml += "<span>" + metaParts[k] + "</span>";
      }

      var bodyHtml = "";
      if (r.body) {
        var preview = r.body.length > 200 ? r.body.slice(0, 200) + "..." : r.body;
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
    var labels = {
      hackernews: "Hacker News", reddit: "Reddit", youtube: "YouTube",
      devto: "Dev.to", github: "GitHub", stackoverflow: "StackOverflow",
      wikipedia: "Wikipedia", lemmy: "Lemmy", googlenews: "Google News",
      archiveorg: "Archive.org", arxiv: "ArXiv", mastodon: "Mastodon"
    };
    return labels[p] || p;
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
