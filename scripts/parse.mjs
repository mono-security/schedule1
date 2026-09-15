import * as XLSX from "xlsx";

export const TARGET_GROUP = "ТД-26-11-1";

const WEEKDAYS = {
  понедельник: "понедельник",
  вторник: "вторник",
  среда: "среда",
  четверг: "четверг",
  пятница: "пятница",
  пянтица: "пятница",
  суббота: "суббота",
  воскресенье: "воскресенье",
};

function cellText(value) {
  if (value == null) return "";
  return String(value).replace(/\r/g, "").replace(/\u00a0/g, " ").trim();
}

function compact(value) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeGroup(value) {
  return value.replace(/\*/g, "").replace(/\s+/g, "").toUpperCase();
}

export function parseTimeRange(raw) {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  const match = cleaned.match(
    /(\d{1,2})\s*[:.]\s*(\d{2})\s*[-–—]\s*(\d{1,2})\s*[:.]\s*(\d{2})/,
  );
  if (!match) return null;
  const h1 = Number(match[1]);
  const m1 = Number(match[2]);
  const h2 = Number(match[3]);
  const m2 = Number(match[4]);
  if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59 || Number.isNaN(h1) || Number.isNaN(h2)) {
    return null;
  }
  const pad = (n) => String(n).padStart(2, "0");
  return {
    time: `${pad(h1)}:${pad(m1)}–${pad(h2)}:${pad(m2)}`,
    startMin: h1 * 60 + m1,
    endMin: h2 * 60 + m2,
  };
}

function parseDayLabel(raw) {
  const text = compact(raw).toLowerCase();
  if (!text) return null;
  let weekday = null;
  for (const [typo, canonical] of Object.entries(WEEKDAYS)) {
    if (text.startsWith(typo) || text.includes(typo)) {
      weekday = canonical;
      break;
    }
  }
  if (!weekday) return null;
  const dateMatch = text.match(/(\d{1,2})[.](\d{1,2})[.](\d{2,4})/);
  let date = null;
  let dateLabel = "";
  if (dateMatch) {
    const dd = dateMatch[1].padStart(2, "0");
    const mm = dateMatch[2].padStart(2, "0");
    let year = dateMatch[3];
    if (year.length === 2) year = `20${year}`;
    date = `${year}-${mm}-${dd}`;
    dateLabel = `${dd}.${mm}`;
  }
  return { weekday, date, dateLabel, key: date ?? weekday };
}

function isClassHour(subject) {
  return /классн/i.test(subject);
}

function cleanRoom(raw) {
  const value = compact(raw.replace(/\|/g, " "));
  if (!value || value === "." || value === "-" || value === "–") return "";
  return value;
}

function weekdayTitle(weekday) {
  return weekday.charAt(0).toUpperCase() + weekday.slice(1);
}

function pickSheet(wb) {
  const preferred =
    wb.SheetNames.find((name) => name.trim().toUpperCase() === "ТД") ??
    wb.SheetNames.find((name) => name.toUpperCase().includes("ТД"));
  if (preferred && wb.Sheets[preferred]) return wb.Sheets[preferred];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
    const found = rows.some((row) =>
      row.some((cell) => normalizeGroup(cellText(cell)) === normalizeGroup(TARGET_GROUP)),
    );
    if (found) return sheet;
  }
  const first = wb.Sheets[wb.SheetNames[0] ?? ""];
  if (!first) throw new Error("В файле нет листов с расписанием");
  return first;
}

function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const row = rows[i] ?? [];
    let subjectCol = -1;
    for (let c = 0; c < row.length; c++) {
      if (normalizeGroup(row[c] ?? "") === normalizeGroup(TARGET_GROUP)) {
        subjectCol = c;
        break;
      }
    }
    if (subjectCol < 0) continue;
    let dayCol = row.findIndex((cell) => /день/i.test(cell));
    let lessonCol = row.findIndex((cell) => /занят/i.test(cell) || /№/.test(cell));
    let timeCol = row.findIndex((cell) => /время/i.test(cell));
    if (dayCol < 0) dayCol = 0;
    if (lessonCol < 0) lessonCol = 1;
    if (timeCol < 0) timeCol = 2;
    return {
      headerIndex: i,
      dayCol,
      lessonCol,
      timeCol,
      subjectCol,
      teacherCol: subjectCol + 1,
      roomCol: subjectCol + 2,
    };
  }
  throw new Error(`Группа ${TARGET_GROUP} не найдена в файле ЭУиК.xls`);
}

export function parseScheduleWorkbook(buffer, meta) {
  const wb = XLSX.read(buffer, { type: "buffer", raw: false, cellText: true });
  const sheet = pickSheet(wb);
  const rawRows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true,
  });
  const rows = rawRows.map((row) => row.map((cell) => cellText(cell)));
  const header = findHeader(rows);

  const dayMap = new Map();
  const dayOrder = [];
  let currentDay = null;
  const pending = [];

  const attach = (day, draft) => {
    let bucket = dayMap.get(day.key);
    if (!bucket) {
      bucket = {
        key: day.key,
        weekday: day.weekday,
        date: day.date,
        dateLabel: day.dateLabel,
        lessons: [],
      };
      dayMap.set(day.key, bucket);
      dayOrder.push(day.key);
    }
    bucket.lessons.push({
      ...draft,
      id: `${day.key}-${draft.lessonNo}-${draft.startMin}-${bucket.lessons.length}`,
      dayKey: day.key,
      weekday: day.weekday,
      date: day.date,
      dateLabel: day.dateLabel,
    });
  };

  for (let r = header.headerIndex + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const joined = compact(row.join(" "));
    if (!joined) continue;
    if (/заведующ|диспетчер/i.test(joined) && !parseTimeRange(row[header.timeCol] ?? "")) {
      continue;
    }

    const dayParsed = parseDayLabel(row[header.dayCol] ?? "");
    if (dayParsed) {
      currentDay = dayParsed;
      if (pending.length) {
        for (const item of pending) attach(dayParsed, item);
        pending.length = 0;
      }
    }

    const subject = compact((row[header.subjectCol] ?? "").replace(/\n/g, " "));
    if (!subject) continue;
    const parsedTime = parseTimeRange(row[header.timeCol] ?? "");
    if (!parsedTime) continue;

    const lessonNoRaw = compact(row[header.lessonCol] ?? "");
    const kind = isClassHour(subject) ? "class_hour" : "class";
    const draft = {
      lessonNo: lessonNoRaw || (kind === "class_hour" ? "КЧ" : "—"),
      kind,
      time: parsedTime.time,
      startMin: parsedTime.startMin,
      endMin: parsedTime.endMin,
      subject,
      teacher: compact((row[header.teacherCol] ?? "").replace(/\n/g, " ")),
      room: cleanRoom(row[header.roomCol] ?? ""),
      isReplacement: /замен/i.test(subject),
    };

    if (currentDay) attach(currentDay, draft);
    else pending.push(draft);
  }

  const days = dayOrder
    .map((key) => dayMap.get(key))
    .filter((day) => day && day.lessons.length)
    .map((day) => ({
      ...day,
      lessons: [...day.lessons].sort((a, b) => a.startMin - b.startMin),
    }));

  if (!days.length) {
    throw new Error(`Для группы ${TARGET_GROUP} пары в файле не найдены`);
  }

  const dates = days.map((d) => d.date).filter(Boolean);
  const first = dates[0];
  const last = dates[dates.length - 1];
  let weekLabel = days.map((d) => weekdayTitle(d.weekday)).join(" — ");
  if (first && last) {
    const fd = first.split("-")[2];
    const fm = first.split("-")[1];
    const ld = last.split("-")[2];
    const lm = last.split("-")[1];
    weekLabel = `${fd}.${fm} — ${ld}.${lm}`;
  }

  return {
    group: TARGET_GROUP,
    weekLabel,
    days,
    sourceName: meta.sourceName,
    sourceModifiedAt: meta.sourceModifiedAt,
    fetchedAt: meta.fetchedAt,
  };
}
