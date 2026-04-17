import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// Event dates: September 7-15, 2026
const EVENT_CHECK_IN = "2026-09-07";
const EVENT_CHECK_OUT = "2026-09-15";

// Parse nights from ticket type
function parseNights(ticket: string): number | null {
  const match = ticket.match(/(\d+)\s*NIGHTS?/i);
  return match ? parseInt(match[1], 10) : null;
}

// Parse room type from ticket
function parseRoomType(ticket: string): string | null {
  if (ticket.includes("UPGRADED SINGLE")) return "upgraded_single";
  if (ticket.includes("SINGLE ROOM")) return "single";
  if (ticket.includes("UPGRADED DOUBLE")) return "upgraded_double";
  if (ticket.includes("DOUBLE ROOM")) return "double";
  return null;
}

// Calculate check-out date based on nights
function calculateCheckOut(nights: number): string {
  const checkIn = new Date(EVENT_CHECK_IN);
  const checkOut = new Date(checkIn);
  checkOut.setDate(checkOut.getDate() + nights);
  return checkOut.toISOString().split("T")[0];
}

// Parse name to get first and last name
function parseName(fullName: string): { firstName: string; lastName: string } {
  const cleaned = fullName.trim().replace(/\s+/g, " ");
  const parts = cleaned.split(" ");
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

async function importAttendees() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase environment variables");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Read CSV file
  const csvPath = path.join(
    process.cwd(),
    "user_read_only_context/text_attachments/Attendees---SalsaRave-2026-(2)-Hjpg0.csv"
  );
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const lines = csvContent.split("\n").slice(1); // Skip header

  // Clear existing data
  console.log("Clearing existing data...");
  await supabase.from("bookings").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("guests").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  // Track unique guests and room bookings
  const guestsMap = new Map<
    string,
    {
      firstName: string;
      lastName: string;
      role: string;
      country: string;
      order: string;
      ticket: string;
    }
  >();

  // Track room bookings by order (to group people sharing a room)
  const roomBookings = new Map<
    string,
    {
      roomType: string;
      nights: number;
      guests: string[];
      ticket: string;
    }
  >();

  // Parse all lines
  for (const line of lines) {
    if (!line.trim()) continue;

    const parts = line.split(";");
    if (parts.length < 8) continue;

    const [order, , , , ticket, fullName, role, country] = parts;

    if (!fullName || fullName === "Placeholder" || fullName === "TBD - Triple Room" || fullName === "Guest") {
      continue;
    }

    const { firstName, lastName } = parseName(fullName);
    const guestKey = `${firstName.toLowerCase()}_${lastName.toLowerCase()}_${country.toLowerCase()}`;

    // Add to guests map (dedupe by name + country)
    if (!guestsMap.has(guestKey)) {
      guestsMap.set(guestKey, {
        firstName,
        lastName,
        role: role.trim(),
        country: country.trim(),
        order,
        ticket: ticket.trim(),
      });
    }

    // Track room bookings
    const roomType = parseRoomType(ticket);
    const nights = parseNights(ticket);

    if (roomType && nights) {
      if (!roomBookings.has(order)) {
        roomBookings.set(order, {
          roomType,
          nights,
          guests: [],
          ticket: ticket.trim(),
        });
      }
      roomBookings.get(order)!.guests.push(guestKey);
    }
  }

  // Insert guests
  console.log(`Inserting ${guestsMap.size} guests...`);
  const guestRecords: Array<{
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    address: string | null;
    notes: string;
  }> = [];

  const guestKeyToId = new Map<string, string>();

  for (const [key, guest] of guestsMap) {
    const email = `${guest.firstName.toLowerCase().replace(/[^a-z]/g, "")}.${guest.lastName.toLowerCase().replace(/[^a-z]/g, "") || "guest"}@salsarave2026.example`;
    guestRecords.push({
      first_name: guest.firstName,
      last_name: guest.lastName || "-",
      email,
      phone: null,
      address: guest.country,
      notes: `Role: ${guest.role} | Order: ${guest.order} | Ticket: ${guest.ticket}`,
    });
  }

  // Insert in batches
  const batchSize = 50;
  for (let i = 0; i < guestRecords.length; i += batchSize) {
    const batch = guestRecords.slice(i, i + batchSize);
    const { data, error } = await supabase.from("guests").insert(batch).select();

    if (error) {
      console.error(`Error inserting guests batch ${i}:`, error.message);
    } else if (data) {
      // Map guest keys to IDs
      const keys = Array.from(guestsMap.keys()).slice(i, i + batchSize);
      data.forEach((record, idx) => {
        guestKeyToId.set(keys[idx], record.id);
      });
    }
  }

  console.log(`Inserted guests, now creating bookings...`);

  // Get all rooms
  const { data: rooms } = await supabase.from("rooms").select("*");
  if (!rooms || rooms.length === 0) {
    console.error("No rooms found in database");
    return;
  }

  // Assign rooms to bookings
  const singleRooms = rooms.filter((r) => r.room_type === "single");
  const doubleRooms = rooms.filter((r) => r.room_type === "double");
  const suiteRooms = rooms.filter((r) => r.room_type === "suite");
  const deluxeRooms = rooms.filter((r) => r.room_type === "deluxe");

  let singleIdx = 0;
  let doubleIdx = 0;
  let suiteIdx = 0;
  let deluxeIdx = 0;

  const bookingRecords: Array<{
    guest_id: string;
    room_id: string;
    check_in_date: string;
    check_out_date: string;
    status: string;
    total_price: number;
    notes: string;
  }> = [];

  for (const [order, booking] of roomBookings) {
    // Find a room for this booking
    let room;
    if (booking.roomType.includes("single")) {
      room = singleRooms[singleIdx % singleRooms.length];
      singleIdx++;
    } else if (booking.roomType.includes("double")) {
      // Use double, suite, or deluxe for double bookings
      if (doubleIdx < doubleRooms.length) {
        room = doubleRooms[doubleIdx % doubleRooms.length];
      } else if (suiteIdx < suiteRooms.length) {
        room = suiteRooms[suiteIdx % suiteRooms.length];
      } else {
        room = deluxeRooms[deluxeIdx % deluxeRooms.length];
      }
      doubleIdx++;
    }

    if (!room) continue;

    // Create booking for first guest in the room
    const guestKey = booking.guests[0];
    const guestId = guestKeyToId.get(guestKey);

    if (!guestId) continue;

    const checkOut = calculateCheckOut(booking.nights);
    const nights = booking.nights;
    const totalPrice = Number(room.price_per_night) * nights;

    bookingRecords.push({
      guest_id: guestId,
      room_id: room.id,
      check_in_date: EVENT_CHECK_IN,
      check_out_date: checkOut,
      status: "confirmed",
      total_price: totalPrice,
      notes: `Order: ${order} | ${booking.ticket}${booking.guests.length > 1 ? ` | Sharing with: ${booking.guests.slice(1).length} other(s)` : ""}`,
    });
  }

  // Insert bookings
  console.log(`Inserting ${bookingRecords.length} bookings...`);
  for (let i = 0; i < bookingRecords.length; i += batchSize) {
    const batch = bookingRecords.slice(i, i + batchSize);
    const { error } = await supabase.from("bookings").insert(batch);
    if (error) {
      console.error(`Error inserting bookings batch ${i}:`, error.message);
    }
  }

  console.log("Import complete!");
  console.log(`Total guests: ${guestsMap.size}`);
  console.log(`Total room bookings: ${bookingRecords.length}`);
}

importAttendees().catch(console.error);
