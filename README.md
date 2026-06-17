# node-red-contrib-ipgeolocation

 Node-RED nodes for the [IPGeolocation.io](https://ipgeolocation.io) v3 API: IP geolocation, security and threat intelligence, VPN and proxy detection, abuse contacts, ASN lookup, bulk IP processing, timezone, astronomy, and user-agent parsing.

[![npm version](https://img.shields.io/npm/v/node-red-contrib-ipgeolocation.svg)](https://www.npmjs.com/package/node-red-contrib-ipgeolocation)
[![npm downloads](https://img.shields.io/npm/dm/node-red-contrib-ipgeolocation.svg)](https://www.npmjs.com/package/node-red-contrib-ipgeolocation)
[![Node-RED](https://img.shields.io/badge/Node--RED-%3E%3D2.0-8F0000.svg)](https://nodered.org)
[![Node.js](https://img.shields.io/badge/node-%3E%3D14-43853d.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

A complete, production-ready set of **Node-RED IP geolocation nodes**. Look up the country, city, latitude, and longitude of any IP address or domain, score IPs for proxy, VPN, TOR, and bot risk, resolve ASN and abuse-contact data, parse user-agent strings, and fetch timezone and astronomy data, all from low-code Node-RED flows.

---

## Table of contents

- [Features](#features)
- [Quick start](#quick-start)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration: API key](#configuration-api-key)
- [How the nodes work](#how-the-nodes-work)
- [Node reference](#node-reference)
- [Message properties](#message-properties)
- [Error handling and retries](#error-handling-and-retries)
- [Example flows](#example-flows)
- [Recipes](#recipes)
- [API credits](#api-credits)
- [Development and testing](#development-and-testing)
- [FAQ](#faq)
- [License](#license)
- [Links](#links)

---

## Features

- **Single IP geolocation:** resolve country, region, city, latitude, longitude, currency, and timezone for any IPv4, IPv6, or domain.
- **Bulk IP geolocation:** process up to 50,000 IP addresses in one request.
- **IP security and threat intelligence:** detect proxy, VPN, TOR, bot, and threat scores for fraud prevention and access control.
- **Bulk security lookup:** score large IP lists in a single call.
- **Abuse contact lookup:** retrieve the abuse email, phone, and owning organization for an IP.
- **ASN lookup:** resolve Autonomous System details by IP or AS number.
- **Timezone API:** get timezone data by name, IP, coordinates, city, IATA code, ICAO code, or UN/LOCODE.
- **Astronomy API:** sunrise, sunset, moonrise, moonset, twilight phases, moon phase, and solar and lunar positions by coordinates, address, or IP.
- **User-agent parser:** identify browser, device, OS, and engine from a user-agent string.
- **Developer friendly:** dynamic `msg`, `flow`, and `global` inputs, an optional dedicated error output, automatic retries with exponential backoff, secure credential storage, and per-request credit reporting.

---

## Quick start

```bash
# In your Node-RED user directory (usually ~/.node-red)
npm install node-red-contrib-ipgeolocation
```

1. Restart Node-RED.
2. Drag the **ipgeo lookup** node onto the canvas (find it under the **IPGeolocation** palette category).
3. Open the node, click the pencil next to **API Config**, and paste your [free IPGeolocation.io API key](https://app.ipgeolocation.io/signup).
4. Wire an **inject** node in and a **debug** node out, then deploy.
5. Inject any IP string as `msg.payload`, for example `8.8.8.8`, and read the geolocation result from the debug panel.

That is the whole loop: inject an IP, get structured location data back.

---

## Requirements

| Requirement | Version |
|-------------|---------|
| Node-RED | >= 2.0 |
| Node.js | >= 14.0 |
| IPGeolocation.io API key | Free tier works ([sign up](https://app.ipgeolocation.io/signup)) |

---

## Installation

### Palette Manager (recommended)

1. Open Node-RED.
2. Go to **Menu > Manage palette > Install**.
3. Search for `node-red-contrib-ipgeolocation`.
4. Click **Install**.

### npm

```bash
cd ~/.node-red
npm install node-red-contrib-ipgeolocation
```

Restart Node-RED. All ten nodes appear under the **IPGeolocation** category in the palette.

---

## Configuration: API key

Every functional node references a shared **ipgeo config** node that holds your API key. The key is stored as an encrypted Node-RED credential and is never written into exported flow JSON.

1. Drag any IPGeolocation node onto the canvas.
2. Double-click it, then click the pencil icon beside **API Config**.
3. Enter a **Name** and paste your **API Key**.
4. Click **Add**, then **Done**.

Reuse the same config node across every IPGeolocation node so you manage one key in one place.

---

## How the nodes work

These conventions apply to all nine functional nodes.

**Dynamic input.** Any IP, coordinate, or value can be a static string or read at runtime from a `msg`, `flow`, or `global` property. One configured node can serve many different inputs.

**Two outputs by default.** Each node ships with two outputs:

- Output 1 (success): the API result, written to the configured property (default `msg.payload`).
- Output 2 (error): the original `msg` with a structured `msg.error` attached.

Uncheck **Use second output** to collapse to a single output and handle failures flow-wide with a standard **Catch** node.

**Response shaping.** Most nodes expose **Fields** (return only the listed dot-notation paths) and **Excludes** (drop listed paths) so you can trim large responses, for example `location.city,location.country_name` or `security.threat_score`.

**Credit reporting.** Every successful response sets `msg.ipgeo_credits` to the number of API credits the request consumed.

---

## Node reference

| Node | Endpoint | Purpose |
|------|----------|---------|
| `ipgeo-config` | n/a | Shared API key credential |
| `ipgeo-lookup` | `GET /v3/ipgeo` | Single IP or domain geolocation |
| `ipgeo-bulk` | `POST /v3/ipgeo-bulk` | Bulk geolocation, up to 50,000 IPs |
| `ipgeo-security` | `GET /v3/security` | Single-IP security and threat data |
| `ipgeo-bulk-security` | `POST /v3/security-bulk` | Bulk security, up to 50,000 IPs |
| `ipgeo-abuse` | `GET /v3/abuse` | Abuse contact details |
| `ipgeo-asn` | `GET /v3/asn` | ASN details by IP or AS number |
| `ipgeo-timezone` | `GET /v3/timezone` | Timezone by name, IP, coords, city, IATA, ICAO, UN/LOCODE |
| `ipgeo-astronomy` | `GET /v3/astronomy` | Sun and moon data |
| `ipgeo-useragent` | `GET /v3/user-agent` | User-agent parsing |

### ipgeo-lookup: single IP geolocation

Resolves a single IPv4, IPv6, or domain. Leave the IP blank to look up the caller's own IP.

| Option | Description | Default |
|--------|-------------|---------|
| IP / Domain | Static value or `msg` / `flow` / `global` property | empty (caller IP) |
| Include | Optional data modules to add | none |
| Fields / Excludes | Restrict or trim the response | all |
| Language | Response language | `en` |
| User-Agent header | Forward a UA string as a request header | off |
| Output to | Destination property | `msg.payload` |

Include modules:

| Module | Extra credits | Adds |
|--------|:---:|------|
| `security` | +2 | Proxy, VPN, TOR, bot, threat score |
| `abuse` | +1 | Abuse contact (email, phone, org) |
| `user_agent` | 0 | Parsed user-agent |
| `geo_accuracy` | 0 | Accuracy radius and confidence |
| `dma_code` | 0 | US Designated Market Area code |
| `hostname` | 0 | PTR from local database |
| `liveHostname` | 0 | Live DNS PTR lookup |
| `hostnameFallbackLive` | 0 | Database first, then live DNS |

Set `msg.ipgeo_include` upstream to override the include list per message.

### ipgeo-bulk: bulk IP geolocation

Sends up to 50,000 IPs or domains in one POST.

- **Input:** `msg.payload` as a string array (`["1.2.3.4", "example.com"]`) or a comma-separated string, which is split automatically.
- **Output:** an array of result objects in input order. Invalid or private entries come back as `{ "message": "..." }`.

```javascript
// Keep only successfully resolved results
const resolved = msg.payload.filter(r => r.ip);
```

### ipgeo-security: IP security and threat intelligence

Single-IP risk lookup: proxy, VPN, TOR, and bot detection plus a threat score, useful for fraud checks, login protection, and access control. Supports **Fields** and **Excludes**.

### ipgeo-bulk-security: bulk IP security

Bulk version of the security lookup, up to 50,000 IPs. Input handling matches `ipgeo-bulk`. When some entries cannot be scored, the node summarizes them:

| Property | Set when | Meaning |
|----------|----------|---------|
| `msg.ipgeo_invalid_count` | an entry has no `security` object | count of invalid entries |
| `msg.ipgeo_invalid_messages` | as above | the invalid entries' messages |

Both are removed from `msg` when every entry is valid.

### ipgeo-abuse: abuse contact lookup

Returns the abuse-contact record for an IP, such as `abuse.emails`, `abuse.phone_numbers`, and the owning organization. Supports **Fields** and **Excludes**.

### ipgeo-asn: ASN lookup

Looks up Autonomous System details. The **Query type** selects what gets sent:

| Query type | Sends | Notes |
|------------|-------|-------|
| `auto` | neither ip nor asn | API infers from context |
| `ip` | `ip=<value>` | resolve the ASN behind an IP |
| `asn` | `asn=<number>` | an `AS` prefix is stripped automatically (`AS15169` becomes `15169`) |

Supports an **Include** list (`peers`, `downstreams`, `upstreams`, and more), overridable per message via `msg.ipgeo_include`, plus **Fields** and **Excludes**.

### ipgeo-timezone: timezone API

Seven lookup modes:

| Mode | Parameter sent | Example |
|------|----------------|---------|
| Timezone name | `tz` | `America/New_York` |
| IP address | `ip` | `8.8.8.8` |
| Address / city | `location` | `Paris, France` |
| Coordinates | `lat` + `long` | `48.8566`, `2.3522` |
| IATA airport | `iata` | `CDG` |
| ICAO airport | `icao` | `LFPG` |
| UN/LOCODE | `location` | `FRPAR` |

Returns `INVALID_INPUT` when the value required for the chosen mode is missing.

### ipgeo-astronomy: sun and moon data

Returns sunrise, sunset, moonrise, moonset, twilight phases (civil, nautical, astronomical, plus blue hour and golden hour), solar noon, day length, moon phase, illumination, and live solar and lunar positions.

The location can be derived four ways, selected by the **Look up by** mode:

| Mode | Sends | Notes |
|------|-------|-------|
| `coords` | `lat` + `long` | decimal degrees; both required |
| `location` | `location` | address, preferably a city, for example `New York, USA` |
| `ip` | `ip` | any IPv4 or IPv6 address; adds an `ip` field to the response |
| `auto` | nothing | the API uses the caller's IP |

When more than one is supplied, the API prefers coordinates, then location, then IP. Coordinates and location modes return `INVALID_INPUT` when their value is missing.

Optional parameters (all modes):

| Option | Parameter | Description |
|--------|-----------|-------------|
| Date | `date` | `YYYY-MM-DD`; defaults to today at the location |
| Time zone | `time_zone` | IANA name; converts all event times into this zone |
| Elevation | `elevation` | meters above sea level, 0 to 10000; defaults to 0 |
| Language | `lang` | language for the `location` object (paid plans) |

The response nests results under an `astronomy` object alongside a `location` object, so read values such as `payload.astronomy.sunrise` and `payload.location.city`.

### ipgeo-useragent: user-agent parser

Parses a user-agent string into browser, device, OS, and engine. The UA is sent to the API as a request header rather than a query parameter.

Ideal in HTTP-in flows: point the UA source at `msg.req.headers.user-agent` (the default) to parse each visitor's browser automatically. An empty UA returns `INVALID_INPUT`.

---

## Message properties

| Property | Direction | Type | Description |
|----------|-----------|------|-------------|
| `ipgeo_credits` | output | number | Credits consumed by the request |
| `ipgeo_include` | input | string | Per-message override of the include list, where supported |
| `ipgeo_invalid_count` | output | number | Bulk-security: entries with no security result |
| `ipgeo_invalid_messages` | output | array | Bulk-security: messages for invalid entries |
| `error` | output | object | On the error output: `{ code, message, status, body }` |

---

## Error handling and retries

On failure, the node sets `msg.error` with a typed `code`, a readable `message`, the HTTP `status` where applicable, and the raw response `body`.

| Code | Cause |
|------|-------|
| `NO_API_KEY` | Config node missing or key empty |
| `BAD_REQUEST` | Invalid parameters (HTTP 400) |
| `AUTH_FAILED` | Invalid or missing API key (HTTP 401) |
| `FORBIDDEN` | Plan restriction or origin not whitelisted (HTTP 403) |
| `NOT_FOUND` | Endpoint or resource not found (HTTP 404) |
| `VALIDATION` | Validation error (HTTP 422) |
| `LOCKED` | Key locked, quota exceeded, or account suspended (HTTP 423) |
| `RATE_LIMITED` | Too many requests (HTTP 429) |
| `SERVER_ERROR` | API internal error (HTTP 500) |
| `HTTP_ERROR` | Any other non-2xx status |
| `TIMEOUT` | Request timed out |
| `NETWORK_ERROR` | DNS or connectivity failure |
| `NO_RESPONSE` | Request sent but no response received |
| `INVALID_INPUT` / `INVALID_MODE` | Missing or malformed node input |
| `TOO_MANY_IPS` | Bulk request over the 50,000-IP limit |

**Automatic retries.** Transient failures (HTTP 429, 500, 502, 503, 504, timeouts, and network errors) are retried up to 3 times with exponential backoff (500 ms, 1 s, 2 s). For HTTP 429, the `Retry-After` header is honored when present. The default request timeout is 10 seconds, and 30 seconds for the bulk endpoints.

---

## Example flows

The package bundles ready-to-import examples, one per functional node:

| Example | Demonstrates |
|---------|--------------|
| 01 - Single IP Lookup | `ipgeo-lookup` |
| 02 - Bulk IP Lookup | `ipgeo-bulk` |
| 03 - IP Security Lookup | `ipgeo-security` |
| 04 - Bulk IP Security | `ipgeo-bulk-security` |
| 05 - Abuse Contact Lookup | `ipgeo-abuse` |
| 06 - ASN Lookup | `ipgeo-asn` |
| 07 - Timezone Lookup | `ipgeo-timezone` |
| 08 - Astronomy (Sun & Moon) | `ipgeo-astronomy` |
| 09 - User-Agent Parser | `ipgeo-useragent` |

To import: **Menu > Import > Examples**, then choose **node-red-contrib-ipgeolocation** and pick a flow. Each example has an inject trigger, the node wired to result and error debug nodes, and a placeholder config node. Point that config node at your own API key before deploying.

---

## Recipes

### Override the include list per message

```javascript
// In a Function node upstream of ipgeo-lookup or ipgeo-asn
msg.ipgeo_include = "security,abuse";
return msg;
```

### Geolocate the visitor in an HTTP flow

Configure `ipgeo-lookup` with **IP / Domain** as a `msg` property pointing at `req.headers['x-forwarded-for']` (behind a proxy) or `req.connection.remoteAddress` (direct).

### Block proxies and VPNs at the edge

Run incoming IPs through `ipgeo-security`, then use a **Switch** node on `payload.security.is_proxy` or the threat score to drop or flag risky traffic before it reaches your application.

### Return compact bulk responses

On `ipgeo-bulk`, set **Fields** to `location.city,location.country_name,asn.organization`, optionally add **Include** `security`, and **Excludes** `security.threat_score` to return only the data you need per IP.

---

## API credits

| Endpoint or module | Credits |
|--------------------|:---:|
| Single IP lookup (base) | 1 |
| + security module | +2 |
| + abuse module | +1 |
| Bulk lookup | 1-4 per valid IP |
| Security / bulk-security | 2 per valid IP |
| ASN, Abuse, Timezone, User-Agent, Astronomy | 1 |

Each node reports the real charge in `msg.ipgeo_credits`. See the [Credits Usage Guide](https://ipgeolocation.io/documentation/credits-usage.html) for current pricing.

---

## Development and testing

```bash
npm install      # install dependencies
npm test         # run the mocha test suite
npm run coverage # run tests with an HTML and text coverage report
```

Tests use `mocha`, `node-red-node-test-helper`, `should`, and `nock`, with all HTTP fully mocked so the suite runs offline with no live API calls. Specs live in `test/**/*_spec.js` and cover the shared API client, the helpers, every node, and the bundled example flows.

---

## FAQ

**How do I get an IPGeolocation.io API key?**
Sign up for free at [app.ipgeolocation.io/signup](https://app.ipgeolocation.io/signup). The free tier is enough to evaluate every node in this package.

**Is the API key safe in exported flows?**
Yes. The key is stored as an encrypted Node-RED credential on the `ipgeo-config` node and is never included in exported flow JSON.

**Can I look up many IP addresses at once?**
Yes. Use `ipgeo-bulk` for geolocation or `ipgeo-bulk-security` for threat scoring, each handling up to 50,000 IPs per request.

**How do I detect VPNs, proxies, or TOR exit nodes?**
Use `ipgeo-security` (or add the `security` include module to `ipgeo-lookup`) and inspect the proxy, VPN, TOR, and threat-score fields in the result.

**Does it work behind a reverse proxy?**
Yes. Read the client IP from `req.headers['x-forwarded-for']` and feed it into `ipgeo-lookup` as a dynamic `msg` input.

**What happens when I hit a rate limit?**
The node retries automatically with backoff and honors the `Retry-After` header. Persistent limits surface as a `RATE_LIMITED` error on the error output.

---

## License

[MIT](./LICENSE) (c) IPGeolocation.io

---

## Links

- [IPGeolocation.io website](https://ipgeolocation.io)
- [API documentation](https://ipgeolocation.io/documentation.html)
- [Get a free API key](https://app.ipgeolocation.io/signup)
- [Node-RED](https://nodered.org)
- [npm package](https://www.npmjs.com/package/node-red-contrib-ipgeolocation)
- [Issue tracker](https://github.com/IPGeolocation/node-red-contrib-ipgeolocation/issues)
