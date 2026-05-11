import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { fetchAllShopifyProducts } from "./shopify";
import {
  formatHKD,
  loadLastSnapshotIds,
  loadNotes,
  saveNotes,
  saveSnapshotIds,
  sortByCreatedDesc,
  toTracked,
  type NoteMap,
} from "./storage";
import type { TrackedProduct, VariantStock } from "./types";

const DEFAULT_BASE = "/api/shopify";
const PUBLIC_SITE = "https://satisfyrunning.com";

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function shortVariantLabel(v: VariantStock): string {
  if (v.option2) {
    const m = /\(([^)]+)\)\s*$/.exec(v.option2);
    if (m) return m[1];
    return v.option2.replace(/^Size\s+/i, "").trim();
  }
  if (v.option3) return v.option3;
  if (v.option1 && v.option1 !== "Default Title") return v.option1;
  if (v.title && v.title !== "Default Title") return v.title;
  return "默认";
}

function VariantInventory({ variants }: { variants: VariantStock[] }) {
  if (!variants.length) return null;

  const useColor =
    variants.some((v) => v.option1 && v.option1 !== "Default Title") && variants.length > 1;

  const ok = variants.filter((v) => v.available);

  const pills = (list: VariantStock[]) =>
    list.map((v) => {
      const isIn = v.available;
      const tip = `${v.title} · ${formatHKD(v.price)} · ${isIn ? "有货" : "无货"}`;
      return (
        <span
          key={v.id}
          title={tip}
          style={
            isIn
              ? { ...pillBase, ...pillIn }
              : { ...pillBase, ...pillOut }
          }
        >
          <strong>{shortVariantLabel(v)}</strong>
          {" · "}
          {formatHKD(v.price)}
        </span>
      );
    });

  return (
    <div style={{ marginTop: 10 }}>
      <div style={variantSectionTitle}>尺码 / 规格 · 库存（港币）</div>
      {!useColor ? (
        <div style={variantStrip}>{pills(variants)}</div>
      ) : (
        <>
          {Object.entries(
            variants.reduce<Record<string, VariantStock[]>>((acc, v) => {
              const c = v.option1 && v.option1 !== "Default Title" ? v.option1 : "款式";
              acc[c] ??= [];
              acc[c].push(v);
              return acc;
            }, {})
          )
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([color, vs]) => (
              <div key={color} style={{ marginTop: 10 }}>
                <div style={colorName}>{color}</div>
                <div style={variantStrip}>{pills(vs)}</div>
              </div>
            ))}
        </>
      )}
      {ok.length === 0 ? (
        <p style={stockNone}>
          尺码库存：当前接口显示<strong>全部规格无货</strong>（请最终以官网为准）
        </p>
      ) : (
        <p style={stockOk}>
          有货规格 <strong>{ok.length}</strong>/{variants.length}：
          {ok.map(shortVariantLabel).join("、")}
        </p>
      )}
    </div>
  );
}

const variantSectionTitle: CSSProperties = {
  fontSize: 12,
  color: "var(--muted)",
  marginBottom: 6,
  fontWeight: 600,
};

const variantStrip: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const pillBase: CSSProperties = {
  fontSize: 11,
  padding: "5px 9px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "rgba(255,255,255,0.03)",
  whiteSpace: "nowrap",
};

const pillIn: CSSProperties = {
  borderColor: "rgba(74, 222, 128, 0.45)",
  background: "rgba(74, 222, 128, 0.1)",
};

const pillOut: CSSProperties = {
  opacity: 0.45,
  textDecoration: "line-through",
  color: "var(--muted)",
};

const colorName: CSSProperties = {
  fontSize: 11,
  color: "var(--muted)",
  marginBottom: 4,
};

const stockOk: CSSProperties = {
  fontSize: 12,
  marginTop: 8,
  color: "#86efac",
};

const stockNone: CSSProperties = {
  fontSize: 12,
  marginTop: 8,
  color: "var(--danger)",
};

const priceHK: CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 600,
  color: "var(--accent)",
};

export default function App() {
  const [items, setItems] = useState<TrackedProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [notes, setNotes] = useState<NoteMap>(() => loadNotes());
  const [filter, setFilter] = useState<"all" | "new">("all");
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [intervalMin, setIntervalMin] = useState(60);

  const newCount = useMemo(() => items.filter((i) => i.isNew).length, [items]);

  const sync = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const prevIds = loadLastSnapshotIds();
      const isBaseline = prevIds.size === 0;
      const raw = await fetchAllShopifyProducts(DEFAULT_BASE);
      const mapped = raw.map((p) =>
        toTracked(p, "Satisfy 官网", PUBLIC_SITE, isBaseline ? new Set(raw.map((x) => x.id)) : prevIds)
      );
      mapped.sort(sortByCreatedDesc);
      setItems(mapped);
      const allIds = new Set(raw.map((p) => p.id));
      saveSnapshotIds(allIds);
      const iso = new Date().toISOString();
      setLastSync(iso);

      const freshNew = isBaseline ? [] : mapped.filter((m) => !prevIds.has(m.id));
      if (notifyEnabled && freshNew.length && "Notification" in window && Notification.permission === "granted") {
        const title = `Satisfy 上新 · ${freshNew.length} 款`;
        const body = freshNew
          .slice(0, 3)
          .map((x) => x.title)
          .join(" · ");
        new Notification(title, { body, icon: freshNew[0]?.imageUrl ?? undefined });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg +
          " — 若在生产环境部署，请配置反向代理将 /api/shopify 指向官网，或使用 npm run dev 本地调试。"
      );
    } finally {
      setLoading(false);
    }
  }, [notifyEnabled]);

  useEffect(() => {
    void sync();
  }, []);

  useEffect(() => {
    if (!notifyEnabled) return;
    const ms = Math.max(5, intervalMin) * 60 * 1000;
    const id = window.setInterval(() => {
      void sync();
    }, ms);
    return () => window.clearInterval(id);
  }, [notifyEnabled, intervalMin, sync]);

  const requestNotify = async () => {
    if (!("Notification" in window)) {
      alert("当前浏览器不支持桌面通知。");
      return;
    }
    const p = await Notification.requestPermission();
    if (p === "granted") setNotifyEnabled(true);
  };

  const updateNote = (productId: number, note: string) => {
    setNotes((prev) => {
      const next = { ...prev };
      if (!note.trim()) delete next[productId];
      else next[productId] = note.trim();
      saveNotes(next);
      return next;
    });
  };

  const visible = filter === "new" ? items.filter((i) => i.isNew) : items;

  return (
    <div style={layout.wrap}>
      <header style={layout.header}>
        <div>
          <h1 style={layout.title}>Satisfy 上新追踪</h1>
          <p style={layout.sub}>
            港币 HKD 价格（接口 <code style={{ fontSize: 12 }}>currency=HKD</code>
            ）；尺码库存来自各 SKU 的 <code style={{ fontSize: 12 }}>available</code>，与结账页可能略有延迟。
          </p>
        </div>
        <div style={layout.actions}>
          <button type="button" style={btn.primary} onClick={() => void sync()} disabled={loading}>
            {loading ? "同步中…" : "立即同步官网"}
          </button>
          {lastSync && (
            <span style={{ color: "var(--muted)", fontSize: 13 }}>
              上次同步：{formatDate(lastSync)}
            </span>
          )}
        </div>
      </header>

      <section style={panel}>
        <h2 style={h2}>提醒设置</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
          {!notifyEnabled ? (
            <button type="button" style={btn.secondary} onClick={() => void requestNotify()}>
              开启浏览器通知
            </button>
          ) : (
            <label style={labelRow}>
              <input
                type="checkbox"
                checked={notifyEnabled}
                onChange={(e) => setNotifyEnabled(e.target.checked)}
              />
              已开启通知（关闭勾选项可停用定时同步）
            </label>
          )}
          <label style={labelRow}>
            自动检查间隔（分钟）
            <input
              type="number"
              min={5}
              step={5}
              value={intervalMin}
              onChange={(e) => setIntervalMin(Number(e.target.value) || 60)}
              style={input}
              disabled={!notifyEnabled}
            />
          </label>
        </div>
        <p style={hint}>
          通知仅在本次访问页面期间定时拉取；页面关闭后不会后台运行。需要长期推送可后续接入服务端或 PWA。
        </p>
      </section>

      {error && (
        <div role="alert" style={errBox}>
          {error}
        </div>
      )}

      <div style={toolbar}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "var(--muted)", fontSize: 14 }}>筛选</span>
          <button
            type="button"
            style={filter === "all" ? btn.tabActive : btn.tab}
            onClick={() => setFilter("all")}
          >
            全部 ({items.length})
          </button>
          <button
            type="button"
            style={filter === "new" ? btn.tabActive : btn.tab}
            onClick={() => setFilter("new")}
          >
            相对上次快照的新品 ({newCount})
          </button>
        </div>
      </div>

      <ul style={grid}>
        {visible.map((p) => (
          <li key={p.id} style={card}>
            <div style={cardMedia}>
              {p.imageUrl ? (
                <img src={p.imageUrl} alt="" style={img} loading="lazy" />
              ) : (
                <div style={placeholder}>无图</div>
              )}
              {p.isNew && <span style={badge}>新品</span>}
            </div>
            <div style={cardBody}>
              <h3 style={cardTitle}>{p.title}</h3>
              <p style={meta}>{p.sourceLabel}</p>
              {p.priceRangeHKD && <p style={priceHK}>{p.priceRangeHKD}</p>}
              <p style={meta}>上架：{formatDate(p.createdAt)}</p>
              <VariantInventory variants={p.variants} />
              <a href={p.sourceUrl} target="_blank" rel="noreferrer">
                打开商品页（港币）
              </a>
              <label style={{ display: "block", marginTop: 10 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>代购备注</span>
                <textarea
                  rows={2}
                  value={notes[p.id] ?? ""}
                  onChange={(e) => updateNote(p.id, e.target.value)}
                  placeholder="尺码、客户、链接备份…"
                  style={{ ...textarea, marginTop: 4 }}
                />
              </label>
            </div>
          </li>
        ))}
      </ul>

      {!loading && visible.length === 0 && (
        <p style={{ color: "var(--muted)", textAlign: "center", padding: "2rem" }}>
          {filter === "new" ? "暂无相对上次同步的新品。" : "暂无数据，请点击「立即同步官网」。"}
        </p>
      )}

      <footer style={footer}>
        <p>
          数据来源为 Satisfy 公开 Shopify JSON（
          <a href={`${PUBLIC_SITE}/collections/all`} target="_blank" rel="noreferrer">
            官网
          </a>
          ）。价格与库存来自官网公开接口；请以结账页为准。
        </p>
      </footer>
    </div>
  );
}

const layout = {
  wrap: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "2rem 1.25rem 4rem",
  } as const,
  header: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "1.5rem",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "2rem",
    borderBottom: "1px solid var(--border)",
    paddingBottom: "1.5rem",
  },
  title: {
    margin: 0,
    fontSize: "1.75rem",
    fontWeight: 700,
    letterSpacing: "-0.02em",
  },
  sub: {
    margin: "0.5rem 0 0",
    color: "var(--muted)",
    maxWidth: 520,
    fontSize: 14,
  },
  actions: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
    alignItems: "flex-end",
  },
};

const panel: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "1rem 1.25rem",
  marginBottom: "1.5rem",
};

const h2: CSSProperties = {
  margin: "0 0 0.75rem",
  fontSize: 16,
  fontWeight: 600,
};

const hint: CSSProperties = {
  margin: "0.75rem 0 0",
  fontSize: 12,
  color: "var(--muted)",
};

const labelRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 14,
};

const input: CSSProperties = {
  width: 72,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
};

const textarea: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  resize: "vertical" as const,
};

const errBox: CSSProperties = {
  background: "rgba(248,113,113,0.12)",
  border: "1px solid var(--danger)",
  color: "#fecaca",
  padding: "0.75rem 1rem",
  borderRadius: 10,
  marginBottom: "1rem",
  fontSize: 14,
};

const toolbar: CSSProperties = {
  marginBottom: "1rem",
};

const grid: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  gap: "1.25rem",
};

const card: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const cardMedia: CSSProperties = {
  position: "relative",
  aspectRatio: "4/5",
  background: "#1a1a1c",
};

const img: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const placeholder: CSSProperties = {
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--muted)",
  fontSize: 14,
};

const badge: CSSProperties = {
  position: "absolute",
  top: 10,
  left: 10,
  background: "var(--new)",
  color: "#052e16",
  fontSize: 11,
  fontWeight: 700,
  padding: "4px 8px",
  borderRadius: 6,
  textTransform: "uppercase",
};

const cardBody: CSSProperties = {
  padding: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  flex: 1,
};

const cardTitle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1.35,
};

const meta: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: "var(--muted)",
};

const footer: CSSProperties = {
  marginTop: "3rem",
  paddingTop: "1.5rem",
  borderTop: "1px solid var(--border)",
  fontSize: 12,
  color: "var(--muted)",
};

const btn = {
  primary: {
    padding: "10px 18px",
    borderRadius: 10,
    border: "none",
    background: "var(--accent)",
    color: "#1a1508",
    fontWeight: 600,
  } as CSSProperties,
  secondary: {
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text)",
  } as CSSProperties,
  tab: {
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--muted)",
  } as CSSProperties,
  tabActive: {
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid var(--accent)",
    background: "rgba(201,169,98,0.12)",
    color: "var(--text)",
  } as CSSProperties,
};
