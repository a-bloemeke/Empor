import { getRequestConfig } from "next-intl/server"
import { cookies } from "next/headers"

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const locale = cookieStore.get("NEXT_LOCALE")?.value ?? "en"
  const validLocale = ["en", "de"].includes(locale) ? locale : "en"
  return {
    locale: validLocale,
    messages: (await import(`../../messages/${validLocale}.json`)).default,
  }
})
