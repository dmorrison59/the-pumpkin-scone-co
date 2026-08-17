const TIME_ZONE = "America/New_York";

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

type EasternParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
};

function getEasternParts(date = new Date()): EasternParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const values: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") values[part.type] = part.value;
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekday: WEEKDAY_INDEX[values.weekday],
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function dateOnlyISO(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDaysToLocalDate(year: number, month: number, day: number, days: number) {
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function getPickupPlan(now = new Date()) {
  const eastern = getEasternParts(now);

  let daysUntilSaturday = (6 - eastern.weekday + 7) % 7;

  const thursdayCutoffPassed =
    eastern.weekday === 4 &&
    (eastern.hour > 20 || (eastern.hour === 20 && eastern.minute >= 0));

  if (thursdayCutoffPassed || eastern.weekday === 5 || eastern.weekday === 6) {
    daysUntilSaturday += 7;
  }

  const pickup = addDaysToLocalDate(
    eastern.year,
    eastern.month,
    eastern.day,
    daysUntilSaturday
  );

  const pickupDate = dateOnlyISO(pickup.year, pickup.month, pickup.day);

  const pickupDisplay = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${pickupDate}T12:00:00Z`));

  return {
    pickupDate,
    pickupDisplay,
    pickupWindow: "9:00 AM–1:00 PM",
    cutoffText: "Thursday at 8:00 PM ET",
  };
}

export function formatPickupDate(pickupDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate)) return pickupDate;

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${pickupDate}T12:00:00Z`));
}
