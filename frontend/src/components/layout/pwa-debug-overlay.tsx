import { useEffect, useState } from "react";

interface Zone {
  label: string;
  top: number;
  height: number;
  color: string; // semi-transparent fill
  border: string; // solid border
}

interface Measurements {
  screenH: number;
  innerH: number;
  appHeight: string;
  safeTop: number;
  safeBottom: number;
  headerNotchH: number;
  headerRowH: number;
  headerTotalH: number;
  mainH: number;
  mainPbPx: number;
  mainContentH: number;
  navTop: number;
  navH: number;
  zones: Zone[];
}

function getSafeAreaPx(prop: "top" | "bottom"): number {
  // Measure by creating a temporary element with the env() value as padding
  const el = document.createElement("div");
  el.style.position = "fixed";
  el.style.visibility = "hidden";
  el.style.pointerEvents = "none";
  if (prop === "top") {
    el.style.paddingTop = "env(safe-area-inset-top, 0px)";
  } else {
    el.style.paddingBottom = "env(safe-area-inset-bottom, 0px)";
  }
  document.body.appendChild(el);
  const val =
    prop === "top"
      ? Number.parseFloat(getComputedStyle(el).paddingTop) || 0
      : Number.parseFloat(getComputedStyle(el).paddingBottom) || 0;
  document.body.removeChild(el);
  return val;
}

function measure(): Measurements {
  const header = document.querySelector("header");
  const main = document.querySelector("main");
  const nav = document.querySelector("nav.fixed");

  const headerRect = header?.getBoundingClientRect();
  const mainRect = main?.getBoundingClientRect();
  const navRect = nav?.getBoundingClientRect();

  const mainStyle = main ? getComputedStyle(main) : null;
  const mainPbPx = mainStyle ? Number.parseFloat(mainStyle.paddingBottom) || 0 : 0;

  const appHeightVar =
    getComputedStyle(document.documentElement).getPropertyValue("--app-height").trim() || "unset";

  const safeTop = getSafeAreaPx("top");
  const safeBottom = getSafeAreaPx("bottom");

  // The notch spacer is the first child of header (the div.pt-safe)
  const notchSpacer = header?.querySelector("div:first-child");
  const notchSpacerRect = notchSpacer?.getBoundingClientRect();
  const headerNotchH = notchSpacerRect?.height ?? 0;
  const headerRowH = (headerRect?.height ?? 0) - headerNotchH;
  const headerTotalH = headerRect?.height ?? 0;

  const mainH = mainRect?.height ?? 0;
  const mainContentH = mainH - mainPbPx;

  const navTop = navRect?.top ?? 0;
  const navH = navRect?.height ?? 0;

  const zones: Zone[] = [
    {
      label: `NOTCH SAFE AREA (${headerNotchH}px)`,
      top: headerRect?.top ?? 0,
      height: headerNotchH,
      color: "rgba(255,255,0,0.35)",
      border: "#ffff00",
    },
    {
      label: `HEADER ROW (${headerRowH}px)`,
      top: (headerRect?.top ?? 0) + headerNotchH,
      height: headerRowH,
      color: "rgba(0,255,255,0.25)",
      border: "#00ffff",
    },
    {
      label: `MAIN CONTENT (${Math.round(mainContentH)}px)`,
      top: mainRect?.top ?? 0,
      height: mainContentH,
      color: "rgba(0,255,100,0.08)",
      border: "#00ff64",
    },
    {
      label: `pb-nav-safe PADDING (${Math.round(mainPbPx)}px)`,
      top: (mainRect?.top ?? 0) + mainContentH,
      height: mainPbPx,
      color: "rgba(255,60,0,0.45)",
      border: "#ff3c00",
    },
    {
      label: `NAV BAR (${Math.round(navH)}px)`,
      top: navTop,
      height: navH,
      color: "rgba(255,0,255,0.25)",
      border: "#ff00ff",
    },
  ];

  return {
    screenH: screen.height,
    innerH: window.innerHeight,
    appHeight: appHeightVar,
    safeTop,
    safeBottom,
    headerNotchH,
    headerRowH,
    headerTotalH,
    mainH,
    mainPbPx: Math.round(mainPbPx),
    mainContentH: Math.round(mainContentH),
    navTop: Math.round(navTop),
    navH: Math.round(navH),
    zones,
  };
}

export function PwaDebugOverlay({ onClose }: { onClose?: () => void }) {
  const [data, setData] = useState<Measurements | null>(null);
  const [showPanel, setShowPanel] = useState(true);

  useEffect(() => {
    // Small delay to let layout settle
    const id = setTimeout(() => setData(measure()), 300);
    return () => clearTimeout(id);
  }, []);

  if (!data) return null;

  const gap = data.navTop - (data.zones[3].top + data.zones[3].height);

  return (
    <>
      {/* Acid-color zone bands */}
      {data.zones.map((zone) => (
        <div
          key={zone.label}
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            top: zone.top,
            height: zone.height,
            background: zone.color,
            border: `1px solid ${zone.border}`,
            boxSizing: "border-box",
            pointerEvents: "none",
            zIndex: 9998,
          }}
        >
          <span
            style={{
              position: "absolute",
              left: 4,
              top: 1,
              fontSize: 9,
              fontFamily: "monospace",
              color: zone.border,
              fontWeight: "bold",
              textShadow: "0 0 3px #000",
              whiteSpace: "nowrap",
            }}
          >
            {zone.label}
          </span>
        </div>
      ))}

      {/* Gap indicator — anything between pb-nav-safe bottom and nav top */}
      {gap > 1 && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            top: data.zones[3].top + data.zones[3].height,
            height: gap,
            background: "rgba(255,255,255,0.6)",
            border: "2px dashed #ffffff",
            zIndex: 9999,
            pointerEvents: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{ fontSize: 10, fontFamily: "monospace", color: "#ff0000", fontWeight: "bold" }}
          >
            ⚠ GAP {Math.round(gap)}px
          </span>
        </div>
      )}

      {/* Measurement panel */}
      {showPanel && (
        <div
          style={{
            position: "fixed",
            right: 8,
            top: data.headerTotalH + 8,
            width: 200,
            background: "rgba(0,0,0,0.88)",
            color: "#00ff64",
            fontFamily: "monospace",
            fontSize: 10,
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid #00ff64",
            zIndex: 10000,
            lineHeight: 1.6,
          }}
        >
          <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
            <button
              type="button"
              onClick={() => setShowPanel(false)}
              style={{
                flex: 1,
                textAlign: "left",
                background: "none",
                border: "none",
                color: "#ffff00",
                fontFamily: "monospace",
                fontSize: 10,
                fontWeight: "bold",
                cursor: "pointer",
                padding: 0,
              }}
            >
              PWA DEBUG
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "none",
                border: "1px solid #ff3c00",
                color: "#ff3c00",
                fontFamily: "monospace",
                fontSize: 9,
                cursor: "pointer",
                padding: "0 4px",
                borderRadius: 3,
              }}
            >
              OFF
            </button>
          </div>
          <div>
            screen.height: <b style={{ color: "#fff" }}>{data.screenH}</b>
          </div>
          <div>
            innerHeight:{" "}
            <b style={{ color: data.innerH !== data.screenH ? "#ff3c00" : "#fff" }}>
              {data.innerH}
            </b>
          </div>
          <div>
            --app-height: <b style={{ color: "#fff" }}>{data.appHeight}</b>
          </div>
          <div style={{ marginTop: 4, color: "#00ffff" }}>
            safe-area-top: <b style={{ color: "#fff" }}>{data.safeTop}px</b>
          </div>
          <div style={{ color: "#00ffff" }}>
            safe-area-bottom: <b style={{ color: "#fff" }}>{data.safeBottom}px</b>
          </div>
          <div style={{ marginTop: 4, color: "#ffff00" }}>
            header-notch: <b style={{ color: "#fff" }}>{data.headerNotchH}px</b>
          </div>
          <div style={{ color: "#ffff00" }}>
            header-row: <b style={{ color: "#fff" }}>{data.headerRowH}px</b>
          </div>
          <div style={{ color: "#ffff00" }}>
            header-total: <b style={{ color: "#fff" }}>{data.headerTotalH}px</b>
          </div>
          <div style={{ marginTop: 4, color: "#00ff64" }}>
            main-total: <b style={{ color: "#fff" }}>{data.mainH}px</b>
          </div>
          <div style={{ color: "#ff3c00" }}>
            main-pb: <b style={{ color: "#fff" }}>{data.mainPbPx}px</b>
          </div>
          <div style={{ color: "#00ff64" }}>
            main-content: <b style={{ color: "#fff" }}>{data.mainContentH}px</b>
          </div>
          <div style={{ marginTop: 4, color: "#ff00ff" }}>
            nav-top:{" "}
            <b
              style={{
                color:
                  Math.abs(data.navTop - (data.mainContentH + data.headerTotalH)) > 2
                    ? "#ff3c00"
                    : "#fff",
              }}
            >
              {data.navTop}px
            </b>
          </div>
          <div style={{ color: "#ff00ff" }}>
            nav-height: <b style={{ color: "#fff" }}>{data.navH}px</b>
          </div>
          {gap > 1 && (
            <div style={{ marginTop: 4, color: "#ff0000", fontWeight: "bold" }}>
              ⚠ GAP: {Math.round(gap)}px
            </div>
          )}
          <div style={{ marginTop: 4, color: "#888", fontSize: 9 }}>
            sum: {data.headerTotalH}+{data.mainH}={data.headerTotalH + data.mainH} vs app=
            {data.appHeight}
          </div>
        </div>
      )}

      {!showPanel && (
        <button
          type="button"
          onClick={() => setShowPanel(true)}
          style={{
            position: "fixed",
            right: 8,
            top: data.headerTotalH + 8,
            background: "rgba(0,0,0,0.8)",
            color: "#00ff64",
            fontFamily: "monospace",
            fontSize: 10,
            padding: "4px 8px",
            borderRadius: 4,
            border: "1px solid #00ff64",
            zIndex: 10000,
          }}
        >
          DEBUG
        </button>
      )}
    </>
  );
}
