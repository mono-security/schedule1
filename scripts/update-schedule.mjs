import { readFile, writeFile } from "node:fs/promises";
import { parseScheduleWorkbook } from "./parse.mjs";

const PUBLIC_KEY =
  "wlsDzWxYtmepORmaCzucIdL43o11AeptdKrtDwjRCx1lh2I+rjDaPPZDnNCCR+AFDqZvSgIch5AN9ddz7ydViQ==";
const FILE_PATH = "/ЭУиК.xls";
const META_URL = "https://cloud-api.yandex.net/v1/disk/public/resources";
const DOWNLOAD_URL = "https://cloud-api.yandex.net/v1/disk/public/resources/download";
const OUT_URL = new URL("../schedule.json", import.meta.url);

function encodeQuery(params) {
  return new URLSearchParams(params).toString();
}

async function yandexJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" }, redirect: "follow" });
  if (!response.ok) {
    const error = new Error(`Яндекс Диск ответил ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

try {
  const meta = await yandexJson(
    `${META_URL}?${encodeQuery({ public_key: PUBLIC_KEY, path: FILE_PATH })}`,
  );
  if (!meta?.name) throw new Error("Не удалось прочитать файл на Яндекс Диске");

  const link = await yandexJson(
    `${DOWNLOAD_URL}?${encodeQuery({ public_key: PUBLIC_KEY, path: FILE_PATH })}`,
  );
  if (!link.href) throw new Error("Яндекс Диск не отдал ссылку на скачивание");

  const file = await fetch(link.href, { redirect: "follow" });
  if (!file.ok) {
    const error = new Error(`Не удалось скачать ЭУиК.xls (${file.status})`);
    error.status = file.status;
    throw error;
  }
  const buffer = Buffer.from(await file.arrayBuffer());

  const schedule = parseScheduleWorkbook(buffer, {
    sourceName: meta.name,
    sourceModifiedAt: meta.modified ?? null,
    fetchedAt: new Date().toISOString(),
  });

  const payload = { schedule, stale: false, warning: null };
  await writeFile(OUT_URL, JSON.stringify(payload, null, 2) + "\n");
  console.log(`OK ${schedule.group} · ${schedule.weekLabel} · ${schedule.days.length} дней`);
} catch (error) {
  if (error?.status === 429) {
    console.warn("Яндекс ответил 429, оставляем прежний schedule.json");
    try {
      await readFile(OUT_URL);
      process.exit(0);
    } catch {
      process.exit(1);
    }
  }
  throw error;
}
