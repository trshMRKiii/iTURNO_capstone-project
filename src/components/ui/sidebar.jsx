import React from "react";
import { Link } from "react-router-dom";
import { navLinkActive, navLinkDefault, iconBase } from "./NavbarUI";
import {
  CollectionsIcon,
  DashboardIcon,
  DispatchIcon,
  DriverIcon,
  ReportIcon,
  QueueIcon,
  UserIcon,
  VehicleIcon,
} from "./NavIcon";

function Navbar() {
  return (
    <>
      <Link to="/Dashboard" className={navLinkActive}>
        <DashboardIcon className={`${iconBase} text-white`} />
        Dashboard
      </Link>

      <Link to="/Dispatch" className={navLinkActive}>
        <DashboardIcon className={`${iconBase} text-white`} />
        Dispatch
      </Link>

      <Link to="/Queue" className={navLinkActive}>
        <QueueIcon className={`${iconBase} text-white`} />
        Queue
      </Link>

      <Link to="/Collections" className={navLinkActive}>
        <CollectionsIcon className={`${iconBase} text-white`} />
        Collections
      </Link>

      <Link to="/Vehicles" className={navLinkActive}>
        <VehicleIcon className={`${iconBase} text-white`} />
        Vehicles Registry
      </Link>

      <Link to="/Drivers" className={navLinkActive}>
        <DriverIcon className={`${iconBase} text-white`} />
        Drivers Registry
      </Link>

      <Link to="/StaffRegistry" className={navLinkActive}>
        <UserIcon className={`${iconBase} text-white`} />
        Staff Registry
      </Link>

      <Link to="/Reports" className={navLinkActive}>
        <ReportIcon className={`${iconBase} text-white`} />
        Reports
      </Link>
    </>
  );
}

export default Navbar;
