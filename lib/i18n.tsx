'use client'

// Lightweight i18n for SalsaRave 2026. No external deps.
// Usage:
//   const t = useT()
//   <p>{t('common.save')}</p>
//   <p>{t('guests.count', { n: 10 })}</p>  (template vars)
// Toggle language via useLang()/setLang() or the button in the TopNav.

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'

export type Lang = 'en' | 'es'

interface Dict {
  [key: string]: string
}

const dictionaries: Record<Lang, Dict> = {
  en: {
    // Top nav
    'nav.guests': 'GUESTS',
    'nav.rooms': 'ROOMS',
    'nav.availability': 'AVAILABILITY BY DAY',
    'nav.statistics': 'STATISTICS',

    // Common
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.add': 'Add',
    'common.remove': 'Remove',
    'common.search': 'Search',
    'common.clear': 'Clear filters',
    'common.all': 'All',
    'common.none': 'None',
    'common.unassigned': 'Unassigned',
    'common.assigned': 'Assigned',
    'common.actions': 'Actions',
    'common.empty': 'Empty',
    'common.loading': 'Loading',

    // Roles
    'role.Leader': 'Leader',
    'role.Follower': 'Follower',
    'role.Both': 'Both',

    // Room types
    'type.single': 'Single',
    'type.double': 'Double',
    'type.triple': 'Triple',
    'type.quadruple': 'Quadruple',

    // Hotels
    'hotel.H3': 'H3 (Standard)',
    'hotel.H4': 'H4 (Upgraded)',

    // Use
    'use.guest': 'SalsaRaver',
    'use.staff': 'Core Tribe',

    // Status
    'status.available': 'available',
    'status.occupied': 'occupied',
    'status.maintenance': 'maintenance',
    'status.cleaning': 'cleaning',

    // Guests tab
    'guests.search': 'Search by name, order, country...',
    'guests.count': '{n} of {total} guests',
    'guests.add': 'Add Guest',
    'guests.addNew': 'Add New Guest',
    'guests.orderCode': 'Order Code',
    'guests.fullName': 'Full Name',
    'guests.country': 'Country',
    'guests.ticketType': 'Ticket Type',
    'guests.checkIn': 'Check-in',
    'guests.checkOut': 'Check-out',
    'guests.order': 'Order',
    'guests.name': 'Name',
    'guests.role': 'Role',
    'guests.hotel': 'Hotel',
    'guests.room': 'Room',
    'guests.roomType': 'Room Type',
    'guests.notFound': 'No guests found',
    'guests.assign': 'Assign',

    // Guest filters
    'filter.hotel': 'Hotel',
    'filter.allHotels': 'All hotels',
    'filter.noHotel': 'No hotel (RAVEPASS)',
    'filter.role': 'Role',
    'filter.allRoles': 'All roles',
    'filter.country': 'Country',
    'filter.allCountries': 'All countries',
    'filter.ticket': 'Ticket',
    'filter.allTickets': 'All tickets',
    'filter.roomType': 'Room Type',
    'filter.allRoomTypes': 'All room types',
    'filter.assignment': 'Assignment',
    'filter.tribe': 'Tribe',
    'filter.allTribes': 'All Tribes',
    'filter.noTribe': 'No Tribe',
    'filter.use': 'Use',
    'filter.allUses': 'All uses',
    'filter.guests': 'SalsaRavers',
    'filter.staff': 'Core Tribe',
    'filter.type': 'Type',
    'filter.allTypes': 'All types',
    'filter.status': 'Status',
    'filter.allStatuses': 'All statuses',
    'filter.fill': 'Fill',
    'filter.anyFill': 'Any fill',
    'filter.partial': 'Partial',
    'filter.full': 'Full',

    // Rooms tab
    'rooms.count': '{n} rooms',
    'rooms.add': 'Add Room',
    'rooms.addNew': 'Add New Room',
    'rooms.number': 'Room #',
    'rooms.type': 'Type',
    'rooms.capacity': 'Capacity',
    'rooms.availableFrom': 'Available From',
    'rooms.occupants': 'Occupants',
    'rooms.search': 'Search rooms...',
    'rooms.notFound': 'No rooms found',
    'rooms.staffRoom': 'Core Tribe room',
    'rooms.autoAssign': 'Auto-assign',
    'rooms.assigning': 'Assigning...',
    'rooms.autoAssignTitle': 'Group unassigned guests by order and drop each group into an empty matching room',
    'rooms.exportCSV': 'Export CSV',
    'rooms.h4': 'H4 (Upgraded)',
    'rooms.h3': 'H3 (Standard)',
    'rooms.total': 'Total Rooms',
    'rooms.h4All': '50 max — All double',
    'rooms.h3Max': '230 max',
    'rooms.h3Breakdown': 'H3 Breakdown',
    'rooms.staffTarget': '{guest} SalsaRaver · {staff} Core Tribe / 30',

    // Availability tab
    'avail.event': 'Event',
    'avail.daily': 'Daily Availability Overview',
    'avail.dailyHint': 'click a row for details',
    'avail.date': 'Date',
    'avail.h3Available': 'H3 Available',
    'avail.h4Available': 'H4 Available',
    'avail.totalFree': 'Total Free',
    'avail.occupancy': 'Room occupancy per day',
    'avail.chartHint': 'Click a day in the table below for check-in / check-out details',
    'avail.legendAvailable': 'Available',
    'avail.legendBooked': 'Booked',
    'avail.legendNotYet': 'Not Yet Available',
    'avail.h3Title': 'H3 — Standard Hotel',
    'avail.h4Title': 'H4 — Upgraded Hotel',
    'avail.reservedStaff': '{n} reserved for Core Tribe',
    'avail.guestRoomsCount': '{n} guest rooms',
    'avail.h3Cap': '{n} guest rooms',
    'avail.h4Cap': '{n} guest rooms',
    'avail.h4AllDoubles': 'All rooms are double rooms that can be used as single',
    'avail.guestRooms': 'Guest rooms: {total} (H3: {h3}, H4: {h4}) · Staff-reserved: {staff}',
    'avail.room': 'Room',
    'avail.showingFirst': 'Showing first {shown} rooms of {total} total',
    'avail.bar.staff': 'Core Tribe',
    'avail.bar.nights4': 'Guests 4-night',
    'avail.bar.nights3': 'Guests 3-night',
    'avail.bar.other': 'Other',
    'avail.bar.free': 'Free',
    'avail.day.checkIns': 'Check-ins',
    'avail.day.checkOuts': 'Check-outs',
    'avail.day.staying': 'Currently staying',
    'avail.day.staffRooms': 'Core Tribe rooms',
    'avail.day.noCheckIns': 'No check-ins this day.',
    'avail.day.noCheckOuts': 'No check-outs this day.',
    'avail.day.noStaying': 'Nobody staying.',
    'avail.day.stayingTitle': 'Staying',
    'avail.day.checkInsTitle': 'Check-ins',
    'avail.day.checkOutsTitle': 'Check-outs',

    // Statistics tab
    'stats.totalRemaining': 'Total Remaining',
    'stats.h3Card': 'H3 — Standard',
    'stats.h4Card': 'H4 — Upgraded',
    'stats.ofGuestRooms': 'of {total} guest rooms · {booked} booked',
    'stats.ofTotal': 'of {total} · {booked} booked',
    'stats.occupancy': 'Occupancy',
    'stats.occupancyDetail': '{used} of {total} rooms used (guests + staff)',
    'stats.staffRooms': 'Core Tribe Rooms',
    'stats.staffRoomsTarget': 'of 30 target',
    'stats.totalAttendees': 'Total Attendees',
    'stats.uniqueOrders': '{n} unique orders',
    'stats.leaders': 'Leaders',
    'stats.followers': 'Followers',
    'stats.countries': 'Countries',
    'stats.represented': 'Represented',
    'stats.withAcc': 'With Accommodation',
    'stats.ofAttendees': '{pct}% of attendees',
    'stats.ravepassOnly': 'RAVEPASS Only',
    'stats.noAcc': 'No accommodation',
    'stats.h3Guests': 'H3 (Standard)',
    'stats.h3GuestsSub': 'Standard hotel guests',
    'stats.h4Guests': 'H4 (Upgraded)',
    'stats.h4GuestsSub': '50 rooms available',
    'stats.fourNights': '4 Nights (Thu-Mon)',
    'stats.fourNightsSub': 'Sep 10-14',
    'stats.threeNights': '3 Nights (Fri-Mon)',
    'stats.threeNightsSub': 'Sep 11-14',
    'stats.roleDist': 'Role Distribution',
    'stats.leaderFollowerRatio': 'Leader/Follower Ratio',
    'stats.ticketTypes': 'Ticket Types',
    'stats.countryDist': 'Country Distribution ({n} countries)',
    'stats.roomShare': 'Room Sharing Statistics',
    'stats.totalOrders': 'Total Orders',
    'stats.singleBookings': 'Single Bookings',
    'stats.singleBookingsSub': '(1 person/order)',
    'stats.doubleBookings': 'Double Bookings',
    'stats.doubleBookingsSub': '(2 people/order)',
    'stats.tripleBookings': 'Triple Bookings',
    'stats.tripleBookingsSub': '(3+ people/order)',
    'stats.sharing': 'Sharing Rooms',
    'stats.sharingSub': '(guests in shared)',

    // Assign room dialog
    'assign.title': 'Assign room',
    'assign.currentlyIn': 'Currently in room',
    'assign.searchRooms': 'Search rooms by number...',
    'assign.noRooms': 'No matching rooms',
    'assign.occupants': '{n}/{cap} occupants',
    'assign.current': 'current',
    'assign.noAccommodation': 'This guest has no accommodation (RAVEPASS or missing dates) — nothing to assign.',

    // Guest detail dialog
    'detail.title': 'Guest details',
    'detail.roomTitle': 'Room',
    'detail.changeRoom': 'Change room',
    'detail.assignRoom': 'Assign room',
    'detail.noRoom': 'No room assigned yet.',
    'detail.noAcc': 'This guest has no accommodation (RAVEPASS or no dates).',
    'detail.roommates': 'Roommates',
    'detail.alone': '{name} is alone in this room.',
    'detail.addOccupant': 'Add another occupant',
    'detail.bedsFree': '{n} bed{s} free',
    'detail.searchUnassigned': 'Search unassigned guests (same hotel)...',
    'detail.noMatching': 'No matching unassigned guests',
    'detail.removeFromRoom': 'Remove from room',

    // Finance
    'finance.title': 'Finance',
    'finance.logout': 'Log out',
    'finance.summary': 'Summary',
    'finance.import': 'Import payments XLSX',
    'finance.importing': 'Importing…',
    'finance.imported': '[{mode}] {inserted} inserted · {updated} updated · {skipped} skipped (total {amount})',
    'finance.importError': 'Error: {msg}',
    'finance.paid': 'Paid (gross)',
    'finance.paidHint': '{n} attendees',
    'finance.hotelCost': 'Hotel cost',
    'finance.hotelCostHint': '{n} unique nights',
    'finance.grossMargin': 'Gross margin',
    'finance.extraIncome': 'Extra income (manual)',
    'finance.manualExpenses': 'Expenses (manual)',
    'finance.netProfit': 'Net profit',
    'finance.ravepassNote': 'Hotel cost H3: {h3} · H4: {h4} · RavePass: no hotel cost',
    'finance.addManual': 'Add manual expense / income',
    'finance.formType': 'Type',
    'finance.formCategory': 'Category',
    'finance.formDescription': 'Description',
    'finance.formAmount': '€',
    'finance.formDate': 'Date',
    'finance.add': 'Add',
    'finance.typeIncome': 'Income',
    'finance.typeExpense': 'Expense',
    'finance.colDate': 'Date',
    'finance.colType': 'Type',
    'finance.colCategory': 'Category',
    'finance.colDescription': 'Description',
    'finance.colAmount': 'Amount',
    'finance.noEntries': 'No entries yet.',
    'finance.deleteConfirm': 'Delete this entry?',
    'finance.byCategory': 'By category (manual)',
    'finance.noData': 'No data.',
    'finance.loading': 'Loading…',
    'finance.cat.tickets': 'Tickets',
    'finance.cat.sponsorship': 'Sponsorship',
    'finance.cat.otherIncome': 'Other income',
    'finance.cat.hotel': 'Hotel',
    'finance.cat.catering': 'Catering',
    'finance.cat.production': 'Production',
    'finance.cat.artists': 'Artists',
    'finance.cat.marketing': 'Marketing',
    'finance.cat.logistics': 'Logistics',
    'finance.cat.other': 'Other',
  },

  es: {
    // Top nav
    'nav.guests': 'HUÉSPEDES',
    'nav.rooms': 'HABITACIONES',
    'nav.availability': 'DISPONIBILIDAD',
    'nav.statistics': 'ESTADÍSTICAS',

    // Common
    'common.save': 'Guardar',
    'common.cancel': 'Cancelar',
    'common.close': 'Cerrar',
    'common.delete': 'Eliminar',
    'common.edit': 'Editar',
    'common.add': 'Añadir',
    'common.remove': 'Quitar',
    'common.search': 'Buscar',
    'common.clear': 'Limpiar filtros',
    'common.all': 'Todos',
    'common.none': 'Ninguno',
    'common.unassigned': 'Sin asignar',
    'common.assigned': 'Asignado',
    'common.actions': 'Acciones',
    'common.empty': 'Vacía',
    'common.loading': 'Cargando',

    // Roles
    'role.Leader': 'Líder',
    'role.Follower': 'Seguidor/a',
    'role.Both': 'Ambos',

    // Room types
    'type.single': 'Individual',
    'type.double': 'Doble',
    'type.triple': 'Triple',
    'type.quadruple': 'Cuádruple',

    // Hotels
    'hotel.H3': 'H3 (Estándar)',
    'hotel.H4': 'H4 (Superior)',

    // Use
    'use.guest': 'SalsaRaver',
    'use.staff': 'Core Tribe',

    // Status
    'status.available': 'disponible',
    'status.occupied': 'ocupada',
    'status.maintenance': 'mantenimiento',
    'status.cleaning': 'limpieza',

    // Guests tab
    'guests.search': 'Buscar por nombre, pedido, país...',
    'guests.count': '{n} de {total} huéspedes',
    'guests.add': 'Añadir huésped',
    'guests.addNew': 'Nuevo huésped',
    'guests.orderCode': 'Código de pedido',
    'guests.fullName': 'Nombre completo',
    'guests.country': 'País',
    'guests.ticketType': 'Tipo de entrada',
    'guests.checkIn': 'Entrada',
    'guests.checkOut': 'Salida',
    'guests.order': 'Pedido',
    'guests.name': 'Nombre',
    'guests.role': 'Rol',
    'guests.hotel': 'Hotel',
    'guests.room': 'Habitación',
    'guests.roomType': 'Tipo',
    'guests.notFound': 'Sin huéspedes',
    'guests.assign': 'Asignar',

    // Filters
    'filter.hotel': 'Hotel',
    'filter.allHotels': 'Todos los hoteles',
    'filter.noHotel': 'Sin hotel (RAVEPASS)',
    'filter.role': 'Rol',
    'filter.allRoles': 'Todos los roles',
    'filter.country': 'País',
    'filter.allCountries': 'Todos los países',
    'filter.ticket': 'Entrada',
    'filter.allTickets': 'Todas las entradas',
    'filter.roomType': 'Tipo de habitación',
    'filter.allRoomTypes': 'Todos los tipos',
    'filter.assignment': 'Asignación',
    'filter.tribe': 'Tribu',
    'filter.allTribes': 'Todas las tribus',
    'filter.noTribe': 'Sin tribu',
    'filter.use': 'Uso',
    'filter.allUses': 'Todos los usos',
    'filter.guests': 'SalsaRavers',
    'filter.staff': 'Core Tribe',
    'filter.type': 'Tipo',
    'filter.allTypes': 'Todos los tipos',
    'filter.status': 'Estado',
    'filter.allStatuses': 'Todos los estados',
    'filter.fill': 'Ocupación',
    'filter.anyFill': 'Cualquier ocupación',
    'filter.partial': 'Parcial',
    'filter.full': 'Llena',

    // Rooms tab
    'rooms.count': '{n} habitaciones',
    'rooms.add': 'Añadir habitación',
    'rooms.addNew': 'Nueva habitación',
    'rooms.number': 'Nº hab.',
    'rooms.type': 'Tipo',
    'rooms.capacity': 'Capacidad',
    'rooms.availableFrom': 'Disponible desde',
    'rooms.occupants': 'Ocupantes',
    'rooms.search': 'Buscar habitaciones...',
    'rooms.notFound': 'Sin habitaciones',
    'rooms.staffRoom': 'Habitación de staff',
    'rooms.autoAssign': 'Auto-asignar',
    'rooms.assigning': 'Asignando...',
    'rooms.autoAssignTitle': 'Agrupa huéspedes sin asignar por pedido y coloca cada grupo en una habitación vacía compatible',
    'rooms.exportCSV': 'Exportar CSV',
    'rooms.h4': 'H4 (Superior)',
    'rooms.h3': 'H3 (Estándar)',
    'rooms.total': 'Total habitaciones',
    'rooms.h4All': '50 máx — todas dobles',
    'rooms.h3Max': '230 máx',
    'rooms.h3Breakdown': 'Desglose H3',
    'rooms.staffTarget': '{guest} huésped · {staff} staff / 30',

    // Availability
    'avail.event': 'Evento',
    'avail.daily': 'Disponibilidad diaria',
    'avail.dailyHint': 'pulsa una fila para ver detalles',
    'avail.date': 'Fecha',
    'avail.h3Available': 'H3 Disponibles',
    'avail.h4Available': 'H4 Disponibles',
    'avail.totalFree': 'Total Libres',
    'avail.occupancy': 'Ocupación por día',
    'avail.chartHint': 'Pulsa un día de la tabla para ver entradas / salidas',
    'avail.legendAvailable': 'Disponible',
    'avail.legendBooked': 'Ocupada',
    'avail.legendNotYet': 'Aún no disponible',
    'avail.h3Title': 'H3 — Hotel Estándar',
    'avail.h4Title': 'H4 — Hotel Superior',
    'avail.reservedStaff': '{n} reservadas para staff',
    'avail.guestRoomsCount': '{n} habitaciones para huéspedes',
    'avail.h3Cap': '{n} habitaciones para huéspedes',
    'avail.h4Cap': '{n} habitaciones para huéspedes',
    'avail.h4AllDoubles': 'Todas son dobles y pueden usarse como individuales',
    'avail.guestRooms': 'Habitaciones de huéspedes: {total} (H3: {h3}, H4: {h4}) · Reservadas para staff: {staff}',
    'avail.room': 'Habitación',
    'avail.showingFirst': 'Mostrando primeras {shown} de {total} habitaciones',
    'avail.bar.staff': 'Core Tribe',
    'avail.bar.nights4': '4 noches',
    'avail.bar.nights3': '3 noches',
    'avail.bar.other': 'Otros',
    'avail.bar.free': 'Libre',
    'avail.day.checkIns': 'Entradas',
    'avail.day.checkOuts': 'Salidas',
    'avail.day.staying': 'Alojados',
    'avail.day.staffRooms': 'Hab. staff',
    'avail.day.noCheckIns': 'Sin entradas ese día.',
    'avail.day.noCheckOuts': 'Sin salidas ese día.',
    'avail.day.noStaying': 'Nadie alojado.',
    'avail.day.stayingTitle': 'Alojados',
    'avail.day.checkInsTitle': 'Entradas',
    'avail.day.checkOutsTitle': 'Salidas',

    // Statistics
    'stats.totalRemaining': 'Total disponibles',
    'stats.h3Card': 'H3 — Estándar',
    'stats.h4Card': 'H4 — Superior',
    'stats.ofGuestRooms': 'de {total} habitaciones · {booked} reservadas',
    'stats.ofTotal': 'de {total} · {booked} reservadas',
    'stats.occupancy': 'Ocupación',
    'stats.occupancyDetail': '{used} de {total} habitaciones en uso (huéspedes + staff)',
    'stats.staffRooms': 'Habitaciones staff',
    'stats.staffRoomsTarget': 'de 30 objetivo',
    'stats.totalAttendees': 'Total asistentes',
    'stats.uniqueOrders': '{n} pedidos únicos',
    'stats.leaders': 'Líderes',
    'stats.followers': 'Seguidores',
    'stats.countries': 'Países',
    'stats.represented': 'Representados',
    'stats.withAcc': 'Con alojamiento',
    'stats.ofAttendees': '{pct}% de asistentes',
    'stats.ravepassOnly': 'Solo RAVEPASS',
    'stats.noAcc': 'Sin alojamiento',
    'stats.h3Guests': 'H3 (Estándar)',
    'stats.h3GuestsSub': 'Huéspedes hotel estándar',
    'stats.h4Guests': 'H4 (Superior)',
    'stats.h4GuestsSub': '50 habitaciones disponibles',
    'stats.fourNights': '4 noches (Jue-Lun)',
    'stats.fourNightsSub': '10-14 Sep',
    'stats.threeNights': '3 noches (Vie-Lun)',
    'stats.threeNightsSub': '11-14 Sep',
    'stats.roleDist': 'Distribución por rol',
    'stats.leaderFollowerRatio': 'Ratio Líder/Seguidor',
    'stats.ticketTypes': 'Tipos de entrada',
    'stats.countryDist': 'Distribución por país ({n} países)',
    'stats.roomShare': 'Habitaciones compartidas',
    'stats.totalOrders': 'Pedidos totales',
    'stats.singleBookings': 'Reservas individuales',
    'stats.singleBookingsSub': '(1 persona/pedido)',
    'stats.doubleBookings': 'Reservas dobles',
    'stats.doubleBookingsSub': '(2 personas/pedido)',
    'stats.tripleBookings': 'Reservas triples',
    'stats.tripleBookingsSub': '(3+ personas/pedido)',
    'stats.sharing': 'Compartiendo',
    'stats.sharingSub': '(personas en habitaciones compartidas)',

    // Assign dialog
    'assign.title': 'Asignar habitación',
    'assign.currentlyIn': 'Actualmente en la habitación',
    'assign.searchRooms': 'Buscar habitaciones por número...',
    'assign.noRooms': 'Sin habitaciones compatibles',
    'assign.occupants': '{n}/{cap} ocupantes',
    'assign.current': 'actual',
    'assign.noAccommodation': 'Este huésped no tiene alojamiento (RAVEPASS o sin fechas) — nada que asignar.',

    // Guest detail
    'detail.title': 'Detalles del huésped',
    'detail.roomTitle': 'Habitación',
    'detail.changeRoom': 'Cambiar habitación',
    'detail.assignRoom': 'Asignar habitación',
    'detail.noRoom': 'Sin habitación asignada.',
    'detail.noAcc': 'Este huésped no tiene alojamiento (RAVEPASS o sin fechas).',
    'detail.roommates': 'Compañeros/as',
    'detail.alone': '{name} está solo/a en esta habitación.',
    'detail.addOccupant': 'Añadir otro ocupante',
    'detail.bedsFree': '{n} cama{s} libre{s}',
    'detail.searchUnassigned': 'Buscar huéspedes sin asignar (mismo hotel)...',
    'detail.noMatching': 'Sin huéspedes sin asignar compatibles',
    'detail.removeFromRoom': 'Quitar de la habitación',

    // Finance
    'finance.title': 'Finanzas',
    'finance.logout': 'Cerrar sesión',
    'finance.summary': 'Resumen',
    'finance.import': 'Importar pagos XLSX',
    'finance.importing': 'Importando…',
    'finance.imported': '[{mode}] {inserted} insertados · {updated} actualizados · {skipped} ignorados (total {amount})',
    'finance.importError': 'Error: {msg}',
    'finance.paid': 'Pagado (bruto)',
    'finance.paidHint': '{n} asistentes',
    'finance.hotelCost': 'Coste hotel',
    'finance.hotelCostHint': '{n} noches únicas',
    'finance.grossMargin': 'Margen bruto',
    'finance.extraIncome': 'Ingresos extra (manuales)',
    'finance.manualExpenses': 'Gastos (manuales)',
    'finance.netProfit': 'Beneficio neto',
    'finance.ravepassNote': 'Coste hotel H3: {h3} · H4: {h4} · RavePass sin coste de hotel',
    'finance.addManual': 'Añadir gasto / ingreso manual',
    'finance.formType': 'Tipo',
    'finance.formCategory': 'Categoría',
    'finance.formDescription': 'Descripción',
    'finance.formAmount': '€',
    'finance.formDate': 'Fecha',
    'finance.add': 'Añadir',
    'finance.typeIncome': 'Ingreso',
    'finance.typeExpense': 'Gasto',
    'finance.colDate': 'Fecha',
    'finance.colType': 'Tipo',
    'finance.colCategory': 'Categoría',
    'finance.colDescription': 'Descripción',
    'finance.colAmount': 'Importe',
    'finance.noEntries': 'Sin entradas todavía.',
    'finance.deleteConfirm': '¿Eliminar esta entrada?',
    'finance.byCategory': 'Por categoría (manual)',
    'finance.noData': 'Sin datos.',
    'finance.loading': 'Cargando…',
    'finance.cat.tickets': 'Entradas',
    'finance.cat.sponsorship': 'Patrocinio',
    'finance.cat.otherIncome': 'Otros ingresos',
    'finance.cat.hotel': 'Hotel',
    'finance.cat.catering': 'Catering',
    'finance.cat.production': 'Producción',
    'finance.cat.artists': 'Artistas',
    'finance.cat.marketing': 'Marketing',
    'finance.cat.logistics': 'Logística',
    'finance.cat.other': 'Otros',
  },
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`))
}

interface LangContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const LangContext = createContext<LangContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en')

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('salsarave_lang') : null
    if (stored === 'es' || stored === 'en') setLangState(stored)
  }, [])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    if (typeof window !== 'undefined') window.localStorage.setItem('salsarave_lang', l)
  }, [])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dict = dictionaries[lang]
      const val = dict[key] ?? dictionaries.en[key] ?? key
      return interpolate(val, vars)
    },
    [lang],
  )

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>
}

export function useLang() {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used inside <LanguageProvider>')
  return ctx
}

export function useT() {
  return useLang().t
}
