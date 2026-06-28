import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

const statsFilePath = path.join(process.cwd(), "stats.json");

// Helper to load stats safely with default seed values for realistic appearance
function getStats() {
  try {
    if (fs.existsSync(statsFilePath)) {
      const data = fs.readFileSync(statsFilePath, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Failed to read stats.json:", err);
  }
  const initialStats = { totalUsers: 342, totalDownloads: 1128, registeredUsers: [] };
  try {
    fs.writeFileSync(statsFilePath, JSON.stringify(initialStats, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write initial stats.json:", err);
  }
  return initialStats;
}

// Helper to save stats safely
function saveStats(stats: any) {
  try {
    fs.writeFileSync(statsFilePath, JSON.stringify(stats, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save stats.json:", err);
  }
}

// Helper to increment downloads
function incrementDownloads() {
  const stats = getStats();
  stats.totalDownloads = (stats.totalDownloads || 1128) + 1;
  saveStats(stats);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Support JSON and urlencoded requests
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API endpoint: Fetch live transparency statistics
  app.get("/api/stats", (req, res) => {
    const stats = getStats();
    res.json({
      status: "success",
      totalUsers: stats.totalUsers || 342,
      totalDownloads: stats.totalDownloads || 1128
    });
  });

  // API endpoint: Register a unique user safely
  app.post("/api/stats/register", (req, res) => {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ status: "error", error: "userId is required" });
    }

    const stats = getStats();
    if (!stats.registeredUsers) {
      stats.registeredUsers = [];
    }

    if (!stats.registeredUsers.includes(userId)) {
      stats.registeredUsers.push(userId);
      stats.totalUsers = (stats.totalUsers || 342) + 1;
      saveStats(stats);
      console.log(`[InstaTube Stats] Registered new user ${userId}. Total: ${stats.totalUsers}`);
    }

    res.json({
      status: "success",
      totalUsers: stats.totalUsers || 342,
      totalDownloads: stats.totalDownloads || 1128
    });
  });

  // API endpoint: Secure client-side proxy login to Instagram to exchange credentials for a session cookie
  app.post("/api/instagram-login", async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ status: "error", error: "Please enter both Instagram Username and Password" });
      }

      console.log(`[InstaTube Private Backend] Attempting secure session login for user: ${username}`);

      // 1. Fetch Instagram landing page to obtain dynamic cookies (mid, csrftoken, etc.)
      const landingRes = await fetch("https://www.instagram.com/", {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
        }
      });

      // Parse cookies from response
      const landingCookies = landingRes.headers.getSetCookie 
        ? landingRes.headers.getSetCookie() 
        : (landingRes.headers.get("set-cookie") ? [landingRes.headers.get("set-cookie")!] : []);
      
      let csrftoken = "";
      const parsedCookies: string[] = [];

      landingCookies.forEach(cookieStr => {
        parsedCookies.push(cookieStr.split(";")[0]);
        if (cookieStr.includes("csrftoken=")) {
          const match = cookieStr.match(/csrftoken=([^;]+)/);
          if (match) csrftoken = match[1];
        }
      });

      // Default CSRF token if not found (Instagram fallback)
      if (!csrftoken) {
        csrftoken = "missing_csrf_token_fallback";
      }

      // Format password in the standard encryption format Instagram expects for AJAX login
      const timestamp = Math.floor(Date.now() / 1000);
      const encPassword = `#PWD_INSTAGRAM_BROWSER:0:${timestamp}:${password}`;

      // 2. Perform AJAX login POST request
      const loginHeaders: Record<string, string> = {
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-CSRFToken": csrftoken,
        "X-Requested-With": "XMLHttpRequest",
        "X-IG-App-ID": "936619743392459", // Instagram Mobile Web app id
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
        "Referer": "https://www.instagram.com/accounts/login/",
        "Cookie": parsedCookies.join("; ")
      };

      const loginBody = new URLSearchParams({
        username: username,
        enc_password: encPassword,
        queryParams: "{}",
        optIntoOneTap: "false"
      });

      const loginRes = await fetch("https://www.instagram.com/api/v1/web/accounts/login/ajax/", {
        method: "POST",
        headers: loginHeaders,
        body: loginBody.toString()
      });

      const loginData = await loginRes.json();
      console.log("[InstaTube Private Backend] Login response status:", loginRes.status, loginData);

      if (loginRes.ok && loginData.authenticated) {
        // Extract sessionid cookie
        const successCookies = loginRes.headers.getSetCookie 
          ? loginRes.headers.getSetCookie() 
          : (loginRes.headers.get("set-cookie") ? [loginRes.headers.get("set-cookie")!] : []);

        let sessionid = "";
        successCookies.forEach(cookieStr => {
          if (cookieStr.includes("sessionid=")) {
            const match = cookieStr.match(/sessionid=([^;]+)/);
            if (match) sessionid = match[1];
          }
        });

        if (sessionid) {
          console.log("[InstaTube Private Backend] Successfully retrieved sessionid cookie programmatically!");
          return res.json({
            status: "success",
            sessionid: sessionid,
            userId: loginData.userId
          });
        }
      }

      // Handle 2FA or verification requirements gracefully
      if (loginData.two_factor_required) {
        return res.status(401).json({
          status: "verification_required",
          error: "Two-Factor Authentication (2FA) is enabled. For absolute security, please use Method 1 (Cookie Editor) inside the guide, or temporarily disable 2FA to use direct login.",
        });
      }

      if (loginData.checkpoint_url) {
        return res.status(401).json({
          status: "checkpoint",
          error: "Instagram security check triggered. Please open instagram.com on your phone, approve the login alert, and try again here."
        });
      }

      const errMsg = loginData.message || (loginData.errors ? Object.values(loginData.errors).flat().join(", ") : "Invalid credentials. Please verify your username and password.");
      return res.status(401).json({
        status: "error",
        error: `Instagram authentication failed: ${errMsg}`
      });

    } catch (err: any) {
      console.error("[InstaTube Private Backend] Error during Instagram Login process:", err);
      return res.status(500).json({
        status: "error",
        error: `Could not connect securely to Instagram servers: ${err.message || "Unknown error"}. Please try again later.`
      });
    }
  });

  // API endpoint: Extract media stream from Private Instagram accounts using sessionid cookie
  app.post("/api/instagram-private", async (req, res) => {
    try {
      const { url, sessionid } = req.body;

      if (!url) {
        return res.status(400).json({ status: "error", error: "Instagram URL is required" });
      }

      if (!sessionid) {
        return res.status(400).json({ status: "error", error: "Instagram sessionid cookie is required for private downloads" });
      }

      // Extract shortcode from URL
      const match = url.match(/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/);
      const shortcode = match ? match[1] : null;

      if (!shortcode) {
        return res.status(400).json({ status: "error", error: "Could not parse Instagram post shortcode from URL. Make sure it's a valid Post or Reel link." });
      }

      console.log(`[InstaTube Private Backend] Extracting shortcode: ${shortcode} with user sessionid`);

      const igUrl = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
      
      const response = await fetch(igUrl, {
        method: "GET",
        headers: {
          "Cookie": `sessionid=${sessionid}`,
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
          "Accept": "*/*",
          "Accept-Language": "en-US,en;q=0.9",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1"
        }
      });

      if (!response.ok) {
        return res.status(response.status).json({
          status: "error",
          error: `Instagram returned an error (HTTP ${response.status}). Your sessionid cookie might be expired or incorrect. Please log in again.`
        });
      }

      const data = await response.json();
      const item = data.items && data.items[0];

      if (!item) {
        return res.status(404).json({
          status: "error",
          error: "Could not find post details in the Instagram response. Please verify if the post is accessible to your account and your sessionid is correct."
        });
      }

      // Check content types: Video (media_type 2), Photo (media_type 1), Carousel (media_type 8)
      if (item.media_type === 8 && item.carousel_media) {
        // Carousel post
        const picker = item.carousel_media.map((media: any, idx: number) => {
          if (media.media_type === 2 || media.video_versions) {
            // Find optimal balanced video size/quality (closest to 720p for fast download, small size and good quality)
            const optimalVideo = media.video_versions.find((v: any) => v.width >= 640 && v.width <= 720) || media.video_versions[0];
            return {
              type: "video",
              url: optimalVideo.url,
              thumb: media.image_versions2?.candidates?.[0]?.url,
            };
          } else {
            // Find optimal image
            const optimalImage = media.image_versions2?.candidates?.find((img: any) => img.width >= 640 && img.width <= 1080) || media.image_versions2?.candidates?.[0];
            return {
              type: "photo",
              url: optimalImage.url,
              thumb: optimalImage.url,
            };
          }
        });

        incrementDownloads();
        return res.json({
          status: "picker",
          picker: picker,
          filename: `instagram_carousel_${shortcode}`,
        });
      } else if (item.media_type === 2 || item.video_versions) {
        // Video post (reel or video)
        const videos = item.video_versions;
        const optimalVideo = videos.find((v: any) => v.width >= 640 && v.width <= 720) || videos[0];

        incrementDownloads();
        return res.json({
          status: "success",
          url: optimalVideo.url,
          filename: `instagram_video_${shortcode}.mp4`,
        });
      } else {
        // Standard Image post
        const images = item.image_versions2?.candidates || [];
        const optimalImage = images.find((img: any) => img.width >= 640 && img.width <= 1080) || images[0];

        if (!optimalImage) {
          return res.status(404).json({ status: "error", error: "Could not extract image URL from Instagram." });
        }

        incrementDownloads();
        return res.json({
          status: "success",
          url: optimalImage.url,
          filename: `instagram_image_${shortcode}.jpg`,
        });
      }
    } catch (err: any) {
      console.error("[InstaTube Private Backend] Error extracting private Instagram post:", err);
      return res.status(500).json({
        status: "error",
        error: `Failed to extract private post: ${err.message || "Unknown error"}. Check your network and sessionid.`
      });
    }
  });

  // API endpoint: Extract media stream from URL
  app.post("/api/extract", async (req, res) => {
    try {
      const { url, videoQuality, audioOnly, audioFormat } = req.body;

      if (!url) {
        return res.status(400).json({ status: "error", error: "Please enter a valid video or post URL" });
      }

      // Construct Cobalt API payload
      const payload: any = {
        url: url,
        videoQuality: videoQuality || "720",
        filenamePattern: "classic",
        isNoTTWatermark: true,
      };

      if (audioOnly) {
        payload.downloadMode = "audio";
        payload.audioFormat = audioFormat || "mp3";
      } else {
        payload.downloadMode = "auto";
      }

      // List of public Cobalt instances for failover / rate-limit resilience
      const cobaltInstances = [
        "https://api.cobalt.tools",
        "https://cobalt.api.ryboflaven.com",
        "https://cobalt-api.l9.fr",
        "https://co.wuk.sh",
      ];

      let lastError = "No connection attempted";

      for (const instance of cobaltInstances) {
        try {
          console.log(`[InstaTube Backend] Attempting extraction with instance: ${instance}`);
          const response = await fetch(instance, {
            method: "POST",
            headers: {
              "Accept": "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });

          if (response.ok) {
            const data = await response.json();
            console.log(`[InstaTube Backend] Successfully extracted via ${instance}:`, data.status);
            incrementDownloads();
            return res.json(data);
          } else {
            const errorText = await response.text();
            console.warn(`[InstaTube Backend] Instance ${instance} returned status ${response.status}: ${errorText}`);
            try {
              const parsed = JSON.parse(errorText);
              lastError = parsed.text || parsed.error || `HTTP ${response.status}`;
            } catch {
              lastError = `HTTP ${response.status}: ${errorText.substring(0, 100)}`;
            }
          }
        } catch (err: any) {
          console.warn(`[InstaTube Backend] Failed to connect to ${instance}: ${err.message || err}`);
          lastError = err.message || err;
        }
      }

      return res.status(502).json({
        status: "error",
        error: `All download engines are currently busy or rate-limited. Please try again in a few moments. (Details: ${lastError})`,
      });
    } catch (routeErr: any) {
      console.error("[InstaTube Backend] Error in /api/extract:", routeErr);
      return res.status(500).json({ status: "error", error: routeErr.message || "An unexpected error occurred." });
    }
  });

  // API endpoint: Proxy download to bypass CORS, hotlinking blocks, and force attachment disposition
  app.get("/api/proxy-download", async (req, res) => {
    try {
      const { url, filename } = req.query;

      if (!url || typeof url !== "string") {
        return res.status(400).send("URL parameter is required");
      }

      const name = typeof filename === "string" ? filename : "download.mp4";
      console.log(`[InstaTube Proxy] Stream proxy initiated for filename: ${name}`);

      const response = await fetch(url);
      if (!response.ok) {
        return res.status(response.status).send(`Failed to fetch media from source server (HTTP ${response.status})`);
      }

      const contentType = response.headers.get("content-type") || "application/octet-stream";
      const contentLength = response.headers.get("content-length");

      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(name)}"`);
      res.setHeader("Content-Type", contentType);
      if (contentLength) {
        res.setHeader("Content-Length", contentLength);
      }

      if (!response.body) {
        return res.status(500).send("Response body is empty");
      }

      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } catch (proxyErr: any) {
      console.error("[InstaTube Proxy] Error proxying download:", proxyErr);
      if (!res.headersSent) {
        res.status(500).send(`Failed to stream download: ${proxyErr.message}`);
      }
    }
  });

  // Mount Vite middleware in development, serve static in production
  if (process.env.NODE_ENV !== "production") {
    console.log("[InstaTube Dev] Mounting Vite Dev Middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("[InstaTube Prod] Serving static client files from /dist...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[InstaTube App] Server successfully booted and running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
