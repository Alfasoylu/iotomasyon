import "server-only";

import { prisma } from "@/lib/prisma";
import { ALL_USER_ROLES, type UserRole } from "@/lib/user-roles";

const KNOWN_ROLE_SET = new Set<string>(ALL_USER_ROLES);

export async function getSupportedUserRoles(): Promise<UserRole[]> {
  try {
    const rows = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'UserRole'
      ORDER BY e.enumsortorder
    `;

    const roles = rows
      .map((row) => row.enumlabel)
      .filter((value): value is UserRole => KNOWN_ROLE_SET.has(value));

    return roles.length > 0 ? roles : ALL_USER_ROLES;
  } catch {
    // If enum introspection fails, preserve current behavior rather than blocking the UI.
    return ALL_USER_ROLES;
  }
}

export async function isUserRoleSupported(role: UserRole): Promise<boolean> {
  const supportedRoles = await getSupportedUserRoles();
  return supportedRoles.includes(role);
}
