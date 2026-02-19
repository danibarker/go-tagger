import { A, useLocation } from "@solidjs/router";

export function TopNav() {
  const location = useLocation();

  return (
    <nav class="top-nav">
      <div class="top-nav__brand">Go Tagger</div>
      <div class="top-nav__links">
        <A href="/" classList={{ "is-active": location.pathname === "/" }}>
          Gallery
        </A>
        <A
          href="/trash"
          classList={{ "is-active": location.pathname === "/trash" }}
        >
          Trash
        </A>
        <A
          href="/upload"
          classList={{ "is-active": location.pathname === "/upload" }}
        >
          Upload
        </A>
      </div>
    </nav>
  );
}
