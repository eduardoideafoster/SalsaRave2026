import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname.startsWith('/finance') && pathname !== '/finance/login') {
    const cookie = req.cookies.get('finance-auth')?.value
    if (cookie !== 'ok') {
      const url = req.nextUrl.clone()
      url.pathname = '/finance/login'
      return NextResponse.redirect(url)
    }
  }
}

export const config = {
  matcher: ['/finance/:path*'],
}
