import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache: the book renders in the browser, so there is little to cache.
export default defineCloudflareConfig({});
