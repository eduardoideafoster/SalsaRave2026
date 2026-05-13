'use server'

import { cookies } from 'next/headers'

export async function authenticate(password: string) {
  if (password === process.env.FINANCE_PASSWORD) {
    const store = await cookies()
    store.set('finance-auth', 'ok', {
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
  store.delete('finance-auth')
}
