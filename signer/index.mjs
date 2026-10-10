// FozPay 1inch Fusion+ cross-chain signing worker (internal, 127.0.0.1:8787).
// Keeps the hot-wallet key only in memory per request; never exposed to the browser.
import dotenv from "dotenv";
dotenv.config({ path: "/app/backend/.env" });
import express from "express";
import { randomBytes } from "node:crypto";
import { Web3 } from "web3";
import { ethers } from "ethers";
import * as CC from "@1inch/cross-chain-sdk";

const SDK = CC.SDK;
const HashLock = CC.HashLock;
const PresetEnum = CC.PresetEnum;
const PrivateKeyProviderConnector = CC.PrivateKeyProviderConnector;

const AUTH = process.env.ONEINCH_KEY;
const ALCHEMY = process.env.ALCHEMY_KEY;
const BASE = "https://api.1inch.dev/fusion-plus";
const RPC = {
  1: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY}`,
  56: `https://bnb-mainnet.g.alchemy.com/v2/${ALCHEMY}`,
  137: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY}`,
  42161: `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY}`,
};
const ROUTER = "0x111111125421ca6dc452d289314280a0f8842a65"; // 1inch router v6 (ERC-20 spender)
const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const ERC20 = [
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];

const orders = new Map(); // orderHash -> {status, dstAmount, secrets, done, fills, error}
const norm = (pk) => (pk.startsWith("0x") ? pk : "0x" + pk);

function mkSdk(srcChainId, pk) {
  const web3 = new Web3(RPC[srcChainId]);
  return new SDK({ url: BASE, authKey: AUTH, blockchainProvider: new PrivateKeyProviderConnector(norm(pk), web3) });
}

async function ensureAllowance(srcChainId, pk, token, amount) {
  if (!token || token.toLowerCase() === NATIVE.toLowerCase()) return null;
  const provider = new ethers.JsonRpcProvider(RPC[srcChainId]);
  const wallet = new ethers.Wallet(norm(pk), provider);
  const c = new ethers.Contract(token, ERC20, wallet);
  const cur = await c.allowance(wallet.address, ROUTER);
  if (cur >= BigInt(amount)) return null;
  const tx = await c.approve(ROUTER, ethers.MaxUint256);
  await tx.wait();
  return tx.hash;
}

async function monitor(sdk, hash, secrets) {
  const st = orders.get(hash);
  for (let i = 0; i < 240; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const ready = await sdk.getReadyToAcceptSecretFills(hash);
      const fills = (ready && ready.fills) || [];
      for (const f of fills) {
        if (secrets[f.idx]) { try { await sdk.submitSecret(hash, secrets[f.idx]); } catch (e) {} }
      }
    } catch (e) {}
    try {
      const s = await sdk.getOrderStatus(hash);
      st.status = s.status;
      st.fills = s.fills || [];
      if (["executed", "expired", "refunded", "cancelled"].includes(s.status)) { st.done = true; return; }
    } catch (e) {}
  }
  st.done = true; st.status = st.status || "timeout";
}

const app = express();
app.use(express.json({ limit: "256kb" }));

app.post("/quote", async (req, res) => {
  try {
    const { srcChainId, dstChainId, srcToken, dstToken, amount, walletAddress, privateKey } = req.body;
    const sdk = mkSdk(srcChainId, privateKey);
    const q = await sdk.getQuote({
      amount: String(amount), srcChainId, dstChainId,
      srcTokenAddress: srcToken, dstTokenAddress: dstToken,
      walletAddress, enableEstimate: true,
    });
    res.json({ dstAmount: String(q.dstTokenAmount), quoteId: q.quoteId });
  } catch (e) { res.status(400).json({ error: String(e?.message || e) }); }
});

app.post("/swap", async (req, res) => {
  try {
    const { srcChainId, dstChainId, srcToken, dstToken, amount, walletAddress, privateKey, integratorFeeBps, integratorFeeReceiver } = req.body;
    let approvalTx = null;
    try { approvalTx = await ensureAllowance(srcChainId, privateKey, srcToken, amount); }
    catch (e) { return res.status(400).json({ error: "approval failed: " + String(e?.message || e) }); }

    const sdk = mkSdk(srcChainId, privateKey);
    const q = await sdk.getQuote({
      amount: String(amount), srcChainId, dstChainId,
      srcTokenAddress: srcToken, dstTokenAddress: dstToken,
      walletAddress, enableEstimate: true,
      ...(integratorFeeBps ? { integratorFee: { receiver: integratorFeeReceiver, value: BigInt(integratorFeeBps) } } : {}),
    });
    const preset = PresetEnum.fast;
    const count = (q.presets?.[preset]?.secretsCount) || 1;
    const secrets = Array.from({ length: count }, () => "0x" + randomBytes(32).toString("hex"));
    const secretHashes = secrets.map((s) => HashLock.hashSecret(s));
    const hashLock = secrets.length === 1
      ? HashLock.forSingleFill(secrets[0])
      : HashLock.forMultipleFills(HashLock.getMerkleLeaves(secrets));

    const created = await sdk.createOrder(q, { walletAddress, hashLock, preset, source: "fozpay", secretHashes });
    const hash = created.hash;
    await sdk.submitOrder(srcChainId, created.order, created.quoteId, secretHashes);
    orders.set(hash, { status: "pending", dstAmount: String(q.dstTokenAmount), secrets, done: false, fills: [], approvalTx });
    monitor(sdk, hash, secrets);
    res.json({ orderHash: hash, dstAmount: String(q.dstTokenAmount), status: "pending", approvalTx });
  } catch (e) { res.status(400).json({ error: String(e?.message || e) }); }
});

app.get("/status/:hash", (req, res) => {
  const o = orders.get(req.params.hash);
  if (!o) return res.json({ status: "unknown", done: false });
  res.json({ status: o.status, dstAmount: o.dstAmount, done: o.done, error: o.error || null });
});

app.get("/health", (req, res) => res.json({ ok: true, auth: !!AUTH, alchemy: !!ALCHEMY }));
app.listen(8787, "127.0.0.1", () => console.log("[fusion-signer] listening on 127.0.0.1:8787"));
