import { useState, useEffect } from "react";
import { apiService } from "./api-service";

// The supervisors a requisition or remittance can be attributed to, plus whoever is logged in
// (a supervisor keying one in is their own default).
export function useSupervisors() {
  const [supervisors, setSupervisors] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  useEffect(() => {
    apiService.request("/supervisors/").then(setSupervisors).catch(() => {});
    apiService.getCurrentUser().then(setCurrentUser).catch(() => {});
  }, []);
  return { supervisors, currentUser };
}
