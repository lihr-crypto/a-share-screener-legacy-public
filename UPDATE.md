# Scheduled market data update

## Purpose and source

Keep the public screening page current for Shenzhen ChiNext and Shanghai STAR Market stocks. Read only official exchange data:

- SZSE securities list and daily snapshot: `https://www.szse.cn/api/report/ShowReport`
- SSE STAR list and daily candles: `https://yunhq.sse.com.cn:32042/v1/sh1/list/exchange/kshare` and `/v1/sh1/dayk/{code}`

The Site's `POST /api/update` handler performs the fetch, validation, screening, and atomic D1 activation. It retrieves up to 45 calendar days from SZSE and the latest 35 trading bars per SSE stock. This covers the recent-month base, prior-week base, ten-session filters, and chart window. Keep the previous active batch if either official source fails or their latest trade dates differ.

## Secure invocation

1. Use the Sites `get_site` tool for this exact Site and retrieve its current `siwc_bypass_bearer_token` at run time.
2. Send that value only as `Authorization: Bearer <token>` to this Site's `POST /api/update` endpoint. Do not put it in source files, prompts, output, or logs.
3. The secret `UPDATE_TOKEN` in Site runtime settings is synchronized to the current Site service token. If the endpoint returns 401, do not weaken its authorization; report the need to resynchronize the Site runtime secret and redeploy.
4. Read `GET /api/status` after the update. A successful result has a new complete market date and both exchange statuses `OK`.

When the latest official data date is already stored, do nothing. On holidays, do nothing. The schedule runs at 17:30, 18:30, and 20:30 Asia/Shanghai on weekdays; the later runs retry only if the latest data date has not been stored.

## Method

- Screen by recent-month return `<= 20%` and current-week return `<= 5%`; negative returns remain eligible.
- Prices are unadjusted closing prices. The month base is the last trading day on or before one calendar month before the latest data date. The week base is the last trading day before Monday of the latest data date's week.
- Preserve exchange, board, code, name, as-of date, base dates, close, and both returns in the D1 batch.
- Do not fabricate missing prices. An incomplete source batch must not replace the last complete batch.
