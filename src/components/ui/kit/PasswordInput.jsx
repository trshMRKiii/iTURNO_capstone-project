import React, { useState } from "react";
import { EyeIcon, EyeOffIcon } from "./icons";
import "../../../styles/PasswordInput.css";

/** Password <input> with a show/hide toggle. Takes the same props as <input>. */
function PasswordInput({ disabled, ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="pw-input">
      <input {...props} disabled={disabled} type={visible ? "text" : "password"} />
      <button
        type="button"
        className="pw-input__toggle"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        title={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

export default PasswordInput;
