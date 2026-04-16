export async function getDatetime(args: { timezone?: string }): Promise<any> {
  const { timezone } = args;

  try {
    const now = new Date();
    const effectiveTimezone = timezone || "UTC";
    const formatted = new Intl.DateTimeFormat("sv-SE", {
      timeZone: effectiveTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(now);

    return {
      ok: true,
      scope: "system",
      data: {
        timezone: effectiveTimezone,
        datetime: formatted,
        iso: now.toISOString(),
        unix_ms: now.getTime(),
      },
      suggested_next: "Pass a timezone like America/Sao_Paulo to compare regional time.",
    };
  } catch (error: any) {
    return {
      ok: false,
      scope: "system",
      data: { error: error.message, timezone },
    };
  }
}
