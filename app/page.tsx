"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  exchange: "SZSE" | "SSE";
  board: "创业板" | "科创板";
  code: string;
  name: string;
  close: number;
  monthChange: number;
  weekChange: number;
  monthBaseDate: string;
  weekBaseDate: string;
  limitUpCount: number;
  pullbackPercent: number;
};
type Screen = {
  marketDate: string | null;
  updatedAt: string | null;
  weekStart: string | null;
  monthTarget: string | null;
  rows: Row[];
  counts: Record<string, { matched: number; insufficient: number }>;
  initializing?: boolean;
  error?: string;
};
type Candle = { date: string; open: number; high: number; low: number; close: number; volume: number };

const fmtDate = (value: string | null) => value ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : "—";
const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
const cls = (n: number) => n > 0 ? "up" : n < 0 ? "down" : "flat";

function CandleChart({ candles }: { candles: Candle[] }) {
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<number | null>(null);
  const visible = candles.slice(-Math.max(8, Math.floor(candles.length / zoom)));
  if (!candles.length) return <div className="chart-empty">暂无官方日线数据</div>;
  const width = 760, height = 310, left = 46, right = 12, top = 16, chartHeight = 208, volTop = 244, volHeight = 44;
  const lo = Math.min(...visible.map(c => c.low)), hi = Math.max(...visible.map(c => c.high));
  const span = hi - lo || 1;
  const maxVol = Math.max(...visible.map(c => c.volume), 1);
  const step = (width - left - right) / visible.length;
  const y = (v: number) => top + (hi - v) / span * chartHeight;
  return <div className="chart-wrap" onWheel={e => { e.preventDefault(); setZoom(z => Math.max(1, Math.min(4, z + (e.deltaY < 0 ? .35 : -.35)))); }}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="最近一个月日K线图" onMouseLeave={() => setHover(null)}>
      {[0, .5, 1].map((t, i) => <g key={i}><line x1={left} x2={width - right} y1={top + t * chartHeight} y2={top + t * chartHeight} className="gridline"/><text x={left - 8} y={top + t * chartHeight + 4} textAnchor="end" className="axis-label">{(hi - t * span).toFixed(2)}</text></g>)}
      {visible.map((c, i) => { const x = left + i * step + step / 2; const rise = c.close >= c.open; const color = rise ? "#e05248" : "#17836e"; const bodyTop = Math.min(y(c.open), y(c.close)); const bodyHeight = Math.max(1.5, Math.abs(y(c.open) - y(c.close))); return <g key={c.date} onMouseEnter={() => setHover(i)}><line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth="1"/><rect x={x - Math.max(2, step * .27)} y={bodyTop} width={Math.max(3, step * .54)} height={bodyHeight} fill={color}/><rect x={x - step / 2} y={volTop} width={step} height={volHeight} fill={color} opacity=".45"/><rect x={x - step / 2} y={volTop + (1 - c.volume / maxVol) * volHeight} width={step} height={(c.volume / maxVol) * volHeight} fill={color} opacity=".8"/></g>; })}
      <line x1={left} x2={width - right} y1={volTop} y2={volTop} className="gridline"/>
      <text x={left} y={height - 5} className="axis-label">{fmtDate(visible[0]?.date ?? null)}</text><text x={width - right} y={height - 5} textAnchor="end" className="axis-label">{fmtDate(visible.at(-1)?.date ?? null)}</text>
      {hover !== null && visible[hover] && <g><rect x={left + 8} y={top + 7} width="214" height="74" rx="7" className="tooltip-bg"/><text x={left + 18} y={top + 24} className="tooltip-text">{fmtDate(visible[hover].date)}</text><text x={left + 18} y={top + 43} className="tooltip-text">开 {visible[hover].open.toFixed(2)}　高 {visible[hover].high.toFixed(2)}</text><text x={left + 18} y={top + 62} className="tooltip-text">低 {visible[hover].low.toFixed(2)}　收 {visible[hover].close.toFixed(2)}</text></g>}
    </svg><div className="chart-hint">滚轮缩放 · 红涨绿跌 · 成交量以万股计</div>
  </div>;
}

export default function Home() {
  const [data, setData] = useState<Screen | null>(null);
  const [loading, setLoading] = useState(true);
  const [board, setBoard] = useState("全部");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: keyof Row; desc: boolean }>({ key: "monthChange", desc: true });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Row | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const pageSize = 50;

  useEffect(() => { fetch("/api/screen").then(r => r.json()).then(setData).catch(() => setData({ marketDate: null, updatedAt: null, weekStart: null, monthTarget: null, rows: [], counts: {}, error: "无法读取筛选数据，请稍后重试。" })).finally(() => setLoading(false)); }, []);
  useEffect(() => {
    if (!data || (data.marketDate && !data.initializing)) return;
    const timer = window.setInterval(() => {
      fetch("/api/screen").then(r => r.json()).then(setData).catch(() => {});
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [data?.marketDate, data?.initializing]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController(); setChartLoading(true); setCandles([]);
    fetch(`/api/chart?exchange=${selected.exchange}&code=${encodeURIComponent(selected.code)}`, { signal: controller.signal }).then(r => r.json()).then(x => setCandles(x.candles ?? [])).catch(() => {}).finally(() => setChartLoading(false));
    return () => controller.abort();
  }, [selected]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...(data?.rows ?? [])].filter(r => (board === "全部" || r.board === board) && (!q || r.code.includes(q) || r.name.toLowerCase().includes(q))).sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key]; const order = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "zh-CN"); return sort.desc ? -order : order;
    });
  }, [data, board, query, sort]);
  useEffect(() => setPage(1), [board, query]);
  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize));
  const pageRows = shown.slice((page - 1) * pageSize, page * pageSize);
  const csv = () => {
    const headers = ["交易所", "板块", "股票代码", "股票名称", "最新收盘价", "近一个月涨跌幅(%)", "本周涨跌幅(%)", "近10个交易日涨停收盘次数", "距近10日最高价回撤(%)", "月基准日期", "周基准日期", "行情日期"];
    const body = shown.map(r => [r.exchange, r.board, r.code, r.name, r.close, r.monthChange.toFixed(6), r.weekChange.toFixed(6), r.limitUpCount, r.pullbackPercent.toFixed(6), r.monthBaseDate, r.weekBaseDate, data?.marketDate ?? ""]);
    const text = [headers, ...body].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff", text], { type: "text/csv;charset=utf-8" })); link.download = `创业板_科创板筛选_${data?.marketDate ?? "未更新"}.csv`; link.click(); URL.revokeObjectURL(link.href);
  };
  const sortBy = (key: keyof Row) => setSort(s => ({ key, desc: s.key === key ? !s.desc : true }));
  const countFor = (name: string) => data?.counts?.[name] ?? { matched: 0, insufficient: 0 };

  return <main className="site-shell">
    <header className="topbar"><a className="brand" href="#"><span className="brand-mark">K</span><span>收盘筛选<span className="brand-sub">MARKET SCREEN</span></span></a><div className="source-label"><span className="live-dot"/>交易所官方收盘数据</div></header>
    <section className="intro"><div><p className="eyebrow">沪深市场 · 日终数据</p><h1>创业板与科创板筛选</h1><p className="subhead">近一个月涨幅≤20%、本周≤5%；近10个交易日收盘涨停1–3次，现价距这10日最高价不超过10%。</p></div><div className="date-card"><span>行情日期</span><strong>{fmtDate(data?.marketDate ?? null)}</strong><small>{data?.updatedAt ? `更新于 ${new Date(data.updatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}` : "等待官方数据初始化"}</small></div></section>
    <section className="summary-grid"><article><span>创业板符合</span><strong>{countFor("创业板").matched.toLocaleString()}</strong><small>数据不足 {countFor("创业板").insufficient.toLocaleString()} 只</small></article><article><span>科创板符合</span><strong>{countFor("科创板").matched.toLocaleString()}</strong><small>数据不足 {countFor("科创板").insufficient.toLocaleString()} 只</small></article><article className="rule-card"><span>筛选规则</span><strong>涨停 1–3 次 <i>·</i> 高点回撤 ≤10%</strong><small>并满足月≤20%、本周≤5%</small></article></section>
    <section className="workspace">
      <div className="list-panel"><div className="toolbar"><div className="board-tabs">{["全部", "创业板", "科创板"].map(b => <button key={b} className={board === b ? "active" : ""} onClick={() => setBoard(b)}>{b}</button>)}</div><label className="searchbox"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索代码或名称" aria-label="搜索代码或名称"/></label><button className="export-button" onClick={csv} disabled={!shown.length}>导出 CSV</button></div>
        <div className="table-scroll"><table><thead><tr><th>板块</th><th><button onClick={() => sortBy("code")}>股票代码 ↕</button></th><th><button onClick={() => sortBy("name")}>名称 ↕</button></th><th className="numeric"><button onClick={() => sortBy("close")}>最新收盘 ↕</button></th><th className="numeric"><button onClick={() => sortBy("monthChange")}>近一个月 ↕</button></th><th className="numeric"><button onClick={() => sortBy("weekChange")}>本周 ↕</button></th><th className="numeric"><button onClick={() => sortBy("limitUpCount")}>近10日涨停 ↕</button></th><th className="numeric"><button onClick={() => sortBy("pullbackPercent")}>距10日高点 ↕</button></th></tr></thead><tbody>
          {loading && <tr><td colSpan={8} className="state-cell">正在读取最近一次完整行情…</td></tr>}
          {!loading && !data?.rows.length && <tr><td colSpan={8} className="state-cell"><strong>{data?.error ?? "官方行情尚未完成首次初始化"}</strong><span>页面只展示交易所官方数据。后台更新完成后，这里会出现符合条件的股票。</span></td></tr>}
          {!loading && data?.rows.length > 0 && pageRows.map(row => <tr key={`${row.exchange}-${row.code}`} className={selected?.code === row.code && selected.exchange === row.exchange ? "selected-row" : ""}><td><span className={`board-chip ${row.board === "创业板" ? "chinext" : "star"}`}>{row.board}</span></td><td><button className="code-link" onClick={() => setSelected(row)}>{row.code}</button></td><td className="name-cell">{row.name}</td><td className="numeric">{row.close.toFixed(2)}</td><td className={`numeric ${cls(row.monthChange)}`}>{pct(row.monthChange)}</td><td className={`numeric ${cls(row.weekChange)}`}>{pct(row.weekChange)}</td><td className="numeric">{row.limitUpCount}</td><td className="numeric">{row.pullbackPercent.toFixed(2)}%</td></tr>)}
          {!loading && data?.rows.length > 0 && !pageRows.length && <tr><td colSpan={8} className="state-cell">没有匹配的搜索结果</td></tr>}
        </tbody></table></div>
        <div className="table-footer"><span>共 {shown.length.toLocaleString()} 只符合条件</span><div><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button><span>{page} / {pageCount}</span><button disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>下一页</button></div></div>
      </div>
      <aside className={`detail-panel ${selected ? "open" : ""}`}>
        {selected ? <><div className="detail-heading"><div><span className={`board-chip ${selected.board === "创业板" ? "chinext" : "star"}`}>{selected.board}</span><h2>{selected.name} <small>{selected.code}</small></h2><p className="detail-price">{selected.close.toFixed(2)} <span>收盘价</span></p></div><button className="close-detail" onClick={() => setSelected(null)} aria-label="关闭走势图">×</button></div><div className="detail-metrics"><div><span>近一个月</span><strong className={cls(selected.monthChange)}>{pct(selected.monthChange)}</strong></div><div><span>本周</span><strong className={cls(selected.weekChange)}>{pct(selected.weekChange)}</strong></div><div><span>近10日涨停</span><strong>{selected.limitUpCount} 次</strong></div><div><span>距10日高点</span><strong>{selected.pullbackPercent.toFixed(2)}%</strong></div></div><h3>最近一个月日 K 线</h3>{chartLoading ? <div className="chart-empty">读取官方日线…</div> : <CandleChart candles={candles}/>}<p className="chart-footnote">月基准 {fmtDate(selected.monthBaseDate)} · 周基准 {fmtDate(selected.weekBaseDate)}<br/>未复权价格；涨停按板块20%价格限制和前收参考价判断，新股上市前五个交易日不计入。</p></> : <div className="detail-placeholder"><div className="chart-icon">⌁</div><strong>查看个股走势</strong><span>点击左侧股票代码，在此查看最近一个月日 K 线与成交量。</span></div>}
      </aside>
    </section>
    <footer className="footnote">月涨幅以回退一个自然月后的最近交易日收盘为基准；周涨幅以当周周一之前最近交易日收盘为基准。涨停价按20%限制、以前收参考价计算；上市前五个交易日不计。数据不足10个交易日的股票不纳入。<span>来源：深交所 · 上交所</span></footer>
  </main>;
}
