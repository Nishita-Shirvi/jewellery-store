import { describe, expect, it } from "vitest";
import { amzDate, encodePath, signV4 } from "@/lib/storage/sigv4";

describe("signV4", () => {
  // AWS's published example: "GET Object" in the S3 Signature V4 documentation.
  it("matches the AWS documentation example", () => {
    const auth = signV4({
      method: "GET",
      host: "examplebucket.s3.amazonaws.com",
      path: "/test.txt",
      headers: {
        range: "bytes=0-9",
        "x-amz-content-sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "x-amz-date": "20130524T000000Z",
      },
      payloadSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      region: "us-east-1",
      service: "s3",
      amzDate: "20130524T000000Z",
    });
    expect(auth).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
  });

  it("formats dates and encodes paths like S3", () => {
    expect(amzDate(new Date("2026-11-18T10:20:30.456Z"))).toBe("20261118T102030Z");
    expect(encodePath("/bucket/products/a b(1).jpg")).toBe("/bucket/products/a%20b%281%29.jpg");
  });
});
