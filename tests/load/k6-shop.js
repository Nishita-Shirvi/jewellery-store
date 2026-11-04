/**
 * k6 load test (Phase 23): 200 shoppers at once browsing the store.
 *
 *   k6 run -e BASE_URL=http://localhost:3100 tests/load/k6-shop.js
 *
 * Each virtual shopper: home → collection → product page → search-as-you-type → (health).
 * Targets: 95% of requests under 800 ms, fewer than 1% errors.
 * Run against a production build (`npm run build && npm start`), never against the dev server,
 * and never against the live site without telling the client first.
 */
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:3100";

export const options = {
  scenarios: {
    shoppers: {
      executor: "ramping-vus",
      stages: [
        { duration: "30s", target: 200 }, // ramp up
        { duration: "1m", target: 200 }, // hold 200 at once
        { duration: "15s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<800"],
    "http_req_duration{page:product}": ["p(95)<800"],
    "http_req_duration{page:listing}": ["p(95)<800"],
  },
};

const QUERIES = ["ri", "ring", "gold", "neck", "silver ear", "bang", "diam"];

/** Each shopper gets its own address so per-visitor rate limits behave as with real traffic. */
function headersFor() {
  return { "x-forwarded-for": `10.${__VU >> 8}.${__VU & 255}.${(__ITER % 250) + 1}` };
}

export function setup() {
  const res = http.get(`${BASE}/products`);
  const slugs = [
    ...new Set((res.body.match(/\/products\/[a-z0-9-]+/g) || []).map((s) => s.slice(10))),
  ];
  if (slugs.length === 0)
    throw new Error("No products found on /products — seed the database first.");
  return { slugs: slugs.slice(0, 20) };
}

export default function shopper(data) {
  const headers = headersFor();
  const get = (path, page) => {
    const res = http.get(`${BASE}${path}`, { headers, tags: { page } });
    check(res, { [`${page} 200`]: (r) => r.status === 200 });
    if (__ENV.DEBUG && res.status !== 200)
      console.log(`FAIL ${res.status} ${path} ${res.error || ""}`);
    return res;
  };
  get("/", "home");
  sleep(1);
  get("/products", "listing");
  sleep(1);
  get(`/products?sort=price-asc&page=1`, "listing");
  sleep(1);
  const slug = data.slugs[Math.floor(Math.random() * data.slugs.length)];
  get(`/products/${slug}`, "product");
  sleep(1);
  const q = QUERIES[Math.floor(Math.random() * QUERIES.length)];
  get(`/api/search/suggest?q=${encodeURIComponent(q)}`, "suggest");
  sleep(0.5);
  if (__ITER % 5 === 0) get("/api/health", "health");
  sleep(1);
}
