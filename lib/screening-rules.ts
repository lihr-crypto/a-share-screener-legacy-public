export type SessionBar = {
  date: string;
  high: number;
  close: number;
  prevClose?: number;
  limitExempt?: boolean;
};

export type TenSessionResult = {
  sufficient: boolean;
  limitUpCount: number | null;
  pullbackPercent: number | null;
  matched: boolean;
};

export function officialLimitUpPrice(previousClose: number, limitRate = 0.2) {
  if (!Number.isFinite(previousClose) || previousClose <= 0) return null;
  // A-share prices trade in fen; Math.round implements the exchange's cent rounding.
  return Math.round(previousClose * (1 + limitRate) * 100 + 1e-8) / 100;
}

export function evaluateTenSessions(
  bars: SessionBar[],
  limitRate = 0.2,
  maxPullback = 10,
): TenSessionResult {
  if (bars.length < 10) {
    return { sufficient: false, limitUpCount: null, pullbackPercent: null, matched: false };
  }
  const ten = [...bars].sort((a, b) => a.date.localeCompare(b.date)).slice(-10);
  const latest = ten[9];
  const maxHigh = Math.max(...ten.map(bar => bar.high));
  if (!Number.isFinite(maxHigh) || maxHigh <= 0 || latest.close <= 0) {
    return { sufficient: false, limitUpCount: null, pullbackPercent: null, matched: false };
  }
  let limitUpCount = 0;
  for (const bar of ten) {
    if (bar.limitExempt || !bar.prevClose || bar.prevClose <= 0) continue;
    const limitUp = officialLimitUpPrice(bar.prevClose, limitRate);
    if (limitUp !== null && Math.round(bar.close * 100) === Math.round(limitUp * 100)) limitUpCount++;
  }
  const pullbackPercent = ((maxHigh - latest.close) / maxHigh) * 100;
  return {
    sufficient: true,
    limitUpCount,
    pullbackPercent,
    matched: limitUpCount >= 1 && limitUpCount <= 3 && pullbackPercent <= maxPullback + 1e-10,
  };
}
