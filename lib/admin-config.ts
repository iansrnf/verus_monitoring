export const defaultAdminUsername = "admin";
export const defaultAdminPassword = "change-this-password";

export function getAdminUsername() {
  return process.env.ADMIN_USERNAME?.trim() || defaultAdminUsername;
}

export function getAdminPassword() {
  return process.env.ADMIN_PASSWORD?.trim() || defaultAdminPassword;
}
