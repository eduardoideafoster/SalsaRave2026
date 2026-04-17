export interface Guest {
  id: string
  order_code: string
  full_name: string
  role: 'Leader' | 'Follower' | 'Both'
  country: string | null
  ticket_type: string
  hotel: 'H3' | 'H4' | null  // null for RAVEPASS (no accommodation)
  check_in_date: string | null
  check_out_date: string | null
  created_at: string
  updated_at: string
}

export interface Room {
  id: string
  room_number: string
  hotel: 'H3' | 'H4'
  room_type: 'single' | 'double' | 'triple_3beds' | 'triple_double_single' | 'quadruple'
  capacity: number
  available_from: string  // Date when room becomes available
  status: 'available' | 'occupied' | 'maintenance' | 'cleaning'
  is_staff: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Booking {
  id: string
  guest_id: string
  room_id: string
  check_in_date: string
  check_out_date: string
  status: 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled'
  notes: string | null
  created_at: string
  updated_at: string
  guest?: Guest
  room?: Room
}

export type Tab = 'guests' | 'rooms' | 'availability' | 'statistics'
