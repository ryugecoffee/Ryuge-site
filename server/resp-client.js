"use strict";
const net = require("node:net");

// Tiny single-command RESP2 client used ONLY by the disposable sandbox service.
// Transactions are implemented inside Redis Lua scripts (EVAL), never by read-modify-write.
function encode(args) {
  const fields = args.map((value) => {
    const data = Buffer.from(String(value), "utf8");
    return Buffer.concat([Buffer.from("$" + data.length + "\r\n"), data, Buffer.from("\r\n")]);
  });
  return Buffer.concat([Buffer.from("*" + args.length + "\r\n"), ...fields]);
}

function parse(buffer, position = 0) {
  const first = buffer.indexOf("\r\n", position);
  if (first < 0) return null;
  const prefix = String.fromCharCode(buffer[position]);
  const head = buffer.subarray(position + 1, first).toString("utf8");
  let next = first + 2;
  if (prefix === "+" || prefix === "-" || prefix === ":") {
    if (prefix === "-") throw new Error("REDIS_ERROR:" + head);
    return { value: prefix === ":" ? Number(head) : head, end: next };
  }
  if (prefix === "$") {
    const length = Number(head);
    if (length === -1) return { value: null, end: next };
    if (buffer.length < next + length + 2) return null;
    return { value: buffer.subarray(next, next + length).toString("utf8"), end: next + length + 2 };
  }
  if (prefix === "*") {
    const length = Number(head);
    if (length === -1) return { value: null, end: next };
    const values = [];
    for (let i = 0; i < length; i++) {
      const part = parse(buffer, next);
      if (!part) return null;
      values.push(part.value);
      next = part.end;
    }
    return { value: values, end: next };
  }
  throw new Error("UNKNOWN_RESP_TYPE");
}

function createStore(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "redis:") throw new Error("SANDBOX_REDIS_PROTOCOL_REQUIRED");
  const host = parsed.hostname;
  const port = Number(parsed.port || 6379);
  const auth = parsed.password ? decodeURIComponent(parsed.password) : null;
  return async function command(...args) {
    // One isolated socket per command: no interleaving or shared mutable command state.
    const sock = net.createConnection({ host, port });
    sock.setTimeout(6000);
    return new Promise((resolve, reject) => {
      let received = Buffer.alloc(0);
      let done = false;
      function finish(err, value) {
        if (done) return;
        done = true;
        sock.destroy();
        if (err) reject(err); else resolve(value);
      }
      sock.on("timeout", () => finish(new Error("REDIS_TIMEOUT")));
      sock.on("error", (err) => finish(err));
      sock.on("connect", async () => {
        try {
          if (auth) {
            // Send auth and wait for response before issuing user command.
            // Connection setup is scoped to each request.
            const authCommand = encode(["AUTH", auth]);
            sock.write(authCommand);
          } else sock.write(encode(args));
        } catch (err) { finish(err); }
      });
      let awaitingAuth = Boolean(auth);
      sock.on("data", (data) => {
        received = Buffer.concat([received, data]);
        try {
          const parsedReply = parse(received);
          if (!parsedReply) return;
          if (awaitingAuth) {
            if (parsedReply.value !== "OK") throw new Error("REDIS_AUTH_FAILED");
            awaitingAuth = false;
            received = received.subarray(parsedReply.end);
            sock.write(encode(args));
            return;
          }
          finish(null, parsedReply.value);
        } catch (err) { finish(err); }
      });
    });
  };
}

module.exports = { createStore };
