  const P = {
    ICONSET:          "mod.zensiteappearancetoggle.iconset",
    LIGHTICON:        "mod.zensiteappearancetoggle.lighticon",
    OVERRIDE_MOON:    "mod.zensiteappearancetoggle.override.moon",
    OVERRIDE_SPARKLE: "mod.zensiteappearancetoggle.override.sparkle",
    OVERRIDE_SUN:     "mod.zensiteappearancetoggle.override.sun",
  };

  function makeSrc(svgContent) {
    return "data:image/svg+xml;utf8," + encodeURIComponent(svgContent);
  }

  // Gecko 159 (Zen 1.24) no longer applies context-fill to data: images in the
  // browser window, so embedded icons rendered black on every theme. The
  // packaged SVG files load through the loader's chrome:// address, which keeps
  // the toolbar's own icon colour. Without a readable packaged file (a manual
  // copy that omitted icons/), the embedded copy is the fallback.
  function packagedSrc(name) {
    try {
      const uri = Services.io.newURI("icons/" + name + ".svg", null, Services.io.newURI(SAT_SITE_CHILD_URI()));
      if (uri.schemeIs("chrome")) {
        const local = Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIChromeRegistry).convertChromeURL(uri);
        if (local.QueryInterface(Ci.nsIFileURL).file.exists()) return uri.spec + "?v=1.3.4";
      }
    } catch {}
    return makeSrc(SAT_ICON_SVG[name]);
  }

  const ORIG_MOON = packagedSrc("moon");
  const ORIG_SPARKLE = packagedSrc("sparkle");
  const ORIG_SUN = packagedSrc("sun");

  const ZEN_MOON    = "chrome://browser/skin/zen-icons/moon-stars.svg";
  const ZEN_SPARKLE = "chrome://browser/skin/zen-icons/sparkles.svg";
  const ZEN_SUN     = "chrome://browser/skin/zen-icons/face-sun.svg";

  function getInt(key, def) {
    try { return Services.prefs.getIntPref(key, def); }
    catch { return def; }
  }

  function resolveIcon(overridePref, origIcon, zenIcon) {
    const override = getInt(overridePref, 0);
    if (override === 1) return origIcon;
    if (override === 2) return zenIcon;
    return getInt(P.ICONSET, 0) === 1 ? zenIcon : origIcon;
  }

  function getMoonSrc() {
    return resolveIcon(P.OVERRIDE_MOON, ORIG_MOON, ZEN_MOON);
  }

  function getLightSrc() {
    return getInt(P.LIGHTICON, 0) === 1
      ? resolveIcon(P.OVERRIDE_SUN, ORIG_SUN, ZEN_SUN)
      : resolveIcon(P.OVERRIDE_SPARKLE, ORIG_SPARKLE, ZEN_SPARKLE);
  }

