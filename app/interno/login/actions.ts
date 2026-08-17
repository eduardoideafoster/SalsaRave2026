'use server'

import { cookies } from 'next/headers'

export async function authenticate(password: string) {
  if (password === process.env.INTERNAL_PASSWORD) {
    const store = await cookies()
    store.set('interno-auth', 'ok', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    })
    return { ok: true }
  }
  return { ok: false }
}

export async function logout() {
  const store = await cookies()
  store.delete('interno-auth')
}
