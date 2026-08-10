import { describe, expect, it } from "vitest";
import { readCookieValue, TIMEZONE_COOKIE_NAME } from "./timezone-cookie";

describe("readCookieValue", () => {
  it("reads the value when the cookie is the only one present", () => {
    expect(readCookieValue("tz=Australia/Sydney", "tz")).toBe(
      "Australia/Sydney",
    );
  });

  it("reads the value when other cookies are present alongside it", () => {
    expect(
      readCookieValue(
        "tipperoos_session=abc123; tz=America/New_York; other=xyz",
        "tz",
      ),
    ).toBe("America/New_York");
  });

  it("returns undefined when the cookie is absent", () => {
    expect(readCookieValue("tipperoos_session=abc123", "tz")).toBeUndefined();
  });

  it("returns undefined for an empty cookie string", () => {
    expect(readCookieValue("", "tz")).toBeUndefined();
  });

  it("does not match a name that is only a prefix of another cookie's name", () => {
    expect(readCookieValue("tzabc=Europe/London", "tz")).toBeUndefined();
  });

  it("trims whitespace around cookie pairs", () => {
    expect(readCookieValue("a=1;  tz=Europe/London ; b=2", "tz")).toBe(
      "Europe/London",
    );
  });

  it("decodes a URI-encoded value", () => {
    expect(readCookieValue("tz=Pacific%2FAuckland", "tz")).toBe(
      "Pacific/Auckland",
    );
  });

  it("uses the exported constant as the real cookie name", () => {
    expect(TIMEZONE_COOKIE_NAME).toBe("tz");
  });
});
