# FozPay — PRD / Project Memory

## Original problem statement (this session)
Clone the GitHub project maksymhumfk-commits/maks0707 into /app and implement:
1. Exchange: add network selection + show balances per network.
2. Payment requests: date search + pagination (not everything on one page).
3. Registration enabled, but every new client (email OR Google) must be approved by admin before cabinet access.
4. Admin can manually edit each client's balance per currency.
5. Fix Arbitrum deposit detection.
6. Hot wallet must show ALL tokens on balance, not only catalog ones.
7. Fund recovery: show all tokens, organized, search by single address + keep scan-all.
Plus design asks: Heleket-style two-panel login, checkout redesign with timers, light animated landing, merchant logo upload, full UK/EN localization.
Keys: ALCHEMY_KEY, TRONGRID_KEY, ONEINCH_KEY.

## Architecture
- Backend: FastAPI + MongoDB (motor), HD wallet (bip-utils), web3 + 1inch swaps, JWT + Emergent Google session auth, encrypted seed in DB (Fernet, key in .env).
- Frontend: React (CRACO) + Tailwind + shadcn, emerald "FozPay" light theme, UK/EN i18n.
- Hot wallet = HD EVM index 0; per-user deposit addresses derived per index; deposits swept to hot wallet.

## Config (preview env, backend/.env)
- MONGO_URL, DB_NAME, JWT_SECRET, MNEMONIC_ENC_KEY, ADMIN_EMAIL, ADMIN_PASSWORD, FRONTEND_URL, ALCHEMY_KEY, TRONGRID_KEY, ONEINCH_KEY.
- Admin: psymaks249@gmail.com / FozPay2025Admin!
- NOTE: On this Alchemy app, Arbitrum + BSC mainnet are ENABLED; Ethereum + Polygon mainnet are DISABLED (dashboard setting on user side) — ETH/Polygon scans return empty by design.

## Implemented (2026-10-10)
- Client approval flow: new email/Google users get status="pending"; core.get_active_user() blocks all cabinet endpoints (403 PENDING) until admin activates. Admin-created users and admin are "active". Frontend PendingScreen gate in App.js.
- Admin user mgmt (server.py): PUT /api/admin/users/{uid}/status (activate/suspend), PUT /api/admin/users/{uid}/balance (set absolute per-currency balance, records admin_adjust tx). Settings UsersTab: status badge, Activate/Suspend, per-currency balance editor.
- Exchange network selection: ExchangeIn gains from_network/to_network; _best_swap_chain honors preferred chain. Wallet swap tab: from/to network selects + "balance by networks" panel.
- Payment requests (Requests.js): invoices + payouts each have search, period filter (all/today/7d/30d/custom), date column, and 20/page pagination.
- Arbitrum: verified Alchemy arb-mainnet RPC + getTokenBalances work with the provided key.
- Hot wallet + recovery show ALL tokens: recovery.scan_evm_all() via alchemy_getTokenBalances + token metadata (unknown tokens flagged). hot_wallet_balances uses it. Recovery page: address search + scan-all, grouped by network.
- Design: two-panel Heleket-style Login with promo panel; Checkout redesign (currency+network select, "best choice" badge, rate-valid ring countdown, time-left-to-pay countdown); light landing with entrance + hover animations; merchant logo upload (base64 data URL in merchant.logo_url).
- i18n: new keys added for UK+EN across Login, Checkout, Requests, Recovery, Wallet swap, PendingScreen, promo panel, merchant logo.
- Bugfix: POST /api/invoices with a currencies[] entry missing "network" now returns 400 instead of 500.

## Testing
- iteration_7.json: 13/13 backend + all critical frontend criteria pass. No critical issues.

## Backlog / Next
- Deep-localize admin-only Settings tabs (Platform/Networks) fully to EN.
- Optional: move merchant logo to object storage if large images needed (currently base64, 512KB cap).

## 1inch Fusion+ cross-chain (added 2026-10-10)
- REAL cross-chain swaps between EVM networks (ETH/BSC/Polygon/Arbitrum) via 1inch Fusion+ (intent-based, gasless).
- Node signing worker at /app/signer/index.mjs (@1inch/cross-chain-sdk) on 127.0.0.1:8787, managed by supervisor (/etc/supervisor/conf.d/fusion-signer.conf). Reads ONEINCH_KEY + ALCHEMY_KEY from backend/.env. Node 20 requires --ignore-engines for install.
  - POST /quote, POST /swap (approve+createOrder+submitOrder+background secret-reveal monitor), GET /status/:hash, GET /health.
- Backend (server.py): POST /api/wallet/crosschain/quote, POST /api/wallet/crosschain/swap (locks source balance), GET /api/wallet/crosschain/status/{hash}; crosschain_worker() background poller credits dst on executed / refunds on expiry. db.crosschain_swaps collection.
- Frontend: Wallet "Крос-чейн" tab (cc-from/cc-to + networks + amount, quote preview, status polling).
- VERIFIED: quote end-to-end (25 USDT Polygon -> 24.87 USDC Arbitrum); same-network rejected. Full on-chain settlement requires the hot wallet to hold the source token + native gas on the source chain (cannot be dry-run without funds).
- 1inch key confirmed entitled to Fusion+ on api.1inch.dev domain.
- Owner admin switched to maksymnykytiuk@yahoo.com (ADMIN_EMAIL).
- Partial payments: checkout shows received/remaining + progress bar on status "Partially"; deposit_worker keeps polling and auto-confirms on top-up.

