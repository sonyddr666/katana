import { toZonedTime, formatInTimeZone } from "date-fns-tz";

export async function getDatetime(args: { timezone?: string }): Promise<any> {
  const { timezone } = args;

  try {
    const now = new Date();

    if (timezone) {
      try {
        // Use date-fns-tz for timezone handling
        const formatted = formatInTimeZone(now, timezone, "yyyy-MM-dd HH:mm:ss zzz");
        const zonedDate = toZonedTime(now, timezone);
        const offset = zonedDate.getTimezoneOffset();

        return {
          ok: true,
          scope: "system",
          data: {
            timezone,
            offset_minutes: offset,
            datetime: formatted,
            iso: zonedDate.toISOString(),
          },
        };
      } catch (tzError) {
        return {
          ok: false,
          scope: "system",
          data: { error: `Invalid timezone: ${timezone}` },
        };
      }
    }

    return {
      ok: true,
      scope: "system",
      data: {
        timezone: "UTC",
        datetime: now.toISOString(),
        iso: now.toISOString(),
      },
    };
  } catch (error: any) {
    return {
      ok: false,
      scope: "system",
      data: { error: error.message },
    };
  }
}
