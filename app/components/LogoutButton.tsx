"use client";

import { LogOut } from "lucide-react";

const APP_BASE_PATH = "/verus-monitoring";

function getAppPath(path: string) {
  return `${APP_BASE_PATH}${path}`;
}

export function LogoutButton() {
  async function logout() {
    await fetch(getAppPath("/api/auth/logout"), { method: "POST" });
    window.location.href = getAppPath("/login");
  }

  return (
    <button className="backLink logoutButton" type="button" onClick={() => void logout()}>
      <LogOut size={16} />
      Logout
    </button>
  );
}
