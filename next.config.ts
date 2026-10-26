import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

function softenReadlinkError(error: unknown): unknown {
  if (!error || typeof error !== "object" || (error as NodeJS.ErrnoException).code !== "EISDIR") {
    return error;
  }
  const orig = error as NodeJS.ErrnoException;
  const next = new Error(
    String(orig.message).replace(
      "EISDIR: illegal operation on a directory, readlink",
      "EINVAL: invalid argument, readlink",
    ),
  ) as NodeJS.ErrnoException;
  next.code = "EINVAL";
  next.syscall = orig.syscall || "readlink";
  next.path = orig.path;
  return next;
}

if (process.platform === "win32") {
  const origSync = fs.readlinkSync.bind(fs);
  (fs as unknown as { readlinkSync: typeof fs.readlinkSync }).readlinkSync = ((
    ...args: Parameters<typeof fs.readlinkSync>
  ) => {
    try {
      return origSync(...args);
    } catch (error) {
      throw softenReadlinkError(error);
    }
  }) as typeof fs.readlinkSync;

  const origAsync = fs.readlink.bind(fs);
  (fs as unknown as { readlink: typeof fs.readlink }).readlink = ((...args: unknown[]) => {
    const cb = args[args.length - 1];
    if (typeof cb !== "function") {
      return (origAsync as (...a: unknown[]) => unknown)(...args);
    }
    args[args.length - 1] = (err: unknown, res: unknown) => {
      (cb as (e: unknown, r?: unknown) => void)(err ? softenReadlinkError(err) : null, res);
    };
    return (origAsync as (...a: unknown[]) => unknown)(...args);
  }) as typeof fs.readlink;

  if (fs.promises && typeof fs.promises.readlink === "function") {
    const origPromise = fs.promises.readlink.bind(fs.promises);
    fs.promises.readlink = (async (...args: Parameters<typeof fs.promises.readlink>) => {
      try {
        return await origPromise(...args);
      } catch (error) {
        throw softenReadlinkError(error);
      }
    }) as typeof fs.promises.readlink;
  }

  const patchBody = `const fs = require("fs");
function soften(error) {
  if (!error || error.code !== "EISDIR") return error;
  const next = new Error(
    String(error.message).replace(
      "EISDIR: illegal operation on a directory, readlink",
      "EINVAL: invalid argument, readlink"
    )
  );
  next.code = "EINVAL";
  next.syscall = error.syscall || "readlink";
  next.path = error.path;
  return next;
}
const readlinkSync = fs.readlinkSync;
fs.readlinkSync = function patchedReadlinkSync(...args) {
  try { return readlinkSync.apply(this, args); } catch (error) { throw soften(error); }
};
const readlink = fs.readlink;
fs.readlink = function patchedReadlink(...args) {
  const cb = args[args.length - 1];
  if (typeof cb !== "function") return readlink.apply(this, args);
  args[args.length - 1] = function (err, res) { cb(err ? soften(err) : null, res); };
  return readlink.apply(this, args);
};
if (fs.promises && typeof fs.promises.readlink === "function") {
  const readlinkPromise = fs.promises.readlink.bind(fs.promises);
  fs.promises.readlink = async function (...args) {
    try { return await readlinkPromise(...args); } catch (error) { throw soften(error); }
  };
}
`;
  try {
    const cacheDir = path.join(process.cwd(), "node_modules", ".cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    const patchPath = path.join(cacheDir, "vr-readlink-patch.cjs").replace(/\\/g, "/");
    fs.writeFileSync(patchPath, patchBody, "utf8");
    const reqFlag = `--require ${patchPath}`;
    const currentOpts = process.env.NODE_OPTIONS ?? "";
    if (!currentOpts.includes("vr-readlink-patch.cjs")) {
      process.env.NODE_OPTIONS = currentOpts ? `${currentOpts} ${reqFlag}` : reqFlag;
    }
  } catch {
    // Ignore if filesystem is read-only
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Streamlit multipage modules live in /pages as Python.
  // Next only treats these extensions as routes.
  pageExtensions: ["ts", "tsx"],
};

export default nextConfig;
