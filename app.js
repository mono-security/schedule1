const WEEKDAY_FROM_INDEX = [
  "воскресенье",
  "понедельник",
  "вторник",
  "среда",
  "четверг",
  "пятница",
  "суббота",
];

const WEEKDAY_SHORT = {
  понедельник: "Пн",
  вторник: "Вт",
  среда: "Ср",
  четверг: "Чт",
  пятница: "Пт",
  суббота: "Сб",
  воскресенье: "Вс",
};

const WEEKDAY_INDEX = {
  воскресенье: 0,
  понедельник: 1,
  вторник: 2,
  среда: 3,
  четверг: 4,
  пятница: 5,
  суббота: 6,
};

const ICONS = {
  clock: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  user: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/></svg>`,
  door: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 4h3a2 2 0 0 1 2 2v14H6V6a2 2 0 0 1 2-2h3"/><path d="M12 20v-4"/><path d="M15 12h.01"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  cap: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>`,
};

const MOSCOW = "Asia/Yekaterinburg";
const root = document.getElementById("app");

let payload = null;
let selectedKey = "";

function getMoscowNow(at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MOSCOW,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const pick = (type) => parts.find((p) => p.type === type)?.value ?? "";
  const isoDate = `${pick("year")}-${pick("month")}-${pick("day")}`;
  const hour = Number(pick("hour"));
  const minute = Number(pick("minute"));
  const weekdayIndex = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
  return {
    isoDate,
    weekday: WEEKDAY_FROM_INDEX[weekdayIndex],
    weekdayIndex,
    minutes: hour * 60 + minute,
    timeLabel: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

function formatUpdatedAt(iso) {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: MOSCOW,
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function weekdayTitle(weekday) {
  return weekday.charAt(0).toUpperCase() + weekday.slice(1);
}

function pluralMinutes(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "минута";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "минуты";
  return "минут";
}

function pluralHours(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "час";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "часа";
  return "часов";
}

function lessonWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "пара";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "пары";
  return "пар";
}

function formatDuration(minutes) {
  if (minutes < 1) return "меньше минуты";
  if (minutes < 60) return `${minutes} ${pluralMinutes(minutes)}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} ${pluralHours(h)}`;
  return `${h} ${pluralHours(h)} ${m} ${pluralMinutes(m)}`;
}

function findToday(schedule, now) {
  return (
    schedule.days.find((day) => day.date === now.isoDate) ??
    schedule.days.find((day) => day.weekday === now.weekday) ??
    null
  );
}

function findDefaultDayKey(schedule, now) {
  const today = findToday(schedule, now);
  if (today) return today.key;
  const upcoming = schedule.days.find((day) => day.date && day.date > now.isoDate);
  return upcoming?.key ?? schedule.days[0]?.key ?? "";
}

function getLiveStatus(schedule, now) {
  const today = findToday(schedule, now);
  if (today) {
    const current = today.lessons.find(
      (lesson) => now.minutes >= lesson.startMin && now.minutes < lesson.endMin,
    );
    if (current) {
      return { type: "now", day: today, lesson: current, remaining: current.endMin - now.minutes };
    }
    const nextToday = today.lessons.find((lesson) => lesson.startMin > now.minutes);
    if (nextToday) {
      const wait = nextToday.startMin - now.minutes;
      const lastBefore = [...today.lessons].reverse().find((lesson) => lesson.endMin <= now.minutes);
      if (lastBefore) return { type: "break", day: today, lesson: nextToday, wait };
      return { type: "upcoming", day: today, lesson: nextToday, wait };
    }
  }
  const nextDay =
    schedule.days.find((day) => day.date && day.date > now.isoDate) ??
    schedule.days.find((day) => (WEEKDAY_INDEX[day.weekday] ?? 99) > now.weekdayIndex) ??
    null;
  return { type: "done", day: today, nextDay };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&" + "amp;")
    .replaceAll("<", "&" + "lt;")
    .replaceAll(">", "&" + "gt;")
    .replaceAll('"', "&" + "quot;");
}

function renderBanner(status) {
  if (status.type === "now") {
    return `<button class="banner now" data-open="${escapeHtml(status.day.key)}" type="button">
      <p class="banner-label">Сейчас идёт</p>
      <p class="banner-title">${escapeHtml(status.lesson.subject)}</p>
      <p class="banner-sub">${escapeHtml(status.lesson.time)} · ещё ${escapeHtml(formatDuration(status.remaining))}${status.lesson.room ? ` · каб. ${escapeHtml(status.lesson.room)}` : ""}</p>
    </button>`;
  }
  if (status.type === "break" || status.type === "upcoming") {
    const label = status.type === "break" ? "Перерыв" : "Ближайшая пара";
    return `<button class="banner" data-open="${escapeHtml(status.day.key)}" type="button">
      <p class="banner-label">${label}</p>
      <p class="banner-title">${escapeHtml(status.lesson.subject)}</p>
      <p class="banner-sub">через ${escapeHtml(formatDuration(status.wait))} · ${escapeHtml(status.lesson.time)}${status.lesson.room ? ` · каб. ${escapeHtml(status.lesson.room)}` : ""}</p>
    </button>`;
  }
  const next = status.nextDay?.lessons[0];
  return `<button class="banner" ${next && status.nextDay ? `data-open="${escapeHtml(status.nextDay.key)}"` : ""} type="button">
    <p class="banner-label">Пары на сегодня закончились</p>
    <p class="banner-sub">${
      next && status.nextDay
        ? `Дальше — ${escapeHtml(weekdayTitle(status.nextDay.weekday).toLowerCase())} в ${escapeHtml(next.time.split("–")[0])}: ${escapeHtml(next.subject)}`
        : "На этой неделе больше пар нет"
    }</p>
  </button>`;
}

function render() {
  if (!payload) return;
  const now = getMoscowNow();
  const schedule = payload.schedule;
  const status = getLiveStatus(schedule, now);
  const todayKey = status.day?.key ?? findDefaultDayKey(schedule, now);
  if (!selectedKey || !schedule.days.some((day) => day.key === selectedKey)) {
    selectedKey = findDefaultDayKey(schedule, now);
  }
  const selected = schedule.days.find((day) => day.key === selectedKey) ?? schedule.days[0];
  const activeId =
    selected && selected.key === (status.day?.key ?? "") && status.lesson ? status.lesson.id : null;

  root.innerHTML = `
    <main class="wrap">
      <header>
        <div class="header-row">
          <div>
            <p class="kicker">Отделение ЭУиК</p>
            <h1 class="title">${escapeHtml(schedule.group)}</h1>
            <p class="meta">Неделя ${escapeHtml(schedule.weekLabel)}<span class="dot">·</span>МСК+2 ${escapeHtml(now.timeLabel)}</p>
          </div>
        </div>
        <p class="updated">Обновлено ${escapeHtml(formatUpdatedAt(schedule.fetchedAt))}${
          schedule.sourceModifiedAt ? ` · файл ${escapeHtml(formatUpdatedAt(schedule.sourceModifiedAt))}` : ""
        }<span class="dot">·</span>автообновление 18:00</p>
        ${payload.warning || payload.stale ? `<p class="warn">${escapeHtml(payload.warning ?? "Показана сохранённая копия расписания")}</p>` : ""}
      </header>
      ${renderBanner(status)}
      <div class="days">
        ${schedule.days
          .map(
            (day) => `<button class="day-chip${day.key === selectedKey ? " selected" : ""}" data-day="${escapeHtml(day.key)}" type="button">
              <small>${escapeHtml(WEEKDAY_SHORT[day.weekday] ?? day.weekday)}</small>
              <b>${escapeHtml(day.dateLabel || "—")}</b>
              ${day.key === todayKey ? '<span class="today-dot"></span>' : ""}
            </button>`,
          )
          .join("")}
      </div>
      ${
        selected
          ? `<section class="panel">
        <div class="panel-head">
          <div>
            <h2>${escapeHtml(weekdayTitle(selected.weekday))}</h2>
            <p>${selected.dateLabel ? `${escapeHtml(selected.dateLabel)} · ` : ""}${selected.lessons.length} ${lessonWord(selected.lessons.length)}</p>
          </div>
          ${ICONS.cap}
        </div>
        <ol class="lessons">
          ${selected.lessons
            .map((lesson) => {
              const active = lesson.id === activeId && status.type === "now";
              const next = lesson.id === activeId && status.type !== "now";
              return `<li class="lesson${active ? " active" : next ? " next" : ""}">
                <div class="num"><b>${escapeHtml(lesson.lessonNo)}</b><span>${lesson.kind === "class_hour" ? "час" : "пара"}</span></div>
                <div>
                  <div class="time-row">${ICONS.clock} ${escapeHtml(lesson.time)}${
                    active ? '<span class="badge now">сейчас</span>' : ""
                  }${lesson.isReplacement ? '<span class="badge swap">замена</span>' : ""}</div>
                  <p class="subject">${escapeHtml(lesson.subject)}</p>
                  <div class="facts">
                    ${lesson.teacher ? `<p>${ICONS.user}<span>${escapeHtml(lesson.teacher)}</span></p>` : ""}
                    <p>${lesson.room ? ICONS.door : ICONS.pin}<span>${lesson.room ? `каб. ${escapeHtml(lesson.room)}` : "кабинет не указан"}</span></p>
                  </div>
                </div>
              </li>`;
            })
            .join("")}
        </ol>
      </section>`
          : `<section class="panel empty"><h2>Пар на эту неделю нет</h2></section>`
      }
    </main>
  `;

  root.querySelectorAll("[data-day]").forEach((el) => {
    el.addEventListener("click", () => {
      selectedKey = el.getAttribute("data-day") ?? "";
      render();
    });
  });
  root.querySelectorAll("[data-open]").forEach((el) => {
    el.addEventListener("click", () => {
      selectedKey = el.getAttribute("data-open") ?? selectedKey;
      render();
    });
  });
}

function showError(message) {
  root.innerHTML = `<div class="error-page">
    <h1>Не удалось загрузить</h1>
    <p>${escapeHtml(message)}</p>
    <button class="retry" type="button" id="retry">Попробовать снова</button>
  </div>`;
  document.getElementById("retry")?.addEventListener("click", () => load());
}

async function load() {
  try {
    const response = await fetch("./schedule.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Файл расписания не найден");
    payload = await response.json();
    if (!payload?.schedule?.days) throw new Error("Некорректный файл расписания");
  } catch (error) {
    showError(error instanceof Error ? error.message : "Ошибка загрузки");
    return;
  }
  render();
}

load();
setInterval(() => {
  if (payload) render();
}, 30_000);
