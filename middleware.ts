import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Every page needs a Supabase session. The anon key ships inside the
 * browser bundle by design, so with the tables open it was enough to
 * read or delete the whole guest list without ever loading this app.
 * The database now only answers to an authenticated session, and this
 * keeps that session fresh and sends anyone without one to /login.
 *
 * /finance and /interno each keep their own extra password on top, with
 * separate cookies: getting into one does not get you into the other.
 */
const PASSWORD_WALLED = [
  { prefix: '/finance', login: '/finance/login', cookie: 'finance-auth' },
  { prefix: '/interno', login: '/interno/login', cookie: 'interno-auth' },
] as const

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  let res = NextResponse.next({ request: req })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          res = NextResponse.next({ request: req })
          cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
        },
      },
    },
  )

  // getUser revalidates against Supabase; getSession would trust a
  // cookie the browser could have written itself.
  const { data: { user } } = await supabase.auth.getUser()

  if (!user && pathname !== '/login') {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    const url = req.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  for (const area of PASSWORD_WALLED) {
    if (pathname.startsWith(area.prefix) && pathname !== area.login) {
      if (req.cookies.get(area.cookie)?.value !== 'ok') {
        const url = req.nextUrl.clone()
        url.pathname = area.login
        return NextResponse.redirect(url)
      }
    }
  }

  return res
}

export const config = {
  // Everything except Next internals and static files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml)$).*)'],
}
