(function () {
  // Runs as an external, same-origin script (not inline) — this app's CSP
  // is script-src 'self' with no 'unsafe-inline' (same reasoning as
  // reload-splash.js's own comment: an inline <script> here would be
  // silently blocked and never run).
  //
  // The single manifest.webmanifest (default) always has start_url: "/".
  // Chrome's "Install app" always launches the installed PWA at *that*
  // fixed URL, never at whatever page the person happened to be on when
  // they tapped Install. For a guardian installing from /guardian/*, that
  // meant the installed app opened the *staff* admin dashboard instead of
  // the guardian portal (and failed there, since a guardian has no staff
  // session — API calls 401, dashboard shows all zeros / "request
  // failed"). Swapping to a second manifest (guardian-manifest.webmanifest,
  // start_url: "/guardian") whenever the current page is under
  // /guardian/* fixes this — Chrome reads whichever manifest <link> is
  // present in the document at the moment Install is offered/tapped, so
  // this must run early, before that.
  try {
    if (location.pathname.indexOf("/guardian") === 0) {
      var link = document.querySelector('link[rel="manifest"]');
      if (link) link.setAttribute("href", "/guardian-manifest.webmanifest");
    }
  } catch (e) {}
})();
