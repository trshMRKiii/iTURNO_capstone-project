import { useState, useEffect } from "react";
import { apiService } from "./api-service";

function useCurrentUserCheck(check) {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    apiService
      .getCurrentUser()
      .then((user) => setAllowed(!!user && check(user)))
      .catch(() => setAllowed(false));
  }, []);
  return allowed;
}

// Everyone can view the registry; only Admins and leads may edit or archive
// (mirrors CanManageFleet on the backend).
export function useCanModifyFleet() {
  return useCurrentUserCheck((user) => user.role !== "PERSONNEL");
}

// Registering new vehicles/drivers: Admins and leads always, Personnel once ticked.
export function useCanRegisterFleet() {
  return useCurrentUserCheck((user) => user.role !== "PERSONNEL" || !!user.can_manage_fleet);
}
