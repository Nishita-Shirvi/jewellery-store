/**
 * Stand-ins for Razorpay's Orders API and Cloudinary uploads, used by the Playwright tests
 * (point RAZORPAY_API_BASE / CLOUDINARY_API_BASE at http://localhost:4010). Never used in production.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";
import http from "node:http";

const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = process.env;

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (req.method === "POST" && url.pathname === "/v1/orders") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const auth = Buffer.from(
          (req.headers.authorization ?? "").replace("Basic ", ""),
          "base64",
        ).toString();
        if (auth !== `${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)
          return res.writeHead(401).end("{}");
        const b = JSON.parse(body);
        res.writeHead(200, { "Content-Type": "application/json" }).end(
          JSON.stringify({
            id: `order_${randomBytes(7).toString("hex")}`,
            amount: b.amount,
            currency: b.currency,
            status: "created",
          }),
        );
      });
      return;
    }

    // Shiprocket: login, create order, AWB, label, pickup, serviceability (pincodes starting 79 = not serviceable).
    if (url.pathname.startsWith("/v1/external/")) {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const json = (code, obj) =>
          res.writeHead(code, { "Content-Type": "application/json" }).end(JSON.stringify(obj));
        if (url.pathname === "/v1/external/auth/login")
          return json(200, { token: "sr_test_token" });
        if (url.pathname === "/v1/external/orders/create/adhoc")
          return json(200, { order_id: 1001, shipment_id: 5001, status: "NEW" });
        if (url.pathname === "/v1/external/courier/assign/awb") {
          const b = JSON.parse(body || "{}");
          return json(200, {
            awb_assign_status: 1,
            response: { data: { awb_code: `AWB${b.shipment_id}`, courier_name: "Test Courier" } },
          });
        }
        if (url.pathname === "/v1/external/courier/generate/label")
          return json(200, { label_created: 1, label_url: "https://example.com/label.pdf" });
        if (url.pathname === "/v1/external/courier/generate/pickup")
          return json(200, { pickup_status: 1 });
        if (url.pathname.startsWith("/v1/external/courier/serviceability")) {
          const pin = url.searchParams.get("delivery_postcode") ?? "";
          return json(200, {
            data: {
              available_courier_companies: pin.startsWith("79")
                ? []
                : [{ estimated_delivery_days: "3" }],
            },
          });
        }
        return json(404, {});
      });
      return;
    }

    // Signs a fake successful payment the way Razorpay's checkout would.
    if (url.pathname === "/sign") {
      const sig = createHmac("sha256", RAZORPAY_KEY_SECRET ?? "")
        .update(`${url.searchParams.get("o")}|${url.searchParams.get("p")}`)
        .digest("hex");
      return res
        .writeHead(200, { "Content-Type": "application/json" })
        .end(JSON.stringify({ sig }));
    }

    if (req.method === "POST" && /^\/v1_1\/[^/]+\/image\/upload$/.test(url.pathname)) {
      req.resume();
      req.on("end", () =>
        res.writeHead(200, { "Content-Type": "application/json" }).end(
          JSON.stringify({
            secure_url: `https://res.cloudinary.com/demo/image/upload/${createHash("md5").update(String(Date.now())).digest("hex")}.png`,
          }),
        ),
      );
      return;
    }

    res.writeHead(404).end();
  })
  .listen(4010, () => console.log("mock services on :4010"));
