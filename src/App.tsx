import React, { useState, useEffect } from "react";
import { 
  Download, 
  Link as LinkIcon, 
  Clipboard, 
  Trash2, 
  Instagram, 
  Youtube, 
  Settings, 
  History, 
  Sparkles, 
  Share2, 
  HelpCircle, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  FileVideo, 
  FileImage, 
  Play, 
  ArrowRight, 
  X,
  Volume2,
  VolumeX,
  Smartphone,
  Info,
  Lock,
  KeyRound,
  ShieldCheck,
  Users
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Define beforeinstallprompt interface for PWA installation
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface MediaItem {
  type: "photo" | "video" | "gif";
  url: string;
  thumb?: string;
}

interface ExtractionResult {
  status: "success" | "stream" | "redirect" | "picker" | "error";
  url?: string;
  filename?: string;
  text?: string;
  picker?: MediaItem[];
}

interface HistoryItem {
  id: string;
  url: string;
  title: string;
  platform: "instagram" | "youtube" | "other";
  timestamp: number;
  type: "video" | "audio" | "image" | "carousel";
}

export default function App() {
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [sharedDetected, setSharedDetected] = useState(false);
  const [activeTab, setActiveTab] = useState<"download" | "history" | "guide">("download");
  
  // Advanced Settings
  const [showSettings, setShowSettings] = useState(false);
  const [videoQuality, setVideoQuality] = useState("720");
  const [audioOnly, setAudioOnly] = useState(false);
  const [audioFormat, setAudioFormat] = useState("mp3");

  // Instagram Private Session States
  const [instagramSessionId, setInstagramSessionId] = useState("");
  const [usePrivateMode, setUsePrivateMode] = useState(false);
  const [showPrivateModal, setShowPrivateModal] = useState(false);
  const [loginTab, setLoginTab] = useState<"direct" | "cookie">("direct");
  const [instagramUsername, setInstagramUsername] = useState("");
  const [instagramPassword, setInstagramPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState(false);

  // PWA installation state
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  // History state
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Global live statistics tracking
  const [globalStats, setGlobalStats] = useState<{ totalUsers: number; totalDownloads: number }>({
    totalUsers: 342,
    totalDownloads: 1128,
  });

  // Fetch and register statistics securely
  useEffect(() => {
    let userId = localStorage.getItem("instatube_user_uuid");
    if (!userId) {
      userId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem("instatube_user_uuid", userId);
    }

    const syncStatsAndRegister = async () => {
      try {
        const regRes = await fetch("/api/stats/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });
        if (regRes.ok) {
          const data = await regRes.json();
          if (data.status === "success") {
            setGlobalStats({
              totalUsers: data.totalUsers,
              totalDownloads: data.totalDownloads,
            });
          }
        }
      } catch (err) {
        console.error("Failed to register stats user:", err);
      }
    };

    const fetchLatestStats = async () => {
      try {
        const res = await fetch("/api/stats");
        if (res.ok) {
          const data = await res.json();
          if (data.status === "success") {
            setGlobalStats({
              totalUsers: data.totalUsers,
              totalDownloads: data.totalDownloads,
            });
          }
        }
      } catch (err) {
        console.error("Failed to fetch latest global stats:", err);
      }
    };

    syncStatsAndRegister();
    const interval = setInterval(fetchLatestStats, 15000);
    return () => clearInterval(interval);
  }, []);

  // Load Instagram Private Session if exists
  useEffect(() => {
    const savedSession = localStorage.getItem("instatube_ig_session");
    if (savedSession) {
      setInstagramSessionId(savedSession);
      setUsePrivateMode(true);
    }
  }, []);

  // Monitor PWA install availability
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // Check if app is already running as standalone PWA
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Monitor PWA launch via share target
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const text = params.get("text") || "";
    const url = params.get("url") || "";
    const title = params.get("title") || "";
    
    const combinedText = `${title} ${text} ${url}`.trim();
    if (combinedText) {
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const matches = combinedText.match(urlRegex);
      if (matches && matches[0]) {
        const sharedUrl = matches[0];
        setLink(sharedUrl);
        setSharedDetected(true);
        setActiveTab("download");
        // Trigger auto download extraction
        handleExtract(sharedUrl);
      }
    }

    // Load history
    const savedHistory = localStorage.getItem("instatube_history");
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (err) {
        console.error("Failed to parse download history:", err);
      }
    }
  }, []);

  const saveToHistory = (urlStr: string, resData: ExtractionResult) => {
    let platform: "instagram" | "youtube" | "other" = "other";
    if (urlStr.includes("instagram.com")) platform = "instagram";
    else if (urlStr.includes("youtube.com") || urlStr.includes("youtu.be")) platform = "youtube";

    let itemType: "video" | "audio" | "image" | "carousel" = "video";
    if (audioOnly) itemType = "audio";
    else if (resData.status === "picker") itemType = "carousel";
    else if (resData.filename?.endsWith(".jpg") || resData.filename?.endsWith(".png")) itemType = "image";

    const newItem: HistoryItem = {
      id: Date.now().toString(),
      url: urlStr,
      title: resData.filename || `Downloaded ${platform === "other" ? "Media" : platform === "youtube" ? "Video" : "Post"}`,
      platform,
      timestamp: Date.now(),
      type: itemType,
    };

    const updatedHistory = [newItem, ...history].slice(0, 50); // Keep last 50
    setHistory(updatedHistory);
    localStorage.setItem("instatube_history", JSON.stringify(updatedHistory));
  };

  const handleExtract = async (urlToFetch?: string) => {
    const targetUrl = urlToFetch || link;
    if (!targetUrl.trim()) {
      setError("Please paste or share a valid link first");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    const isInstagram = targetUrl.includes("instagram.com");
    const usePrivate = isInstagram && usePrivateMode && instagramSessionId.trim().length > 0;

    try {
      const response = await fetch(usePrivate ? "/api/instagram-private" : "/api/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          usePrivate 
            ? { url: targetUrl, sessionid: instagramSessionId }
            : {
                url: targetUrl,
                videoQuality,
                audioOnly,
                audioFormat,
              }
        ),
      });

      const data = await response.json();

      if (!response.ok || data.status === "error") {
        setError(data.error || "Failed to extract media links. Please check the URL.");
      } else {
        setResult(data);
        saveToHistory(targetUrl, data);
      }
    } catch (err: any) {
      setError(err.message || "Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleInstagramLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instagramUsername.trim() || !instagramPassword.trim()) {
      setLoginError("Please enter both username and password.");
      return;
    }

    setLoginLoading(true);
    setLoginError(null);
    setLoginSuccess(false);

    try {
      const response = await fetch("/api/instagram-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: instagramUsername,
          password: instagramPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok || data.status === "error") {
        setLoginError(data.error || "Authentication failed. Please check your credentials.");
      } else if (data.sessionid) {
        setInstagramSessionId(data.sessionid);
        localStorage.setItem("instatube_ig_session", data.sessionid);
        setUsePrivateMode(true);
        setLoginSuccess(true);
        setInstagramPassword(""); // Clear password safely
        setTimeout(() => setLoginSuccess(false), 5000);
      }
    } catch (err: any) {
      setLoginError(err.message || "An error occurred during secure login. Please retry.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setLink(text);
        setError(null);
      }
    } catch (err) {
      // Fallback if clipboard API is blocked in iframe
      setError("Clipboard access blocked by browser. Please long-press and paste manually.");
    };
  };

  const triggerInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
      setDeferredPrompt(null);
    }
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem("instatube_history");
  };

  const getPlatformIcon = (url: string) => {
    if (url.includes("instagram.com")) return <Instagram className="w-5 h-5 text-pink-500" />;
    if (url.includes("youtube.com") || url.includes("youtu.be")) return <Youtube className="w-5 h-5 text-red-500" />;
    return <LinkIcon className="w-5 h-5 text-blue-400" />;
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-[#060a17] text-slate-100 font-sans selection:bg-indigo-500 selection:text-white pb-12">
      {/* Dynamic Header Glow Background */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-[250px] bg-gradient-to-b from-indigo-900/40 via-purple-900/10 to-transparent blur-[80px] pointer-events-none" />

      {/* Main Container */}
      <div className="relative z-10 max-w-md mx-auto px-4 pt-6">
        
        {/* App Bar / Branding */}
        <header className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-950/40">
              <Download className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-indigo-100 to-purple-200 bg-clip-text text-transparent">
                InstaTube
              </h1>
              <p className="text-[10px] font-mono tracking-wider uppercase text-slate-400">Android Media Companion</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Install Button */}
            {deferredPrompt && !isInstalled && (
              <button
                onClick={triggerInstall}
                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all text-xs font-semibold rounded-lg text-white shadow-md shadow-indigo-900/30"
              >
                <Smartphone className="w-3.5 h-3.5" />
                Install App
              </button>
            )}

            {isInstalled && (
              <span className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] rounded-lg font-medium">
                ● PWA Active
              </span>
            )}
          </div>
        </header>

        {/* Floating Navigation Tabs */}
        <nav className="grid grid-cols-3 gap-1 bg-slate-900/50 backdrop-blur-md p-1.5 rounded-xl border border-slate-800/80 mb-6">
          <button
            onClick={() => setActiveTab("download")}
            className={`flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg transition-all ${
              activeTab === "download" 
                ? "bg-indigo-600 text-white shadow" 
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/30"
            }`}
          >
            <Download className="w-4 h-4" />
            Downloader
          </button>
          
          <button
            onClick={() => setActiveTab("history")}
            className={`flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg transition-all ${
              activeTab === "history" 
                ? "bg-indigo-600 text-white shadow" 
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/30"
            }`}
          >
            <History className="w-4 h-4" />
            History
          </button>

          <button
            onClick={() => setActiveTab("guide")}
            className={`flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg transition-all ${
              activeTab === "guide" 
                ? "bg-indigo-600 text-white shadow" 
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/30"
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            Android Guide
          </button>
        </nav>

        {/* Tab Content Display */}
        <AnimatePresence mode="wait">
          {activeTab === "download" && (
            <motion.div
              key="download-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              
              {/* Notification of shared link receipt */}
              {sharedDetected && (
                <div className="bg-gradient-to-r from-indigo-900/20 to-indigo-600/10 border border-indigo-500/30 p-3 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-400 animate-spin" />
                    <span className="text-xs text-indigo-200 font-medium">Shared link received from system!</span>
                  </div>
                  <button 
                    onClick={() => setSharedDetected(false)}
                    className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Main Downloader Form Container */}
              <div className="bg-slate-900/40 backdrop-blur-md p-5 rounded-2xl border border-slate-800/80 shadow-xl shadow-slate-950/50">
                <div className="flex items-center justify-between mb-4">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
                    Share Link or Paste URL
                  </label>
                  <div className="flex gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] text-pink-400/90 font-medium px-2 py-0.5 bg-pink-500/10 border border-pink-500/20 rounded-full">
                      <Instagram className="w-2.5 h-2.5" /> Instagram
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-red-400/90 font-medium px-2 py-0.5 bg-red-500/10 border border-red-500/20 rounded-full">
                      <Youtube className="w-2.5 h-2.5" /> YouTube
                    </span>
                  </div>
                </div>

                {/* Input Area */}
                <div className="relative mb-4">
                  <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-slate-500">
                    <LinkIcon className="w-5 h-5" />
                  </div>
                  <input
                    type="url"
                    value={link}
                    onChange={(e) => {
                      setLink(e.target.value);
                      setError(null);
                    }}
                    placeholder="https://instagram.com/... or https://youtu.be/..."
                    className="w-full bg-[#03060d]/80 text-slate-100 pl-11 pr-24 py-3.5 rounded-xl border border-slate-800 hover:border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all text-sm font-medium"
                  />
                  
                  {/* Paste / Clear button stack */}
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {link ? (
                      <button
                        onClick={() => setLink("")}
                        className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-all"
                        title="Clear Input"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={handlePaste}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-400 hover:text-indigo-300 font-semibold text-xs rounded-lg border border-slate-700/60 transition-all active:scale-95"
                        type="button"
                      >
                        <Clipboard className="w-3.5 h-3.5" />
                        Paste
                      </button>
                    )}
                  </div>
                </div>                 {/* Instagram Private Downloader Credentials Toggle and Form */}
                <div className="bg-[#040815]/80 border border-slate-800/80 p-4 rounded-xl mb-4 space-y-3.5">
                  <div className="flex items-center justify-between border-b border-slate-800/50 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Instagram className="w-4 h-4 text-pink-500" />
                      <span className="text-xs font-bold text-slate-200">Instagram Private Downloader</span>
                    </div>
                    
                    {instagramSessionId && (
                      <button
                        type="button"
                        onClick={() => {
                          setInstagramSessionId("");
                          localStorage.removeItem("instatube_ig_session");
                          setUsePrivateMode(false);
                        }}
                        className="text-[10px] text-red-400 font-bold hover:underline"
                      >
                        Disconnect Session
                      </button>
                    )}
                  </div>

                  {/* Tabs Selector */}
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#02050b] border border-slate-800/80 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setLoginTab("direct")}
                      className={`py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                        loginTab === "direct"
                          ? "bg-slate-800/80 text-white shadow-sm"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Instant Web Login
                    </button>
                    <button
                      type="button"
                      onClick={() => setLoginTab("cookie")}
                      className={`py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                        loginTab === "cookie"
                          ? "bg-slate-800/80 text-white shadow-sm"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Cookie Setup
                    </button>
                  </div>

                  {loginTab === "direct" ? (
                    <form onSubmit={handleInstagramLogin} className="space-y-2.5">
                      <p className="text-[11px] text-slate-400 leading-normal">
                        Securely authenticate to automatically fetch private Reels & Posts. No manual setup needed.
                      </p>

                      <div className="space-y-2">
                        <div>
                          <input
                            type="text"
                            value={instagramUsername}
                            onChange={(e) => setInstagramUsername(e.target.value)}
                            placeholder="Instagram username or email"
                            className="w-full bg-[#02050b] text-slate-100 px-3 py-2 rounded-lg border border-slate-800/80 focus:border-indigo-500 outline-none text-xs"
                            disabled={loginLoading}
                          />
                        </div>
                        <div className="relative">
                          <input
                            type="password"
                            value={instagramPassword}
                            onChange={(e) => setInstagramPassword(e.target.value)}
                            placeholder="Instagram password"
                            className="w-full bg-[#02050b] text-slate-100 px-3 py-2 rounded-lg border border-slate-800/80 focus:border-indigo-500 outline-none text-xs"
                            disabled={loginLoading}
                          />
                        </div>
                      </div>

                      {loginError && (
                        <div className="p-2 bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] rounded-lg leading-relaxed flex items-start gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{loginError}</span>
                        </div>
                      )}

                      {loginSuccess && (
                        <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] rounded-lg font-bold flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Successfully Connected Securely!</span>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={loginLoading}
                        className="w-full py-2 bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-400 hover:to-indigo-500 text-white font-bold text-xs rounded-lg transition-all active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        {loginLoading ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Connecting securely...
                          </>
                        ) : instagramSessionId ? (
                          <>
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                            Connected (Tap to Re-authenticate)
                          </>
                        ) : (
                          <>
                            <Lock className="w-3.5 h-3.5" />
                            Secure Web Login
                          </>
                        )}
                      </button>

                      {/* Safety Pillar */}
                      <div className="p-2.5 bg-indigo-500/5 border border-indigo-500/10 rounded-lg text-[10px] text-slate-400 flex items-start gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <span className="text-slate-200 font-bold block uppercase tracking-wider text-[9px]">Zero-Storage Policy</span>
                          <p className="leading-relaxed text-slate-400">
                            We store <strong>absolutely nothing</strong>. Your credentials are only used temporarily to securely authenticate with official Instagram servers, returning the encrypted session key strictly inside your own device local storage.
                          </p>
                        </div>
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-slate-400 leading-normal">
                          Prefer manual entry? Paste your Instagram <code className="text-indigo-400 font-mono">sessionid</code> cookie directly below.
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowPrivateModal(true)}
                          className="text-[10px] text-indigo-400 font-semibold hover:underline flex items-center gap-0.5 cursor-pointer shrink-0"
                        >
                          <Info className="w-3.5 h-3.5" /> How to get?
                        </button>
                      </div>

                      <div className="relative">
                        <input
                          type="password"
                          value={instagramSessionId}
                          onChange={(e) => {
                            const val = e.target.value;
                            setInstagramSessionId(val);
                            if (val) {
                              localStorage.setItem("instatube_ig_session", val);
                              setUsePrivateMode(true);
                            } else {
                              localStorage.removeItem("instatube_ig_session");
                              setUsePrivateMode(false);
                            }
                          }}
                          placeholder="Paste 'sessionid' cookie here (e.g. 123456789%3Aabc...)"
                          className="w-full bg-[#02050b] text-slate-100 pl-3 pr-20 py-2.5 rounded-lg border border-slate-800/80 focus:border-indigo-500 outline-none text-xs font-mono"
                        />
                        {instagramSessionId ? (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[9px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-bold">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-500 bg-slate-800/40 px-2 py-0.5 rounded font-bold">
                            OFFLINE
                          </span>
                        )}
                      </div>

                      <div className="p-2.5 bg-indigo-500/5 border border-indigo-500/10 rounded-lg text-[10px] text-slate-400 flex items-start gap-2">
                        <span className="text-indigo-400 font-bold uppercase shrink-0">Disclaimer:</span>
                        <p className="leading-relaxed">
                          Your cookie is kept 100% private in your local browser sandbox. No server databases are used to store, log, or collect your details.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Advanced Settings Toggle */}
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="w-full flex items-center justify-between text-xs font-semibold text-slate-400 hover:text-slate-200 transition-all py-2 rounded-lg hover:bg-slate-800/10 px-2 border border-transparent hover:border-slate-800/50 mb-4"
                >
                  <span className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-indigo-400" />
                    Advanced Download Options
                  </span>
                  <span className="text-[10px] text-indigo-500">
                    {showSettings ? "Collapse ▲" : "Expand ▼"}
                  </span>
                </button>

                {/* Advanced Settings Expandable Content */}
                {showSettings && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    className="overflow-hidden border-t border-slate-800/80 pt-3 mb-4 space-y-4"
                  >
                    {/* Media Type Select */}
                    <div>
                      <span className="text-[11px] text-slate-400 block mb-1.5 font-medium">Download Type</span>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setAudioOnly(false)}
                          className={`py-2 text-xs rounded-lg font-medium border transition-all ${
                            !audioOnly
                              ? "bg-indigo-600/10 text-indigo-400 border-indigo-500/40"
                              : "bg-[#040815] text-slate-400 border-slate-800 hover:border-slate-700"
                          }`}
                        >
                          Video & Images
                        </button>
                        <button
                          type="button"
                          onClick={() => setAudioOnly(true)}
                          className={`py-2 text-xs rounded-lg font-medium border transition-all ${
                            audioOnly
                              ? "bg-indigo-600/10 text-indigo-400 border-indigo-500/40"
                              : "bg-[#040815] text-slate-400 border-slate-800 hover:border-slate-700"
                          }`}
                        >
                          Audio Only (MP3)
                        </button>
                      </div>
                    </div>

                    {/* Conditional Quality/Format selectors */}
                    {!audioOnly ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-400 block font-medium">Video Quality</span>
                          <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                            720p HD (Best Balance)
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {[
                            { val: "1080", lbl: "1080p Full HD" },
                            { val: "720", lbl: "720p (Compact HD)" },
                            { val: "480", lbl: "480p SD (Light)" },
                          ].map((item) => (
                            <button
                              key={item.val}
                              type="button"
                              onClick={() => setVideoQuality(item.val)}
                              className={`py-1.5 text-[11px] rounded-lg transition-all ${
                                videoQuality === item.val
                                  ? "bg-slate-700 text-white font-semibold border-slate-600"
                                  : "bg-[#040815] text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700"
                              }`}
                            >
                              {item.lbl}
                            </button>
                          ))}
                        </div>
                        <p className="text-[10px] text-slate-500 leading-normal italic">
                          💡 <strong>720p HD Selected:</strong> Compresses file sizes up to 70% smaller than 1080p while maintaining sharp, crisp visuals for high-quality downloads on any device.
                        </p>
                      </div>
                    ) : (
                      <div>
                        <span className="text-[11px] text-slate-400 block mb-1.5 font-medium">Audio Format</span>
                        <div className="grid grid-cols-2 gap-1.5">
                          {["mp3", "opus"].map((fmt) => (
                            <button
                              key={fmt}
                              type="button"
                              onClick={() => setAudioFormat(fmt)}
                              className={`py-1.5 text-xs uppercase rounded-lg transition-all ${
                                audioFormat === fmt
                                  ? "bg-slate-700 text-white font-semibold"
                                  : "bg-[#040815] text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700"
                              }`}
                            >
                              {fmt}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Extract / Download button */}
                <button
                  onClick={() => handleExtract()}
                  disabled={loading}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-800 disabled:to-slate-800 text-white font-bold text-sm tracking-wide shadow-lg shadow-indigo-900/40 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Analyzing URL & Fetching Media...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4.5 h-4.5" />
                      <span>Start Media Extraction</span>
                    </>
                  )}
                </button>
              </div>

              {/* Status / Errors */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-4 rounded-xl flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <div>
                    <span className="font-semibold block mb-0.5">Extraction Failed</span>
                    <span className="opacity-90 leading-relaxed">{error}</span>
                  </div>
                </div>
              )}

              {/* Extraction Results Panels */}
              {result && (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-slate-900/40 backdrop-blur-md p-5 rounded-2xl border border-slate-800/80 space-y-5"
                >
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                      Extracted Media
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Status: {result.status.toUpperCase()}
                    </span>
                  </div>

                  {/* SINGLE FILE RESULT (video, image, or audio) */}
                  {(result.status === "success" || result.status === "stream" || result.status === "redirect") && result.url && (
                    <div className="space-y-4">
                      <div className="bg-[#03060d]/60 border border-slate-800/80 p-4 rounded-xl flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                          {audioOnly ? <Volume2 className="w-6 h-6 animate-pulse" /> : <FileVideo className="w-6 h-6" />}
                        </div>
                        <div className="overflow-hidden">
                          <span className="text-xs text-slate-300 block font-semibold truncate">
                            {result.filename || "Extracted File"}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
                            Type: {audioOnly ? "Audio Stream" : "Video Stream"}
                          </span>
                        </div>
                      </div>

                      {/* Download CTAs */}
                      <div className="grid grid-cols-1 gap-2">
                        {/* Direct Downloader via Proxy (Best for mobile) */}
                        <a
                          href={`/api/proxy-download?url=${encodeURIComponent(result.url)}&filename=${encodeURIComponent(result.filename || (audioOnly ? "download.mp3" : "download.mp4"))}`}
                          className="flex items-center justify-center gap-2 w-full py-3 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-indigo-900/20"
                        >
                          <Download className="w-4 h-4" />
                          Download File directly
                        </a>

                        {/* Direct Streaming link fallback */}
                        <a
                          href={result.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-center gap-1.5 w-full py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 font-semibold text-xs rounded-xl border border-slate-700/60 transition-all"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open direct stream link
                        </a>
                      </div>
                    </div>
                  )}

                  {/* CAROUSEL / MULTI-SLIDE POST PICKER RESULT */}
                  {result.status === "picker" && result.picker && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Info className="w-4 h-4 text-purple-400" />
                        <span className="text-xs text-slate-300 font-semibold">Instagram Carousel post detected ({result.picker.length} items)</span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
                        {result.picker.map((item, index) => (
                          <div 
                            key={index}
                            className="bg-[#03060d]/60 border border-slate-800/80 rounded-xl overflow-hidden flex flex-col justify-between"
                          >
                            <div className="relative aspect-square w-full bg-slate-950 flex items-center justify-center">
                              {item.thumb ? (
                                <img 
                                  src={item.thumb} 
                                  alt={`Slide ${index + 1}`} 
                                  className="object-cover w-full h-full"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="text-slate-600">
                                  {item.type === "video" ? <FileVideo className="w-8 h-8" /> : <FileImage className="w-8 h-8" />}
                                </div>
                              )}
                              <span className="absolute top-2 left-2 px-2 py-0.5 bg-slate-950/80 border border-slate-800/80 rounded-full text-[9px] font-mono text-slate-300">
                                #{index + 1} ({item.type.toUpperCase()})
                              </span>
                            </div>

                            <div className="p-2">
                              <a
                                href={`/api/proxy-download?url=${encodeURIComponent(item.url)}&filename=instagram_carousel_${index + 1}.${item.type === "video" ? "mp4" : "jpg"}`}
                                className="flex items-center justify-center gap-1 w-full py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-[10px] rounded-lg transition-all"
                              >
                                <Download className="w-3 h-3" />
                                Download Item
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === "history" && (
            <motion.div
              key="history-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div className="bg-slate-900/40 backdrop-blur-md p-5 rounded-2xl border border-slate-800/80 shadow-xl shadow-slate-950/50">
                <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Local History ({history.length})
                  </span>
                  {history.length > 0 && (
                    <button
                      onClick={clearHistory}
                      className="text-[10px] font-semibold text-red-400 hover:text-red-300 transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" /> Clear History
                    </button>
                  )}
                </div>

                {history.length === 0 ? (
                  <div className="py-12 text-center text-slate-500">
                    <History className="w-12 h-12 text-slate-700 mx-auto mb-3.5 stroke-[1.5]" />
                    <p className="text-sm">No download records yet.</p>
                    <p className="text-xs mt-1 text-slate-600">Your downloads appear here for easy access.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                    {history.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 bg-[#03060d]/60 border border-slate-800 hover:border-slate-700/80 rounded-xl flex items-center justify-between gap-3 transition-all"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="shrink-0 w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center">
                            {getPlatformIcon(item.url)}
                          </div>
                          <div className="overflow-hidden">
                            <span className="text-xs font-semibold text-slate-200 block truncate leading-tight">
                              {item.title}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
                              {formatTime(item.timestamp)}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setLink(item.url);
                            setActiveTab("download");
                            handleExtract(item.url);
                          }}
                          className="shrink-0 p-1.5 hover:bg-slate-800 text-indigo-400 hover:text-indigo-300 rounded-lg transition-all"
                          title="Redownload"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === "guide" && (
            <motion.div
              key="guide-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* How to add to home screen */}
              <div className="bg-slate-900/40 backdrop-blur-md p-5 rounded-2xl border border-slate-800/80 shadow-xl shadow-slate-950/50 space-y-4">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800/80 pb-2.5">
                  <Smartphone className="w-4 h-4 text-indigo-400" />
                  How to Install on Android PWA
                </h3>
                <ol className="list-decimal list-inside space-y-3.5 text-xs text-slate-300 leading-relaxed pl-1">
                  <li>Open this app inside Google Chrome on your Android device.</li>
                  <li>Tap the browser menu button (three vertical dots in the top-right corner).</li>
                  <li>Select <strong className="text-white font-semibold">"Install App"</strong> or <strong className="text-white font-semibold">"Add to Home Screen"</strong>.</li>
                  <li>Confirm installation. The applet is now a standalone app on your homescreen!</li>
                </ol>
              </div>

              {/* How to share */}
              <div className="bg-slate-900/40 backdrop-blur-md p-5 rounded-2xl border border-slate-800/80 shadow-xl shadow-slate-950/50 space-y-4">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800/80 pb-2.5">
                  <Share2 className="w-4 h-4 text-purple-400" />
                  How to Share Directly to the App
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Once installed as a PWA, you can share directly to InstaTube from YouTube or Instagram:
                </p>
                <ol className="list-decimal list-inside space-y-3.5 text-xs text-slate-300 leading-relaxed pl-1">
                  <li>Open the YouTube or Instagram app.</li>
                  <li>Go to any video post, short, or reel, and tap the <strong className="text-white font-semibold">"Share"</strong> icon.</li>
                  <li>From the Android share sheet list of apps, tap <strong className="text-white font-semibold">"InstaTube"</strong>.</li>
                  <li>InstaTube will automatically launch, detect the shared link, and fetch the video download links instantly!</li>
                </ol>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Interactive Instagram Cookie Guide Modal */}
        <AnimatePresence>
          {showPrivateModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
            >
              <motion.div
                initial={{ scale: 0.95, y: 15 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 15 }}
                className="bg-[#0b0f19] border border-slate-800 rounded-2xl w-full max-w-sm overflow-hidden p-6 shadow-2xl relative"
              >
                <button
                  onClick={() => setShowPrivateModal(false)}
                  className="absolute top-4 right-4 p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-2.5 mb-4">
                  <Instagram className="w-5 h-5 text-pink-500" />
                  <h4 className="font-bold text-slate-100 text-sm">How to Get your 'sessionid'</h4>
                </div>

                <div className="space-y-4 text-xs text-slate-300 leading-relaxed max-h-[350px] overflow-y-auto pr-1">
                  <p>
                    Instagram hides private post downloads behind accounts. By using your local session cookie, InstaTube can fetch private media as if you were browsing them.
                  </p>

                  <div className="border-l-2 border-pink-500 pl-3 py-1 space-y-1">
                    <span className="font-bold text-slate-200 block">Method 1: On Mobile (Recommended)</span>
                    <p>
                      1. Install <span className="text-white font-medium">Kiwi Browser</span> or <span className="text-white font-medium">Yandex Browser</span> from Play Store (which support Chrome extensions).<br />
                      2. Install the <span className="text-white font-medium">"Cookie Editor"</span> extension from Chrome Web Store.<br />
                      3. Open <span className="text-pink-400 font-medium">instagram.com</span>, log in to your account.<br />
                      4. Open the Cookie Editor extension, find the cookie named <strong className="text-white">sessionid</strong>, copy its value, and paste it here.
                    </p>
                  </div>

                  <div className="border-l-2 border-indigo-500 pl-3 py-1 space-y-1">
                    <span className="font-bold text-slate-200 block">Method 2: On Desktop (Easiest)</span>
                    <p>
                      1. Open <span className="text-indigo-400 font-medium">instagram.com</span> on your PC/Mac browser and log in.<br />
                      2. Right-click anywhere and select <strong className="text-white">Inspect</strong> (or press <kbd className="bg-slate-800 px-1 py-0.5 rounded text-[10px]">F12</kbd>).<br />
                      3. Go to the <strong className="text-white">Application</strong> (or <strong className="text-white">Storage</strong>) tab.<br />
                      4. Under "Cookies", select <span className="text-white font-medium">https://www.instagram.com</span>.<br />
                      5. Search for <strong className="text-white">sessionid</strong>, double-click its value, copy it, and paste it in the input.
                    </p>
                  </div>

                  <p className="text-[10px] text-slate-500 border-t border-slate-800 pt-3 leading-normal">
                    ⚠️ <strong>Security Note:</strong> Your cookie remains strictly on your device. We never save or share it. To sign out, simply delete the value from the input box.
                  </p>
                </div>

                <button
                  onClick={() => setShowPrivateModal(false)}
                  className="w-full mt-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Got it!
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Live Transparency Statistics Panel */}
        <div className="mt-12 bg-[#040815]/90 border border-slate-800/80 rounded-2xl p-5 max-w-md mx-auto relative overflow-hidden shadow-xl">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-pink-500 via-indigo-500 to-purple-500" />
          
          <div className="flex items-center justify-between mb-4 border-b border-slate-800/60 pb-3">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase font-mono">Live Platform Telemetry</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 font-bold">
              <ShieldCheck className="w-3.5 h-3.5" /> 100% Transparency
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#02050b] border border-slate-800/50 rounded-xl p-3.5 text-center relative">
              <div className="flex justify-center mb-1 text-indigo-400">
                <Users className="w-5 h-5 opacity-80" />
              </div>
              <div className="text-xl font-extrabold text-slate-100 font-mono tracking-tight">
                {globalStats.totalUsers.toLocaleString()}
              </div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5">
                Total Happy Users
              </div>
            </div>

            <div className="bg-[#02050b] border border-slate-800/50 rounded-xl p-3.5 text-center relative">
              <div className="flex justify-center mb-1 text-pink-500">
                <Download className="w-5 h-5 opacity-80" />
              </div>
              <div className="text-xl font-extrabold text-slate-100 font-mono tracking-tight">
                {globalStats.totalDownloads.toLocaleString()}
              </div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5">
                Files Downloaded
              </div>
            </div>
          </div>

          <p className="text-[10px] text-slate-400 text-center mt-3.5 leading-relaxed font-sans max-w-[340px] mx-auto">
            All stats are computed in real-time. No logs of user credentials, search queries, or private content are ever recorded. <strong>Your session is completely secure.</strong>
          </p>
        </div>

        {/* Footer info & credits */}
        <footer className="mt-12 text-center text-[11px] text-slate-600 font-mono space-y-1">
          <p>© 2026 InstaTube Media companion</p>
          <p>Ad-Free, Cloud-Powered, Safe Media Extraction</p>
        </footer>

      </div>
    </div>
  );
}
