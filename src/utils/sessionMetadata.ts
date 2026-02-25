const decodeJwtPayload = (accessToken: string): Record<string, unknown> | null => {
  try {
    const tokenParts = accessToken.split(".");
    if (tokenParts.length < 2) {
      return null;
    }

    const payload = tokenParts[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(window.atob(padded));
  } catch {
    return null;
  }
};

export const extractSessionIdFromAccessToken = (accessToken?: string | null): string | null => {
  if (!accessToken) {
    return null;
  }

  const payload = decodeJwtPayload(accessToken);
  const rawSessionId = payload?.session_id;

  return typeof rawSessionId === "string" && rawSessionId.length > 0 ? rawSessionId : null;
};

const getBrowserName = (userAgent: string): string => {
  if (/edg/i.test(userAgent)) return "Edge";
  if (/opr|opera/i.test(userAgent)) return "Opera";
  if (/chrome|crios/i.test(userAgent)) return "Chrome";
  if (/firefox|fxios/i.test(userAgent)) return "Firefox";
  if (/safari/i.test(userAgent) && !/chrome|crios/i.test(userAgent)) return "Safari";
  return "Unknown Browser";
};

const getOsName = (userAgent: string): string => {
  if (/windows nt 10\.0/i.test(userAgent)) return "Windows 10/11";
  if (/windows/i.test(userAgent)) return "Windows";
  if (/android/i.test(userAgent)) return "Android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "iOS";
  if (/mac os x/i.test(userAgent)) return "macOS";
  if (/linux/i.test(userAgent)) return "Linux";
  return "Unknown OS";
};

const getDeviceName = (userAgent: string, os: string): string => {
  if (/iphone/i.test(userAgent)) return "iPhone";
  if (/ipad/i.test(userAgent)) return "iPad";
  if (/android/i.test(userAgent) && /mobile/i.test(userAgent)) return "Android Phone";
  if (/android/i.test(userAgent)) return "Android Tablet";
  if (/mobile/i.test(userAgent)) return "Mobile Device";
  if (/mac/i.test(userAgent)) return "Mac";
  if (/windows/i.test(userAgent)) return "Windows PC";
  if (/linux/i.test(userAgent)) return "Linux Device";
  return `${os} Device`;
};

export const getClientSessionMetadata = () => {
  const userAgent = navigator.userAgent || "";
  const browser = getBrowserName(userAgent);
  const os = getOsName(userAgent);
  const deviceName = getDeviceName(userAgent, os);

  return {
    deviceName,
    browser,
    os,
    location: null as string | null,
    userAgent,
  };
};
