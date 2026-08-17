import { Room, Guest, Booking, allowedRoomTypes } from '@/lib/types'

/**
 * Rooming checks, in the spirit of the DJ schedule's rules module: pure
 * data in, warnings out, nothing blocked. Eduardo overrides these
 * knowingly all the time — a room let early, a capacity that does not
 * match the beds — so the job here is to make them visible, not to
 * stand in the way.
 *
 * `error` is something that will bite at reception. `soft` is worth a
 * look but may well be deliberate.
 */
export interface RoomingWarning {
  code: string
  severity: 'error' | 'soft'
  message: string
  roomNumber?: string
  hotel?: string
}

const CAPACITY_FOR_TYPE: Record<string, number> = {
  single: 1,
  twin: 2,
  matrimonial: 2,
  double: 2,
  triple: 3,
  quadruple: 4,
}

export function validateRooming({
  rooms,
  guests,
  bookings,
}: {
  rooms: Room[]
  guests: Guest[]
  bookings: Booking[]
}): RoomingWarning[] {
  const warnings: RoomingWarning[] = []
  const active = bookings.filter((b) => b.status !== 'cancelled')
  const guestById = new Map(guests.map((g) => [g.id, g]))

  const byRoom = new Map<string, Booking[]>()
  for (const b of active) {
    const list = byRoom.get(b.room_id) ?? []
    list.push(b)
    byRoom.set(b.room_id, list)
  }

  for (const room of rooms) {
    const bs = byRoom.get(room.id) ?? []
    const where = { roomNumber: room.room_number, hotel: room.hotel }

    if (bs.length > room.capacity) {
      warnings.push({
        code: 'over-capacity',
        severity: 'error',
        message: `${room.hotel} ${room.room_number}: ${bs.length} guests in a room for ${room.capacity}`,
        ...where,
      })
    }

    // The bed layout a room is allowed to have — H4 single-bed rooms
    // cannot be twin.
    const allowed = allowedRoomTypes(room.hotel, room.room_number)
    if (!allowed.includes(room.room_type)) {
      warnings.push({
        code: 'bed-layout',
        severity: 'error',
        message: `${room.hotel} ${room.room_number} is ${room.room_type}, but this room only takes ${allowed.join(' or ')}`,
        ...where,
      })
    }

    // Matrimonial means two people sharing one bed. One person in it is a
    // single and should say so: the label drives the hotel rate, so leaving it
    // as matrimonial quietly bills 83 € instead of 108 € in H4.
    if (room.room_type === 'matrimonial' && bs.length === 1) {
      warnings.push({
        code: 'matrimonial-alone',
        severity: 'error',
        message: `${room.hotel} ${room.room_number}: matrimonial with one guest — relabel it single`,
        ...where,
      })
    }

    const expected = CAPACITY_FOR_TYPE[room.room_type]
    if (expected !== undefined && room.capacity !== expected) {
      warnings.push({
        code: 'capacity-mismatch',
        severity: 'soft',
        message: `${room.hotel} ${room.room_number}: ${room.room_type} with capacity ${room.capacity}, normally ${expected}`,
        ...where,
      })
    }

    // Someone arriving before the room is free is the one that bites at
    // the desk: there is no key to hand over.
    const first = bs
      .map((b) => b.check_in_date)
      .filter(Boolean)
      .sort()[0]
    if (first && room.available_from && first < room.available_from) {
      warnings.push({
        code: 'early-check-in',
        severity: 'error',
        message: `${room.hotel} ${room.room_number}: guest arrives ${first}, room only free from ${room.available_from}`,
        ...where,
      })
    }

    for (const b of bs) {
      const g = guestById.get(b.guest_id)
      if (g?.hotel && g.hotel !== room.hotel) {
        warnings.push({
          code: 'hotel-mismatch',
          severity: 'error',
          message: `${g.full_name} booked ${g.hotel} but sits in ${room.hotel} ${room.room_number}`,
          ...where,
        })
      }
    }
  }

  // A guest can only sleep in one room.
  const roomsPerGuest = new Map<string, Set<string>>()
  for (const b of active) {
    const set = roomsPerGuest.get(b.guest_id) ?? new Set<string>()
    set.add(b.room_id)
    roomsPerGuest.set(b.guest_id, set)
  }
  for (const [guestId, set] of roomsPerGuest) {
    if (set.size < 2) continue
    const g = guestById.get(guestId)
    const numbers = [...set]
      .map((id) => rooms.find((r) => r.id === id))
      .filter(Boolean)
      .map((r) => `${r!.hotel} ${r!.room_number}`)
    warnings.push({
      code: 'guest-twice',
      severity: 'error',
      message: `${g?.full_name ?? 'A guest'} is in ${set.size} rooms: ${numbers.join(', ')}`,
    })
  }

  const order = { error: 0, soft: 1 }
  return warnings.sort(
    (a, b) => order[a.severity] - order[b.severity] || a.code.localeCompare(b.code),
  )
}
