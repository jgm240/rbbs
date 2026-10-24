// Runs the real hostbbs.py inside Pyodide (Python compiled to WebAssembly), off the page's main thread.
importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js");

let py = null, demo = null;

const post = (t, d) => postMessage({ t, d });
const syncfs = (populate) => new Promise((res, rej) => py.FS.syncfs(populate, e => (e ? rej(e) : res())));

async function init(m) {
  post("status", "Loading Python (about 10 MB, cached after the first visit)...");
  py = await loadPyodide();
  post("status", "Loading the BBS...");
  const get = (p, type) => fetch(m.base + p).then(r => { if (!r.ok) throw new Error(p + ": " + r.status); return r[type](); });
  const [bbsSrc, demoSrc, manifest] = await Promise.all([get("hostbbs.py", "text"), get("demo.py", "text"), get("art/manifest.json", "json")]);
  py.FS.mkdirTree("/home/pyodide");
  py.FS.writeFile("/home/pyodide/hostbbs.py", bbsSrc);
  py.FS.writeFile("/home/pyodide/demo.py", demoSrc);
  await Promise.all(manifest.map(async p => {
    const buf = new Uint8Array(await get("art/" + p, "arrayBuffer"));
    const dir = "/art/" + p.split("/").slice(0, -1).join("/");
    py.FS.mkdirTree(dir);
    py.FS.writeFile("/art/" + p, buf);
  }));
  post("status", "Opening your private BBS...");
  py.FS.mkdirTree("/data");
  try {
    py.FS.mount(py.FS.filesystems.IDBFS, {}, "/data");
    await syncfs(true);
  } catch (e) {
    post("status", "(Your browser would not keep data between visits; the demo still works.)");
  }
  py.globals.set("__post", (kind, payload) => post(kind, payload));
  py.runPython("import sys; sys.path.insert(0, '/home/pyodide'); import demo; demo.load_module()");
  await py.runPythonAsync("await demo.setup({'tz': " + (m.tz | 0) + "}, __post)");
  demo = py.pyimport("demo");
  setInterval(() => syncfs(false).catch(() => {}), 3000);
  post("ready", "");
}

onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.t === "init") await init(m);
    else if (m.t === "connect") demo.start_call(py.toPy(m.opts || {}));
    else if (m.t === "in") demo.feed(m.d);
    else if (m.t === "reset") { demo.reset_data(); await syncfs(false); post("reset-done", ""); }
  } catch (err) {
    post("error", String(err && err.message || err).split("\n").slice(-3).join(" "));
  }
};
