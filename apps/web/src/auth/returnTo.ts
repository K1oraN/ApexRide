// Only known application pages can be login destinations. Never trust a URL query.
export function safeReturnTo(value: string | null): string {
  if (
    !value ||
    !value.startsWith('/') ||
    /[\\\s]/u.test(value) ||
    [...value].some(
      (char) => char.codePointAt(0)! < 32 || char.codePointAt(0) === 127,
    )
  )
    return '/app';
  try {
    const url = new URL(value, 'https://apex.invalid');
    if (url.origin !== 'https://apex.invalid') return '/app';
    // Reject encoded separators/dot segments, including repeated encoding.
    if (
      /%|\\/.test(decodeURIComponent(url.pathname)) ||
      /%2e|%2f|%5c/i.test(value.split(/[?#]/)[0]!)
    )
      return '/app';
    if (
      !/^\/(app|explorar|ride|guia|descobertas|comunidade|garagem|perfil|configuracoes|privacidade|historico|estatisticas|tecnico)(\/|$)/.test(
        url.pathname,
      )
    )
      return '/app';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/app';
  }
}
