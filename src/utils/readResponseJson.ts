/**
 * fetch Response için güvenli JSON okuma.
 * Boş gövde veya proxy bağlantı hatasında response.json() "Unexpected end of JSON input" fırlatır.
 */
export async function readResponseJson<T = Record<string, unknown>>(
  response: Response
): Promise<T> {
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) {
    return {} as T;
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return {} as T;
  }
}
