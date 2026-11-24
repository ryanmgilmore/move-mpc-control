// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ryan Gilmore
/* Stands in for /data/UserData/schwung/shared/screen_reader.mjs under deno
 * (mapped in deno.json). Like the real one, it hands the text to the host's
 * host_send_screenreader, which the harness records. */
export function announce(text) {
    if (!text || typeof text !== "string") return;
    if (typeof globalThis.host_send_screenreader === "function") globalThis.host_send_screenreader(text);
}
