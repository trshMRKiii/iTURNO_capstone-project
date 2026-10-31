import React from "react";
import { apiService } from "../../../lib/api-service";
import CsvImportModal from "../../../components/ui/CsvImportModal";

const TEMPLATE = {
  filename: "staff-import-template.csv",
  rows: [
    ["Email", "First Name", "Middle Name", "Last Name", "Role"],
    ["juan.delacruz@example.com", "Juan", "Reyes", "Dela Cruz", "Personnel"],
  ],
};

const ALIASES = {
  username: ["username", "email", "email_address", "username_email"],
  first_name: ["first_name", "firstname", "given_name"],
  middle_name: ["middle_name", "middlename", "middle"],
  last_name: ["last_name", "lastname", "surname", "family_name"],
  role: ["role", "position"],
};

const COLUMNS = [
  { label: "Name", cell: (r) => [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" ") },
  { label: "Email", cell: (r) => r.username, className: "usr-td-email" },
  { label: "Role", cell: (r) => r.role.toLowerCase(), className: "usr-import-role" },
];

export default function ImportUsersModal({ onClose, onImported }) {
  return (
    <CsvImportModal
      title="Import staff accounts"
      noun="account"
      aliases={ALIASES}
      requiredField="username"
      template={TEMPLATE}
      columns={COLUMNS}
      importFn={apiService.importUsers.bind(apiService)}
      hint={
        <>
          Columns: <b>Email</b>, <b>First Name</b>, <b>Last Name</b> are required; <b>Middle Name</b> and <b>Role</b> (Personnel,
          Supervisor or Manager — blank means Personnel) are optional. Admin accounts can't be imported.
        </>
      }
      previewNote={(ready, issues) =>
        `${ready} ready${issues ? ` · ${issues} will be skipped` : ""}. Each new account is emailed a temporary password and must choose its own on first sign-in. This creates real accounts.`}
      doneNote={({ created, emails_queued }) =>
        `${created} account${created === 1 ? "" : "s"} created.${emails_queued > 0
          ? ` ${emails_queued} login email${emails_queued === 1 ? " is" : "s are"} queued and will be sent automatically once the mail service or system is back online.`
          : " Their login emails have been sent."}`}
      onClose={onClose}
      onImported={onImported}
    />
  );
}
