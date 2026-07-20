import PropTypes from "prop-types";

// Role options
export const Role = ["PERSONNEL", "SUPERVISOR", "MANAGER"];

// User
export const UserPropTypes = {
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  role: PropTypes.oneOf(Role).isRequired,
  username: PropTypes.string.isRequired,
  password: PropTypes.string,
};

// Vehicle
export const VehiclePropTypes = {
  id: PropTypes.string.isRequired,
  plateNumber: PropTypes.string.isRequired,
  unitNumber: PropTypes.string.isRequired,
  route: PropTypes.string.isRequired,
  status: PropTypes.oneOf(["AVAILABLE", "ON_TRIP", "MAINTENANCE"]).isRequired,
  activeDriverId: PropTypes.string,
  isArchived: PropTypes.bool,
};

// Driver
export const DriverPropTypes = {
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  contact: PropTypes.string.isRequired,
  status: PropTypes.oneOf(["ACTIVE", "INACTIVE"]).isRequired,
  isArchived: PropTypes.bool,
};

// Ticket
export const TicketPropTypes = {
  id: PropTypes.string.isRequired,
  vehicleId: PropTypes.string.isRequired,
  driverId: PropTypes.string.isRequired,
  route: PropTypes.string.isRequired,
  issuedAt: PropTypes.string.isRequired,
  status: PropTypes.oneOf(["ISSUED", "DISPATCHED", "COLLECTED", "CANCELLED"])
    .isRequired,
  collectionAmount: PropTypes.number,
  isVerified: PropTypes.bool,
  nullifiedAt: PropTypes.string,
  reason: PropTypes.string,
};

// BatchArchive
export const BatchArchivePropTypes = {
  id: PropTypes.string.isRequired,
  date: PropTypes.string.isRequired,
  batchName: PropTypes.string.isRequired,
  ticketCount: PropTypes.number.isRequired,
  totalRevenue: PropTypes.number.isRequired,
  finalizedAt: PropTypes.string.isRequired,
  status: PropTypes.oneOf(["FINALIZED", "PENDING"]).isRequired,
};

// DispatchRecord
export const DispatchRecordPropTypes = {
  id: PropTypes.string.isRequired,
  ticketId: PropTypes.string.isRequired,
  dispatchTime: PropTypes.string.isRequired,
};
