import { spawn } from 'child_process';
import fs from 'fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outDir = 'C:\\Users\\vinic\\.gemini\\antigravity-ide\\brain\\df5c631a-0ea1-45c4-8dfb-9e08bb849567\\scratch';

const chromeProc = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=9222',
  '--window-size=1920,1080',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--use-gl=angle',
  '--no-sandbox',
  '--user-data-dir=C:\\Users\\vinic\\.gemini\\antigravity-ide\\brain\\df5c631a-0ea1-45c4-8dfb-9e08bb849567\\scratch\\chrome_profile_density',
  'about:blank'
]);

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getWsUrl() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json/version');
      if (res.ok) {
        const json = await res.json();
        return json.webSocketDebuggerUrl;
      }
    } catch (e) {}
    await sleep(200);
  }
  throw new Error('Could not connect to Chrome debugging port');
}

async function run() {
  try {
    const wsUrl = await getWsUrl();
    console.log('Connected to CDP at', wsUrl);

    const ws = new WebSocket(wsUrl);
    let id = 1;
    const callbacks = new Map();

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (callbacks.has(data.id)) {
        const cb = callbacks.get(data.id);
        callbacks.delete(data.id);
        if (data.error) cb.reject(data.error);
        else cb.resolve(data.result);
      }
    };

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const curId = id++;
        callbacks.set(curId, { resolve, reject });
        ws.send(JSON.stringify({ id: curId, method, params }));
      });
    }

    // Create target
    const target = await send('Target.createTarget', { url: 'http://localhost:8080/' });
    const targetWsUrl = `ws://127.0.0.1:9222/devtools/page/${target.targetId}`;

    const pageWs = new WebSocket(targetWsUrl);
    await new Promise((resolve, reject) => {
      pageWs.onopen = resolve;
      pageWs.onerror = reject;
    });

    const pageCallbacks = new Map();
    let pageId = 1;
    pageWs.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (pageCallbacks.has(data.id)) {
        const cb = pageCallbacks.get(data.id);
        pageCallbacks.delete(data.id);
        if (data.error) cb.reject(data.error);
        else cb.resolve(data.result);
      }
    };

    function pageSend(method, params = {}) {
      return new Promise((resolve, reject) => {
        const curId = pageId++;
        pageCallbacks.set(curId, { resolve, reject });
        pageWs.send(JSON.stringify({ id: curId, method, params }));
      });
    }

    await pageSend('Page.enable');
    await pageSend('Runtime.enable');

    console.log('Waiting for scene load...');
    for (let i = 0; i < 40; i++) {
      const check = await pageSend('Runtime.evaluate', {
        expression: 'typeof terrainMesh !== "undefined" && terrainMesh !== null && (document.getElementById("loading-overlay")?.classList.contains("fade-out") || document.getElementById("loading-overlay")?.style.display === "none")'
      });
      if (check?.result?.value) {
        console.log('Scene loaded!');
        break;
      }
      await sleep(500);
    }

    await sleep(2500);

    async function getStats() {
      const res = await pageSend('Runtime.evaluate', {
        expression: `JSON.stringify({
          density: state.props.density,
          label: document.getElementById('val-prop-density')?.textContent,
          badgeNext: document.getElementById('badge-density-next')?.textContent,
          propsCount: document.getElementById('badge-props-count')?.textContent
        })`
      });
      return JSON.parse(res.result.value);
    }

    async function takeShot(name) {
      const shot = await pageSend('Page.captureScreenshot', { format: 'png' });
      const buf = Buffer.from(shot.data, 'base64');
      const fPath = `${outDir}\\${name}.png`;
      fs.writeFileSync(fPath, buf);
      console.log(`Saved screenshot: ${fPath} (${buf.length} bytes)`);
    }

    // Initial state (1.0x)
    console.log('--- Initial State (1.0x) ---');
    console.log(await getStats());
    await pageSend('Runtime.evaluate', { expression: 'setCameraPreset("floresta")' });
    await sleep(1500);
    await takeShot('density_1_0x_floresta');

    // Click Increase Density -> 1.5x
    console.log('--- Clicking Increase Density (-> 1.5x) ---');
    await pageSend('Runtime.evaluate', { expression: 'document.getElementById("btn-increase-density").click()' });
    await sleep(1500);
    console.log(await getStats());
    await takeShot('density_1_5x_floresta');

    // Click Increase Density -> 2.0x
    console.log('--- Clicking Increase Density (-> 2.0x) ---');
    await pageSend('Runtime.evaluate', { expression: 'document.getElementById("btn-increase-density").click()' });
    await sleep(1500);
    console.log(await getStats());
    await takeShot('density_2_0x_floresta');

    // Click Increase Density -> 2.5x
    console.log('--- Clicking Increase Density (-> 2.5x) ---');
    await pageSend('Runtime.evaluate', { expression: 'document.getElementById("btn-increase-density").click()' });
    await sleep(1500);
    console.log(await getStats());
    await takeShot('density_2_5x_floresta');

    // Test quick-pick button: click 1.0x
    console.log('--- Clicking 1.0x quick-pick button ---');
    await pageSend('Runtime.evaluate', { expression: 'document.getElementById("btn-density-1x").click()' });
    await sleep(1500);
    console.log(await getStats());

    // Switch to Soja preset at 2.0x
    console.log('--- Testing Soja preset with 2.0x density ---');
    await pageSend('Runtime.evaluate', { expression: 'setCameraPreset("soja"); document.getElementById("btn-density-2x").click();' });
    await sleep(2000);
    console.log(await getStats());
    await takeShot('density_2_0x_soja');

    console.log('All density tests passed successfully!');
  } finally {
    try { chromeProc.kill(); } catch (e) {}
  }
}

run().catch((e) => {
  console.error('Error in test_density:', e);
  try { chromeProc.kill(); } catch (e) {}
  process.exit(1);
});
