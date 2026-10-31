import React from "react";
import { apiService } from "../../../lib/api-service";
import CsvImportModal from "../../../components/ui/CsvImportModal";

const CONFIGS = {
  drivers: {
    title: "Import drivers",
    noun: "driver",
    requiredField: "iwp_number",
    importFn: (rows, commit) => apiService.importDrivers(rows, commit),
    template: {
      filename: "driver-import-template.csv",
      rows: [
        ["First Name", "Middle Name", "Last Name", "IWP Number", "IWP Expiration Date", "Gender", "Birthdate", "Province", "City", "Barangay", "Street", "Contact"],
        ["Juan", "Reyes", "Dela Cruz", "1234-5678-9012", "2030-12-31", "Male", "1985-05-04", "La Union", "Bauang", "Payocpoc Norte", "Purok 3", "09171234567"],
      ],
    },
    aliases: {
      first_name: ["first_name", "firstname", "given_name"],
      middle_name: ["middle_name", "middlename", "middle"],
      last_name: ["last_name", "lastname", "surname", "family_name"],
      iwp_number: ["iwp_number", "iwp", "iwp_no"],
      iwp_expiration_date: ["iwp_expiration_date", "iwp_expiration", "iwp_expiry", "iwp_expiry_date"],
      gender: ["gender", "sex"],
      birthdate: ["birthdate", "birth_date", "birthday", "date_of_birth"],
      province: ["province"],
      city: ["city", "municipality", "city_municipality"],
      barangay: ["barangay", "brgy"],
      street: ["street", "purok"],
      contact: ["contact", "contact_number", "mobile", "mobile_number", "phone"],
    },
    columns: [
      { label: "Name", cell: (r) => [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" ") },
      { label: "IWP", cell: (r) => r.iwp_number },
      { label: "Contact", cell: (r) => r.contact },
    ],
    hint: (
      <>
        Your CSV needs these columns. Only <b>Middle Name</b>, <b>Street</b> and <b>Province</b> (blank means La Union) are optional.
      </>
    ),
  },
  vehicles: {
    title: "Import vehicles",
    noun: "vehicle",
    requiredField: "plate_number",
    importFn: (rows, commit) => apiService.importVehicles(rows, commit),
    template: {
      filename: "vehicle-import-template.csv",
      rows: [
        ["Plate Number", "Route", "Transportation", "Franchise Number", "Franchise Expiration Date", "Driver IWP Number"],
        ["ABC-1234", "Bacnotan", "Jeepney", "21-58231", "2030-12-31 (YYYY-MM-DD)", "1234-5678-9012"],
      ],
    },
    aliases: {
      plate_number: ["plate_number", "plate", "plate_no"],
      route: ["route"],
      transportation: ["transportation", "transportation_type", "transport_type", "puv_type", "type"],
      franchise_number: ["franchise_number", "franchise", "franchise_no"],
      franchise_expiration_date: ["franchise_expiration_date", "franchise_expiration", "franchise_expiry", "franchise_expiry_date"],
      operator_iwp: ["driver_iwp_number", "operator_iwp", "operator_iwp_number", "operator", "driver_iwp"],
    },
    columns: [
      { label: "Plate", cell: (r) => r.plate_number },
      { label: "Route", cell: (r) => r.route },
      { label: "Type", cell: (r) => r.transportation },
      { label: "Franchise #", cell: (r) => r.franchise_number },
      { label: "Driver IWP", cell: (r) => r.operator_iwp },
    ],
    hint: (
      <>
        Your CSV needs these columns, all required. Import the drivers first, since each vehicle is linked to a registered driver.
      </>
    ),
  },
};

export default function FleetImportModal({ tab, onClose, onImported }) {
  const { title, noun, requiredField, importFn, template, aliases, columns, hint } = CONFIGS[tab];
  return (
    <CsvImportModal
      title={title}
      noun={noun}
      aliases={aliases}
      requiredField={requiredField}
      template={template}
      columns={columns}
      importFn={importFn}
      hint={hint}
      previewNote={(ready, issues) => `${ready} ready${issues ? ` · ${issues} will be skipped` : ""}. This registers real ${noun}s.`}
      doneNote={({ created }) => `${created} ${noun}${created === 1 ? "" : "s"} registered.`}
      onClose={onClose}
      onImported={onImported}
    />
  );
}
